import assert from "node:assert/strict";
import test from "node:test";
import {
  FIXED_HOTBAR_LAYOUT,
  ensureFixedHotbarItem,
  ensureInventoryItem,
  ensureItemAtSlot,
  ensureWeaponInFixedHotbar,
  sanitizeFixedHotbarInventory,
  syncWeaponsToFixedHotbar,
} from "../src/inventory";

interface TestItem { typeId:string; marker:string; lockMode?:string }

class MemoryInventory {
  constructor(private readonly slots:Array<TestItem|undefined>) {}
  get size():number { return this.slots.length; }
  getItem(index:number):TestItem|undefined { return this.slots[index]; }
  setItem(index:number,item?:TestItem):void { this.slots[index]=item; }
}

test("an existing item type succeeds without adding a duplicate",()=>{
  const existing={typeId:"fps:bomb",marker:"existing"};
  const inventory=new MemoryInventory([undefined,existing]);

  const result=ensureInventoryItem(inventory,{typeId:"fps:bomb",marker:"incoming"},0);

  assert.deepEqual(result,{success:true,slot:1});
  assert.equal(inventory.getItem(0),undefined);
  assert.equal(inventory.getItem(1),existing);
});

test("an item is inserted into the first empty slot before replacing anything",()=>{
  const occupied={typeId:"minecraft:stone_sword",marker:"loadout"};
  const bomb={typeId:"fps:bomb",marker:"objective"};
  const inventory=new MemoryInventory([occupied,undefined,undefined]);

  const result=ensureInventoryItem(inventory,bomb,0);

  assert.deepEqual(result,{success:true,slot:1});
  assert.equal(inventory.getItem(0),occupied);
  assert.equal(inventory.getItem(1),bomb);
});

test("a full inventory replaces the preferred slot and returns the displaced item",()=>{
  const sword={typeId:"minecraft:stone_sword",marker:"slot-zero"};
  const food={typeId:"minecraft:golden_apple",marker:"slot-one"};
  const objective={typeId:"fps:objective_fixture",marker:"round-item"};
  const inventory=new MemoryInventory([sword,food]);

  const result=ensureInventoryItem(inventory,objective,1);

  assert.deepEqual(result,{success:true,slot:1,displaced:food});
  assert.equal(inventory.getItem(0),sword);
  assert.equal(inventory.getItem(1),objective);
});

test("a zero-sized inventory reports failure",()=>{
  const inventory=new MemoryInventory([]);

  const result=ensureInventoryItem(inventory,{typeId:"minecraft:emerald",marker:"shop"},0);

  assert.deepEqual(result,{success:false});
});

test("a full inventory does not replace an invalid preferred slot",()=>{
  const sword={typeId:"minecraft:stone_sword",marker:"slot-zero"};
  const food={typeId:"minecraft:golden_apple",marker:"slot-one"};
  const inventory=new MemoryInventory([sword,food]);

  const result=ensureInventoryItem(inventory,{typeId:"minecraft:emerald",marker:"shop"},2);

  assert.deepEqual(result,{success:false});
  assert.equal(inventory.getItem(0),sword);
  assert.equal(inventory.getItem(1),food);
});

test("a fixed-slot item moves to the requested hotbar slot and removes duplicates",()=>{
  const existing={typeId:"minecraft:emerald",marker:"old-stack"};
  const duplicate={typeId:"minecraft:emerald",marker:"duplicate"};
  const displaced={typeId:"minecraft:golden_apple",marker:"slot-seven"};
  const inventory=new MemoryInventory([undefined,existing,undefined,duplicate,undefined,undefined,undefined,displaced,undefined]);

  const result=ensureItemAtSlot(inventory,{typeId:"minecraft:emerald",marker:"incoming"},7);

  assert.deepEqual(result,{success:true,slot:7,displaced});
  assert.equal(inventory.getItem(1),undefined);
  assert.equal(inventory.getItem(3),undefined);
  assert.equal(inventory.getItem(7),existing);
});

test("the fixed hotbar contract keeps visible slots separate from tactical reservations",()=>{
  assert.deepEqual(FIXED_HOTBAR_LAYOUT,{
    size:9,primary:0,secondary:1,knife:2,tactical:[3,4,5,6],objective:7,shopAccess:8,
  });
});

