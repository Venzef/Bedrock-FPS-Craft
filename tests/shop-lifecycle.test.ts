import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SHOP } from "../src/config";
import {
  OpenShopSessions,
  ShopPurchaseTransaction,
  canUseShop,
  removeItemsByType,
  type ShopPurchaseTarget,
} from "../src/shop";
import type { FixedHotbarWeaponSlot } from "../src/inventory";
import type { ArmorTier, PersistedMatchState, PurchasableArmorTier, WeaponLoadout, WeaponState } from "../src/types";

const gameSource = readFileSync(new URL("../src/game.ts", import.meta.url), "utf8");

function state(money = 800): PersistedMatchState {
  return {
    phase: "FREEZE", round: 2, tScore: 0, ctScore: 0, lossStreak: { T: 0, CT: 0 }, timerTicks: 100,
    players: [
      { id: "t", name: "T", squad: "T", money, alive: true, activeFromRound: 1, connected: true, joined: true },
    ],
  };
}

interface FakeSnapshot { inventory: string[]; armor: string[]; hasDefuseKit:boolean }

class FakeShopTarget implements ShopPurchaseTarget {
  inventory = ["fps:old_item", "", "", "", "", "", "", "", ""];
  armor = ["", ""];
  inZone = true;
  placementFailure = false;
  armorFailure = false;
  giveFailure = false;
  loadoutFailure = false;
  defuseKit = false;
  replaced: WeaponState | undefined;

  constructor(private readonly match: PersistedMatchState) {}

  inBuyZone(): boolean { return this.inZone; }

  snapshot(): FakeSnapshot {
    return { inventory: [...this.inventory], armor: [...this.armor], hasDefuseKit:this.defuseKit };
  }

  restore(snapshot: unknown): void {
    const saved = snapshot as FakeSnapshot;
    this.inventory = [...saved.inventory];
    this.armor = [...saved.armor];
    this.defuseKit = saved.hasDefuseKit;
  }

  setLoadout(loadout: WeaponLoadout | undefined): boolean {
    this.match.players[0].loadout = loadout;
    return !this.loadoutFailure;
  }

  placeWeapon(itemId: string, slot: FixedHotbarWeaponSlot): { success: true } | { success: false; reason: "equipment-placement-failed" } {
    const index = slot === "PRIMARY" ? 0 : slot === "SECONDARY" ? 1 : 2;
    this.inventory[index] = itemId;
    return this.placementFailure ? { success: false, reason: "equipment-placement-failed" } : { success: true };
  }

  armorTier(): ArmorTier {
    const hasHelmet = this.armor[0] === "minecraft:iron_helmet";
    const hasChestplate = this.armor[1] === "minecraft:iron_chestplate";
    return hasChestplate ? (hasHelmet ? "ARMOR_SET" : "ARMOR") : "NONE";
  }

  equipArmor(tier: PurchasableArmorTier): boolean {
    this.armor[1] = "minecraft:iron_chestplate";
    if (tier === "ARMOR_SET") this.armor[0] = "minecraft:iron_helmet";
    return !this.armorFailure;
  }

  hasDefuseKit():boolean { return this.defuseKit; }

  equipDefuseKit():boolean {
    this.defuseKit=true;
    this.match.players[0].hasDefuseKit=true;
    return true;
  }

  giveItem(itemId: string, amount: number): boolean {
    if (this.giveFailure) return false;
    this.inventory[3] = `${itemId}:${amount}`;
    return true;
  }

  commitWeaponReplacement(replaced: WeaponState | undefined): void {
    this.replaced = replaced && { ...replaced };
  }
}

function open(transaction: ShopPurchaseTransaction, match: PersistedMatchState, target: FakeShopTarget) {
  const result = transaction.openSession(match, "t", target.inBuyZone());
  if (!result.success) throw new Error(`Unable to open shop: ${result.reason}`);
  return result.session;
}

test("an active player can purchase from the current buy phase session", () => {
  assert.equal(canUseShop(state(), "t", 2), true);
});

