import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isCombatActionAllowed } from "../src/input-policy";

test("bomb interactions block attacks while allowing reload",()=>{
  assert.deepEqual([
    isCombatActionAllowed("fire",true),
    isCombatActionAllowed("melee",true),
    isCombatActionAllowed("reload",true),
  ],[false,false,true]);
});

test("defuse intent is resolved before first-shot handling and release always cancels",()=>{
  const game=readFileSync(new URL("../src/game.ts",import.meta.url),"utf8");
  const start=game.slice(game.indexOf("private onUseStart"),game.indexOf("private tickInteraction"));
  assert.ok(start.indexOf("this.bombObjective.startUse")<start.indexOf("weaponIdFromItemType"));
  assert.match(start,/INTERACTION_STARTED[\s\S]*this\.combat\.stopFiring\(player\.id\)[\s\S]*return/);
  assert.match(game,/itemStopUse\.subscribe\([\s\S]*this\.cancelInteraction\(e\.source\.id\)/);
  assert.match(game,/itemReleaseUse\.subscribe\([\s\S]*this\.cancelInteraction\(e\.source\.id\)/);
});
