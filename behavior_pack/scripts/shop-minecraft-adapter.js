import { EntityComponentTypes, EquipmentSlot, ItemStack } from "@minecraft/server";
import { MATCH_CONFIG } from "./config.js";
import { ensureWeaponInFixedHotbar } from "./inventory.js";
import { roleForSquad } from "./rules.js";
import { isMatchItem, inBox, inventory } from "./utils.js";
import { weaponDefinition } from "./weapons.js";
const DROPPED_WEAPON = "fps:dropped_weapon";
const DROPPED_WEAPON_TAG = "fps:dropped_weapon";
const ARMOR = [
    [EquipmentSlot.Head, "minecraft:iron_helmet"],
    [EquipmentSlot.Chest, "minecraft:iron_chestplate"],
];
function cloneItem(item) {
    return item?.clone();
}
/**
 * Minecraft adapter for the shop transaction seam. It intentionally contains
 * no price, eligibility, or selection policy; those remain local to Shop.
 */
export function createMinecraftShopPurchaseTarget(player, state, map) {
    let displaced;
    let placedItemId;
    return {
        inBuyZone: () => {
            const ps = state.players.find(candidate => candidate.id === player.id);
            if (!ps)
                return false;
            const role = roleForSquad(ps.squad, state.round, MATCH_CONFIG.roundsPerHalf);
            return inBox(player.location, map.buyZones[role]);
        },
        snapshot: () => {
            const container = inventory(player);
            if (!container)
                throw new Error("Inventory component unavailable");
            const equipment = player.getComponent(EntityComponentTypes.Equippable);
            return {
                inventory: Array.from({ length: container.size }, (_, index) => cloneItem(container.getItem(index))),
                equipment: ARMOR.map(([slot]) => [slot, cloneItem(equipment?.getEquipment(slot))]),
                hasDefuseKit: state.players.find(candidate => candidate.id === player.id)?.hasDefuseKit === true,
            };
        },
        restore: (snapshot) => {
            const saved = snapshot;
            const container = inventory(player);
            if (container) {
                for (let index = 0; index < container.size; index++)
                    container.setItem(index, cloneItem(saved.inventory[index]));
            }
            const equipment = player.getComponent(EntityComponentTypes.Equippable);
            if (equipment)
                for (const [slot, item] of saved.equipment)
                    equipment.setEquipment(slot, cloneItem(item));
            const ps = state.players.find(candidate => candidate.id === player.id);
            if (ps)
                ps.hasDefuseKit = saved.hasDefuseKit;
            displaced = undefined;
            placedItemId = undefined;
        },
        setLoadout: loadout => {
            const ps = state.players.find(candidate => candidate.id === player.id);
            if (!ps)
                return false;
            ps.loadout = loadout;
            return true;
        },
        placeWeapon: (itemId, slot) => {
            const container = inventory(player);
            if (!container)
                return { success: false, reason: "equipment-placement-failed" };
            try {
                const result = ensureWeaponInFixedHotbar(container, new ItemStack(itemId), slot);
                if (!result.success)
                    return { success: false, reason: "equipment-placement-failed" };
                displaced = result.displaced;
                placedItemId = itemId;
                return { success: true };
            }
            catch {
                return { success: false, reason: "equipment-placement-failed" };
            }
        },
        armorTier: () => {
            const equipment = player.getComponent(EntityComponentTypes.Equippable);
            if (!equipment)
                return "NONE";
            const hasHelmet = equipment.getEquipment(EquipmentSlot.Head)?.typeId === "minecraft:iron_helmet";
            const hasChestplate = equipment.getEquipment(EquipmentSlot.Chest)?.typeId === "minecraft:iron_chestplate";
            return hasChestplate ? (hasHelmet ? "ARMOR_SET" : "ARMOR") : "NONE";
        },
        equipArmor: (tier) => {
            const equipment = player.getComponent(EntityComponentTypes.Equippable);
            if (!equipment)
                return false;
            try {
                if (!equipment.setEquipment(EquipmentSlot.Chest, new ItemStack("minecraft:iron_chestplate")))
                    return false;
                return tier === "ARMOR" ||
                    equipment.setEquipment(EquipmentSlot.Head, new ItemStack("minecraft:iron_helmet"));
            }
            catch {
                return false;
            }
        },
        hasDefuseKit: () => state.players.find(candidate => candidate.id === player.id)?.hasDefuseKit === true,
        equipDefuseKit: () => {
            const ps = state.players.find(candidate => candidate.id === player.id);
            if (!ps)
                return false;
            const role = roleForSquad(ps.squad, state.round, MATCH_CONFIG.roundsPerHalf);
            if (role !== "CT")
                return false;
            ps.hasDefuseKit = true;
            return true;
        },
        giveItem: (itemId, amount) => {
            const container = inventory(player);
            if (!container)
                return false;
            try {
                return container.addItem(new ItemStack(itemId, amount)) === undefined;
            }
            catch {
                return false;
            }
        },
        commitWeaponReplacement: (replaced) => {
            const oldItem = displaced;
            displaced = undefined;
            const itemId = placedItemId;
            placedItemId = undefined;
            if (replaced) {
                try {
                    const entity = player.dimension.spawnEntity(DROPPED_WEAPON, player.location);
                    entity.addTag(DROPPED_WEAPON_TAG);
                    entity.setDynamicProperty("fps:weapon_id", replaced.id);
                    entity.setDynamicProperty("fps:magazine", replaced.magazine);
                    entity.setDynamicProperty("fps:reserve", replaced.reserve);
                    const definition = weaponDefinition(replaced.id);
                    entity.nameTag = `${definition.name} ${replaced.magazine}/${replaced.reserve}`;
                }
                catch { /* The loadout remains committed if the world cannot spawn a drop. */ }
                return;
            }
            if (oldItem && isMatchItem(oldItem.typeId) && oldItem.typeId !== itemId) {
                try {
                    player.dimension.spawnItem(oldItem, player.location);
                }
                catch { /* A player can leave between placement and the drop. */ }
            }
        },
    };
}
