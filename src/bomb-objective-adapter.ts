import { EntityComponentTypes, ItemStack, world, type Entity, type Player, type Vector3 } from "@minecraft/server";
import { ensureFixedHotbarItem } from "./inventory.js";
import { BOMB_ITEM, type BombObjectiveAdapter, type DroppedBombReference } from "./bomb-objective.js";
import type { BombState, SiteId } from "./types.js";
import { inventory } from "./utils.js";

const DROPPED_BOMB = "fps:dropped_bomb";
const DROPPED_BOMB_TAG = "fps:dropped_bomb";

function playerById(id: string): Player | undefined {
  return world.getAllPlayers().find(player => player.id === id);
}

function toReference(entity: Entity): DroppedBombReference {
  return { id: entity.id, location: { ...entity.location }, dimensionId: entity.dimension.id };
}

/** Production adapter for the bomb objective's Minecraft entity and inventory seam. */
export class MinecraftBombObjectiveAdapter implements BombObjectiveAdapter {
  public isBombItemEntity(entity: Entity): boolean {
    try {
      if (!entity.isValid || entity.typeId !== "minecraft:item") return false;
      return entity.getComponent(EntityComponentTypes.Item)?.itemStack.typeId === BOMB_ITEM;
    } catch { return false; }
  }

  public removeItemEntity(entity: Entity): void {
    try { if (entity.isValid) entity.kill(); } catch {}
  }

  public heldItem(playerId: string): string | undefined {
    const player = playerById(playerId), inv = player && inventory(player);
    return inv?.getItem(player!.selectedSlotIndex)?.typeId;
  }

  public hasBomb(playerId: string): boolean {
    const player = playerById(playerId), inv = player && inventory(player);
    return Boolean(inv && [...Array(inv.size).keys()].some(index => inv.getItem(index)?.typeId === BOMB_ITEM));
  }

  public removeBomb(playerId: string): void {
    const player = playerById(playerId), inv = player && inventory(player);
    if (!inv) return;
    for (let index = 0; index < inv.size; index++) if (inv.getItem(index)?.typeId === BOMB_ITEM) inv.setItem(index);
  }

  public giveBomb(playerId: string): boolean {
    const player = playerById(playerId), inv = player && inventory(player);
    if (!player || !inv) return false;
    const result = ensureFixedHotbarItem(inv, new ItemStack(BOMB_ITEM), "DROPPABLE_OBJECTIVE");
    if (!result.success) return false;
    if (result.displaced) player.dimension.spawnItem(result.displaced, player.location);
    return true;
  }

  public reconcileBombItems(shouldKeep: (playerId: string, alreadyKept: boolean) => boolean): void {
    for (const player of world.getAllPlayers()) {
      const inv = inventory(player);if (!inv) continue;
      let alreadyKept = false;
      for (let index = 0; index < inv.size; index++) {
        if (inv.getItem(index)?.typeId !== BOMB_ITEM) continue;
        const keep = shouldKeep(player.id, alreadyKept);
        if (keep) alreadyKept = true; else inv.setItem(index);
      }
    }
  }

  public removeVanillaBombItems(): void {
    for (const entity of world.getDimension("overworld").getEntities({ type: "minecraft:item" })) {
      if (entity.getComponent(EntityComponentTypes.Item)?.itemStack.typeId === BOMB_ITEM) {
        try { entity.kill(); } catch {}
      }
    }
  }

  public ensureDroppedBomb(bomb: BombState): DroppedBombReference | undefined {
    if (bomb.kind !== "DROPPED" || !bomb.location) return undefined;
    let kept: Entity | undefined;
    if (bomb.droppedEntityId) {
      try {
        const entity = world.getEntity(bomb.droppedEntityId);
        if (entity?.isValid && entity.typeId === DROPPED_BOMB) kept = entity;
      } catch {}
    }
    if (!kept) kept = world.getDimension("overworld").getEntities({ type: DROPPED_BOMB, location: bomb.location, maxDistance: 8, closest: 1 })[0];
    if (!kept) kept = this.spawnEntity(bomb.location);
    if (!kept) return undefined;
    for (const entity of world.getDimension("overworld").getEntities({ type: DROPPED_BOMB })) {
      if (entity.id !== kept.id) this.despawnEntity(entity);
    }
    this.removeVanillaBombItems();
    return toReference(kept);
  }

  public spawnDroppedBomb(location: Vector3, bounceTarget?: Vector3): DroppedBombReference | undefined {
    const entity = this.spawnEntity(location);
    if (!entity) return undefined;
    if (bounceTarget && entity.tryTeleport(bounceTarget, { checkForBlocks: true, keepVelocity: false })) entity.applyImpulse({ x: 0, y: 0.18, z: 0 });
    return toReference(entity);
  }

  public despawnDroppedBomb(drop: DroppedBombReference): void {
    try {
      const entity = world.getEntity(drop.id);
      if (entity?.isValid && entity.typeId === DROPPED_BOMB) this.despawnEntity(entity);
    } catch {}
  }

  public removeAllDroppedBombs(): void {
    for (const entity of world.getDimension("overworld").getEntities({ type: DROPPED_BOMB })) this.despawnEntity(entity);
  }

  public spawnPlantedBomb(playerId: string, location: Vector3, site: SiteId): void {
    const player = playerById(playerId);if (!player) return;
    try {
      const planted = player.dimension.spawnEntity("fps:planted_bomb", location);
      planted.addTag("fps:planted_bomb");planted.nameTag = `Bomb ${site}`;
    } catch {}
  }

  public removePlantedBombs(): void {
    const dimension = world.getDimension("overworld");
    for (const entity of dimension.getEntities({ tags: ["fps:planted_bomb"] })) this.despawnEntity(entity);
  }

  private spawnEntity(location: Vector3): Entity | undefined {
    try {
      const entity = world.getDimension("overworld").spawnEntity(DROPPED_BOMB, location);
      entity.addTag(DROPPED_BOMB_TAG);
      return entity;
    } catch { return undefined; }
  }

  private despawnEntity(entity: Entity): void {
    if (!entity.isValid) return;
    try { entity.triggerEvent("fps:despawn"); } catch {}
  }
}
