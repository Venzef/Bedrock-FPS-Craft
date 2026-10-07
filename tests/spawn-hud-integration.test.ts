import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gameSource=readFileSync(new URL("../src/game.ts",import.meta.url),"utf8");

test("the spawn handler preserves a death respawn in the current HUD round",()=>{
  const onSpawn=gameSource.slice(gameSource.indexOf("private onSpawn"),gameSource.indexOf("private giveLobbyTools"));
  assert.match(gameSource,/import \{[^}]*activeFromRoundAfterSpawn[^}]*\} from "\.\/rules\.js"/);
  assert.match(onSpawn,/activeFromRoundAfterSpawn\(ps\.activeFromRound,this\.state\.round,initial,ps\.joined\)/);
  assert.doesNotMatch(onSpawn,/Math\.max\(ps\.activeFromRound,this\.state\.round\+1\)/);
});
