import assert from "node:assert/strict";
import test from "node:test";
import { MATCH_CONFIG } from "../src/config";
import { activeFromRoundAfterSpawn, awardRound, canJoinTeam, canKeepBombItem, canPickUpDroppedBomb, droppedBombBounceTarget, eliminationWinner, lossReward, matchResult, movementPermissionsFor, recoverInterruptedBomb, resetMoneyForSideSwitch, roleForSquad, roundAchievements, scoreForRole, shouldApplyDelayedSpectator } from "../src/rules";
import type { PersistedMatchState } from "../src/types";

function state(): PersistedMatchState {
  return {
    phase:"LIVE",round:1,tScore:0,ctScore:0,lossStreak:{T:0,CT:0},timerTicks:0,
    players:[
      {id:"t",name:"T",squad:"T",money:800,alive:true,activeFromRound:1,connected:true,joined:true},
      {id:"ct",name:"CT",squad:"CT",money:800,alive:true,activeFromRound:1,connected:true,joined:true},
    ],
  };
}

test("team join enforces capacity and difference",()=>{
  assert.equal(canJoinTeam(1,1,"T",5,1),true);
  assert.equal(canJoinTeam(2,1,"T",5,1),false);
  assert.equal(canJoinTeam(5,4,"T",5,1),false);
});

test("roles swap after round 7",()=>{
  assert.equal(roleForSquad("T",7,7),"T");
  assert.equal(roleForSquad("T",8,7),"CT");
  assert.equal(roleForSquad("CT",8,7),"T");
});

test("side switch resets money for joined players",()=>{
  const s=state();
  s.players[0].money=16000;s.players[1].money=4200;
  s.players.push({id:"left",name:"Left",squad:"T",money:9000,alive:false,activeFromRound:1,connected:false,joined:false});
  resetMoneyForSideSwitch(s,MATCH_CONFIG);
  assert.equal(s.players[0].money,MATCH_CONFIG.startingMoney);
  assert.equal(s.players[1].money,MATCH_CONFIG.startingMoney);
  assert.equal(s.players[2].money,9000);
});

test("match settings use a ten-second freeze and ten-thousand money cap",()=>{
  assert.equal(MATCH_CONFIG.freezeTicks,10*20);
  assert.equal(MATCH_CONFIG.maxMoney,10000);
});

test("loss bonus ramps and caps",()=>{
  assert.equal(lossReward(1,MATCH_CONFIG),1400);
  assert.equal(lossReward(2,MATCH_CONFIG),1900);
  assert.equal(lossReward(10,MATCH_CONFIG),3400);
});

test("round rewards include planted T loss bonus",()=>{
  const s=state(); awardRound(s,"CT",MATCH_CONFIG,true);
  assert.equal(s.ctScore,1); assert.equal(s.players[0].money,3000); assert.equal(s.players[1].money,4050);
});

test("scores stay with squads and HUD maps them to current roles",()=>{
  const s=state();s.round=8;awardRound(s,"T",MATCH_CONFIG,false);
  assert.equal(s.tScore,0);assert.equal(s.ctScore,1);
  assert.equal(scoreForRole(s,"T",MATCH_CONFIG),1);
  assert.equal(scoreForRole(s,"CT",MATCH_CONFIG),0);
});

test("money never exceeds cap",()=>{
  const s=state();s.players.forEach(p=>p.money=9900);awardRound(s,"T",MATCH_CONFIG,false);
  assert.equal(s.players[0].money,10000);assert.equal(s.players[1].money,10000);
});

test("MR8 result is first to 8 with no draw",()=>{
  const s=state();s.tScore=8;assert.equal(matchResult(s,MATCH_CONFIG),"T");
  s.tScore=7;s.ctScore=8;s.round=15;assert.equal(matchResult(s,MATCH_CONFIG),"CT");
});

