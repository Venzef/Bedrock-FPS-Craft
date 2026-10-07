import assert from "node:assert/strict";
import test from "node:test";
import { MATCH_CONFIG } from "../src/config";
import { BOMB_ITEM, BombObjective, bombWasPlanted, completePlantTransition, plantMode, type BombObjectiveAdapter, type DroppedBombReference } from "../src/bomb-objective";
import type { PersistedMatchState } from "../src/types";

function plantingState():PersistedMatchState {
  return {
    phase:"LIVE",round:3,tScore:2,ctScore:1,lossStreak:{T:0,CT:2},timerTicks:900,
    players:[
      {id:"t",name:"T",squad:"T",money:2400,alive:true,activeFromRound:1,connected:true,joined:true},
      {id:"ct",name:"CT",squad:"CT",money:1800,alive:false,activeFromRound:1,connected:true,joined:true},
    ],
    bomb:{kind:"PLANTING",carrierId:"t",actorId:"t",site:"A",progressTicks:40,timerTicks:0},
  };
}

class MemoryBombAdapter implements BombObjectiveAdapter {
  readonly items=new Map<string,string>();
  planted?:{playerId:string;site:string;location:{x:number;y:number;z:number}};
  dropped?:DroppedBombReference;
  removedDropped=false;
  private nextId=1;

  heldItem(playerId:string):string|undefined{return this.items.get(playerId);}
  removeBomb(playerId:string):void{if(this.items.get(playerId)===BOMB_ITEM)this.items.delete(playerId);}
  giveBomb(playerId:string):boolean{this.items.set(playerId,BOMB_ITEM);return true;}
  reconcileBombItems(shouldKeep:(playerId:string,alreadyKept:boolean)=>boolean):void{
    for(const [playerId,item] of this.items)if(item===BOMB_ITEM&&!shouldKeep(playerId,false))this.items.delete(playerId);
  }
  removeVanillaBombItems():void{}
  ensureDroppedBomb(bomb:PersistedMatchState["bomb"]):DroppedBombReference|undefined{
    if(bomb?.kind!=="DROPPED"||!bomb.location)return undefined;
    this.dropped??={id:bomb.droppedEntityId??`drop-${this.nextId++}`,location:{...bomb.location},dimensionId:"overworld"};
    return this.dropped;
  }
  spawnDroppedBomb(location:{x:number;y:number;z:number},bounceTarget?:{x:number;y:number;z:number}):DroppedBombReference{
    this.dropped={id:`drop-${this.nextId++}`,location:{...(bounceTarget??location)},dimensionId:"overworld"};return this.dropped;
  }
  despawnDroppedBomb(drop:DroppedBombReference):void{if(this.dropped?.id===drop.id){this.dropped=undefined;this.removedDropped=true;}}
  removeAllDroppedBombs():void{this.dropped=undefined;}
  spawnPlantedBomb(playerId:string,location:{x:number;y:number;z:number},site:"A"|"B"):void{this.planted={playerId,site,location};}
  removePlantedBombs():void{this.planted=undefined;}
}

const objectiveMap={
  boundary:{min:{x:-10,y:0,z:-10},max:{x:10,y:10,z:10}},
  bombRecovery:{x:0,y:1,z:0},
  sites:{A:{min:{x:1,y:0,z:1},max:{x:5,y:5,z:5}},B:{min:{x:-5,y:0,z:-5},max:{x:-1,y:5,z:-1}}},
} as const;

test("plant mode distinguishes live objective play from T elimination post-round play",()=>{
  assert.equal(plantMode({phase:"LIVE"}),"LIVE_OBJECTIVE");
  assert.equal(plantMode({phase:"ROUND_END",lastRoundWinner:"T",lastRoundReason:"elimination"}),"POST_ROUND");
});

test("post-round planting is rejected for every other round result",()=>{
  for(const state of [
    {phase:"ROUND_END",lastRoundWinner:"CT",lastRoundReason:"elimination"},
    {phase:"ROUND_END",lastRoundWinner:"CT",lastRoundReason:"timeout"},
    {phase:"ROUND_END",lastRoundWinner:"CT",lastRoundReason:"defused"},
    {phase:"ROUND_END",lastRoundWinner:"T",lastRoundReason:"exploded"},
    {phase:"FREEZE"},
  ] as const)assert.equal(plantMode(state),undefined);
});

