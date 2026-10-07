import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MATCH_CONFIG, TICKS } from "../src/config.ts";
import { describeFcabContract, encodePlayerHudFrame } from "../src/ui/hud_elements/fcab/index.ts";
import { WEAPONS } from "../src/weapons.ts";

const fcab=describeFcabContract();
const actionbarText="$actionbar_text";

function fieldExpression(field){
  return `('%.${field.width}s' * ($atext - ('%.${field.offset}s' * $atext)))`;
}

const held=fieldExpression(fcab.fields.held);
const heldPrefix=`('%.${fcab.fields.held.gunPrefix.length}s' * ($atext - ('%.${fcab.fields.held.offset}s' * $atext)))`;
const interaction=fieldExpression(fcab.fields.interaction);
const glyphFrame=fieldExpression(fcab.fields.progress);
const validFrame=`((('%.${fcab.prefix.length}s' * $atext) = '${fcab.prefix}') and (('%.${fcab.frameLength}s' * $atext) = $atext))`;

function runtimeControl(properties={}){
  return {$atext:actionbarText,...properties};
}

function visibleWhen(condition){
  return `(${validFrame} and ${condition})`;
}

function responsiveOffset(desktop,mobile){
  return {
    offset:"$offset",
    $offset:desktop,
    variables:[{
      requires:"((not $desktop_screen and not $education_edition) or ($is_android or $is_ios))",
      $offset:mobile
    }]
  };
}

function actionbarFactory(target){
  return {type:"panel",factory:{name:"hud_actionbar_text_factory",control_ids:{hud_actionbar_text:target}}};
}

function weaponLabelStyle(desktopOffset,mobileOffset){
  return runtimeControl({
    anchor_from:"bottom_right",
    anchor_to:"bottom_right",
    ...responsiveOffset(desktopOffset,mobileOffset),
    font_scale_factor:1,
    shadow:true
  });
}

function ammoLabels({name,field,max}){
  return Object.fromEntries(Array.from({length:max+1},(_,value)=>{
    const padded=String(value).padStart(field.digits,"0");
    return [`${name}_${padded}@fc_actionbar.${name}_label`,{
      text:String(value),
      visible:visibleWhen(`(${gunCondition} and (${fieldExpression(field)} = '${field.marker}${padded}'))`)
    }];
  }));
}

const objectiveSize=[100,20];
const barHeight=2;
const progressFrames=Array.from({length:fcab.fields.progress.max+1},(_,frame)=>({
  frame,
  suffix:String(frame).padStart(fcab.fields.progress.digits,"0"),
  visible:`(${glyphFrame} = '${fcab.fields.progress.marker}${String(frame).padStart(fcab.fields.progress.digits,"0")}')`
}));

function objectiveTemplates(){
  // Static inheritance only: keep runtime expressions on their original
  // controls and preserve the hierarchy, child order and factory targets.
  return {
    "objective_panel@fc.p":runtimeControl({
      type:"panel",
      size:objectiveSize,
      anchor_from:"center",
      anchor_to:"center",
      ...responsiveOffset([0,80],[0,46])
    }),
    "objective_background@fc.img":{
      texture:"textures/ui/hud_rectangle_text_background",
      size:[objectiveSize[0],objectiveSize[1]-barHeight],
      anchor_from:"top_left",
      anchor_to:"top_left",
      offset:[0,barHeight],
      keep_ratio:false,
      alpha:0.4,
      layer:0
    },
    "objective_track@fc.img":{
      texture:"fc/white",size:[objectiveSize[0],barHeight],
      anchor_from:"top_left",anchor_to:"top_left",offset:[0,0],
      keep_ratio:false,color:[0.65,0.65,0.65],alpha:0.65,layer:1
    },
    "objective_label@fc.l":runtimeControl({shadow:true,layer:1}),
    "objective_icon@fc_actionbar.objective_label":{offset:[-32,1],font_scale_factor:1},
    "objective_action@fc_actionbar.objective_label":{localize:true,offset:[-2,1]},
    "objective_time@fc_actionbar.objective_label":{offset:[34,1]},
    "objective_fill@fc.img":runtimeControl({
      texture:"fc/white",
      anchor_from:"top_left",anchor_to:"top_left",offset:[0,0],
      keep_ratio:false,color:[1,0.12,0.12],alpha:1,
      layer:2
    }),
    ...Object.fromEntries(progressFrames.map(({frame,suffix,visible})=>[
      `objective_frame_${suffix}@fc_actionbar.objective_fill`,
      {size:[objectiveSize[0]*frame/fcab.fields.progress.max,barHeight],visible}
    ]))
  };
}

