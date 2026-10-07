import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ensureFixedHotbarItem } from "../src/inventory";
import { roundAchievements } from "../src/rules";

interface TestItem { typeId:string; lockMode?:string }

class MemoryInventory {
  constructor(private readonly slots:Array<TestItem|undefined>) {}
  get size():number { return this.slots.length; }
  getItem(index:number):TestItem|undefined { return this.slots[index]; }
  setItem(index:number,item?:TestItem):void { this.slots[index]=item; }
}

const game=readFileSync(new URL("../src/game.ts",import.meta.url),"utf8");

test("completed planting and defusing refresh the player's input permissions",()=>{
  const refresh=game.slice(game.indexOf("private refreshBombInteractionPlayers"),game.indexOf("private applyBombTransition"));
  assert.match(refresh,/effect\.kind==="PLANTED"/);
  assert.match(refresh,/effect\.kind==="DEFUSED"/);
});

test("ace is shown only to the winning role",()=>{
  const achievements=game.slice(game.indexOf("private sendRoundAchievements"),game.indexOf("private sendRoundResultBanners"));
  assert.match(achievements,/if\(result\.acePlayerId\)this\.sendBannerToRole\("ACE",winner,roles\)/);
  assert.doesNotMatch(achievements,/if\(result\.acePlayerId\)this\.sendBanner\("ACE"\)/);
});

test("ace requires a full five-versus-five round and all five enemy kills",()=>{
  const result=roundAchievements({
    winner:"T",reason:"elimination",participants:{T:5,CT:5},deaths:{T:1,CT:5},
    roles:new Map([["t1","T"]]),
    killsByPlayer:new Map([["t1",new Set(["ct1","ct2","ct3","ct4","ct5"])] ]),
    clutchCandidates:{T:undefined,CT:undefined},survivors:{T:new Set(["t1","t2","t3","t4"]),CT:new Set()},
  });
  assert.equal(result.acePlayerId,"t1");

  const shortRound=roundAchievements({
    winner:"T",reason:"elimination",participants:{T:2,CT:3},deaths:{T:0,CT:3},
    roles:new Map([["t1","T"]]),
    killsByPlayer:new Map([["t1",new Set(["ct1","ct2","ct3"])] ]),
    clutchCandidates:{T:undefined,CT:undefined},survivors:{T:new Set(["t1","t2"]),CT:new Set()},
  });
  assert.equal(shortRound.acePlayerId,undefined);
});

test("the bomb is droppable from its fixed hotbar slot",()=>{
  const inventory=new MemoryInventory(Array.from({length:9}));
  const result=ensureFixedHotbarItem(inventory,{typeId:"fps:bomb"},"DROPPABLE_OBJECTIVE");

  assert.deepEqual(result,{success:true,slot:7});
  assert.deepEqual(inventory.getItem(7),{typeId:"fps:bomb",lockMode:"none"});
});

test("the USP uses the gold sword texture path",()=>{
  const atlas=JSON.parse(readFileSync(new URL("../resource_pack/textures/item_texture.json",import.meta.url),"utf8"));
  assert.equal(atlas.texture_data.fps_gun_sidearm.textures,"textures/items/gold_sword");
});
