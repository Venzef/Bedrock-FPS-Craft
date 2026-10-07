import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BANNER_EVENTS, BANNER_PREFIX, bannerMessage, resultBannerForRole } from "../src/banner";

test("banner protocol keeps the documented event names and prefix",()=>{
  assert.equal(bannerMessage("WIN"),"FPSCRAFT:BANNER:WIN");
  assert.equal(BANNER_EVENTS.length,11);
  for(const event of BANNER_EVENTS)assert.match(bannerMessage(event),new RegExp(`^${BANNER_PREFIX}[A-Z_]+$`));
});

test("round result banner is resolved independently for each current role",()=>{
  assert.equal(resultBannerForRole("T","T"),"WIN");
  assert.equal(resultBannerForRole("CT","T"),"DEFEAT");
  assert.equal(resultBannerForRole("T","CT"),"DEFEAT");
  assert.equal(resultBannerForRole("CT","CT"),"WIN");
});

test("event banner UI is registered and inserted into the HUD",()=>{
  const defs=JSON.parse(readFileSync(new URL("../resource_pack/ui/_ui_defs.json",import.meta.url),"utf8"));
  const hud=JSON.parse(readFileSync(new URL("../resource_pack/ui/hud_screen.json",import.meta.url),"utf8"));
  const chat=JSON.parse(readFileSync(new URL("../resource_pack/ui/chat_screen.json",import.meta.url),"utf8"));
  const banner=JSON.parse(readFileSync(new URL("../resource_pack/ui/hud_elements/permanents/game_event_banner.json",import.meta.url),"utf8"));
  assert.ok(defs.ui_defs.includes("ui/hud_elements/permanents/game_event_banner.json"));
  assert.ok(defs.ui_defs.includes("ui/chat_screen.json"));
  assert.doesNotMatch(JSON.stringify(defs.ui_defs),/game_event_banner\.json\//);
  assert.match(JSON.stringify(hud.root_panel),/game_event_banner@pm_match_events\.render/);
  assert.match(JSON.stringify(hud.chat_grid_item),/FPSCRAFT:/);
  assert.match(JSON.stringify(hud.chat_grid_item),/target_property_name.*#visible/);
  assert.match(JSON.stringify(chat),/messages_text/);
  assert.match(JSON.stringify(chat),/FPSCRAFT:/);
  assert.match(JSON.stringify(chat),/target_property_name.*#visible/);
  assert.equal(banner["result_background@fc.img"].texture,"fc/banner_gradient");
  assert.deepEqual([...readFileSync(new URL("../resource_pack/fc/banner_gradient.png",import.meta.url)).subarray(0,8)],[137,80,78,71,13,10,26,10]);
});