test("a shop session expires when the buy phase or round changes", () => {
  const match = state();
  match.phase = "LIVE";
  assert.equal(canUseShop(match, "t", 2), false);
  match.phase = "FREEZE"; match.round = 3;
  assert.equal(canUseShop(match, "t", 2), false);
});

test("dead disconnected inactive and unjoined players cannot purchase", () => {
  for (const change of [{ alive: false }, { connected: false }, { joined: false }, { activeFromRound: 3 }]) {
    const match = state(); Object.assign(match.players[0], change);
    assert.equal(canUseShop(match, "t", 2), false);
  }
});

test("buy phase cleanup removes every emerald without touching the loadout", () => {
  const slots = Array<{ typeId: string } | undefined>(5).fill(undefined);
  slots[0] = { typeId: "minecraft:emerald" }; slots[1] = { typeId: "minecraft:stone_sword" }; slots[3] = { typeId: "minecraft:emerald" };
  const removed = removeItemsByType({
    size: slots.length,
    getItem: index => slots[index],
    setItem: index => { slots[index] = undefined; },
  }, "minecraft:emerald");

  assert.equal(removed, 2);
  assert.deepEqual(slots, [undefined, { typeId: "minecraft:stone_sword" }, undefined, undefined, undefined]);
});

test("only a currently open shop session is force-closed", () => {
  const sessions = new OpenShopSessions(); let closes = 0;
  assert.equal(sessions.open("t"), true);
  assert.equal(sessions.close("t", () => { closes++; }), true);
  assert.equal(sessions.close("t", () => { closes++; }), false);
  assert.equal(closes, 1);
});

test("a second shop session cannot replace the tracked open form", () => {
  const sessions = new OpenShopSessions(); let closes = 0;
  assert.equal(sessions.open("t"), true);
  assert.equal(sessions.open("t"), false);
  assert.equal(sessions.close("t", () => { closes++; }), true);
  assert.equal(closes, 1);
});

test("a successful weapon purchase commits the loadout and money through Shop", () => {
  const match = state(); const target = new FakeShopTarget(match); const transaction = new ShopPurchaseTransaction(SHOP);
  const result = transaction.purchase(open(transaction, match, target), match, 0, target);

  assert.deepEqual(result, { success: true, price: 500, itemId: "fps:gun_sidearm" });
  assert.equal(match.players[0].money, 300);
  assert.equal(match.players[0].loadout?.secondary?.id, "W05");
  assert.equal(target.inventory[1], "fps:gun_sidearm");
});

test("insufficient money leaves money, loadout, and inventory unchanged", () => {
  const match = state(100); const target = new FakeShopTarget(match); const before = target.snapshot();
  const transaction = new ShopPurchaseTransaction(SHOP);
  const result = transaction.purchase(open(transaction, match, target), match, 0, target);

  assert.deepEqual(result, { success: false, reason: "insufficient-money" });
  assert.equal(match.players[0].money, 100);
  assert.equal(match.players[0].loadout, undefined);
  assert.deepEqual(target.snapshot(), before);
});

test("weapon placement failure restores the inventory before charging money", () => {
  const match = state(); const target = new FakeShopTarget(match); target.placementFailure = true;
  const before = target.snapshot();
  const transaction = new ShopPurchaseTransaction(SHOP);
  const result = transaction.purchase(open(transaction, match, target), match, 0, target);

  assert.deepEqual(result, { success: false, reason: "equipment-placement-failed" });
  assert.equal(match.players[0].money, 800);
  assert.equal(match.players[0].loadout, undefined);
  assert.deepEqual(target.snapshot(), before);
});

test("a failed loadout change restores the already placed weapon", () => {
  const match = state(); const target = new FakeShopTarget(match); target.loadoutFailure = true;
  const before = target.snapshot();
  const transaction = new ShopPurchaseTransaction(SHOP);
  const result = transaction.purchase(open(transaction, match, target), match, 0, target);

  assert.deepEqual(result, { success: false, reason: "equipment-placement-failed" });
  assert.equal(match.players[0].money, 800);
  assert.equal(match.players[0].loadout, undefined);
  assert.deepEqual(target.snapshot(), before);
});

