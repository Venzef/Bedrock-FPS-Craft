import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root=resolve(import.meta.dirname,"..");
const generatedDirectories=[
  "behavior_pack/scripts",
];
const generatedFiles=[
  "docs/INSTALL.md",
  "docs/HUD_PROTOCOL.md",
  "resource_pack/font/glyph_E2.png",
  "resource_pack/textures/items/scoreboard.png",
  "resource_pack/textures/ui/scoreboard_white.png",
  "resource_pack/ui/actionbar_hud.json",
  "resource_pack/ui/hud_elements/permanents/scoreboard.json",
];

async function listFiles(directory){
  const paths=[];
  async function visit(current){
    let entries;
    try{entries=await readdir(current,{withFileTypes:true});}
    catch(error){
      if(error?.code==="ENOENT")return;
      throw error;
    }
    for(const entry of entries){
      const path=resolve(current,entry.name);
      if(entry.isDirectory())await visit(path);else paths.push(path);
    }
  }
  await visit(resolve(root,directory));
  return paths;
}

async function snapshot(){
  const paths=generatedFiles.map(path=>resolve(root,path));
  for(const directory of generatedDirectories)paths.push(...await listFiles(directory));
  const hashes=new Map();
  for(const path of paths.sort()){
    const key=relative(root,path).replaceAll("\\","/");
    try{
      const data=await readFile(path);
      hashes.set(key,createHash("sha256").update(data).digest("hex"));
    }catch(error){
      if(error?.code==="ENOENT")hashes.set(key,null);
      else throw error;
    }
  }
  return hashes;
}

function compare(before,after){
  const changed=[];
  for(const path of new Set([...before.keys(),...after.keys()])){
    if(!before.has(path))changed.push(`added: ${path}`);
    else if(!after.has(path))changed.push(`removed: ${path}`);
    else if(before.get(path)!==after.get(path))changed.push(`changed: ${path}`);
  }
  return changed.sort();
}

const before=await snapshot();
const npmCli=process.env.npm_execpath;
if(!npmCli)throw new Error("npm_execpath is unavailable; run this verifier through `npm run verify:generated`");
const generation=spawnSync(process.execPath,[npmCli,"run","generate"],{cwd:root,stdio:"inherit"});

if(generation.error)throw generation.error;
if(generation.status!==0)process.exit(generation.status??1);

const drift=compare(before,await snapshot());
if(drift.length){
  console.error("Generated artifacts are out of date:");
  for(const change of drift)console.error(`- ${change}`);
  console.error("Run `npm run generate`, review the diff, and commit the generated files.");
  process.exit(1);
}

console.log("Generated artifacts match their sources.");
