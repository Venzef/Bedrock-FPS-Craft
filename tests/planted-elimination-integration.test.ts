import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source=readFileSync(new URL("../src/game.ts",import.meta.url),"utf8");

test("death handling checks elimination while the bomb is planted",()=>{
  const onDeath=source.slice(source.indexOf("private onDeath"),source.indexOf("private onUseStart"));
  assert.match(onDeath,/this\.state\.phase === "LIVE" \|\| this\.state\.phase === "BOMB_PLANTED"/);
  assert.match(onDeath,/this\.checkElimination\(\)/);
});
