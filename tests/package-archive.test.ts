import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the distributable mcaddon starts with a ZIP local-file header",()=>{
  const bytes=readFileSync(new URL("../BombDefusal.mcaddon",import.meta.url));
  assert.deepEqual([...bytes.subarray(0,4)],[0x50,0x4b,0x03,0x04],"BombDefusal.mcaddon must be a ZIP archive");
});
