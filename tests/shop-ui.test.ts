import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { SHOP } from "../src/config";
import {
  SHOP_UI_CONTRACT,
  buildShopUiSlots,
  encodeShopButtonText,
  getShopFormTitle,
} from "../src/shop-ui-contract";

const root = process.cwd();
const shopUi = JSON.parse(readFileSync(join(root, "resource_pack", "ui", "custom_forms", "fps_shop.json"), "utf8"));
const serverForm = JSON.parse(readFileSync(join(root, "resource_pack", "ui", "server_form.json"), "utf8"));
const uiSource = readFileSync(join(root, "src", "ui.ts"), "utf8");

function findControl(node: unknown, key: string): Record<string, unknown> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findControl(child, key);
      if (found) return found;
    }
    return undefined;
  }
  if (!node || typeof node !== "object") return undefined;
  const record = node as Record<string, unknown>;
  if (record[key] && typeof record[key] === "object") return record[key] as Record<string, unknown>;
  for (const child of Object.values(record)) {
    const found = findControl(child, key);
    if (found) return found;
  }
  return undefined;
}

test("the eight real products occupy their fixed CS shop slots", () => {
  const slots = buildShopUiSlots(SHOP);
  assert.equal(slots.length, 27);
  assert.deepEqual(
    slots.flatMap((slot, uiIndex) => slot ? [{ uiIndex, id: slot.item.id }] : []),
    [
      { uiIndex: 0, id: "fps:gun_sidearm" },
      { uiIndex: 5, id: "fps:gun_vector" },
      { uiIndex: 9, id: "fps:gun_ranger" },
      { uiIndex: 13, id: "fps:gun_bulldog" },
      { uiIndex: 17, id: "fps:gun_longshot" },
      { uiIndex: 21, id: "fps:iron_armor" },
      { uiIndex: 22, id: "fps:iron_armor_set" },
      { uiIndex: 23, id: "fps:defuse_kit" },
    ],
  );
  assert.equal(slots.filter(Boolean).length, 8);
});

test("shop UI protocol uses the routed title and buyability markers", () => {
  assert.equal(getShopFormTitle(), "fps_shop:main");
  assert.equal(encodeShopButtonText(SHOP[0], true), "BUYABLE:USP");
  assert.equal(encodeShopButtonText(SHOP[0], false), "LOCKED:USP");
  assert.equal(SHOP_UI_CONTRACT.hiddenMarker, "HIDDEN:");
});

test("every configured shop icon resolves to a PNG asset", () => {
  for (const item of SHOP) {
    assert.ok(item.texture, `${item.id} has no texture`);
    const path = join(root, "resource_pack", `${item.texture}.png`);
    assert.equal(existsSync(path), true, `${item.id} texture is missing: ${path}`);
    assert.deepEqual(
      [...readFileSync(path).subarray(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10],
      `${item.id} texture is not a PNG`,
    );
  }
});

test("fps_shop JSON shows the project products and hides placeholder buttons", () => {
  const pistols = findControl(shopUi, "pistols@fps_shop.category_5");
  const smgs = findControl(shopUi, "smgs@fps_shop.category_4");
  const rifles = findControl(shopUi, "rifles@fps_shop.category_4");
  const heavy = findControl(shopUi, "heavy@fps_shop.category_4");
  const snipers = findControl(shopUi, "snipers@fps_shop.category_4");
  const equipment = findControl(shopUi, "equipment@fps_shop.utility_group_3");
  const grenades = findControl(shopUi, "grenades@fps_shop.utility_group_4");

  assert.deepEqual(
    [
      [pistols?.$slot_1_name, pistols?.$slot_1_price],
      [smgs?.$slot_1_name, smgs?.$slot_1_price],
      [rifles?.$slot_1_name, rifles?.$slot_1_price],
      [heavy?.$slot_1_name, heavy?.$slot_1_price],
      [snipers?.$slot_1_name, snipers?.$slot_1_price],
      [equipment?.$slot_1_name, equipment?.$slot_1_price],
      [equipment?.$slot_2_name, equipment?.$slot_2_price],
      [equipment?.$slot_3_name, equipment?.$slot_3_price],
    ],
    [
      ["USP", "500"],
      ["UMP", "1500"],
      ["AK47", "2800"],
      ["Bulldog", "2000"],
      ["AWP", "4500"],
      ["Armor", "600"],
      ["Armor + Helmet", "1000"],
      ["Defuse Kit", "400"],
    ],
  );
  assert.equal(grenades?.visible, false);
  assert.match(JSON.stringify(shopUi.shop_slot.bindings), /HIDDEN:/);
});

test("server form inserts the proven shop factory without replacing the vanilla factory", () => {
  assert.equal(serverForm.main_screen_content.controls, undefined,
    "the RP must not replace Minecraft's main server-form factory");
  const factoryInsert = serverForm.main_screen_content.modifications.find(
    (entry: { array_name?: string; operation?: string }) =>
      entry.array_name === "controls" && entry.operation === "insert_back",
  );
  assert.ok(factoryInsert);
  const factory = factoryInsert.value[0].fps_shop_server_form_factory;
  assert.equal(factory.type, "panel");
  assert.equal(factory.factory.name, "server_form_factory");
  assert.equal(factory.factory.control_ids.long_form, "@server_form.shop_long_form");

  const longFormBindings = serverForm.long_form.modifications.find(
    (entry: { array_name?: string; operation?: string }) =>
      entry.array_name === "bindings" && entry.operation === "insert_back",
  );
  assert.ok(longFormBindings);
  assert.match(JSON.stringify(longFormBindings.value), /fps_shop:/);
  assert.match(JSON.stringify(serverForm.shop_long_form), /fps_shop\.shop_root/);
});

test("shop sessions reopen on a later tick until the tracked form is closed", () => {
  assert.match(uiSource, /while\(openShopSessions\.has\(player\.id\)\)/);
  assert.match(uiSource, /await nextTick\(\);[\s\S]*shopPurchase\.purchase/);
  assert.match(uiSource, /shopPurchase\.purchase[\s\S]*await nextTick\(\);/);
});
