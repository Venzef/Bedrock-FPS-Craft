import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readJson=(path:string)=>JSON.parse(readFileSync(new URL(path,import.meta.url),"utf8"));

test("the dropped objective has a gravity-enabled custom 3D entity",()=>{
  const server=readJson("../behavior_pack/entities/dropped_bomb.json");
  const client=readJson("../resource_pack/entity/dropped_bomb.entity.json");
  const components=server["minecraft:entity"].components;
  const animations=readJson("../resource_pack/animations/bomb.animation.json");

  assert.equal(server["minecraft:entity"].description.identifier,"fps:dropped_bomb");
  assert.equal(components["minecraft:physics"].has_gravity,true);
  assert.equal(components["minecraft:physics"].has_collision,true);
  assert.equal(components["minecraft:pushable"].is_pushable,false);
  assert.deepEqual(server["minecraft:entity"].component_groups["fps:instant_despawn"]["minecraft:instant_despawn"],{});
  assert.deepEqual(server["minecraft:entity"].events["fps:despawn"].add.component_groups,["fps:instant_despawn"]);
  assert.equal(client["minecraft:client_entity"].description.identifier,"fps:dropped_bomb");
  assert.equal(client["minecraft:client_entity"].description.geometry.default,"geometry.bomb");
  assert.equal(client["minecraft:client_entity"].description.textures.default,"textures/entity/planted_bomb");
  assert.equal(client["minecraft:client_entity"].description.animations.drop_fly,"animation.bomb.drop_fly");
  assert.deepEqual(client["minecraft:client_entity"].description.scripts.animate,["drop_fly"]);
  assert.ok(animations.animations["animation.bomb.drop_fly"]);
});

test("bomb drops are event-driven and pickup removes the tracked entity",()=>{
  const source=readFileSync(new URL("../src/game.ts",import.meta.url),"utf8");
  const objective=readFileSync(new URL("../src/bomb-objective.ts",import.meta.url),"utf8");
  const adapter=readFileSync(new URL("../src/bomb-objective-adapter.ts",import.meta.url),"utf8");

  assert.match(source,/afterEvents\.entitySpawn\.subscribe/);
  assert.match(source,/beforeEvents\.playerLeave\.subscribe/);
  assert.match(source,/this\.bombObjective\.drop\(this\.state/);
  assert.match(source,/this\.bombObjective\.tickPickup\(this\.state/);
  assert.match(objective,/droppedEntityId:\s*dropped\.id/);
  assert.match(adapter,/entity\.triggerEvent\("fps:despawn"\)/);
  assert.doesNotMatch(source,/dropped\.kill\(\)/);
  assert.doesNotMatch(source,/runInterval\(onItemDropWatcher/);
  assert.doesNotMatch(source,/spawnItem\(new ItemStack\(BOMB\)/);
});

test("an invalid spawned item is rejected before its item component is read",()=>{
  const source=readFileSync(new URL("../src/bomb-objective-adapter.ts",import.meta.url),"utf8");
  const handler=source.slice(source.indexOf("public isBombItemEntity"),source.indexOf("public removeItemEntity"));

  assert.ok(handler.indexOf("entity.isValid")>=0);
  assert.ok(handler.indexOf("entity.isValid")<handler.indexOf("getComponent(EntityComponentTypes.Item)"));
});