function progressHud({mode,icon,textKey,durationSeconds}){
  const isDefuse=mode===fcab.fields.interaction.codes.defuse||mode===fcab.fields.interaction.codes.defuseKit;
  return {
    visible:visibleWhen(`(${interaction} = '${mode}')`),
    controls:[
      {"background@fc_actionbar.objective_background":{}},
      {"track@fc_actionbar.objective_track":{}},
      {"icon@fc_actionbar.objective_icon":{text:icon}},
      {"action@fc_actionbar.objective_action":{text:textKey}},
      ...progressFrames.map(({frame,suffix,visible})=>({
        [`time_${suffix}@fc_actionbar.objective_time`]:{
          text:`${(durationSeconds*(fcab.fields.progress.max-frame)/fcab.fields.progress.max).toFixed(1)}s`,
          visible
        }
      })),
      ...progressFrames.map(({suffix})=>({
        [`frame_${suffix}@fc_actionbar.objective_frame_${suffix}`]:isDefuse?{color:[0.45,1,0.5]}:{}
      }))
    ]
  };
}

const gunDefinitions=WEAPONS.filter(weapon=>weapon.slot!=="KNIFE");
const maximumMagazine=Math.max(...gunDefinitions.map(weapon=>weapon.magazineSize));
const maximumReserve=Math.max(...gunDefinitions.map(weapon=>weapon.reserveSize));
const gunCondition=`(${heldPrefix} = '${fcab.fields.held.gunPrefix}')`;
const knifeCondition=`(${held} = '${fcab.fields.held.knife}')`;
const bombCondition=`(${held} = '${fcab.fields.held.bomb}')`;
const magazineLabels=ammoLabels({name:"magazine",field:fcab.fields.magazine,max:maximumMagazine});
const reserveLabels=ammoLabels({name:"reserve",field:fcab.fields.reserve,max:maximumReserve});
const targets={
  ...Object.fromEntries(Object.keys(magazineLabels).map(definition=>{const name=definition.split("@")[0];return [name,`${name}@fc_actionbar.${name}`];})),
  slash:"slash@fc_actionbar.slash",
  ...Object.fromEntries(Object.keys(reserveLabels).map(definition=>{const name=definition.split("@")[0];return [name,`${name}@fc_actionbar.${name}`];})),
  knife_dash:"knife_dash@fc_actionbar.knife_dash",
  bomb_dash:"bomb_dash@fc_actionbar.bomb_dash",
  plant_hud:"plant_hud@fc_actionbar.plant_hud",
  defuse_hud:"defuse_hud@fc_actionbar.defuse_hud",
  defuse_kit_hud:"defuse_kit_hud@fc_actionbar.defuse_kit_hud"
};

export function buildActionbarHud(){
  return {
    namespace:"fc_actionbar",
    "magazine_label@fc.l":weaponLabelStyle([-120,-10],[-120,-10]),
    "reserve_label@fc.l":weaponLabelStyle([-80,-10],[-80,-10]),
    "weapon_status_label@fc.l":weaponLabelStyle([-105,-10],[-105,-10]),
    ...objectiveTemplates(),
    render:{
      type:"panel",size:["100%","100%"],anchor_from:"center",anchor_to:"center",
      controls:Object.entries(targets).map(([name,target])=>({[`${name}_factory`]:actionbarFactory(target)}))
    },
    ...magazineLabels,
    "slash@fc_actionbar.weapon_status_label":{text:"/",color:[0.65,0.65,0.65],visible:visibleWhen(gunCondition)},
    ...reserveLabels,
    "knife_dash@fc_actionbar.weapon_status_label":{text:"- / -",visible:visibleWhen(knifeCondition)},
    "bomb_dash@fc_actionbar.weapon_status_label":{text:"- / -",visible:visibleWhen(bombCondition)},
    "plant_hud@fc_actionbar.objective_panel":progressHud({mode:fcab.fields.interaction.codes.plant,icon:"\uE1E1",textKey:"fps.hud.plant",durationSeconds:MATCH_CONFIG.plantTicks/TICKS}),
    "defuse_hud@fc_actionbar.objective_panel":progressHud({mode:fcab.fields.interaction.codes.defuse,icon:"\uE1E0",textKey:"fps.hud.defuse",durationSeconds:MATCH_CONFIG.defuseWithoutKitTicks/TICKS}),
    "defuse_kit_hud@fc_actionbar.objective_panel":progressHud({mode:fcab.fields.interaction.codes.defuseKit,icon:"\uE1E0",textKey:"fps.hud.defuse",durationSeconds:MATCH_CONFIG.defuseTicks/TICKS})
  };
}