test("weapon synchronization owns placement, lock modes, duplicate removal, and empty reservations",()=>{
  const inventory=new MemoryInventory([
    {typeId:"fps:gun_vector",marker:"duplicate"},
    {typeId:"minecraft:stone",marker:"unrelated"},
    {typeId:"minecraft:emerald",marker:"shop"},
    {typeId:"fps:gun_sidearm",marker:"wrong-slot"},
    {typeId:"minecraft:golden_apple",marker:"reserved"},
    {typeId:"fps:gun_vector",marker:"old"},
    {typeId:"minecraft:paper",marker:"reserved"},
    {typeId:"fps:bomb",marker:"objective"},
    {typeId:"minecraft:emerald",marker:"shop"},
  ]);

  syncWeaponsToFixedHotbar(inventory,[
    {slot:"PRIMARY",item:{typeId:"fps:gun_vector",marker:"primary"}},
    {slot:"SECONDARY",item:{typeId:"fps:gun_sidearm",marker:"secondary"}},
    {slot:"KNIFE",item:{typeId:"fps:knife",marker:"knife"}},
  ],typeId=>typeId.startsWith("fps:gun_")||typeId==="fps:knife");

  assert.deepEqual(inventory.getItem(0),{typeId:"fps:gun_vector",marker:"primary",lockMode:"none"});
  assert.deepEqual(inventory.getItem(1),{typeId:"fps:gun_sidearm",marker:"secondary",lockMode:"none"});
  assert.deepEqual(inventory.getItem(2),{typeId:"fps:knife",marker:"knife",lockMode:"slot"});
  assert.deepEqual([3,4,5,6].map(index=>inventory.getItem(index)),[undefined,undefined,undefined,undefined]);
  assert.deepEqual(inventory.getItem(7),{typeId:"fps:bomb",marker:"objective"});
  assert.deepEqual(inventory.getItem(8),{typeId:"minecraft:emerald",marker:"shop"});
});

test("fixed objective placement reuses one copy, removes duplicates, locks it, and returns displacement",()=>{
  const existing={typeId:"fps:objective_fixture",marker:"existing"};
  const duplicate={typeId:"fps:objective_fixture",marker:"duplicate"};
  const displaced={typeId:"minecraft:golden_apple",marker:"slot-seven"};
  const inventory=new MemoryInventory([undefined,existing,undefined,duplicate,undefined,undefined,undefined,displaced,undefined]);

  const result=ensureFixedHotbarItem(inventory,{typeId:"fps:objective_fixture",marker:"incoming"},"OBJECTIVE");

  assert.deepEqual(result,{success:true,slot:7,displaced});
  assert.deepEqual(inventory.getItem(7),{typeId:"fps:objective_fixture",marker:"existing",lockMode:"slot"});
  assert.equal(inventory.getItem(1),undefined);
  assert.equal(inventory.getItem(3),undefined);
});

test("weapon replacement keeps the old fixed-slot stack observable for the existing drop behavior",()=>{
  const old={typeId:"fps:gun_vector",marker:"old"};
  const inventory=new MemoryInventory([old,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined]);

  const result=ensureWeaponInFixedHotbar(inventory,{typeId:"fps:gun_ranger",marker:"new"},"PRIMARY");

  assert.deepEqual(result,{success:true,slot:0,displaced:old});
  assert.deepEqual(inventory.getItem(0),{typeId:"fps:gun_ranger",marker:"new",lockMode:"none"});
});

test("inventory sanitization retains only expected weapons, fixes locks, and clears tactical slots",()=>{
  const inventory=new MemoryInventory([
    {typeId:"fps:gun_vector",marker:"primary"},
    {typeId:"fps:gun_sidearm",marker:"secondary"},
    {typeId:"fps:knife",marker:"knife"},
    {typeId:"fps:bomb",marker:"must-clear-from-reserved"},
    {typeId:"minecraft:stone",marker:"must-clear"},
    {typeId:"fps:gun_vector",marker:"duplicate"},
    {typeId:"minecraft:paper",marker:"must-clear"},
    {typeId:"fps:objective_fixture",marker:"objective"},
    {typeId:"minecraft:emerald",marker:"shop"},
  ]);

  sanitizeFixedHotbarInventory(inventory,{
    isWeaponItem:typeId=>typeId.startsWith("fps:gun_")||typeId==="fps:knife",
    expectedWeaponType:slot=>({PRIMARY:"fps:gun_vector",SECONDARY:"fps:gun_sidearm",KNIFE:"fps:knife"}[slot]),
    isMatchItem:typeId=>new Set(["fps:bomb","fps:objective_fixture","minecraft:emerald","fps:gun_vector","fps:gun_sidearm","fps:knife"]).has(typeId),
    isObjectiveItem:typeId=>typeId==="fps:bomb"||typeId==="fps:objective_fixture",
    isDroppableObjectiveItem:typeId=>typeId==="fps:bomb",
    isShopAccessItem:typeId=>typeId==="minecraft:emerald",
  });

  assert.deepEqual(inventory.getItem(0),{typeId:"fps:gun_vector",marker:"primary",lockMode:"none"});
  assert.deepEqual(inventory.getItem(1),{typeId:"fps:gun_sidearm",marker:"secondary",lockMode:"none"});
  assert.deepEqual(inventory.getItem(2),{typeId:"fps:knife",marker:"knife",lockMode:"slot"});
  assert.deepEqual([3,4,5,6].map(index=>inventory.getItem(index)),[undefined,undefined,undefined,undefined]);
  assert.equal(inventory.getItem(5),undefined);
  assert.deepEqual(inventory.getItem(7),{typeId:"fps:objective_fixture",marker:"objective",lockMode:"slot"});
  assert.deepEqual(inventory.getItem(8),{typeId:"minecraft:emerald",marker:"shop",lockMode:"slot"});
});
