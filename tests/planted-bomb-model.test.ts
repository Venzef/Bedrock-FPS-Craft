import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const readJson=(path:string)=>JSON.parse(readFileSync(new URL(path,import.meta.url),"utf8"));

test("the planted objective uses the custom bomb entity instead of an armor stand",()=>{
  const source=readFileSync(new URL("../src/bomb-objective-adapter.ts",import.meta.url),"utf8");
  const planted=source.slice(source.indexOf("public spawnPlantedBomb"),source.indexOf("public removePlantedBombs"));
  assert.match(planted,/spawnEntity\("fps:planted_bomb"/);
  assert.doesNotMatch(planted,/minecraft:armor_stand|setEquipment/);
});

test("the planted bomb entity resolves the supplied geometry and texture",()=>{
  const server=readJson("../behavior_pack/entities/planted_bomb.json");
  const client=readJson("../resource_pack/entity/planted_bomb.entity.json");
  const geometry=readJson("../resource_pack/models/entity/planted_bomb.geo.json");
  const animations=readJson("../resource_pack/animations/bomb.animation.json");
  const attachable=readJson("../resource_pack/attachables/bomb.json");
  const controller=readJson("../resource_pack/render_controllers/planted_bomb.render_controllers.json");

  assert.equal(server["minecraft:entity"].description.identifier,"fps:planted_bomb");
  assert.deepEqual(server["minecraft:entity"].component_groups["fps:instant_despawn"]["minecraft:instant_despawn"],{});
  assert.deepEqual(server["minecraft:entity"].events["fps:despawn"].add.component_groups,["fps:instant_despawn"]);
  assert.equal(client["minecraft:client_entity"].description.identifier,"fps:planted_bomb");
  assert.equal(client["minecraft:client_entity"].description.geometry.default,"geometry.bomb");
  assert.equal(client["minecraft:client_entity"].description.textures.default,"textures/entity/planted_bomb");
  assert.equal(client["minecraft:client_entity"].description.animations.move,"animation.bomb.move");
  assert.deepEqual(client["minecraft:client_entity"].description.scripts.animate,["move"]);
  assert.equal(geometry["minecraft:geometry"][0].description.identifier,"geometry.bomb");
  assert.equal(animations.animations["animation.bomb.planting"],undefined);
  assert.equal(animations.animations["animation.bomb.move"].loop,true);
  assert.equal(attachable["minecraft:attachable"].description.geometry.default,"geometry.bomb");
  assert.equal(attachable["minecraft:attachable"].description.textures.default,"textures/entity/planted_bomb");
  assert.equal(attachable["minecraft:attachable"].description.animations.hold_first_person,"animation.bomb.hold_first_person");
  assert.equal(attachable["minecraft:attachable"].description.animations.hold_third_person,"animation.bomb.hold_third_person");
  assert.equal(attachable["minecraft:attachable"].description.animations.planting,undefined);
  assert.equal(attachable["minecraft:attachable"].description.animations.planting_first_person,"animation.bomb.planting_first_person");
  assert.equal(attachable["minecraft:attachable"].description.animations.planting_third_person,"animation.bomb.planting_third_person");
  assert.equal(
    attachable["minecraft:attachable"].description.animations.use_cycle_controller,
    "controller.animation.bomb.use_cycle"
  );
  assert.deepEqual(attachable["minecraft:attachable"].description.scripts.animate,["use_cycle_controller"]);
  const animationControllers=readJson("../resource_pack/animation_controllers/bomb.animation_controllers.json");
  const useCycle=animationControllers.animation_controllers["controller.animation.bomb.use_cycle"];
  assert.equal(useCycle.initial_state,"holding");
  assert.deepEqual(useCycle.states.holding.animations,[
    {hold_first_person:"context.is_first_person == 1.0"},
    {hold_third_person:"context.is_first_person == 0.0"}
  ]);
  assert.deepEqual(useCycle.states.holding.transitions,[{planting:"query.is_using_item"}]);
  assert.deepEqual(useCycle.states.planting.animations,[
    {planting_first_person:"context.is_first_person == 1.0"},
    {planting_third_person:"context.is_first_person == 0.0"}
  ]);
  assert.deepEqual(useCycle.states.planting.transitions,[{holding:"!query.is_using_item"}]);
  assert.ok(animations.animations["animation.bomb.planting_first_person"]);
  assert.ok(animations.animations["animation.bomb.planting_third_person"]);
  for(const name of ["animation.bomb.planting_first_person","animation.bomb.planting_third_person"]){
    assert.equal(animations.animations[name].animation_length,3.2917);
    assert.ok(animations.animations[name].bones.initialization);
    assert.ok(animations.animations[name].bones.num8);
    assert.ok(animations.animations[name].bones.sign01);
  }
  assert.deepEqual(animations.animations["animation.bomb.hold_first_person"].bones.Bomb,{
    rotation:[12.4413,-19.7506,-87.2947],
    position:[-9,31.5,-12.6],
    scale:0.4
  });
  assert.deepEqual(animations.animations["animation.bomb.hold_third_person"].bones.Bomb,{
    rotation:[-92.9803,-73.8242,93.4982],
    position:[0,21.25,-5],
    scale:0.65
  });
  assert.deepEqual(
    animations.animations["animation.bomb.planting_first_person"].bones.Bomb,
    animations.animations["animation.bomb.hold_first_person"].bones.Bomb
  );
  assert.deepEqual(
    animations.animations["animation.bomb.planting_third_person"].bones.Bomb,
    animations.animations["animation.bomb.hold_third_person"].bones.Bomb
  );
  assert.ok(controller.render_controllers["controller.render.fps_planted_bomb"]);
  assert.equal(existsSync(new URL("../resource_pack/textures/entity/planted_bomb.png",import.meta.url)),true);
  assert.equal(existsSync(new URL("../resource_pack/font/glyph_E1.png",import.meta.url)),true);
});