test("weapon replacement passes the old weapon state to the adapter", () => {
  const match = state(2000);
  match.players[0].loadout = { primary: { id: "W02", magazine: 3, reserve: 4 }, knife: { id: "W14", magazine: 0, reserve: 0 } };
  const target = new FakeShopTarget(match); const transaction = new ShopPurchaseTransaction(SHOP);
  const result = transaction.purchase(open(transaction, match, target), match, 1, target);

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.replaced, { id: "W02", magazine: 3, reserve: 4 });
  assert.deepEqual(target.replaced, result.replaced);
  assert.equal(match.players[0].loadout?.primary?.id, "W04");
  assert.equal(match.players[0].loadout?.primary?.magazine, 30);
});

test("a stale state object rejects the selection after a match reset", () => {
  const match = state(); const target = new FakeShopTarget(match); const transaction = new ShopPurchaseTransaction(SHOP);
  const session = open(transaction, match, target);
  const replacedState = { ...match, players: match.players.map(player => ({ ...player })) };

  assert.deepEqual(transaction.purchase(session, replacedState, 0, target), { success: false, reason: "stale-session" });
  assert.equal(match.players[0].money, 800);
});

test("round changes reject a selection from the old session", () => {
  const match = state(); const target = new FakeShopTarget(match); const transaction = new ShopPurchaseTransaction(SHOP);
  const session = open(transaction, match, target); match.round++;

  assert.deepEqual(transaction.purchase(session, match, 0, target), { success: false, reason: "round-changed" });
});

test("phase changes reject a selection from the old session", () => {
  const match = state(); const target = new FakeShopTarget(match); const transaction = new ShopPurchaseTransaction(SHOP);
  const session = open(transaction, match, target); match.phase = "LIVE";

  assert.deepEqual(transaction.purchase(session, match, 0, target), { success: false, reason: "phase-changed" });
});

test("an inactive player is rejected by the purchase interface", () => {
  const match = state(); const target = new FakeShopTarget(match); const transaction = new ShopPurchaseTransaction(SHOP);
  const session = open(transaction, match, target); match.players[0].alive = false;

  assert.deepEqual(transaction.purchase(session, match, 0, target), { success: false, reason: "player-inactive" });
});

test("armor placement failure does not charge money", () => {
  const match = state(3000); const target = new FakeShopTarget(match); target.armorFailure = true;
  const before = target.snapshot(); const transaction = new ShopPurchaseTransaction(SHOP);
  const result = transaction.purchase(open(transaction, match, target), match, 5, target);

  assert.deepEqual(result, { success: false, reason: "equipment-placement-failed" });
  assert.equal(match.players[0].money, 3000);
  assert.deepEqual(target.snapshot(), before);
});

test("armor and armor set use their confirmed full prices", () => {
  const armorMatch = state(1000); const armorTarget = new FakeShopTarget(armorMatch);
  const armorTransaction = new ShopPurchaseTransaction(SHOP);
  assert.deepEqual(
    armorTransaction.purchase(open(armorTransaction, armorMatch, armorTarget), armorMatch, 5, armorTarget),
    { success: true, price: 600, itemId: "fps:iron_armor" },
  );
  assert.equal(armorMatch.players[0].money, 400);
  assert.deepEqual(armorTarget.armor, ["", "minecraft:iron_chestplate"]);

  const setMatch = state(1200); const setTarget = new FakeShopTarget(setMatch);
  const setTransaction = new ShopPurchaseTransaction(SHOP);
  assert.deepEqual(
    setTransaction.purchase(open(setTransaction, setMatch, setTarget), setMatch, 6, setTarget),
    { success: true, price: 1000, itemId: "fps:iron_armor_set" },
  );
  assert.equal(setMatch.players[0].money, 200);
  assert.deepEqual(setTarget.armor, ["minecraft:iron_helmet", "minecraft:iron_chestplate"]);
});

