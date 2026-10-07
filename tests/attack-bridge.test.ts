import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root=process.cwd();

test("player attack animation is wired to the reload scoreboard producer",()=>{
  const player=JSON.parse(readFileSync(join(root,"behavior_pack","entities","player.json"),"utf8"));
  const description=player["minecraft:entity"]?.description;
  const entity=player["minecraft:entity"];
  assert.equal(entity?.components?.["minecraft:movement"]?.value,0.1);
  assert.equal(entity?.components?.["minecraft:attack"]?.damage,1);
  assert.ok(entity?.events?.["minecraft:gain_bad_omen"]);
  assert.equal(description?.animations?.fps_reload_bridge,"controller.animation.fps.reload_bridge");
  assert.deepEqual(description?.scripts?.animate,["fps_reload_bridge"]);

  const controllers=JSON.parse(readFileSync(join(root,"behavior_pack","animation_controllers","reload_bridge.animation_controllers.json"),"utf8"));
  const controller=controllers.animation_controllers["controller.animation.fps.reload_bridge"];
  assert.equal(controller.initial_state,"idle");
  assert.match(JSON.stringify(controller.states.idle.transitions),/variable\.attack_time/);
  assert.match(JSON.stringify(controller.states.idle.transitions),/fps:gun_sidearm/);
  assert.doesNotMatch(JSON.stringify(controller.states.idle.transitions),/fps:knife/);
  assert.deepEqual(controller.states.reload.on_entry,["/scoreboard players set @s fps_reload 1"]);
  assert.match(JSON.stringify(controller.states.reload.transitions),/variable\.attack_time/);
});

test("server consumes the left-click reload phase signal",()=>{
  const source=readFileSync(join(root,"src","game.ts"),"utf8");
  const combat=readFileSync(join(root,"src","combat-execution.ts"),"utf8");
  assert.doesNotMatch(source,/fps_fire/);
  assert.match(combat,/phase === 1\) \{\s*this\.adapter\.setReloadPhase\(player\.id, 2\)/);
  assert.match(source,/this\.combat\.tick\(system\.currentTick\)/);
});
