import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ui=JSON.parse(readFileSync(new URL("../resource_pack/ui/hud_elements/gamemodes/bombdefusal.json",import.meta.url),"utf8"));
const uiDefs=JSON.parse(readFileSync(new URL("../resource_pack/ui/_ui_defs.json",import.meta.url),"utf8"));
const hudScreen=JSON.parse(readFileSync(new URL("../resource_pack/ui/hud_screen.json",import.meta.url),"utf8"));
const common=JSON.parse(readFileSync(new URL("../resource_pack/ui/fc.json",import.meta.url),"utf8"));

test("shared UI controls use the fc file and namespace",()=>{
  const legacyFile=`ui/${["r","t"].join("")}.json`;
  const legacyNamespace=["rt","20k"].join("");
  assert.equal(common.namespace,"fc");
  assert.ok(uiDefs.ui_defs.includes("ui/fc.json"));
  assert.equal(uiDefs.ui_defs.includes(legacyFile),false);
  assert.equal(JSON.stringify(ui).includes(legacyNamespace),false);
});

test("bomb defusal HUD uses its role-based namespace",()=>{
  assert.equal(ui.namespace,"gm_bombdefusal");
});

test("bomb defusal HUD is registered from its gamemode directory",()=>{
  assert.ok(uiDefs.ui_defs.includes("ui/hud_elements/gamemodes/bombdefusal.json"));
  assert.doesNotMatch(JSON.stringify(uiDefs),/boxfights?\.json/);
  assert.match(JSON.stringify(hudScreen),/bomb_defusal_hud@gm_bombdefusal\.render/);
});

test("team score controls use isolated JSON UI binding names",()=>{
  const attacker=ui["attacker_score@fc.img"].controls[0]["score@fc.l"];
  const defender=ui["defender_score@fc.img"].controls[0]["score@fc.l"];
  assert.equal(attacker.text,"#attacker_score_text");
  assert.equal(defender.text,"#defender_score_text");
  assert.match(attacker.bindings[2].source_property_name,/- 'A'/);
  assert.match(defender.bindings[2].source_property_name,/- 'D'/);
  assert.notEqual(attacker.bindings[1].target_property_name,defender.bindings[1].target_property_name);
  assert.notEqual(attacker.bindings[2].target_property_name,defender.bindings[2].target_property_name);
});

test("bomb state wire tokens are rendered as static RP glyphs",()=>{
  const timer=ui["timer@fc.img"];
  const controls=timer.controls;
  assert.equal(controls[1]["planted_text@fc.l"].text,"\uE108");
  assert.equal(controls[2]["defused_text@fc.l"].text,"\uE109");
  assert.match(JSON.stringify(controls),/TMRBPLNT/);
  assert.match(JSON.stringify(controls),/TMRBDEFS/);
});

