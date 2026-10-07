import { EntityComponentTypes, EquipmentSlot, GameMode, InputPermissionCategory, ItemStack, type Player, type Vector3 } from "@minecraft/server";
import type { Box } from "./types.js";

const MATCH_ITEMS = new Set([
  // Keep the retired item id only to scrub legacy copies from upgraded worlds.
  "fps:bomb", "fps:defuse_kit", "minecraft:emerald", "fps:scoreboard",
  "fps:gun_sidearm", "fps:gun_vector", "fps:gun_ranger", "fps:gun_bulldog", "fps:gun_longshot", "fps:knife",
  "minecraft:iron_helmet", "minecraft:iron_chestplate", "minecraft:iron_leggings", "minecraft:iron_boots",
]);

export function isMatchItem(typeId: string): boolean { return MATCH_ITEMS.has(typeId); }

export function inBox(p: Vector3, box: Box): boolean {
  return p.x >= box.min.x && p.x <= box.max.x && p.y >= box.min.y && p.y <= box.max.y && p.z >= box.min.z && p.z <= box.max.z;
}

export function distanceSquared(a: Vector3, b: Vector3): number {
  return (a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2;
}

export function inventory(player: Player) {
  return player.getComponent(EntityComponentTypes.Inventory)?.container;
}

export function clearMatchItems(player: Player, preserveScoreboard=false): void {
  const inv = inventory(player);
  if (inv) for (let i=0; i<inv.size; i++) {
    const item = inv.getItem(i);
    if (item && isMatchItem(item.typeId) && !(preserveScoreboard&&item.typeId==="fps:scoreboard")) inv.setItem(i);
  }
  const equipment = player.getComponent(EntityComponentTypes.Equippable);
  if (equipment) for (const slot of [EquipmentSlot.Head,EquipmentSlot.Chest,EquipmentSlot.Legs,EquipmentSlot.Feet,EquipmentSlot.Offhand]) {
    const item = equipment.getEquipment(slot);
    if (item && isMatchItem(item.typeId)) equipment.setEquipment(slot);
  }
}

export function giveMarked(player: Player, typeId: string, amount=1): boolean {
  const item = new ItemStack(typeId, amount);
  return inventory(player)?.addItem(item) === undefined;
}

export function applyPlayerMovementPermissions(player: Player, permissions: {lateralEnabled:boolean;jumpEnabled:boolean;sneakEnabled:boolean}): void {
  player.inputPermissions.setPermissionCategory(InputPermissionCategory.LateralMovement,permissions.lateralEnabled);
  player.inputPermissions.setPermissionCategory(InputPermissionCategory.Jump,permissions.jumpEnabled);
  player.inputPermissions.setPermissionCategory(InputPermissionCategory.Sneak,permissions.sneakEnabled);
}

export function setAdventure(player: Player): void { player.setGameMode(GameMode.Adventure); }
export function setSpectator(player: Player): void {
  applyPlayerMovementPermissions(player,{lateralEnabled:true,jumpEnabled:true,sneakEnabled:true});
  player.setGameMode(GameMode.Spectator);
}
