import { EntityComponentTypes, EquipmentSlot, GameMode, InputPermissionCategory, ItemStack } from "@minecraft/server";
const MATCH_ITEMS = new Set([
    // Keep the retired item id only to scrub legacy copies from upgraded worlds.
    "fps:bomb", "fps:defuse_kit", "minecraft:emerald", "fps:scoreboard",
    "fps:gun_sidearm", "fps:gun_vector", "fps:gun_ranger", "fps:gun_bulldog", "fps:gun_longshot", "fps:knife",
    "minecraft:iron_helmet", "minecraft:iron_chestplate", "minecraft:iron_leggings", "minecraft:iron_boots",
]);
export function isMatchItem(typeId) { return MATCH_ITEMS.has(typeId); }
export function inBox(p, box) {
    return p.x >= box.min.x && p.x <= box.max.x && p.y >= box.min.y && p.y <= box.max.y && p.z >= box.min.z && p.z <= box.max.z;
}
export function distanceSquared(a, b) {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
}
export function inventory(player) {
    return player.getComponent(EntityComponentTypes.Inventory)?.container;
}
export function clearMatchItems(player, preserveScoreboard = false) {
    const inv = inventory(player);
    if (inv)
        for (let i = 0; i < inv.size; i++) {
            const item = inv.getItem(i);
            if (item && isMatchItem(item.typeId) && !(preserveScoreboard && item.typeId === "fps:scoreboard"))
                inv.setItem(i);
        }
    const equipment = player.getComponent(EntityComponentTypes.Equippable);
    if (equipment)
        for (const slot of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand]) {
            const item = equipment.getEquipment(slot);
            if (item && isMatchItem(item.typeId))
                equipment.setEquipment(slot);
        }
}
export function giveMarked(player, typeId, amount = 1) {
    const item = new ItemStack(typeId, amount);
    return inventory(player)?.addItem(item) === undefined;
}
export function applyPlayerMovementPermissions(player, permissions) {
    player.inputPermissions.setPermissionCategory(InputPermissionCategory.LateralMovement, permissions.lateralEnabled);
    player.inputPermissions.setPermissionCategory(InputPermissionCategory.Jump, permissions.jumpEnabled);
    player.inputPermissions.setPermissionCategory(InputPermissionCategory.Sneak, permissions.sneakEnabled);
}
export function setAdventure(player) { player.setGameMode(GameMode.Adventure); }
export function setSpectator(player) {
    applyPlayerMovementPermissions(player, { lateralEnabled: true, jumpEnabled: true, sneakEnabled: true });
    player.setGameMode(GameMode.Spectator);
}
