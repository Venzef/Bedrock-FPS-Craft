import assert from "node:assert/strict";
import test from "node:test";
import { MATCH_CONFIG } from "../src/config";
import { RoundLifecycle } from "../src/round-lifecycle";
import type { PersistedMatchState } from "../src/types";

function state(): PersistedMatchState {
  return {
    phase: "LOBBY", round: 1, tScore: 0, ctScore: 0, lossStreak: { T: 0, CT: 0 }, timerTicks: 0,
    players: [
      { id: "t1", name: "T1", squad: "T", money: 800, alive: false, activeFromRound: 1, connected: true, joined: true },
      { id: "t2", name: "T2", squad: "T", money: 800, alive: false, activeFromRound: 1, connected: true, joined: true },
      { id: "ct1", name: "CT1", squad: "CT", money: 800, alive: false, activeFromRound: 1, connected: true, joined: true },
      { id: "ct2", name: "CT2", squad: "CT", money: 800, alive: false, activeFromRound: 1, connected: true, joined: true },
    ],
  };
}

function lifecycle(): RoundLifecycle {
  return new RoundLifecycle(MATCH_CONFIG, () => 0);
}

test("map vote owns its phase guard, team recheck, and match reset", () => {
  const game = state(), rules = lifecycle();
  assert.deepEqual(rules.beginMapVote(game), { kind: "STARTED" });
  assert.equal(game.phase, "MAP_VOTE");

  const result = rules.completeMapVote(game, new Map([["t1", "industrial_facility"]]), ["desert_city", "industrial_facility"]);
  assert.deepEqual(result, { kind: "MAP_SELECTED", mapId: "industrial_facility" });
  assert.equal(game.phase, "MAP_VOTE");
  assert.equal(game.mapId, "industrial_facility");
  assert.equal(game.round, 1);
  assert.deepEqual([game.tScore, game.ctScore, game.lossStreak], [0, 0, { T: 0, CT: 0 }]);
});

test("round start emits cleanup before player preparation and resets money on round 8", () => {
  const game = state(), rules = lifecycle();
  game.mapId = "desert_city";
  game.round = MATCH_CONFIG.roundsPerHalf + 1;
  game.players.forEach(player => {
    player.money = 9000;
    player.hasDefuseKit = true;
    player.loadout = {
      primary:{id:"W00",magazine:5,reserve:10},
      secondary:{id:"W05",magazine:3,reserve:6},
      knife:{id:"W14",magazine:0,reserve:0},
    };
  });

  const effects = rules.startRound(game);
  assert.deepEqual(effects.map(effect => effect.kind), ["CLEAR_INTERACTIONS", "CLEANUP_ROUND_OBJECTIVES", "ROUND_STARTED"]);
  assert.equal(game.phase, "FREEZE");
  assert.equal(game.timerTicks, MATCH_CONFIG.freezeTicks);
  assert.deepEqual(game.players.map(player => player.money), game.players.map(() => MATCH_CONFIG.startingMoney));
  assert.deepEqual(game.players.map(player => player.loadout),game.players.map(()=>undefined));
  assert.deepEqual(game.players.map(player=>player.hasDefuseKit),game.players.map(()=>false));
  const started = effects[2];
  assert.equal(started.kind, "ROUND_STARTED");
  if (started.kind === "ROUND_STARTED") {
    assert.deepEqual(started.players.map(player => [player.id, player.role]), [["t1", "CT"], ["t2", "CT"], ["ct1", "T"], ["ct2", "T"]]);
    assert.equal(started.bombCarrierId, "ct1");
  }
});

test("live transition is separate from round preparation", () => {
  const game = state(), rules = lifecycle();
  game.mapId = "desert_city";
  rules.startRound(game);
  const effects = rules.goLive(game);
  assert.deepEqual(effects, [{ kind: "LIVE" }]);
  assert.equal(game.phase, "LIVE");
  assert.equal(game.timerTicks, MATCH_CONFIG.roundTicks);
});