test("live planting starts the bomb objective without mutating its input",()=>{
  const state=plantingState(),before=structuredClone(state),location={x:10,y:64,z:20};
  const transition=completePlantTransition(state,location,MATCH_CONFIG);
  const expected=structuredClone(before);expected.phase="BOMB_PLANTED";
  expected.bomb={kind:"PLANTED",site:"A",location,progressTicks:0,timerTicks:MATCH_CONFIG.bombTicks};

  assert.deepEqual(transition,{mode:"LIVE_OBJECTIVE",state:expected});
  assert.deepEqual(state,before);
});

test("post-round planting preserves the complete awarded round result",()=>{
  const state=plantingState();
  state.phase="ROUND_END";state.timerTicks=91;state.tScore=3;state.lastRoundWinner="T";state.lastRoundReason="elimination";
  const before=structuredClone(state),location={x:11,y:64,z:21};
  const transition=completePlantTransition(state,location,MATCH_CONFIG);
  const expected=structuredClone(before);
  expected.bomb={kind:"PLANTED",site:"A",location,progressTicks:0,timerTicks:0};

  assert.deepEqual(transition,{mode:"POST_ROUND",state:expected});
  assert.deepEqual(state,before);
  assert.equal(transition&&completePlantTransition(transition.state,location,MATCH_CONFIG),undefined);
});

test("only completed or actively defused bombs count as planted rewards",()=>{
  assert.equal(bombWasPlanted({kind:"PLANTING",site:"A",progressTicks:40,timerTicks:0}),false);
  assert.equal(bombWasPlanted({kind:"PLANTED",site:"A",progressTicks:0,timerTicks:800}),true);
  assert.equal(bombWasPlanted({kind:"DEFUSING",site:"A",progressTicks:20,timerTicks:700}),true);
});

test("the deep objective module applies the same plant policy in live and post-round modes",()=>{
  const adapter=new MemoryBombAdapter();adapter.items.set("t",BOMB_ITEM);
  const objective=new BombObjective(adapter,{...MATCH_CONFIG,plantTicks:1,defuseTicks:1,repickupBlockTicks:20,droppedBombBounceDistance:2.5});
  const player={id:"t",role:"T" as const,alive:true,location:{x:2,y:1,z:2},dimensionId:"overworld"};
  const liveState=plantingState();liveState.bomb={kind:"CARRIED",carrierId:"t",progressTicks:0,timerTicks:0};
  const liveStart=objective.startUse(liveState,{...player,itemId:BOMB_ITEM,map:objectiveMap});
  const live=objective.tickInteraction(liveStart.state,{map:objectiveMap,players:new Map([[player.id,player]])});
  assert.equal(live.state.phase,"BOMB_PLANTED");
  assert.equal(live.state.bomb?.timerTicks,MATCH_CONFIG.bombTicks);
  assert.equal(live.effects[0]?.kind,"PLANTED");
  assert.ok(adapter.planted);

  const postState=plantingState();postState.phase="ROUND_END";postState.lastRoundWinner="T";postState.lastRoundReason="elimination";postState.bomb={kind:"CARRIED",carrierId:"t",progressTicks:0,timerTicks:0};
  const postStart=objective.startUse(postState,{...player,itemId:BOMB_ITEM,map:objectiveMap});
  const post=objective.tickInteraction(postStart.state,{map:objectiveMap,players:new Map([[player.id,player]])});
  assert.equal(post.state.phase,"ROUND_END");
  assert.equal(post.state.bomb?.timerTicks,0);
});

test("a CT with a passive kit starts a 100 tick defuse while holding a gun near the bomb surface",()=>{
  const adapter=new MemoryBombAdapter();adapter.items.set("ct","fps:gun_vector");
  const objective=new BombObjective(adapter,{...MATCH_CONFIG,defuseWithoutKitTicks:200,repickupBlockTicks:20,droppedBombBounceDistance:2.5});
  const state=plantingState();
  state.phase="BOMB_PLANTED";
  state.bomb={kind:"PLANTED",site:"A",location:{x:2,y:1,z:2},progressTicks:0,timerTicks:700};
  state.players.find(player=>player.id==="ct")!.alive=true;
  state.players.find(player=>player.id==="ct")!.hasDefuseKit=true;

  const transition=objective.startUse(state,{
    id:"ct",role:"CT",alive:true,location:{x:2.8,y:1,z:2},dimensionId:"overworld",
    itemId:"fps:gun_vector",aimedBomb:true,map:objectiveMap,
  });

  assert.deepEqual(transition.effects,[{
    kind:"INTERACTION_STARTED",playerId:"ct",interaction:"defuse",durationTicks:100,startedWithKit:true,
  }]);
  assert.equal(transition.state.bomb?.kind,"DEFUSING");
  assert.deepEqual(objective.interactionFor("ct"),{
    kind:"defuse",ticks:0,durationTicks:100,startedWithKit:true,
  });
});

