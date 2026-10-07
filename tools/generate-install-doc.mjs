import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root=resolve(import.meta.dirname,"..");
export const releasePathStart="<!-- INSTALL:RELEASE-PATH:START -->";
export const releasePathEnd="<!-- INSTALL:RELEASE-PATH:END -->";

export function renderReleasePath(version){
  if(typeof version!=="string"||!/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)){
    throw new Error(`Unsupported package version: ${String(version)}`);
  }
  return `\`release-${version}/BombDefusal-${version}.mcaddon\``;
}

export function projectInstallDocument(document,version){
  const start=document.indexOf(releasePathStart);
  const end=document.indexOf(releasePathEnd);
  if(start<0||end<0||end<start){
    throw new Error("docs/INSTALL.md is missing the release path markers");
  }
  if(document.indexOf(releasePathStart,start+releasePathStart.length)>=0||
    document.indexOf(releasePathEnd,end+releasePathEnd.length)>=0){
    throw new Error("docs/INSTALL.md must contain exactly one release path marker pair");
  }
  return `${document.slice(0,start)}${releasePathStart}${renderReleasePath(version)}${releasePathEnd}${document.slice(end+releasePathEnd.length)}`;
}

export function generateInstallDocument(){
  const packageJson=JSON.parse(readFileSync(resolve(root,"package.json"),"utf8"));
  const installPath=resolve(root,"docs/INSTALL.md");
  const document=readFileSync(installPath,"utf8");
  writeFileSync(installPath,projectInstallDocument(document,packageJson.version));
}

if(import.meta.url===pathToFileURL(process.argv[1]).href)generateInstallDocument();
