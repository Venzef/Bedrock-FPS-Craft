import assert from "node:assert/strict";
import test from "node:test";
import { gameHarness } from "./helpers/game-harness";
import { decodeScoreboard } from "../src/scoreboard/wire";

const extension=(title:string)=>decodeScoreboard(Buffer.from(title).subarray(202).toString());
test("joined players receive a locked fourth-slot scoreboard; weapon sync, sanitize, death and respawn preserve it",()=>{
  const {game,players,events,timers}=gameHarness();const p=players[0];
  assert.equal(p.container.getItem(3).typeId,"fps:scoreboard");assert.equal(p.container.getItem(3).lockMode,"slot");assert.equal(p.container.getItem(3).keepOnDeath,true);
  assert.equal(players[4].container.getItem(3),undefined);
  game.syncWeaponsToInventory(p);game.sanitizeInventories();assert.equal(p.container.getItem(3).typeId,"fps:scoreboard");
  events.get("entityDie")!({deadEntity:p,damageSource:{cause:"fall"}});assert.equal(p.container.getItem(3).typeId,"fps:scoreboard");
  timers.find(t=>t.ticks===1)?.callback();assert.equal(p.mode,"spectator");
  game.onSpawn(p,false);assert.equal(p.container.getItem(3).typeId,"fps:scoreboard");
  p.selectedSlotIndex=3;game.updateHud();assert.equal(extension(p.title).ct.find(p=>p.self)!.deaths,1);
});
test("slot events immediately switch the overlay, retain Title prefix/FCAB and support spectators",()=>{
  const {game,players,events}=gameHarness();const p=players[0];game.updateHud();const original=p.title;
  assert.equal(Buffer.byteLength(original),202);assert.equal(Buffer.byteLength(p.actionBar),20);
  p.selectedSlotIndex=3;events.get("playerHotbarSelectedSlotChange")!({player:p});
  assert.ok(p.title.startsWith(original));assert.equal(extension(p.title).ct[0].self,true);assert.ok(!("money" in extension(p.title).t[0]));
  p.selectedSlotIndex=2;events.get("playerHotbarSelectedSlotChange")!({player:p});assert.equal(p.title,original);
  p.mode="spectator";game.state.players[0].alive=false;p.selectedSlotIndex=3;game.updateHud();assert.equal(extension(p.title).ct[0].self,true);
  assert.ok(p.actionBar.startsWith("FCABWNN"));assert.equal(players[4].title,"");
});
test("round-end deaths count and match-end retains the item and statistics until the result timer ends",()=>{
  const {game,players,events,timers}=gameHarness();const p=players[0];
  game.state.phase="ROUND_END";events.get("entityDie")!({deadEntity:p,damageSource:{cause:"fall"}});
  game.state.phase="MATCH_END";
  game.applyLifecycle([{kind:"MATCH_ENDED",winner:"DRAW",reason:"admin",roles:new Map()}]);
  assert.equal(p.container.getItem(3).typeId,"fps:scoreboard");p.selectedSlotIndex=3;game.updateHud();assert.equal(extension(p.title).ct.find(row=>row.self)!.deaths,1);
  timers.find(t=>t.ticks===200)!.callback();assert.equal(p.container.getItem(3),undefined);assert.equal(p.title,"");
  game.state.players[0].joined=true;game.syncScoreboardPlayers();game.updateHud();assert.equal(extension(p.title).t.find(row=>row.self)!.deaths,0);
});
test("Game leave hard deletes attacker contributions and reconnect starts with zero KDA",()=>{
  const {game,players,events}=gameHarness();
  game.recordScoreboardDamage("v","a",9);game.recordScoreboardDamage("v","b",8);
  events.get("playerLeave")!({playerId:"a"});game.state.players[0].connected=true;game.syncScoreboardPlayers();
  events.get("entityDie")!({deadEntity:players[3],damageSource:{cause:"entityAttack",damagingEntity:players[2]}});
  players[0].selectedSlotIndex=3;game.updateHud();const rows=extension(players[0].title).ct;
  assert.equal(rows.find(p=>p.name==="a")!.assists,0);assert.equal(rows.find(p=>p.name==="b")!.assists,1);assert.equal(rows.find(p=>p.name==="c")!.kills,1);
});

test("the production damage adapter includes health correction and suppresses duplicate native hurt contributions",()=>{
  const {game,players,events}=gameHarness();
  game.combatAdapter.applyProjectileDamage("b","v",8); // native damage 4, corrected to 8
  assert.equal(players[3].health.currentValue,12);
  events.get("entityHurt")!({hurtEntity:players[3],damage:7,damageSource:{cause:"entityAttack",damagingEntity:players[2]}});
  events.get("entityDie")!({deadEntity:players[3],damageSource:{cause:"entityAttack",damagingEntity:players[0]}});
  players[0].selectedSlotIndex=3;game.updateHud();const rows=extension(players[0].title).ct;
  assert.equal(rows.find(p=>p.name==="b")!.assists,1);assert.equal(rows.find(p=>p.name==="c")!.assists,0);
});

test("native team and gun-melee damage is restored and never enters assist contributions",()=>{
  const {game,players,events}=gameHarness();
  game.state.players[1].loadout={secondary:{id:"W05",magazine:12,reserve:24}};
  game.syncWeaponsToInventory(players[1]);players[1].selectedSlotIndex=1;
  events.get("entityHurt")!({hurtEntity:players[3],damage:50,damageSource:{cause:"entityAttack",damagingEntity:players[1]}});
  events.get("entityHurt")!({hurtEntity:players[3],damage:80,damageSource:{cause:"entityAttack",damagingEntity:players[3]}});
  game.recordScoreboardDamage("v","c",1);
  events.get("entityDie")!({deadEntity:players[3],damageSource:{cause:"entityAttack",damagingEntity:players[0]}});
  players[0].selectedSlotIndex=3;game.updateHud();const rows=extension(players[0].title).ct;
  assert.equal(rows.find(p=>p.name==="b")!.assists,0);assert.equal(rows.find(p=>p.name==="c")!.assists,1);
});
