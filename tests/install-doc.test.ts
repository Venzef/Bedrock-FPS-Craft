import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  projectInstallDocument,
  releasePathEnd,
  releasePathStart,
  renderReleasePath,
} from "../tools/generate-install-doc.mjs";

const root=resolve(import.meta.dirname,"..");

test("the install document release path follows the package version",()=>{
  const packageJson=JSON.parse(readFileSync(resolve(root,"package.json"),"utf8"));
  const document=readFileSync(resolve(root,"docs/INSTALL.md"),"utf8");

  assert.equal(document,projectInstallDocument(document,packageJson.version));
  assert.ok(document.includes(`${releasePathStart}${renderReleasePath(packageJson.version)}${releasePathEnd}`));
});

test("the install document generator rejects an unsupported version",()=>{
  assert.throws(()=>renderReleasePath("현재 버전"),/Unsupported package version/);
});