export function serializeActionbarHud(){
  return `${JSON.stringify(buildActionbarHud(),null,2)}\n`;
}

function fieldRange(field){
  return `${field.offset}–${field.offset+field.width-1}`;
}

export function renderFcabProtocolSection(){
  const sample=encodePlayerHudFrame({held:"W04",magazine:maximumMagazine,reserve:maximumReserve,interaction:{kind:"defuse",frame:7}});
  const {fields}=fcab;
  return [
    "```text",
    sample,
    "```",
    "",
    `정확히 ${fcab.frameLength}바이트인 ASCII 프레임이다.`,
    "",
    "| 범위 | 형식 | 의미 |",
    "| --- | --- | --- |",
    `| 0–${fcab.prefix.length-1} | \`${fcab.prefix}\` | 버전 없는 고정 프로토콜 식별자 |`,
    `| ${fieldRange(fields.held)} | \`Wxx\` | 현재 장비 코드 |`,
    `| ${fieldRange(fields.magazine)} | \`${fields.magazine.marker}${"0".repeat(fields.magazine.digits)}\` | 현재 탄창 \`${String(fields.magazine.min).padStart(fields.magazine.digits,"0")}–${String(fields.magazine.max).padStart(fields.magazine.digits,"0")}\` |`,
    `| ${fieldRange(fields.reserve)} | \`${fields.reserve.marker}${"0".repeat(fields.reserve.digits)}\` | 예비탄 \`${String(fields.reserve.min).padStart(fields.reserve.digits,"0")}–${String(fields.reserve.max).padStart(fields.reserve.digits,"0")}\` |`,
    `| ${fieldRange(fields.interaction)} | \`${fields.interaction.codes.none}\` | 없음, 설치, 일반 해제, 키트 해제 코드 |`,
    `| ${fieldRange(fields.progress)} | \`${fields.progress.marker}${"0".repeat(fields.progress.digits)}\` | 진행 글리프 인덱스 \`${String(fields.progress.min).padStart(fields.progress.digits,"0")}–${String(fields.progress.max).padStart(fields.progress.digits,"0")}\` |`,
    "",
    `장비 코드는 총기 \`${fields.held.gunCodes.join("`, `")}\`, 칼 \`${fields.held.knife}\`, 폭탄 \`${fields.held.bomb}\`, 숨김 \`${fields.held.hidden}\`이다. 실제 도달 가능한 탄창은 \`0–${maximumMagazine}\`, 예비탄은 \`0–${maximumReserve}\`이며 칼·폭탄·숨김 상태는 탄약을 0으로 만든다.`,
    "",
    `interaction 코드는 \`${fields.interaction.codes.none}\` 없음, \`${fields.interaction.codes.plant}\` 설치, \`${fields.interaction.codes.defuse}\` 일반 해제(${MATCH_CONFIG.defuseWithoutKitTicks/TICKS}초), \`${fields.interaction.codes.defuseKit}\` 키트 해제(${MATCH_CONFIG.defuseTicks/TICKS}초)다. \`${fields.progress.marker}00\`–\`${fields.progress.marker}${String(fields.progress.max-1).padStart(fields.progress.digits,"0")}\`는 진행 중이며 \`${fields.progress.marker}${String(fields.progress.max).padStart(fields.progress.digits,"0")}\`은 서버가 성공을 확정한 뒤에만 사용한다. 설치 시간은 ${MATCH_CONFIG.plantTicks/TICKS}초다.`
  ].join("\n");
}

export function projectFcabProtocolDocument(document){
  const start="<!-- FCAB:GENERATED:START -->";
  const end="<!-- FCAB:GENERATED:END -->";
  const pattern=new RegExp(`${start}[\\s\\S]*?${end}`);
  if(!pattern.test(document))throw new Error("HUD protocol document is missing the FCAB generated markers");
  return document.replace(pattern,`${start}\n${renderFcabProtocolSection()}\n${end}`);
}

export function writeFcabArtifacts(){
  const actionbarUrl=new URL("../resource_pack/ui/actionbar_hud.json",import.meta.url);
  const documentUrl=new URL("../docs/HUD_PROTOCOL.md",import.meta.url);
  writeFileSync(actionbarUrl,serializeActionbarHud());
  writeFileSync(documentUrl,projectFcabProtocolDocument(readFileSync(documentUrl,"utf8")));
}

const isMain=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(isMain)writeFcabArtifacts();