test("a defuse snapshots the no-kit 200 tick duration until that session completes",()=>{
  const adapter=new MemoryBombAdapter();adapter.items.set("ct","fps:gun_vector");
  const objective=new BombObjective(adapter,{...MATCH_CONFIG,defuseWithoutKitTicks:200,repickupBlockTicks:20,droppedBombBounceDistance:2.5});
  let state=plantingState();
  state.phase="BOMB_PLANTED";
  state.bomb={kind:"PLANTED",site:"A",location:{x:2,y:1,z:2},progressTicks:0,timerTicks:700};
  const playerState=state.players.find(player=>player.id==="ct")!;
  playerState.alive=true;playerState.hasDefuseKit=false;
  const observation={id:"ct",role:"CT" as const,alive:true,location:{x:2.8,y:1,z:2},dimensionId:"overworld",aimedBomb:true};

  const started=objective.startUse(state,{...observation,itemId:"fps:gun_vector",map:objectiveMap});
  assert.equal(started.effects[0]?.kind,"INTERACTION_STARTED");
  assert.equal(started.effects[0]?.durationTicks,200);
  state=started.state;
  playerState.hasDefuseKit=true;

  for(let tick=1;tick<200;tick++){
    const transition=objective.tickInteraction(state,{map:objectiveMap,players:new Map([["ct",observation]])});
    state=transition.state;
    assert.equal(transition.effects.some(effect=>effect.kind==="DEFUSED"),false);
  }
  const completed=objective.tickInteraction(state,{map:objectiveMap,players:new Map([["ct",observation]])});
  assert.deepEqual(completed.effects,[{kind:"DEFUSED",playerId:"ct",startedWithKit:false}]);
});

test("the first valid defuse request exclusively owns contention even against the same state snapshot",()=>{
  const adapter=new MemoryBombAdapter();adapter.items.set("ct","fps:gun_vector");adapter.items.set("ct2","fps:knife");
  const objective=new BombObjective(adapter,{...MATCH_CONFIG,defuseWithoutKitTicks:200,repickupBlockTicks:20,droppedBombBounceDistance:2.5});
  const state=plantingState();state.phase="BOMB_PLANTED";
  state.players.push({id:"ct2",name:"CT2",squad:"CT",money:800,alive:true,activeFromRound:1,connected:true,joined:true,hasDefuseKit:false});
  state.bomb={kind:"PLANTED",site:"A",location:{x:2,y:1,z:2},progressTicks:0,timerTicks:700};
  const input={role:"CT" as const,alive:true,location:{x:2.8,y:1,z:2},dimensionId:"overworld",aimedBomb:true,map:objectiveMap};

  const first=objective.startUse(state,{...input,id:"ct",itemId:"fps:gun_vector"});
  const second=objective.startUse(state,{...input,id:"ct2",itemId:"fps:knife"});

  assert.equal(first.effects[0]?.kind,"INTERACTION_STARTED");
  assert.deepEqual(second,{state,effects:[]});
  assert.equal(objective.interactionFor("ct2"),undefined);
});

test("defuse range follows the bomb collision surface instead of the interaction origin",()=>{
  const adapter=new MemoryBombAdapter();adapter.items.set("ct","fps:gun_vector");
  const objective=new BombObjective(adapter,{...MATCH_CONFIG,defuseWithoutKitTicks:200,repickupBlockTicks:20,droppedBombBounceDistance:2.5});
  const state=plantingState();state.phase="BOMB_PLANTED";
  state.bomb={kind:"PLANTED",site:"A",location:{x:2,y:1,z:2},progressTicks:0,timerTicks:700};
  state.players.find(player=>player.id==="ct")!.alive=true;
  const started=objective.startUse(state,{
    id:"ct",role:"CT",alive:true,location:{x:2.8,y:1,z:2},dimensionId:"overworld",
    itemId:"fps:gun_vector",aimedBomb:true,map:objectiveMap,
  });

  const continued=objective.tickInteraction(started.state,{map:objectiveMap,players:new Map([["ct",{
    id:"ct",role:"CT",alive:true,location:{x:2,y:1,z:2.8},dimensionId:"overworld",aimedBomb:true,
  }]])});

  assert.deepEqual(continued.effects,[]);
  assert.equal(continued.state.bomb?.kind,"DEFUSING");
  assert.equal(objective.interactionFor("ct")?.ticks,1);
});