test("elimination awards the round and snapshots roles before later side switching", () => {
  const game = state(), rules = lifecycle();
  game.mapId = "desert_city";
  rules.startRound(game);
  game.players.forEach(player => player.alive = true);
  rules.goLive(game);
  game.players.find(player => player.id === "ct1")!.alive = false;
  game.players.find(player => player.id === "ct2")!.alive = false;

  const effects = rules.checkElimination(game);
  assert.equal(game.phase, "ROUND_END");
  assert.equal(game.tScore, 1);
  assert.deepEqual(effects.map(effect => effect.kind), ["CLEAR_INTERACTIONS", "REMOVE_GROUND_ITEMS", "ROUND_ENDED"]);
  const ended = effects[2];
  if (ended?.kind === "ROUND_ENDED") {
    assert.equal(ended.winner, "T");
    assert.equal(ended.roles.get("t1"), "T");
    game.round = 8;
    assert.equal(ended.roles.get("t1"), "T");
    assert.equal(ended.preservePlant, true);
  }
});

test("T elimination leaves a planting interaction eligible until the next-round cleanup", () => {
  const game = state(), rules = lifecycle();
  game.mapId = "desert_city";
  rules.startRound(game);
  game.players.forEach(player => player.alive = true);
  rules.goLive(game);
  game.bomb = { kind: "PLANTING", carrierId: "t1", actorId: "t1", site: "A", progressTicks: 20, timerTicks: 0 };

  const end = rules.endRound(game, "T", "elimination");
  assert.equal(game.phase, "ROUND_END");
  assert.equal(game.bomb?.kind, "PLANTING");
  assert.equal(end[0]?.kind, "CLEAR_INTERACTIONS");
  assert.equal(end[0]?.kind === "CLEAR_INTERACTIONS" ? end[0].preservePlant : undefined, true);

  const next = rules.nextRound(game);
  assert.equal(next[0]?.kind, "CLEAR_INTERACTIONS");
  assert.equal(game.phase, "FREEZE");
  assert.equal(game.bomb, undefined);
});

test("death tracking and kill reward stay inside the round lifecycle", () => {
  const game = state(), rules = lifecycle();
  game.mapId = "desert_city";
  rules.startRound(game);
  game.players.forEach(player => player.alive = true);
  const killer = game.players.find(player => player.id === "t1")!;
  rules.recordDeath(game, { victimId: "ct1", killerId: killer.id, killReward: 300 });
  game.players.find(player => player.id === "ct1")!.alive = false;
  assert.equal(killer.money, 1100);

  game.players.find(player => player.id === "ct2")!.alive = false;
  const effects = rules.checkElimination(game);
  assert.equal(effects[0]?.kind, undefined);
  rules.goLive(game);
  const liveEffects = rules.checkElimination(game);
  assert.equal(liveEffects[2]?.kind, "ROUND_ENDED");
});

test("death immediately removes the victim's passive defuse kit",()=>{
  const game=state(),rules=lifecycle();
  game.mapId="desert_city";
  rules.startRound(game);
  const victim=game.players.find(player=>player.id==="ct1")!;
  victim.alive=true;victim.hasDefuseKit=true;

  rules.recordDeath(game,{victimId:victim.id,killReward:0});

  assert.equal(victim.hasDefuseKit,false);
});

test("next round clears interactions before advancing and ends an MR8 match at score", () => {
  const game = state(), rules = lifecycle();
  game.mapId = "desert_city";
  game.phase = "ROUND_END";
  game.round = 1;
  const next = rules.nextRound(game);
  assert.deepEqual(next.map(effect => effect.kind), ["CLEAR_INTERACTIONS", "CLEANUP_ROUND_OBJECTIVES", "ROUND_STARTED"]);
  assert.equal(game.round, 2);
  assert.equal(game.phase, "FREEZE");

  game.phase = "ROUND_END";
  game.tScore = MATCH_CONFIG.roundsToWin;
  const end = rules.nextRound(game);
  assert.deepEqual(end.map(effect => effect.kind), ["CLEAR_INTERACTIONS", "MATCH_ENDED"]);
  assert.equal(game.phase, "MATCH_END");
});

test("forfeit ends the match without entering another round", () => {
  const game = state(), rules = lifecycle();
  game.phase = "LIVE";
  game.players.filter(player => player.squad === "T").forEach(player => player.connected = false);
  const effects = rules.checkForfeit(game);
  assert.deepEqual(effects.map(effect => effect.kind), ["MATCH_ENDED"]);
  assert.equal(game.phase, "MATCH_END");
  assert.equal(effects[0]?.kind === "MATCH_ENDED" ? effects[0].winner : undefined, "CT");
});