test("armor set charges only the 400 upgrade difference after armor", () => {
  const match = state(500); const target = new FakeShopTarget(match);
  target.equipArmor("ARMOR");
  const transaction = new ShopPurchaseTransaction(SHOP);

  assert.deepEqual(transaction.quote(6, match.players[0].money, target), {
    item: SHOP[6], price: 400, buyable: true, owned: false,
  });
  assert.deepEqual(
    transaction.purchase(open(transaction, match, target), match, 6, target),
    { success: true, price: 400, itemId: "fps:iron_armor_set" },
  );
  assert.equal(match.players[0].money, 100);
  assert.deepEqual(target.armor, ["minecraft:iron_helmet", "minecraft:iron_chestplate"]);
});

test("owned armor products cannot be purchased twice", () => {
  const match = state(2000); const target = new FakeShopTarget(match);
  target.equipArmor("ARMOR_SET");
  const before = target.snapshot();
  const transaction = new ShopPurchaseTransaction(SHOP);

  assert.equal(transaction.quote(5, match.players[0].money, target)?.owned, true);
  assert.equal(transaction.quote(6, match.players[0].money, target)?.owned, true);
  assert.deepEqual(
    transaction.purchase(open(transaction, match, target), match, 6, target),
    { success: false, reason: "already-owned" },
  );
  assert.equal(match.players[0].money, 2000);
  assert.deepEqual(target.snapshot(), before);
});

test("a CT buys a passive defuse kit without receiving an inventory item",()=>{
  const match=state(800);match.players[0].squad="CT";
  const target=new FakeShopTarget(match),before=[...target.inventory];
  const transaction=new ShopPurchaseTransaction(SHOP);

  const result=transaction.purchase(open(transaction,match,target),match,7,target);

  assert.deepEqual(result,{success:true,price:400,itemId:"fps:defuse_kit"});
  assert.equal(match.players[0].hasDefuseKit,true);
  assert.deepEqual(target.inventory,before);
});

test("an inventory failure does not charge money or mutate the target", () => {
  const match = state(1000); const target = new FakeShopTarget(match); target.giveFailure = true;
  const transaction = new ShopPurchaseTransaction([{ id: "minecraft:golden_apple", name: "Test", price: 100, amount: 1 }]);
  const before = target.snapshot();
  const result = transaction.purchase(open(transaction, match, target), match, 0, target);

  assert.deepEqual(result, { success: false, reason: "inventory-full" });
  assert.equal(match.players[0].money, 1000);
  assert.deepEqual(target.snapshot(), before);
});

test("invalid selections and exited buy zones are explicit policy results", () => {
  const match = state(); const target = new FakeShopTarget(match); const transaction = new ShopPurchaseTransaction(SHOP);
  const session = open(transaction, match, target);
  assert.deepEqual(transaction.purchase(session, match, 99, target), { success: false, reason: "invalid-shop-item" });
  target.inZone = false;
  assert.deepEqual(transaction.purchase(session, match, 0, target), { success: false, reason: "buy-zone-exited" });
});

test("two UI callers receive the same purchase policy from one Shop interface", () => {
  const runCaller = () => {
    const match = state(2000); const target = new FakeShopTarget(match); const transaction = new ShopPurchaseTransaction(SHOP);
    const result = transaction.purchase(open(transaction, match, target), match, 0, target);
    return { result, money: match.players[0].money, loadout: match.players[0].loadout };
  };

  assert.deepEqual(runCaller(), runCaller());
});

test("going live closes the shop and removes access items before play resumes", () => {
  const goLive = gameSource.slice(gameSource.indexOf('effect.kind==="LIVE"'), gameSource.indexOf('effect.kind==="ROUND_ENDED"'));
  const closeAt = goLive.indexOf("closeOpenShopForms");
  const removeAt = goLive.indexOf("this.removeShopAccessItems()");
  const movementAt = goLive.indexOf("this.refreshAllMovement()");
  assert.ok(closeAt >= 0 && closeAt < removeAt && removeAt < movementAt);
});
