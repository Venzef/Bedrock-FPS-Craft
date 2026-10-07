import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { WEAPONS } from "../src/weapons.ts";
import { createHash } from "node:crypto";
import { canonicalUi, resolveActionbarInheritance } from "./helpers/actionbar-inheritance.ts";

const hud=JSON.parse(readFileSync(new URL("../resource_pack/ui/hud_screen.json",import.meta.url),"utf8"));
const actionbarSource=JSON.parse(readFileSync(new URL("../resource_pack/ui/actionbar_hud.json",import.meta.url),"utf8"));
const actionbar=resolveActionbarInheritance(actionbarSource);
const uiDefs=JSON.parse(readFileSync(new URL("../resource_pack/ui/_ui_defs.json",import.meta.url),"utf8"));
const enUs=readFileSync(new URL("../resource_pack/texts/en_US.lang",import.meta.url),"utf8");
const koKr=readFileSync(new URL("../resource_pack/texts/ko_KR.lang",import.meta.url),"utf8");
const maxMagazine=Math.max(...WEAPONS.map(weapon=>weapon.magazineSize));
const maxReserve=Math.max(...WEAPONS.map(weapon=>weapon.reserveSize));
const magazineDefinitions=Array.from({length:maxMagazine+1},(_,value)=>`magazine_${String(value).padStart(3,"0")}@fc.l`);
const reserveDefinitions=Array.from({length:maxReserve+1},(_,value)=>`reserve_${String(value).padStart(3,"0")}@fc.l`);
const ammoDefinitions=[...magazineDefinitions,...reserveDefinitions];

test("static inheritance preserves the approved layout including the objective offset at 80",()=>{
  // Captured from the original JSON before template extraction. Object key order
  // is ignored; control order, strings, runtime expressions and arrays are exact.
  const originalColors=structuredClone(actionbar);
  for(const name of ["defuse_hud@fc.p","defuse_kit_hud@fc.p"]){
    for(const entry of originalColors[name].controls){
      const [key,control]=Object.entries(entry)[0] as [string,Record<string,unknown>];
      if(key.startsWith("frame_")){
        assert.deepEqual(control.color,[0.45,1,0.5]);
        control.color=[1,0.12,0.12];
      }
    }
  }
  assert.equal(createHash("sha256").update(canonicalUi(originalColors)).digest("hex"),
    "3b809316f543194ba338e869f1e25feefc6234fb957c3b16bc154595c33a5fa5");
  assert.deepEqual(actionbarSource["objective_panel@fc.p"].$offset,[0,80]);
});

test("the vanilla ActionBar is always hidden and the FCAB renderer is registered",()=>{
  assert.equal(hud.hud_actionbar_text.visible,false);
  assert.match(JSON.stringify(hud.root_panel),/player_actionbar_hud@fc_actionbar\.render/);
  assert.ok(uiDefs.ui_defs.includes("ui/actionbar_hud.json"));
});

test("the FCAB bus drives independent ammo weapon-state plant and defuse controls",()=>{
  const source=JSON.stringify(actionbar);
  assert.match(source,/FCAB/);
  assert.match(source,/magazine_000@fc_actionbar\.magazine_000/);
  assert.match(source,/reserve_120@fc_actionbar\.reserve_120/);
  assert.match(source,/knife_dash@fc_actionbar\.knife_dash/);
  assert.match(source,/bomb_dash@fc_actionbar\.bomb_dash/);
  assert.match(source,/plant_hud@fc_actionbar\.plant_hud/);
  assert.match(source,/defuse_hud@fc_actionbar\.defuse_hud/);
  assert.match(source,/defuse_kit_hud@fc_actionbar\.defuse_kit_hud/);
  assert.match(source,/W14/);
  assert.match(source,/WFF/);
  assert.match(source,/I1/);
  assert.match(source,/I2/);
  assert.match(source,/I3/);
});