test("ace requires one winner-role player to kill all five opponents in a five-versus-five round",()=>{
  const result=roundAchievements({
    winner:"T",reason:"elimination",participants:{T:5,CT:5},deaths:{T:0,CT:5},
    roles:new Map([["t1","T"],["t2","T"],["ct1","CT"]]),
    killsByPlayer:new Map([["t1",new Set(["ct1","ct2","ct3","ct4","ct5"])] ]),
    clutchCandidates:{T:undefined,CT:undefined},survivors:{T:new Set(["t1","t2","t3","t4","t5"]),CT:new Set()},
  });
  assert.equal(result.acePlayerId,"t1");
});

test("ace is not awarded in a round that did not start five-versus-five",()=>{
  const result=roundAchievements({
    winner:"T",reason:"elimination",participants:{T:1,CT:2},deaths:{T:0,CT:2},
    roles:new Map([["t1","T"]]),
    killsByPlayer:new Map([["t1",new Set(["ct1"])] ]),
    clutchCandidates:{T:undefined,CT:undefined},survivors:{T:new Set(["t1"]),CT:new Set()},
  });
  assert.equal(result.acePlayerId,undefined);
});

test("clutch requires a real last-survivor transition and any valid round win",()=>{
  const clutch=roundAchievements({
    winner:"T",reason:"exploded",participants:{T:3,CT:3},deaths:{T:2,CT:0},
    roles:new Map([["t1","T"],["ct1","CT"]]),killsByPlayer:new Map(),
    clutchCandidates:{T:"t1",CT:undefined},survivors:{T:new Set(),CT:new Set(["ct1"])}},
  );
  assert.equal(clutch.clutchPlayerId,"t1");
  const noTransition=roundAchievements({
    winner:"T",reason:"elimination",participants:{T:1,CT:3},deaths:{T:0,CT:3},
    roles:new Map([["t1","T"]]),killsByPlayer:new Map(),
    clutchCandidates:{T:undefined,CT:undefined},survivors:{T:new Set(["t1"]),CT:new Set()}},
  );
  assert.equal(noTransition.clutchPlayerId,undefined);
});

test("flawless requires every actual winner participant to survive without a death record",()=>{
  const flawless=roundAchievements({
    winner:"CT",reason:"defused",participants:{T:2,CT:2},deaths:{T:2,CT:0},
    roles:new Map([["ct1","CT"],["ct2","CT"]]),killsByPlayer:new Map(),
    clutchCandidates:{T:undefined,CT:undefined},survivors:{T:new Set(),CT:new Set(["ct1","ct2"])}},
  );
  assert.equal(flawless.flawless,true);
  const disconnected=roundAchievements({
    winner:"CT",reason:"timeout",participants:{T:2,CT:2},deaths:{T:0,CT:0},
    roles:new Map([["ct1","CT"],["ct2","CT"]]),killsByPlayer:new Map(),
    clutchCandidates:{T:undefined,CT:undefined},survivors:{T:new Set(["t1","t2"]),CT:new Set(["ct1"])}},
  );
  assert.equal(disconnected.flawless,false);
});

test("bomb sanitizer preserves the carrier item throughout planting",()=>{
  assert.equal(canKeepBombItem({kind:"PLANTING",carrierId:"t",progressTicks:20,timerTicks:0},"t",false),true);
  assert.equal(canKeepBombItem({kind:"PLANTING",carrierId:"t",progressTicks:20,timerTicks:0},"ct",false),false);
  assert.equal(canKeepBombItem({kind:"PLANTED",progressTicks:0,timerTicks:800},"t",false),false);
});

test("death respawn keeps the player in the current HUD round",()=>{
  assert.equal(activeFromRoundAfterSpawn(1,3,false,true),1);
  assert.equal(activeFromRoundAfterSpawn(1,3,true,true),4);
  assert.equal(activeFromRoundAfterSpawn(4,3,false,true),4);
});

test("T wins when every CT dies after the bomb is planted",()=>{
  assert.equal(eliminationWinner("BOMB_PLANTED",true,false),"T");
  assert.equal(eliminationWinner("BOMB_PLANTED",false,false),"T");
  assert.equal(eliminationWinner("BOMB_PLANTED",false,true),undefined);
});

