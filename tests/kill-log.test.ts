import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MATCH_CONFIG, TICKS } from "../src/config";
import { createKillLogForKill, isKillLogRecipient, killLogTeamCode } from "../src/killLog/killLog";
import { KILLLOG_UI_HEADER, WEAPON_GLYPHS } from "../src/killLog/killLogGlyphs";
import { KILLLOG_PROTOCOL_LENGTH, createKillLogMessage, parseKillLogMessage } from "../src/killLog/killLogProtocol";
import { WEAPONS } from "../src/weapons";

test("Kill Log protocol preserves its fixed wire contract",()=>{
  const message=createKillLogMessage({killerTeam:"0",killerName:"Attacker",weaponId:"W00",victimTeam:"1",victimName:"Victim"});
  assert.equal(message.length,KILLLOG_PROTOCOL_LENGTH);
  assert.equal(message.slice(0,21),KILLLOG_UI_HEADER);
  assert.deepEqual(parseKillLogMessage(message),{
    killerTeam:"0",killerName:"Attacker",weapon:"W00",
    flags:{headshot:false,jumpShot:false,smokeShot:false,wallbang:false,blinded:false,noScope:false},
    victimTeam:"1",victimName:"Victim",
  });
});

test("kills map roles, use the weapon glyph, and default unavailable flags to disabled",()=>{
  const message=createKillLogForKill({killerTeam:"T",killerName:"Attacker",weaponId:"W14",victimTeam:"CT",victimName:"Victim"});
  assert.equal(killLogTeamCode("T"),"0");
  assert.equal(killLogTeamCode("CT"),"1");
  assert.equal(message,`${KILLLOG_UI_HEADER}\n§cAttacker §r${WEAPON_GLYPHS.W14} §bVictim§r`);
});

test("available combat flags render in the protocol-defined order",()=>{
  const message=createKillLogForKill({
    killerTeam:"CT",killerName:"Shooter",weaponId:"W00",victimTeam:"T",victimName:"Target",
    flags:{headshot:true,jumpShot:true,wallbang:true},
  });
  assert.equal(message,`${KILLLOG_UI_HEADER}\n§bShooter §r${WEAPON_GLYPHS.W00} §r\uE1F0\uE1F1\uE1F2 §cTarget§r`);
});

test("every operational weapon resolves to a packaged Kill Log glyph",()=>{
  for(const weapon of WEAPONS)assert.ok(WEAPON_GLYPHS[weapon.id],`${weapon.id} is missing a Kill Log glyph`);
});

test("Kill Log recipients include connected spectators but exclude nonparticipants",()=>{
  assert.equal(isKillLogRecipient({joined:true,connected:true}),true);
  assert.equal(isKillLogRecipient({joined:false,connected:true}),false);
  assert.equal(isKillLogRecipient({joined:true,connected:false}),false);
  assert.equal(isKillLogRecipient(undefined),false);
});

test("the death handler publishes attributed weapon kills through the match recipient policy",()=>{
  const game=readFileSync(new URL("../src/game.ts",import.meta.url),"utf8");
  const death=game.slice(game.indexOf("private onDeath"),game.indexOf("private onEntitySpawn"));
  assert.match(death,/if\(killer&&rewardWeapon&&attribution\)this\.sendKillLog\(killer,e\.deadEntity,rewardWeapon,attribution\.flags\)/);
  assert.match(game,/if\(isKillLogRecipient\(this\.ps\(player\.id\)\)\)player\.sendMessage\(message\)/);
});

test("the match-winning final kill is published before elimination and outlives the round-end transition",()=>{
  const game=readFileSync(new URL("../src/game.ts",import.meta.url),"utf8");
  const death=game.slice(game.indexOf("private onDeath"),game.indexOf("private onEntitySpawn"));
  const publishAt=death.indexOf("this.sendKillLog(");
  const recordAt=death.indexOf("this.lifecycle.recordDeath(");
  const eliminationAt=death.indexOf("this.checkElimination()");

  assert.ok(publishAt>=0&&publishAt<recordAt&&recordAt<eliminationAt,
    "the final kill must enter chat before elimination emits round-result messages");
  assert.ok(MATCH_CONFIG.roundEndTicks/TICKS>4.5,
    "MATCH_END cleanup must not remove the HUD before the final Kill Log animation completes");
});

test("the Kill Log renderer is registered in the HUD and filters its chat transport",()=>{
  const definitions=JSON.parse(readFileSync(new URL("../resource_pack/ui/_ui_defs.json",import.meta.url),"utf8"));
  const hud=JSON.parse(readFileSync(new URL("../resource_pack/ui/hud_screen.json",import.meta.url),"utf8"));
  const renderer=JSON.parse(readFileSync(new URL("../resource_pack/ui/hud_elements/permanents/kill_log.json",import.meta.url),"utf8"));
  const chat=readFileSync(new URL("../resource_pack/ui/chat_screen.json",import.meta.url),"utf8");
  assert.ok(definitions.ui_defs.includes("ui/hud_elements/permanents/kill_log.json"));
  assert.match(JSON.stringify(hud.root_panel),/kill_log@kill_log\.render/);
  assert.equal(renderer.namespace,"kill_log");
  assert.match(JSON.stringify(renderer),/FPSCRAFT:KILLLOG:ADD:/);
  assert.match(chat,/FPSCRAFT:/);
});

test("two rapid kills survive the unfiltered round-end chat burst",()=>{
  const renderer=JSON.parse(readFileSync(new URL("../resource_pack/ui/hud_elements/permanents/kill_log.json",import.meta.url),"utf8"));
  const factory=renderer.render.factory;

  assert.equal(renderer.render.orientation,"vertical");
  assert.ok(factory.max_children_size>=50,
    "chat_item_factory receives every chat row before the Kill Log prefix filter, so five rows can evict rapid kills");
});

test("hidden chat rows expire at the unfiltered factory root before the final round",()=>{
  const renderer=JSON.parse(readFileSync(new URL("../resource_pack/ui/hud_elements/permanents/kill_log.json",import.meta.url),"utf8"));
  const factoryTemplate=String(renderer.render.factory.control_ids.chat_item).split("@").at(-1)?.split(".").at(-1);
  const root=renderer[factoryTemplate!];

  assert.ok(root,"the factory template must resolve inside the Kill Log namespace");
  assert.ok(Array.isArray(root.anims)&&root.anims.includes("@kill_log.kill_item_wait"),
    "cleanup must run on the unfiltered root; ignored non-kill children do not reliably run child animations");
  assert.equal(renderer.kill_item_wait.next,"@kill_log.kill_item_destroy");
  assert.equal(renderer.kill_item_destroy.destroy_at_end,factoryTemplate);
});

test("each Kill Log row keeps the documented 4.5 second lifetime",()=>{
  const renderer=JSON.parse(readFileSync(new URL("../resource_pack/ui/hud_elements/permanents/kill_log.json",import.meta.url),"utf8"));
  const lifetime=renderer.kill_item_wait.duration+renderer.kill_item_destroy.duration;
  assert.equal(lifetime,4.5);
});

test("future Kill Log work is documented with required state and lifecycle seams",()=>{
  const guide=readFileSync(new URL("../docs/KILL_LOG.md",import.meta.url),"utf8");
  for(const topic of ["noScope","smokeShot","blinded","W12","W13","DamageAttributionRecord","라운드 정리"]){
    assert.match(guide,new RegExp(topic));
  }
});
