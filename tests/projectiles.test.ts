import assert from "node:assert/strict";
import test from "node:test";
import { canDamageTarget, classifyHitBand, damageAfterPenetration, damageForHit, isPenetrableBlock, projectileShouldDespawn } from "../src/projectiles";

test("projectile hit bands apply head and leg damage multipliers",()=>{
  assert.equal(classifyHitBand(1.7,0),"HEAD");
  assert.equal(classifyHitBand(0.9,0),"BODY");
  assert.equal(classifyHitBand(0.2,0),"LEGS");
  assert.equal(damageForHit(20,"HEAD"),40);
  assert.equal(damageForHit(20,"BODY"),20);
  assert.equal(damageForHit(20,"LEGS"),15);
});

test("projectiles cannot damage teammates and only allow one glass or wool penetration",()=>{
  assert.equal(canDamageTarget("T","CT"),true);
  assert.equal(canDamageTarget("T","T"),false);
  for(const block of ["minecraft:glass","minecraft:glass_pane","minecraft:red_wool","glass","wool"])assert.equal(isPenetrableBlock(block),true);
  assert.equal(isPenetrableBlock("minecraft:stone"),false);
  assert.equal(damageAfterPenetration(20,0),20);
  assert.equal(damageAfterPenetration(20,1),10);
  assert.equal(damageAfterPenetration(20,2),10);
});

test("projectile cleanup is bounded by four seconds or 73 blocks",()=>{
  assert.equal(projectileShouldDespawn(79,72.9),false);
  assert.equal(projectileShouldDespawn(80,1),true);
  assert.equal(projectileShouldDespawn(1,73),true);
});
