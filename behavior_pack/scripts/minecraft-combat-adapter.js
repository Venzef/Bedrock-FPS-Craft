import { EntityComponentTypes, EntityDamageCause, Player, system, world } from "@minecraft/server";
import { inventory } from "./utils.js";
import { weaponIdFromItemType } from "./weapons.js";
import { EffectiveDamage } from "./scoreboard/damage.js";
const PROJECTILE_TAG = "fps:projectile";
const RELOAD_OBJECTIVE = "fps_reload";
/** The Minecraft-side adapter for combat execution and the reload bridge. */
export class MinecraftCombatAdapter {
    state;
    projectileEntities = new Map();
    damage = new EffectiveDamage((victim, attacker, amount) => this.state.recordDamage?.(victim, attacker, amount));
    deferDeath(victimId, callback) { return this.damage.deferDeath(victimId, callback); }
    constructor(state) {
        this.state = state;
    }
    initializeReloadBridge() {
        this.reloadObjective();
    }
    getPhase() {
        return this.state.getPhase();
    }
    getPlayers() {
        return world.getAllPlayers().map(player => this.snapshot(player)).filter((player) => player !== undefined);
    }
    getPlayer(id) {
        const player = this.findPlayer(id);
        return player ? this.snapshot(player) : undefined;
    }
    getLoadout(id) {
        return this.state.getPlayerState(id)?.loadout;
    }
    setLoadout(id, loadout) {
        this.state.setLoadout(id, loadout);
    }
    getReloadPhase(playerId) {
        const objective = this.reloadObjective();
        const player = this.findPlayer(playerId);
        if (!objective || !player)
            return 0;
        try {
            return objective.getScore(player.scoreboardIdentity ?? player.name) ?? 0;
        }
        catch {
            return 0;
        }
    }
    setReloadPhase(playerId, phase) {
        const objective = this.reloadObjective();
        const player = this.findPlayer(playerId);
        if (!objective || !player)
            return;
        try {
            objective.setScore(player.scoreboardIdentity ?? player.name, phase);
        }
        catch { }
    }
    spawnProjectile(request) {
        const shooter = this.findPlayer(request.shooterId);
        if (!shooter)
            return undefined;
        try {
            const entity = shooter.dimension.spawnEntity(request.projectileType, request.origin);
            entity.addTag(PROJECTILE_TAG);
            entity.setDynamicProperty("fps:shooter", request.shooterId);
            entity.setDynamicProperty("fps:weapon_id", request.weaponId);
            this.projectileEntities.set(entity.id, entity);
            return entity.id;
        }
        catch {
            return undefined;
        }
    }
    isProjectileValid(projectileId) {
        return this.projectileEntities.get(projectileId)?.isValid === true;
    }
    raycastProjectile(projectileId, origin, direction, maxDistance) {
        const projectile = this.projectileEntities.get(projectileId);
        if (!projectile)
            return undefined;
        const dimension = projectile.dimension;
        let blockHit;
        try {
            blockHit = dimension.getBlockFromRay(origin, direction, { maxDistance, includeLiquidBlocks: true, includePassableBlocks: true });
        }
        catch {
            blockHit = undefined;
        }
        let blockDistance = Number.POSITIVE_INFINITY;
        let blockPoint;
        if (blockHit) {
            blockPoint = this.vectorAdd(blockHit.block.location, blockHit.faceLocation);
            blockDistance = this.distance(blockPoint, origin);
        }
        let entityHit;
        try {
            entityHit = dimension.getEntitiesFromRay(origin, direction, { maxDistance, ignoreBlockCollision: true, includePassableBlocks: true })
                .filter(hit => hit.entity instanceof Player && hit.entity.id !== (projectile.getDynamicProperty("fps:shooter") ?? ""))
                .sort((a, b) => a.distance - b.distance)[0];
        }
        catch {
            entityHit = undefined;
        }
        if (entityHit && entityHit.distance <= blockDistance)
            return { kind: "ENTITY", targetId: entityHit.entity.id, distance: entityHit.distance };
        if (blockHit && blockPoint && blockDistance <= maxDistance)
            return { kind: "BLOCK", blockTypeId: blockHit.block.typeId, point: blockPoint, distance: blockDistance };
        return undefined;
    }
    moveProjectile(projectileId, position) {
        const projectile = this.projectileEntities.get(projectileId);
        if (!projectile)
            return false;
        try {
            projectile.tryTeleport(position, { checkForBlocks: false, keepVelocity: false });
            return true;
        }
        catch {
            return false;
        }
    }
    despawnProjectile(projectileId, delayTicks = 0) {
        if (delayTicks > 0) {
            system.runTimeout(() => this.despawnProjectile(projectileId), delayTicks);
            return;
        }
        const projectile = this.projectileEntities.get(projectileId);
        this.projectileEntities.delete(projectileId);
        try {
            if (projectile?.isValid)
                projectile.remove();
        }
        catch { }
    }
    applyProjectileDamage(shooterId, targetId, damage) {
        const shooter = this.findPlayer(shooterId);
        const target = this.findPlayer(targetId);
        if (!shooter || !target)
            return;
        const health = target.getComponent(EntityComponentTypes.Health);
        const healthBefore = health?.currentValue;
        if (!health || healthBefore === undefined)
            return;
        this.damage.apply(targetId, shooterId, () => { try {
            return health.currentValue;
        }
        catch {
            return 0;
        } }, () => {
            try {
                target.applyDamage(damage, { cause: EntityDamageCause.override, damagingEntity: shooter });
            }
            catch { }
            try {
                const healthAfter = health.currentValue;
                const applied = Math.max(0, healthBefore - healthAfter);
                const remaining = Math.max(0, damage - applied);
                if (remaining > 0)
                    health.setCurrentValue(Math.max(health.effectiveMin, healthAfter - remaining));
            }
            catch { }
        });
    }
    applyMeleeDamage(attackerId, targetId, damage) {
        const attacker = this.findPlayer(attackerId);
        const target = this.findPlayer(targetId);
        if (!attacker || !target)
            return;
        const health = target.getComponent(EntityComponentTypes.Health);
        if (!health)
            return;
        this.damage.apply(targetId, attackerId, () => { try {
            return health.currentValue;
        }
        catch {
            return 0;
        } }, () => {
            try {
                target.applyDamage(damage, { cause: EntityDamageCause.entityAttack, damagingEntity: attacker });
            }
            catch { }
        });
    }
    findMeleeTargets(playerId, maxDistance) {
        const player = this.findPlayer(playerId);
        if (!player)
            return [];
        try {
            return player.getEntitiesFromViewDirection({ maxDistance, includePassableBlocks: true })
                .filter(entry => entry.entity instanceof Player && entry.entity.id !== playerId)
                .map(entry => entry.entity.id);
        }
        catch {
            return [];
        }
    }
    restoreDamage(victimId, damage) {
        const victim = this.findPlayer(victimId);
        const health = victim?.getComponent(EntityComponentTypes.Health);
        if (!health)
            return;
        try {
            health.setCurrentValue(Math.min(health.effectiveMax, health.currentValue + damage));
        }
        catch { }
    }
    hurtEvent(event) {
        if (!(event.hurtEntity instanceof Player))
            return undefined;
        if (this.damage.isApplying(event.hurtEntity.id))
            return undefined;
        const attacker = event.damageSource.damagingEntity;
        return {
            victimId: event.hurtEntity.id,
            attackerId: attacker instanceof Player ? attacker.id : undefined,
            damage: event.damage,
            cause: event.damageSource.cause,
            hasDamagingProjectile: event.damageSource.damagingProjectile !== undefined,
        };
    }
    deathEvent(event) {
        if (!(event.deadEntity instanceof Player))
            return undefined;
        const attacker = event.damageSource.damagingEntity;
        const projectile = event.damageSource.damagingProjectile;
        const weaponId = projectile?.getDynamicProperty("fps:weapon_id");
        return {
            victimId: event.deadEntity.id,
            attackerId: attacker instanceof Player ? attacker.id : undefined,
            allowProjectileFallback: this.damage.isApplying(event.deadEntity.id) || event.damageSource.cause === EntityDamageCause.override || event.damageSource.cause === EntityDamageCause.projectile,
            damagingProjectileWeaponId: typeof weaponId === "string" && weaponId.startsWith("W") ? weaponId : undefined,
        };
    }
    reloadObjective() {
        try {
            return world.scoreboard.getObjective(RELOAD_OBJECTIVE) ?? world.scoreboard.addObjective(RELOAD_OBJECTIVE, "FPS reload bridge");
        }
        catch {
            return undefined;
        }
    }
    findPlayer(id) {
        return world.getAllPlayers().find(player => player.id === id);
    }
    snapshot(player) {
        const matchState = this.state.getPlayerState(player.id);
        if (!matchState)
            return undefined;
        const heldWeaponId = weaponIdFromItemType(inventory(player)?.getItem(player.selectedSlotIndex)?.typeId ?? "");
        return {
            id: player.id,
            alive: matchState.alive,
            role: matchState.role,
            heldWeaponId,
            isOnGround: this.isPlayerOnGround(player),
            location: { ...player.location },
            headLocation: { ...player.getHeadLocation() },
            direction: { ...player.getViewDirection() },
        };
    }
    isPlayerOnGround(player) {
        try {
            return player.isOnGround;
        }
        catch {
            // A failed API read must not create a false-positive jump-shot flag.
            return true;
        }
    }
    vectorAdd(a, b) {
        return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
    }
    distance(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    }
}