test("timer uses the proven two-stage title binding",()=>{
  const timerText=ui["timer@fc.img"].controls[0]["timer_text@fc.l"];
  const wholeBinding=timerText.bindings.find((binding: { target_property_name?: string })=>
    binding.target_property_name==="#timer_whole"
  );
  const displayBinding=timerText.bindings.find((binding: { target_property_name?: string })=>
    binding.target_property_name==="#timer_insides"
  );

  assert.ok(wholeBinding,"timer must first capture the fixed TMRxxxxx field");
  assert.equal(wholeBinding.source_property_name,"('%.8s' * #hud_title_text_string)");
  assert.ok(displayBinding,"timer must strip TMR in a separate view binding");
  assert.match(displayBinding.source_property_name,/#timer_whole/);
  assert.match(displayBinding.source_property_name,/TMR/);
  assert.equal(timerText.text,"#timer_insides");
});

test("dead and empty HUD slots keep a collection-independent barrier",()=>{
  const slot=ui["player_slot@fc.p"];
  assert.ok(slot,"team entries must use a persistent fixed slot wrapper");

  const barrier=slot.controls.find((control: Record<string,unknown>)=>"unavailable@fc.img" in control)?.["unavailable@fc.img"];
  assert.ok(barrier);
  assert.equal(barrier.texture,"textures/blocks/barrier");
  assert.equal(barrier.bindings[0].binding_name,"#hud_title_text_string");
  assert.equal(barrier.bindings.some((binding: { binding_type?: string })=>binding.binding_type==="collection"),false);
  assert.match(barrier.bindings.at(-1).source_property_name,/PLN/);
  assert.doesNotMatch(barrier.bindings.at(-1).source_property_name,/PLD/);

  for(const teamName of ["attacker_team@fc.img","defender_team@fc.img"]){
    const entries=ui[teamName].controls[0]["stack@fc.sp"].controls;
    assert.equal(entries.length,5);
    for(const entry of entries){
      assert.match(Object.keys(entry)[0],/@gm_bombdefusal\.player_slot$/);
    }
  }
});

test("player portraits do not depend on players_collection",()=>{
  assert.doesNotMatch(JSON.stringify(ui),/players_collection/);
});

test("every team slot receives its RP-owned portrait texture",()=>{
  const teams=[
    ["attacker_team@fc.img","textures/ui/team_attacker_player"],
    ["defender_team@fc.img","textures/ui/team_defender_player"]
  ] as const;
  const assets:Buffer[]=[];

  for(const [teamName,expectedTexture] of teams){
    const entries=ui[teamName].controls[0]["stack@fc.sp"].controls;
    assert.equal(entries.length,5);

    for(const entry of entries){
      const [controlName,instance]=Object.entries(entry)[0] as [string,Record<string,unknown>];
      assert.match(controlName,/@gm_bombdefusal\.player_slot$/);
      assert.equal(instance.$portrait_texture,expectedTexture);
    }

    const asset=readFileSync(new URL(`../resource_pack/${expectedTexture}.png`,import.meta.url));
    assert.deepEqual([...asset.subarray(0,8)],[137,80,78,71,13,10,26,10],
      `${expectedTexture} must resolve to a valid PNG`
    );
    assets.push(asset);
  }

  assert.notDeepEqual(assets[0],assets[1],"attacker and defender teams must remain visually distinguishable");
});

test("fixed portraits preserve alive dead and empty slot states",()=>{
  const slot=ui["player_slot@fc.p"];
  assert.ok(slot);

  const find=(name:string)=>
    slot.controls.find((control:Record<string,unknown>)=>name in control)?.[name];
  const alive=find("alive@fc.img");
  const dead=find("dead@fc.img");
  const empty=find("unavailable@fc.img");

  assert.ok(alive);
  assert.ok(dead);
  assert.ok(empty);
  assert.equal(alive.texture,"$portrait_texture");
  assert.equal(dead.texture,"$portrait_texture");
  assert.equal(empty.texture,"textures/blocks/barrier");

  for(const [control,token] of [[alive,"PLA"],[dead,"PLD"],[empty,"PLN"]] as const){
    const visible=control.bindings.find((binding:{target_property_name?:string})=>
      binding.target_property_name==="#visible"
    );
    assert.ok(visible);
    assert.match(visible.source_property_name,/\$name_at/);
    assert.match(visible.source_property_name,new RegExp(`= '${token}'`));
  }

  const crossed=dead.controls?.find((control:Record<string,unknown>)=>"crossed@fc.img" in control)?.["crossed@fc.img"];
  assert.ok(crossed,"PLD must keep its barrier overlay inside the dead portrait control");
  assert.equal(crossed.texture,"textures/blocks/barrier");
  assert.ok(crossed.layer>0,"the nested barrier must render above the dead portrait");
  assert.equal(Object.keys(slot.controls.at(-1))[0],"unavailable@fc.img");
});

test("the empty-state barrier is the final sibling overlay in each player slot",()=>{
  const controls=ui["player_slot@fc.p"].controls;
  assert.equal(Object.keys(controls.at(-1))[0],"unavailable@fc.img",
    "Bedrock draws the face grid after an earlier sibling even when its child layer is lower"
  );
});

test("HUD does not parse a round result suffix for a central result banner",()=>{
  const main=ui["main@fc.p"];
  assert.equal(main.controls.some((control:Record<string,unknown>)=>"round_result@gm_bombdefusal.round_result" in control),false);
  assert.doesNotMatch(JSON.stringify(ui),/RWIN|RLOS|round_result_token|ROUND RESULT/);
});
