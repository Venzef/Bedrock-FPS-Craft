import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source=readFileSync(new URL("../src/game.ts",import.meta.url),"utf8");
const lifecycle=readFileSync(new URL("../src/round-lifecycle.ts",import.meta.url),"utf8");
const objective=readFileSync(new URL("../src/bomb-objective.ts",import.meta.url),"utf8");

test("plant start and progress share the live-or-post-round plant policy",()=>{
  const start=source.slice(source.indexOf("private onUseStart"),source.indexOf("private tickInteraction"));
  const tick=objective.slice(objective.indexOf("public tickInteraction"),objective.indexOf("public cancel"));
  assert.match(start,/this\.bombObjective\.startUse\(this\.state/);
  assert.match(tick,/plantMode\(next\)/);
  assert.match(objective,/phase === "ROUND_END"/);
});

test("plant completion delegates state changes to the tested transition",()=>{
  const complete=objective.slice(objective.indexOf("public tickInteraction"),objective.indexOf("public cancel"));
  assert.match(complete,/completePlantTransition\(next, player\.location, this\.config\)/);
  assert.match(source,/this\.applyBombTransition\(this\.bombObjective\.tickInteraction\(this\.state/);
  assert.doesNotMatch(source.slice(source.indexOf("private applyBombTransition"),source.indexOf("private dropBomb")),/this\.state\.phase\s*=|this\.state\.timerTicks\s*=/);
});

test("T elimination preserves planting until completion or next-round cleanup",()=>{
  const endRound=source.slice(source.indexOf("private applyLifecycle"),source.indexOf("private applyRoundStart"));
  const nextRound=source.slice(source.indexOf("private nextRound"),source.indexOf("private endMatch"));
  const clear=objective.slice(objective.indexOf("public clearInteractions"),objective.indexOf("public recover"));
  assert.match(lifecycle,/const planted\s*=\s*bombWasPlanted\(state\.bomb\)/);
  assert.match(lifecycle,/const preservePlant\s*=\s*winner\s*===\s*"T"\s*&&\s*reason\s*===\s*"elimination"/);
  assert.match(endRound,/this\.clearInteractions\(\{preservePlant:effect\.preservePlant\}\)/);
  assert.match(clear,/next\.bomb\?\.kind === "PLANTING"/);
  assert.match(clear,/next\.bomb\.actorId === id/);
  assert.match(clear,/plantMode\(next\) === "POST_ROUND"/);
  assert.match(clear,/this\.cancel\(next, id\)/);
  assert.match(nextRound,/this\.lifecycle\.nextRound\(this\.state\)/);
  assert.match(lifecycle,/const effects:\s*LifecycleEffect\[\]\s*=\s*\[\{ kind: "CLEAR_INTERACTIONS" \}\]/);
  assert.match(lifecycle,/const result\s*=\s*matchResult\(state, this\.config\)/);
});