test("weapon switching cancels and resets defuse before a new session re-evaluates the kit",()=>{
  const adapter=new MemoryBombAdapter();adapter.items.set("ct","fps:gun_vector");
  const objective=new BombObjective(adapter,{...MATCH_CONFIG,defuseWithoutKitTicks:200,repickupBlockTicks:20,droppedBombBounceDistance:2.5});
  const state=plantingState();state.phase="BOMB_PLANTED";
  const playerState=state.players.find(player=>player.id==="ct")!;playerState.alive=true;playerState.hasDefuseKit=false;
  state.bomb={kind:"PLANTED",site:"A",location:{x:2,y:1,z:2},progressTicks:0,timerTicks:700};
  const observation={id:"ct",role:"CT" as const,alive:true,location:{x:2.8,y:1,z:2},dimensionId:"overworld",aimedBomb:true};
  const started=objective.startUse(state,{...observation,itemId:"fps:gun_vector",map:objectiveMap});
  assert.equal(objective.interactionFor("ct")?.durationTicks,200);

  adapter.items.set("ct","fps:knife");
  const cancelled=objective.tickInteraction(started.state,{map:objectiveMap,players:new Map([["ct",observation]])});
  assert.deepEqual(cancelled.effects,[{kind:"INTERACTION_CANCELLED",playerId:"ct",interaction:"defuse"}]);
  assert.equal(cancelled.state.bomb?.kind,"PLANTED");
  assert.equal(cancelled.state.bomb?.progressTicks,0);
  assert.equal(objective.interactionFor("ct"),undefined);

  playerState.hasDefuseKit=true;
  const restarted=objective.startUse(cancelled.state,{...observation,itemId:"fps:knife",map:objectiveMap});
  assert.equal(restarted.effects[0]?.durationTicks,100);
  assert.equal(restarted.effects[0]?.startedWithKit,true);
});

test("aim loss distance loss and death each cancel defuse with zero retained progress",()=>{
  const cases=[
    {name:"aim loss",observation:{alive:true,aimedBomb:false,location:{x:2.8,y:1,z:2}}},
    {name:"distance loss",observation:{alive:true,aimedBomb:true,location:{x:4,y:1,z:2}}},
    {name:"death",observation:{alive:false,aimedBomb:true,location:{x:2.8,y:1,z:2}}},
  ] as const;

  for(const entry of cases){
    const adapter=new MemoryBombAdapter();adapter.items.set("ct","fps:gun_vector");
    const objective=new BombObjective(adapter,{...MATCH_CONFIG,defuseWithoutKitTicks:200,repickupBlockTicks:20,droppedBombBounceDistance:2.5});
    const state=plantingState();state.phase="BOMB_PLANTED";state.players.find(player=>player.id==="ct")!.alive=true;
    state.bomb={kind:"PLANTED",site:"A",location:{x:2,y:1,z:2},progressTicks:0,timerTicks:700};
    const started=objective.startUse(state,{
      id:"ct",role:"CT",alive:true,location:{x:2.8,y:1,z:2},dimensionId:"overworld",
      itemId:"fps:gun_vector",aimedBomb:true,map:objectiveMap,
    });
    const progressed=objective.tickInteraction(started.state,{map:objectiveMap,players:new Map([["ct",{
      id:"ct",role:"CT",dimensionId:"overworld",...entry.observation,
    }]])});
    assert.deepEqual(progressed.effects,[{kind:"INTERACTION_CANCELLED",playerId:"ct",interaction:"defuse"}],entry.name);
    assert.equal(progressed.state.bomb?.kind,"PLANTED",entry.name);
    assert.equal(progressed.state.bomb?.progressTicks,0,entry.name);
  }
});

test("drop and pickup policy keeps the dropper lock inside the deep module",()=>{
  const adapter=new MemoryBombAdapter();adapter.items.set("t",BOMB_ITEM);
  const objective=new BombObjective(adapter,{...MATCH_CONFIG,plantTicks:1,defuseTicks:1,repickupBlockTicks:20,droppedBombBounceDistance:2.5});
  const state=plantingState();state.bomb={kind:"CARRIED",carrierId:"t",progressTicks:0,timerTicks:0};
  const dropped=objective.drop(state,{playerId:"t",candidateLocation:{x:2,y:1,z:2},currentTick:100,map:objectiveMap});
  assert.equal(dropped.state.bomb?.kind,"DROPPED");
  const picked=objective.tickPickup(dropped.state,{currentTick:100,players:[
    {id:"t",role:"T",alive:true,location:{x:2,y:1,z:2},dimensionId:"overworld"},
    {id:"t2",role:"T",alive:true,location:{x:2,y:1,z:2},dimensionId:"overworld"},
  ]});
  assert.equal(picked.state.bomb?.kind,"CARRIED");
  assert.equal(picked.state.bomb?.carrierId,"t2");
  assert.equal(adapter.removedDropped,true);
});
