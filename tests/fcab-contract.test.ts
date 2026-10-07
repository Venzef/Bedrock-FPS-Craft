import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  describeFcabContract,
  encodePlayerHudFrame,
  type PlayerHudFrameSnapshot,
} from "../src/ui/hud_elements/fcab/index";
import {
  renderFcabProtocolSection,
  serializeActionbarHud,
} from "../tools/generate-actionbar-hud.mjs";

test("the FCAB module exposes one immutable contract description",()=>{
  const contract=describeFcabContract();

  assert.equal(contract.prefix,"FCAB");
  assert.equal(contract.frameLength,20);
  assert.equal(contract.fallbackFrame,"FCABWNNA000R000I0G00");
  assert.equal(contract.fields.magazine.offset,7);
  assert.equal(contract.fields.reserve.offset,11);
  assert.equal(contract.fields.interaction.offset,15);
  assert.equal(contract.fields.progress.offset,17);
  assert.ok(Object.isFrozen(contract));
  assert.ok(Object.isFrozen(contract.fields));
});

test("the FCAB encoder composes ammo and defuse progress through its public interface",()=>{
  assert.equal(encodePlayerHudFrame({
    held:"W04",magazine:30,reserve:120,
    interaction:{kind:"defuse",frame:7},
  }),"FCABW04A030R120I2G07");
});

test("the FCAB encoder fails closed for invalid runtime input",()=>{
  const invalid={
    held:"BAD",magazine:30,reserve:120,
    interaction:{kind:"unknown",frame:99},
  } as unknown as PlayerHudFrameSnapshot;

  assert.equal(encodePlayerHudFrame(invalid),"FCABWNNA000R000I0G00");
});

test("non-firearm FCAB frames cannot leak stale ammo",()=>{
  assert.deepEqual([
    encodePlayerHudFrame({held:"W14",magazine:30,reserve:120}),
    encodePlayerHudFrame({held:"WFF",magazine:30,reserve:120}),
    encodePlayerHudFrame({held:"WNN",magazine:30,reserve:120}),
  ],[
    "FCABW14A000R000I0G00",
    "FCABWFFA000R000I0G00",
    "FCABWNNA000R000I0G00",
  ]);
});

test("committed ActionBar JSON is the FCAB contract projection",()=>{
  const committed=readFileSync(new URL("../resource_pack/ui/actionbar_hud.json",import.meta.url),"utf8");
  assert.equal(committed,serializeActionbarHud());
});

test("the documented FCAB table is the contract projection",()=>{
  const document=readFileSync(new URL("../docs/HUD_PROTOCOL.md",import.meta.url),"utf8");
  const actionbarHeading=document.indexOf("## 개인 HUD: ActionBar 데이터 버스");
  const generatedStart=document.indexOf("<!-- FCAB:GENERATED:START -->");
  const generated=document.match(/<!-- FCAB:GENERATED:START -->\r?\n([\s\S]*?)\r?\n<!-- FCAB:GENERATED:END -->/)?.[1];
  assert.ok(actionbarHeading>=0&&generatedStart>actionbarHeading);
  assert.equal(document.match(/<!-- FCAB:GENERATED:START -->/g)?.length,1);
  assert.equal(generated,renderFcabProtocolSection());
});
