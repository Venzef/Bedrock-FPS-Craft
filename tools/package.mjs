import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const root=resolve(import.meta.dirname,"..");
const {version}=JSON.parse(await readFile(resolve(root,"package.json"),"utf8"));
const build=resolve(root,"build");
const stage=resolve(build,"mcaddon");
const dist=resolve(root,`release-${version}`);
await rm(build,{recursive:true,force:true});await rm(dist,{recursive:true,force:true});
await mkdir(stage,{recursive:true});await mkdir(dist,{recursive:true});

function crc32(data){
  let crc=0xffffffff;
  for(const byte of data){
    crc^=byte;
    for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}

async function listFiles(directory){
  const result=[];
  async function visit(current){
    for(const entry of await readdir(current,{withFileTypes:true})){
      const path=resolve(current,entry.name);
      if(entry.isDirectory())await visit(path);else result.push(path);
    }
  }
  await visit(directory);
  return result;
}

async function zipDirectory(source,destination){
  const files=await listFiles(source);
  const localParts=[];
  const centralParts=[];
  let offset=0;

  for(const file of files){
    const data=await readFile(file);
    const name=Buffer.from(relative(source,file).split(sep).join("/"));
    const checksum=crc32(data);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);
    local.writeUInt16LE(20,4);
    local.writeUInt16LE(0,6);
    local.writeUInt16LE(0,8);
    local.writeUInt16LE(0,10);
    local.writeUInt16LE(0,12);
    local.writeUInt32LE(checksum,14);
    local.writeUInt32LE(data.length,18);
    local.writeUInt32LE(data.length,22);
    local.writeUInt16LE(name.length,26);
    local.writeUInt16LE(0,28);
    localParts.push(local,name,data);

    const central=Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0);
    central.writeUInt16LE(20,4);
    central.writeUInt16LE(20,6);
    central.writeUInt16LE(0,8);
    central.writeUInt16LE(0,10);
    central.writeUInt16LE(0,12);
    central.writeUInt16LE(0,14);
    central.writeUInt32LE(checksum,16);
    central.writeUInt32LE(data.length,20);
    central.writeUInt32LE(data.length,24);
    central.writeUInt16LE(name.length,28);
    central.writeUInt16LE(0,30);
    central.writeUInt16LE(0,32);
    central.writeUInt16LE(0,34);
    central.writeUInt16LE(0,36);
    central.writeUInt32LE(0,38);
    central.writeUInt32LE(offset,42);
    centralParts.push(central,name);
    offset+=local.length+name.length+data.length;
  }

  const centralDirectory=Buffer.concat(centralParts);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(0,4);
  end.writeUInt16LE(0,6);
  end.writeUInt16LE(files.length,8);
  end.writeUInt16LE(files.length,10);
  end.writeUInt32LE(centralDirectory.length,12);
  end.writeUInt32LE(offset,16);
  end.writeUInt16LE(0,20);
  await writeFile(destination,Buffer.concat([...localParts,centralDirectory,end]));
}

async function makePack(source,name){
  const pack=resolve(dist,`${name}.mcpack`);
  await zipDirectory(source,pack);
  await cp(pack,resolve(stage,`${name}.mcpack`));
}
await makePack(resolve(root,"behavior_pack"),`BombDefusal_BP-${version}`);
await makePack(resolve(root,"resource_pack"),`BombDefusal_RP-${version}`);
const out=resolve(dist,`BombDefusal-${version}.mcaddon`);
await zipDirectory(stage,out);
await cp(out,resolve(root,"BombDefusal.mcaddon"));
await writeFile(resolve(dist,"README.txt"),"Import BombDefusal.mcaddon, enable both packs on a new flat world, grant yourself tag fps_admin, then run /scriptevent fps:admin build. See docs/INSTALL.md.\r\n");
console.log(out);
