import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("projectile cleanup removes bullets immediately instead of killing them",()=>{
  const source=readFileSync(new URL("../src/minecraft-combat-adapter.ts",import.meta.url),"utf8");

  assert.match(source,/projectile\.remove\(\)/);
  assert.doesNotMatch(source,/projectile\.kill\(\)/);
});

test("projectile damage is not mistaken for direct gun damage after bullet removal",()=>{
  const source=readFileSync(new URL("../src/combat-execution.ts",import.meta.url),"utf8");

  assert.match(source,/event\.cause === "projectile"/);
  assert.match(source,/event\.cause === "override"/);
  assert.doesNotMatch(source,/attacker instanceof Player&&!e\.damageSource\.damagingProjectile/);
});

test("projectile removal is deferred until the damage and death events can be delivered",()=>{
  const execution=readFileSync(new URL("../src/combat-execution.ts",import.meta.url),"utf8");
  const adapter=readFileSync(new URL("../src/minecraft-combat-adapter.ts",import.meta.url),"utf8");

  assert.match(adapter,/cause: EntityDamageCause\.override, damagingEntity: shooter/);
  assert.match(adapter,/health\.setCurrentValue/);
  assert.match(adapter,/system\.runTimeout\(\(\) => this\.despawnProjectile\(projectileId\), delayTicks\)/);
  assert.match(execution,/this\.activeProjectiles\.delete\(projectile\.id\);\s*this\.adapter\.despawnProjectile\(projectile\.id, 1\)/);
});

test("projectile damage uses the override cause so consecutive bullets bypass hurt immunity",()=>{
  const source=readFileSync(new URL("../src/minecraft-combat-adapter.ts",import.meta.url),"utf8");

  assert.match(source,/cause: EntityDamageCause\.override/);
  assert.doesNotMatch(source,/damagingProjectile: projectile/);
});
