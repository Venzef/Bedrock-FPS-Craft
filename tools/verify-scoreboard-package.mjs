import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { inflateRawSync } from "node:zlib";

const root=resolve(import.meta.dirname,"..");
const {version}=JSON.parse(await readFile(resolve(root,"package.json"),"utf8"));
function entries(bytes){
  const files=new Map();let offset=0;
  while(bytes.readUInt32LE(offset)===0x04034b50){
    const method=bytes.readUInt16LE(offset+8),length=bytes.readUInt32LE(offset+18),nameSize=bytes.readUInt16LE(offset+26),extraSize=bytes.readUInt16LE(offset+28);
    const name=bytes.subarray(offset+30,offset+30+nameSize).toString();
    const begin=offset+30+nameSize+extraSize,data=bytes.subarray(begin,begin+length);
    assert.ok(method===0||method===8,`Unsupported compression: ${method}`);
    files.set(name,method===8?inflateRawSync(data):data);offset=begin+length;
  }
  return files;
}
const addon=entries(await readFile(resolve(root,`release-${version}/BombDefusal-${version}.mcaddon`)));
let checked=0;
for(const [kind,folder,paths] of [
  ["BP","behavior_pack",["manifest.json","items/scoreboard.json","scripts/game.js","scripts/inventory.js","scripts/utils.js","scripts/minecraft-combat-adapter.js","scripts/combat-execution.js","scripts/scoreboard/ledger.js","scripts/scoreboard/wire.js","scripts/scoreboard/damage.js"]],
  ["RP","resource_pack",["manifest.json","ui/_ui_defs.json","ui/hud_screen.json","ui/hud_elements/permanents/scoreboard.json","textures/items/scoreboard.png","textures/ui/scoreboard_white.png","textures/item_texture.json","textures/ui/team_defender_player.png","textures/ui/team_attacker_player.png","texts/ko_KR.lang","texts/en_US.lang","ui/hud_elements/gamemodes/bombdefusal.json","ui/actionbar_hud.json","ui/hud_elements/permanents/kill_log.json","ui/hud_elements/permanents/game_event_banner.json"]],
]){
  const pack=addon.get(`BombDefusal_${kind}-${version}.mcpack`);assert.ok(pack,`${kind} pack is missing`);
  const files=entries(pack);
  for(const path of paths){
    assert.ok(files.has(path),`${kind}/${path} is missing`);
    assert.deepEqual(files.get(path),await readFile(resolve(root,folder,path)),`${kind}/${path} differs from build`);checked++;
  }
}
assert.deepEqual(await readFile(resolve(root,"BombDefusal.mcaddon")),await readFile(resolve(root,`release-${version}/BombDefusal-${version}.mcaddon`)));
console.log(`Verified ${checked} scoreboard and existing HUD files in the nested ${version} mcaddon; root distribution matches.`);