test("the ActionBar factory parses its runtime payload instead of an unavailable global binding",()=>{
  const source=JSON.stringify(actionbar);
  const factories=(actionbar.render.controls as Array<Record<string,{factory:{name:string}}>>)
    .map(entry=>Object.values(entry)[0].factory);
  assert.ok(factories.length>0);
  assert.ok(factories.every(factory=>factory.name==="hud_actionbar_text_factory"));
  assert.match(source,/\$actionbar_text/);
  assert.doesNotMatch(source,/#hud_actionbar_text_string/);
  assert.equal(hud.hud_actionbar_text.visible,false);
});

test("factory variables drive direct visibility properties instead of inert view bindings",()=>{
  const source=JSON.stringify(actionbar);
  assert.doesNotMatch(source,/"bindings"/);
  for(const controlName of [
    ...ammoDefinitions,"slash@fc.l","knife_dash@fc.l","bomb_dash@fc.l",
    "plant_hud@fc.p","defuse_hud@fc.p","defuse_kit_hud@fc.p",
  ]){
    assert.equal(actionbar[controlName].$atext,"$actionbar_text",controlName);
    assert.equal(typeof actionbar[controlName].visible,"string",controlName);
  }

  for(const controlName of ["plant_hud@fc.p","defuse_hud@fc.p","defuse_kit_hud@fc.p"]){
    const controls=actionbar[controlName].controls as Array<Record<string,Record<string,unknown>>>;
    const dynamicControls=controls.filter(entry=>/^(frame|time)_/.test(Object.keys(entry)[0]));
    assert.equal(dynamicControls.length,42);
    for(const entry of dynamicControls){
      const control=Object.values(entry)[0];
      assert.equal(control.$atext,"$actionbar_text");
      assert.equal(typeof control.visible,"string");
    }
  }
});

test("weapon visibility uses one comparison per renderer",()=>{
  const gunControls=["slash@fc.l",...ammoDefinitions];
  for(const name of gunControls){
    const visible=actionbar[name].visible as string;
    assert.match(visible,/= 'W0'/);
    assert.doesNotMatch(visible,/W00W02|\bor\b/);
  }
  for(const [name,code] of [
    ["knife_dash@fc.l","W14"],
    ["bomb_dash@fc.l","WFF"],
  ] as const){
    const visible=actionbar[name].visible as string;
    assert.match(visible,new RegExp(`= '${code}'`));
    assert.doesNotMatch(visible,/\bor\b/);
  }
  for(const name of [...gunControls,"knife_dash@fc.l","bomb_dash@fc.l"]){
    assert.doesNotMatch(actionbar[name].visible,/WNN/);
  }
});

test("every reachable ammo value is a direct factory target selected by its complete wire token",()=>{
  const factories=(actionbar.render.controls as Array<Record<string,{
    factory?:{control_ids?:{hud_actionbar_text?:string}};
  }>>).map(entry=>Object.values(entry)[0]?.factory);
  const targets=new Set(factories.map(factory=>factory?.control_ids?.hud_actionbar_text));

  for(const [field,marker,offset,max] of [
    ["magazine","A",7,maxMagazine],
    ["reserve","R",11,maxReserve],
  ] as const){
    for(let value=0;value<=max;value++){
      const padded=String(value).padStart(3,"0");
      const definition=`${field}_${padded}@fc.l`;
      const factoryTarget=`${field}_${padded}@fc_actionbar.${field}_${padded}`;
      const label=actionbar[definition] as {$atext?:string;text?:string;visible?:string}|undefined;
      assert.ok(targets.has(factoryTarget),factoryTarget);
      assert.ok(label,definition);
      assert.equal(label.$atext,"$actionbar_text",definition);
      assert.equal(label.text,String(value),definition);
      assert.match(label.visible??"",new RegExp(`%\\.4s.*%\\.${offset}s.*= '${marker}${padded}'`),definition);
      assert.doesNotMatch(label.visible??"",/%\.1s/,definition);
    }
  }
});

test("every weapon renderer receives the ActionBar payload as a direct factory target",()=>{
  const expectedTargets=[
    ...magazineDefinitions.map(definition=>{
      const name=definition.split("@")[0];
      return `${name}@fc_actionbar.${name}`;
    }),
    "slash@fc_actionbar.slash",
    ...reserveDefinitions.map(definition=>{
      const name=definition.split("@")[0];
      return `${name}@fc_actionbar.${name}`;
    }),
    "knife_dash@fc_actionbar.knife_dash",
    "bomb_dash@fc_actionbar.bomb_dash",
    "plant_hud@fc_actionbar.plant_hud",
    "defuse_hud@fc_actionbar.defuse_hud",
    "defuse_kit_hud@fc_actionbar.defuse_kit_hud",
  ];
  const controls=actionbar.render.controls as Array<Record<string,{
    factory?:{name?:string;control_ids?:{hud_actionbar_text?:string}};
  }>>;
  const factories=controls.map(entry=>Object.values(entry)[0]?.factory);
  assert.deepEqual(factories.map(factory=>factory?.name),expectedTargets.map(()=>"hud_actionbar_text_factory"));
  assert.deepEqual(factories.map(factory=>factory?.control_ids?.hud_actionbar_text),expectedTargets);

  for(const target of expectedTargets){
    const definition=target.split("@fc_actionbar.")[1];
    const isBackground=definition.endsWith("_background");
    const isPanel=["plant_hud","defuse_hud","defuse_kit_hud"].includes(definition);
    const control=actionbar[`${definition}@fc.${isBackground?"img":isPanel?"p":"l"}`];
    assert.equal(control?.$atext,"$actionbar_text",target);
    assert.equal(typeof control?.visible,"string",target);
  }
});

test("plant and defuse fill the full width from left to right in 21 frames",()=>{
  for(const [controlName,start] of [
    ["plant_hud@fc.p",0xE200],
    ["defuse_hud@fc.p",0xE220],
    ["defuse_kit_hud@fc.p",0xE220],
  ] as const){
    const controls=actionbar[controlName].controls as Array<Record<string,{size:number[];anchor_from:string;anchor_to:string;offset:number[]}>>;
    const bars=controls
      .filter(control=>Object.keys(control)[0].startsWith("frame_"))
      .map(control=>Object.values(control)[0]);
    assert.equal(bars.length,21);
    for(const [frame,bar] of bars.entries()){
      assert.deepEqual(bar.size,[actionbar[controlName].size[0]*frame/20,2]);
      assert.equal(bar.anchor_from,"top_left");
      assert.equal(bar.anchor_to,"top_left");
      assert.deepEqual(bar.offset,[0,0]);
    }
  }
});

test("the U+E2 progress glyph page is a real 256 by 256 PNG",()=>{
  const png=readFileSync(new URL("../resource_pack/font/glyph_E2.png",import.meta.url));
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(png.readUInt32BE(16),256);
  assert.equal(png.readUInt32BE(20),256);
});

test("the supplied weapon HUD layout removes backgrounds and keeps its bottom-right offsets",()=>{
  for(const name of ["gun_background","knife_background","bomb_background"]){
    assert.equal(actionbar[`${name}@fc.img`],undefined,name);
    assert.doesNotMatch(JSON.stringify(actionbar.render.controls),new RegExp(`${name}@fc_actionbar\\.${name}`));
  }
  for(const name of magazineDefinitions){
    assert.deepEqual(actionbar[name].$offset,[-120,-10],name);
    assert.equal(actionbar[name].font_scale_factor,1,name);
  }
  for(const name of reserveDefinitions)assert.deepEqual(actionbar[name].$offset,[-80,-10],name);
  for(const name of ["slash@fc.l","knife_dash@fc.l","bomb_dash@fc.l"]){
    assert.deepEqual(actionbar[name].$offset,[-105,-10],name);
  }
});

test("objective progress presents its icon localized C4 action and remaining seconds",()=>{
  assert.match(enUs,/^fps\.hud\.plant=Planting C4$/m);
  assert.match(enUs,/^fps\.hud\.defuse=Defusing C4$/m);
  assert.match(koKr,/^fps\.hud\.plant=폭탄 설치$/m);
  assert.match(koKr,/^fps\.hud\.defuse=폭탄 해제$/m);

  for(const [controlName,icon,textKey,seconds] of [
    ["plant_hud@fc.p","\uE1E1","fps.hud.plant",["3.0s","1.5s","0.0s"]],
    ["defuse_hud@fc.p","\uE1E0","fps.hud.defuse",["10.0s","5.0s","0.0s"]],
    ["defuse_kit_hud@fc.p","\uE1E0","fps.hud.defuse",["5.0s","2.5s","0.0s"]],
  ] as const){
    const controls=actionbar[controlName].controls as Array<Record<string,Record<string,unknown>>>;
    const definitions=Object.fromEntries(controls.map(entry=>{
      const [name,control]=Object.entries(entry)[0];
      return [name,control];
    }));
    assert.equal(definitions["icon@fc.l"].text,icon,controlName);
    assert.equal(definitions["action@fc.l"].text,textKey,controlName);
    assert.equal(definitions["action@fc.l"].localize,true,controlName);
    for(const [frame,expected] of [[0,seconds[0]],[10,seconds[1]],[20,seconds[2]]] as const){
      assert.equal(definitions[`time_${String(frame).padStart(2,"0")}@fc.l`].text,expected,`${controlName} G${frame}`);
    }
  }
});

test("objective text and progress form one compact visual block",()=>{
  for(const controlName of [
    "plant_hud@fc.p","defuse_hud@fc.p","defuse_kit_hud@fc.p",
  ]){
    const panel=actionbar[controlName] as {
      size:[number,number];controls:Array<Record<string,{offset?:[number,number];font_scale_factor?:number}>>;
    };
    const definitions=Object.fromEntries(panel.controls.map(entry=>Object.entries(entry)[0]));
    const icon=definitions["icon@fc.l"];
    const action=definitions["action@fc.l"];
    const time=definitions["time_00@fc.l"];
    const progress=definitions["frame_00@fc.img"];

    assert.ok(panel.size[0]<=110,`${controlName} width`);
    assert.ok(panel.size[1]<=42,`${controlName} height`);
    assert.equal(icon.offset?.[1],action.offset?.[1],`${controlName} icon baseline`);
    assert.equal(time.offset?.[1],action.offset?.[1],`${controlName} time baseline`);
    assert.ok(Math.abs((icon.offset?.[0]??0)-(action.offset?.[0]??0))<=34,`${controlName} icon gap`);
    assert.ok(Math.abs((time.offset?.[0]??0)-(action.offset?.[0]??0))<=40,`${controlName} time gap`);
    assert.ok(Math.abs((progress.offset?.[0]??0)-(action.offset?.[0]??0))<=4,`${controlName} progress alignment`);
    assert.ok((progress.offset?.[1]??0)<(action.offset?.[1]??0),`${controlName} progress order`);
    assert.ok((action.offset?.[1]??0)-(progress.offset?.[1]??0)<=20,`${controlName} vertical gap`);
    assert.equal(icon.font_scale_factor,1,`${controlName} icon scale`);
  }
});

test("objective progress is grouped on a translucent background",()=>{
  for(const controlName of [
    "plant_hud@fc.p","defuse_hud@fc.p","defuse_kit_hud@fc.p",
  ]){
    const panel=actionbar[controlName] as {
      size:[number,number];controls:Array<Record<string,{size?:[number,number];offset?:number[];anchor_from?:string;anchor_to?:string;texture?:string;alpha?:number;layer?:number;keep_ratio?:boolean}>>;
    };
    const definitions=Object.fromEntries(panel.controls.map(entry=>Object.entries(entry)[0]));
    const background=definitions["background@fc.img"];

    assert.ok(background,`${controlName} background`);
    assert.equal(background.texture,"textures/ui/hud_rectangle_text_background",controlName);
    const track=definitions["track@fc.img"];
    assert.deepEqual(track.size,[panel.size[0],2],`${controlName} full-width top edge`);
    assert.deepEqual(track.offset,[0,0]);
    assert.equal(track.anchor_from,"top_left");
    assert.equal(track.anchor_to,"top_left");
    assert.deepEqual(background.size,[panel.size[0],panel.size[1]-2],controlName);
    assert.deepEqual(background.offset,[0,2],`${controlName} background starts below bar`);
    assert.equal(background.anchor_from,"top_left");
    assert.equal(background.anchor_to,"top_left");
    assert.equal(background.keep_ratio,false,`${controlName} fills the text area`);
    assert.ok((background.alpha??1)>0&&(background.alpha??1)<1,`${controlName} alpha`);
    assert.equal(background.layer,0,`${controlName} background layer`);
    for(const name of ["icon@fc.l","action@fc.l","time_00@fc.l","frame_00@fc.img"]){
      assert.ok((definitions[name].layer??0)>background.layer,`${controlName} ${name} layer`);
    }
  }

  const png=readFileSync(new URL("../resource_pack/textures/ui/hud_rectangle_text_background.png",import.meta.url));
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(png.readUInt32BE(16),6);
  assert.equal(png.readUInt32BE(20),6);
  assert.equal(png[25],6);
});

test("weapon and objective HUD use separate responsive anchors",()=>{
  for(const controlName of [
    ...ammoDefinitions,"slash@fc.l","knife_dash@fc.l","bomb_dash@fc.l",
  ]){
    assert.equal(actionbar[controlName].anchor_from,"bottom_right");
    assert.equal(actionbar[controlName].anchor_to,"bottom_right");
    assert.match(JSON.stringify(actionbar[controlName].variables),/\$is_android|\$is_ios/);
  }
  assert.equal(actionbar["plant_hud@fc.p"].anchor_from,"center");
  assert.equal(actionbar["defuse_hud@fc.p"].anchor_from,"center");
  assert.equal(actionbar["defuse_kit_hud@fc.p"].anchor_from,"center");
});
