import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bomb=JSON.parse(readFileSync(new URL("../behavior_pack/items/bomb.json",import.meta.url),"utf8"));

test("bomb use does not apply the bow slowdown animation outside a bomb site",()=>{
  const components=bomb["minecraft:item"].components;
  assert.equal(components["minecraft:use_animation"],"none");
  assert.equal(components["minecraft:use_modifiers"].use_duration,999);
});