test("buy phase disables lateral movement and jumping while preserving sneak",()=>{
  assert.deepEqual(movementPermissionsFor({buyPhaseLocked:true,interactionLocked:false}),{
    lateralEnabled:false,jumpEnabled:false,sneakEnabled:true,
  });
});

test("planting and defusing disable lateral movement and jumping while preserving sneak",()=>{
  assert.deepEqual(movementPermissionsFor({buyPhaseLocked:false,interactionLocked:true}),{
    lateralEnabled:false,jumpEnabled:false,sneakEnabled:true,
  });
});

test("overlapping buy phase and interaction locks remain fully restrictive",()=>{
  assert.deepEqual(movementPermissionsFor({buyPhaseLocked:true,interactionLocked:true}),{
    lateralEnabled:false,jumpEnabled:false,sneakEnabled:true,
  });
});

test("players without a movement lock retain all supported input",()=>{
  assert.deepEqual(movementPermissionsFor({buyPhaseLocked:false,interactionLocked:false}),{
    lateralEnabled:true,jumpEnabled:true,sneakEnabled:true,
  });
});

test("delayed spectator applies to a player still dead in the same live round",()=>{
  assert.equal(shouldApplyDelayedSpectator({deathRound:3,currentRound:3,alive:false,phase:"LIVE"}),true);
});

test("delayed spectator is stale after the round advances",()=>{
  assert.equal(shouldApplyDelayedSpectator({deathRound:3,currentRound:4,alive:false,phase:"FREEZE"}),false);
});

test("delayed spectator does not override a player revived in the same round",()=>{
  assert.equal(shouldApplyDelayedSpectator({deathRound:3,currentRound:3,alive:true,phase:"LIVE"}),false);
});

test("delayed spectator applies only during actual round phases",()=>{
  for(const phase of ["FREEZE","LIVE","BOMB_PLANTED","ROUND_END"] as const){
    assert.equal(shouldApplyDelayedSpectator({deathRound:3,currentRound:3,alive:false,phase}),true,phase);
  }
  for(const phase of ["LOBBY","MAP_VOTE","MATCH_END"] as const){
    assert.equal(shouldApplyDelayedSpectator({deathRound:3,currentRound:3,alive:false,phase}),false,phase);
  }
});

test("startup recovery rolls orphaned plant and defuse progress back to stable bomb states",()=>{
  const planting={kind:"PLANTING" as const,carrierId:"t",actorId:"t",site:"A" as const,progressTicks:20,timerTicks:0};
  const defusing={kind:"DEFUSING" as const,actorId:"ct",site:"B" as const,location:{x:1,y:2,z:3},progressTicks:40,timerTicks:300};
  assert.deepEqual(recoverInterruptedBomb(planting),{kind:"CARRIED",carrierId:"t",progressTicks:0,timerTicks:0});
  assert.deepEqual(recoverInterruptedBomb(defusing),{kind:"PLANTED",site:"B",location:{x:1,y:2,z:3},progressTicks:0,timerTicks:300});
  assert.equal(planting.kind,"PLANTING");
  assert.equal(defusing.kind,"DEFUSING");
});

test("only the dropper is blocked from immediately picking the bomb back up",()=>{
  assert.equal(canPickUpDroppedBomb("dropper","dropper",120,100),false);
  assert.equal(canPickUpDroppedBomb("teammate","dropper",120,100),true);
  assert.equal(canPickUpDroppedBomb("dropper","dropper",120,119),false);
  assert.equal(canPickUpDroppedBomb("dropper","dropper",120,120),true);
});

test("a dropped bomb is moved exactly 2.5 blocks horizontally away from the player",()=>{
  const target=droppedBombBounceTarget({x:10,y:64,z:10},{x:3,y:8,z:4});
  assert.deepEqual(target,{x:11.5,y:64,z:12});
  assert.equal(Math.hypot(target.x-10,target.z-10),2.5);
  assert.deepEqual(droppedBombBounceTarget({x:1,y:2,z:3},{x:0,y:1,z:0}),{x:1,y:2,z:3});
});
