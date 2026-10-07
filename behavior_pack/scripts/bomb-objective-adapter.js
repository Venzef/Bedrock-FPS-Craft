import { EntityComponentTypes, ItemStack, world } from "@minecraft/server";
import { ensureFixedHotbarItem } from "./inventory.js";
import { BOMB_ITEM } from "./bomb-objective.js";
import { inventory } from "./utils.js";
const DROPPED_BOMB = "fps:dropped_bomb";
const DROPPED_BOMB_TAG = "fps:dropped_bomb";
function playerById(id) {
    return world.getAllPlayers().find(player => player.id === id);
}
function toReference(entity) {
    return { id: entity.id, location: { ...entity.location }, dimensionId: entity.dimension.id };
}
/** Production adapter for the bomb objective's Minecraft entity and inventory seam. */
export class MinecraftBombObjectiveAdapter {
    isBombItemEntity(entity) {
        try {
            if (!entity.isValid || entity.typeId !== "minecraft:item")
                return false;
            return entity.getComponent(EntityComponentTypes.Item)?.itemStack.typeId === BOMB_ITEM;
        }
        catch {
            return false;
        }
    }
    removeItemEntity(entity) {
        try {
            if (entity.isValid)
                entity.kill();
        }
        catch { }
    }
    heldItem(playerId) {
        const player = playerById(playerId), inv = player && inventory(player);
        return inv?.getItem(player.selectedSlotIndex)?.typeId;
    }
    hasBomb(playerId) {
        const player = playerById(playerId), inv = player && inventory(player);
        return Boolean(inv && [...Array(inv.size).keys()].some(index => inv.getItem(index)?.typeId === BOMB_ITEM));
    }
    removeBomb(playerId) {
        const player = playerById(playerId), inv = player && inventory(player);
        if (!inv)
            return;
        for (let index = 0; index < inv.size; index++)
            if (inv.getItem(index)?.typeId === BOMB_ITEM)
                inv.setItem(index);
    }
    giveBomb(playerId) {
        const player = playerById(playerId), inv = player && inventory(player);
        if (!player || !inv)
            return false;
        const result = ensureFixedHotbarItem(inv, new ItemStack(BOMB_ITEM), "DROPPABLE_OBJECTIVE");
        if (!result.success)
            return false;
        if (result.displaced)
            player.dimension.spawnItem(result.displaced, player.location);
        return true;
    }
    reconcileBombItems(shouldKeep) {
        for (const player of world.getAllPlayers()) {
            const inv = inventory(player);
            if (!inv)
                continue;
            let alreadyKept = false;
            for (let index = 0; index < inv.size; index++) {
                if (inv.getItem(index)?.typeId !== BOMB_ITEM)
                    continue;
                const keep = shouldKeep(player.id, alreadyKept);
                if (keep)
                    alreadyKept = true;
                else
                    inv.setItem(index);
            }
        }
    }
    removeVanillaBombItems() {
        for (const entity of world.getDimension("overworld").getEntities({ type: "minecraft:item" })) {
            if (entity.getComponent(EntityComponentTypes.Item)?.itemStack.typeId === BOMB_ITEM) {
                try {
                    entity.kill();
                }
                catch { }
            }
        }
    }
    ensureDroppedBomb(bomb) {
        if (bomb.kind !== "DROPPED" || !bomb.location)
            return undefined;
        let kept;
        if (bomb.droppedEntityId) {
            try {
                const entity = world.getEntity(bomb.droppedEntityId);
                if (entity?.isValid && entity.typeId === DROPPED_BOMB)
                    kept = entity;
            }
            catch { }
        }
        if (!kept)
            kept = world.getDimension("overworld").getEntities({ type: DROPPED_BOMB, location: bomb.location, maxDistance: 8, closest: 1 })[0];
        if (!kept)
            kept = this.spawnEntity(bomb.location);
        if (!kept)
            return undefined;
        for (const entity of world.getDimension("overworld").getEntities({ type: DROPPED_BOMB })) {
            if (entity.id !== kept.id)
                this.despawnEntity(entity);
        }
        this.removeVanillaBombItems();
        return toReference(kept);
    }
    spawnDroppedBomb(location, bounceTarget) {
        const entity = this.spawnEntity(location);
        if (!entity)
            return undefined;
        if (bounceTarget && entity.tryTeleport(bounceTarget, { checkForBlocks: true, keepVelocity: false }))
            entity.applyImpulse({ x: 0, y: 0.18, z: 0 });
        return toReference(entity);
    }
    despawnDroppedBomb(drop) {
        try {
            const entity = world.getEntity(drop.id);
            if (entity?.isValid && entity.typeId === DROPPED_BOMB)
                this.despawnEntity(entity);
        }
        catch { }
    }
    removeAllDroppedBombs() {
        for (const entity of world.getDimension("overworld").getEntities({ type: DROPPED_BOMB }))
            this.despawnEntity(entity);
    }
    spawnPlantedBomb(playerId, location, site) {
        const player = playerById(playerId);
        if (!player)
            return;
        try {
            const planted = player.dimension.spawnEntity("fps:planted_bomb", location);
            planted.addTag("fps:planted_bomb");
            planted.nameTag = `Bomb ${site}`;
        }
        catch { }
    }
    removePlantedBombs() {
        const dimension = world.getDimension("overworld");
        for (const entity of dimension.getEntities({ tags: ["fps:planted_bomb"] }))
            this.despawnEntity(entity);
    }
    spawnEntity(location) {
        try {
            const entity = world.getDimension("overworld").spawnEntity(DROPPED_BOMB, location);
            entity.addTag(DROPPED_BOMB_TAG);
            return entity;
        }
        catch {
            return undefined;
        }
    }
    despawnEntity(entity) {
        if (!entity.isValid)
            return;
        try {
            entity.triggerEvent("fps:despawn");
        }
        catch { }
    }
}
