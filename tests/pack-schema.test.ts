import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root=process.cwd();

test("custom item damage components use a positive integer accepted by Bedrock",()=>{
  const itemFiles=["bomb.json","gun_sidearm.json","gun_vector.json","gun_ranger.json","gun_bulldog.json","gun_longshot.json","knife.json"];
  for(const file of itemFiles){
    const json=JSON.parse(readFileSync(join(root,"behavior_pack","items",file),"utf8")) as {"minecraft:item":{components?:{"minecraft:damage"?:number|{"value"?:number}}}};
    const damage=json["minecraft:item"].components?.["minecraft:damage"];
    if(damage===undefined)continue;
    const value=typeof damage==="number"?damage:damage.value;
    assert.equal(Number.isInteger(value)&&value>0,true,file+" has invalid minecraft:damage");
  }
});

test("the passive defuse kit has no inventory item attachable or geometry definition",()=>{
  for(const path of [
    join(root,"behavior_pack","items","defuse_kit.json"),
    join(root,"resource_pack","attachables","defuse_kit.json"),
    join(root,"resource_pack","models","entity","defuse_kit.geo.json"),
  ])assert.equal(existsSync(path),false,path);
});
