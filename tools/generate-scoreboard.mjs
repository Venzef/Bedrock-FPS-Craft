import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { SCOREBOARD_WIRE } from "../src/scoreboard/wire.ts";

const root=resolve(import.meta.dirname,"..");
const save=async(path,data)=>writeFile(resolve(root,path),JSON.stringify(data,null,2)+"\n");
const view=(expression,target="#visible")=>({binding_type:"view",source_property_name:expression,target_property_name:target});
const title={binding_name:"#hud_title_text_string"};
const field=(at,length)=>`('%.${length}s' * (#hud_title_text_string - (('%.' + (${at}) + 's') * #hud_title_text_string)))`;
const bind=(expression)=>[title,view(expression)];
const at=(delta)=>`$row_at + ${delta}`;
const state=field(at(0),1),ally=`(${field(205,1)} = $role_code)`;
const label=(text,x,width,extra={})=>({type:"label",text,localize:false,shadow:false,font_scale_factor:0.75,
  anchor_from:"top_left",anchor_to:"top_left",offset:[x,0],size:[width,14],text_alignment:"center",layer:3,...extra});
const dataLabel=(delta,length,x,width,extra={})=>label("#cell",x,width,{bindings:[title,view(field(at(delta),length),"#cell")],...extra});
const columns=(money)=>[
  ["rank",1,1,"1%","5%"],["name",2,32,"15%",money?"39%":"49%"],
  ["kills",34,3,money?"54%":"64%","10%"],["deaths",37,3,money?"64%":"76%","10%"],
  ["assists",40,3,money?"74%":"88%","10%"],...(money?[["money",43,5,"84%","16%"]]:[])
];
const rowContent=(money,color)=>({type:"panel",size:["100%","100%"],bindings:bind(money?ally:`(not ${ally})`),controls:[
  {icon:{type:"image",texture:"$portrait",size:[11,11],offset:["8%",1],anchor_from:"top_left",anchor_to:"top_left",layer:3,color}},
  ...columns(money).map(([name,delta,length,x,width])=>({[name]:dataLabel(delta,length,x,width,{color,...(name==="name"?{text_alignment:"left"}:{} )})}))
]});
const rowStyle=(condition,color)=>({type:"panel",size:["100%","100%"],bindings:bind(condition),controls:[
  {allied:rowContent(true,color)},{opponent:rowContent(false,color)}
]});
const row={type:"panel",size:["100%","14%"],anchor_from:"top_left",anchor_to:"top_left",bindings:bind(`(not (${state} = 'N'))`),controls:[
  {self_background:{type:"image",texture:"textures/ui/scoreboard_white",alpha:0.19,size:["100%","100%"],layer:1,bindings:bind(`((${state} = 'S') or (${state} = 'X'))`)}},
  {dead_background:{type:"image",texture:"textures/ui/Black",alpha:0.35,size:["100%","100%"],layer:2,bindings:bind(`((${state} = 'D') or (${state} = 'X'))`)}},
  {alive:rowStyle(`(${state} = 'A')`,[0.8,0.85,0.9])},
  {dead:rowStyle(`(${state} = 'D')`,[0.38,0.42,0.47])},
  {self:rowStyle(`((${state} = 'S') or (${state} = 'X'))`,[1,1,1])}
]};
const header=(money)=>({type:"panel",size:["100%",14],offset:[0,"20%"],anchor_from:"top_left",anchor_to:"top_left",bindings:bind(money?ally:`(not ${ally})`),controls:
  columns(money).map(([name,,,x,width])=>({[name]:label(({rank:"#",name:"fps.scoreboard.name",kills:"K",deaths:"D",assists:"A",money:"fps.scoreboard.money"})[name],x,width,{color:[0.64,0.68,0.73],localize:name==="name"||name==="money",...(name==="name"?{text_alignment:"left"}:{})})}))
});
const team=(role,index,color)=>({type:"panel",size:["49.5%","100%"],anchor_from:role==="CT"?"top_left":"top_right",anchor_to:role==="CT"?"top_left":"top_right",
  $role_code:role==="CT"?"C":"T",$portrait:`textures/ui/team_${role==="CT"?"defender":"attacker"}_player`,controls:[
    {accent:{type:"image",texture:"textures/ui/scoreboard_white",color,size:["100%",2],anchor_from:"top_left",anchor_to:"top_left"}},
    {team_name:label(`fps.scoreboard.${role.toLowerCase()}`,"3%","65%",{localize:true,color,font_scale_factor:1,offset:[role==="CT"?"3%":"32%","5%"],text_alignment:role==="CT"?"left":"right"})},
    {score:label("#score",role==="CT"?"79%":"3%","18%",{font_scale_factor:1.5,color,offset:[role==="CT"?"79%":"3%","4%"],bindings:[title,view(field(role==="CT"?206:208,2),"#score")]})},
    {allied_header:header(true)},{opponent_header:header(false)},
    ...Array.from({length:5},(_,i)=>({[`row_${i}@fps_scoreboard.row`]:{$row_at:SCOREBOARD_WIRE.offset+SCOREBOARD_WIRE.header+(index+i)*SCOREBOARD_WIRE.row,offset:[0,`${29+i*14}%`]}}))
]});
const ui={namespace:"fps_scoreboard",render:{type:"panel",size:["94%","58%"],max_size:[760,190],anchor_from:"center",anchor_to:"center",layer:100,
  bindings:bind(`(${field(202,3)} = 'SB1')`),controls:[
    {background:{type:"image",texture:"textures/ui/Black",alpha:0.68,size:["100%","100%"],layer:0}},
    {ct:team("CT",0,[0.35,0.65,1])},{t:team("T",5,[1,0.59,0.24])}
  ]},row};
await save("resource_pack/ui/hud_elements/permanents/scoreboard.json",ui);

// Small geometric pixel assets, in the same code-owned style as existing HUD glyphs.
function png(width,height,pixel){
  const scan=Buffer.alloc((width*4+1)*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)scan.set(pixel(x,y),y*(width*4+1)+1+x*4);
  function chunk(name,data){
    const type=Buffer.from(name),body=Buffer.concat([type,data]);let crc=0xffffffff;
    for(const byte of body){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    const result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);body.copy(result,4);result.writeUInt32BE((crc^0xffffffff)>>>0,result.length-4);return result;
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",deflateSync(scan)),chunk("IEND",Buffer.alloc(0))]);
}
await mkdir(resolve(root,"resource_pack/textures/items"),{recursive:true});
await writeFile(resolve(root,"resource_pack/textures/items/scoreboard.png"),png(32,32,(x,y)=>{
  if(x<2||x>29||y<4||y>27)return [0,0,0,0];
  if(x===2||x===29||y===4||y===27)return [106,115,125,255];
  if(y>=8&&y<=23&&(y-8)%5<2&&x>=6&&x<=25)return x<15?[77,154,238,255]:x>16?[248,151,67,255]:[35,39,46,255];
  return [35,39,46,255];
}));
await writeFile(resolve(root,"resource_pack/textures/ui/scoreboard_white.png"),png(1,1,()=>[255,255,255,255]));
