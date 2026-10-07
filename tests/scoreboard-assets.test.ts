import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { SCOREBOARD_WIRE } from "../src/scoreboard/wire";

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url));
const json=(path:string)=>JSON.parse(read(path).toString());
const uiPath="resource_pack/ui/hud_elements/permanents/scoreboard.json";
test("scoreboard UI is registered above existing HUDs, without animations or hiding other HUDs",()=>{
  const ui=json(uiPath),screen=json("resource_pack/ui/hud_screen.json"),defs=json("resource_pack/ui/_ui_defs.json");
  assert.ok(defs.ui_defs.includes("ui/hud_elements/permanents/scoreboard.json"));
  const entries=screen.root_panel.modifications[0].value;
  assert.ok(entries.some((e:any)=>"scoreboard@fps_scoreboard.render" in e));
  for(const key of ["bomb_defusal_hud@gm_bombdefusal.render","player_actionbar_hud@fc_actionbar.render","kill_log@kill_log.render","game_event_banner@pm_match_events.render"])assert.ok(entries.some((e:any)=>key in e));
  assert.equal(ui.render.layer,100);assert.deepEqual(ui.render.size,["94%","58%"]);assert.equal(ui.render.max_size[0],760);
  assert.match(JSON.stringify(ui.render.bindings),/SB1/);assert.doesNotMatch(JSON.stringify(ui),/anims|animation|players_collection|#hud_actionbar/);
  assert.equal(ui.render.controls[0].background.alpha,0.68);
});
test("both panels have five fixed rows at UTF-8 wire offsets and separate ally/enemy column layouts",()=>{
  const ui=json(uiPath);
  for(const [index,role] of ["ct","t"].entries()){
    const panel=ui.render.controls[index+1][role];assert.equal(panel.$role_code,role==="ct"?"C":"T");
    const rows=panel.controls.filter((entry:any)=>Object.keys(entry)[0].includes("@fps_scoreboard.row"));assert.equal(rows.length,5);
    rows.forEach((row:any,i:number)=>assert.equal(Object.values<any>(row)[0].$row_at,202+8+(index*5+i)*SCOREBOARD_WIRE.row));
    assert.match(panel.$portrait,/team_(defender|attacker)_player/);
  }
  const alive=ui.row.controls.find((c:any)=>c.alive).alive;
  const ally=alive.controls[0].allied,enemy=alive.controls[1].opponent;
  assert.ok(ally.controls.some((c:any)=>c.money));assert.ok(!enemy.controls.some((c:any)=>c.money));
  assert.notDeepEqual(ally.bindings,enemy.bindings);
  assert.ok(ui.row.controls.some((c:any)=>c.self_background));assert.ok(ui.row.controls.some((c:any)=>c.dead_background));
});
test("item, atlas, localized strings and pack versions agree",()=>{
  const item=json("behavior_pack/items/scoreboard.json")["minecraft:item"];
  assert.equal(item.description.identifier,"fps:scoreboard");assert.equal(item.components["minecraft:max_stack_size"],1);
  assert.doesNotMatch(JSON.stringify(item),/food|throwable|use_modifiers|shooter/);
  assert.equal(json("resource_pack/textures/item_texture.json").texture_data.fps_scoreboard.textures,"textures/items/scoreboard");
  assert.match(read("resource_pack/texts/ko_KR.lang").toString(),/item.fps:scoreboard.name=점수판/);
  assert.match(read("resource_pack/texts/en_US.lang").toString(),/item.fps:scoreboard.name=Scoreboard/);
  assert.deepEqual([...read("resource_pack/textures/items/scoreboard.png").subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const version=json("package.json").version.split(".").map(Number);
  for(const pack of ["behavior_pack","resource_pack"]){const manifest=json(`${pack}/manifest.json`);assert.deepEqual(manifest.header.version,version);for(const module of manifest.modules)assert.deepEqual(module.version,version);}
  assert.deepEqual(json("behavior_pack/manifest.json").dependencies.find((d:any)=>d.uuid).version,version);
});
test("scoreboard JSON UI and geometric assets reproduce exactly from the wire contract",()=>{
  const paths=[uiPath,"resource_pack/textures/items/scoreboard.png","resource_pack/textures/ui/scoreboard_white.png"];
  const before=paths.map(read);execFileSync(process.execPath,["--import","tsx","tools/generate-scoreboard.mjs"]);
  paths.forEach((p,i)=>assert.deepEqual(read(p),before[i]));
});
