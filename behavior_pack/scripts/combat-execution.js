import { canDamageTarget, classifyHitBand, damageAfterPenetration, damageForHit, isPenetrableBlock, projectileShouldDespawn } from "./projectiles.js";
import { canStartReload, completeReload, fireWeapon, weaponDefinition, weaponState, withWeaponState } from "./weapons.js";
const PROJECTILE_SPEED = 4;
/**
 * Owns the complete combat execution sequence. Its adapter is the only seam
 * where Minecraft entities, health, raycasts, and the reload scoreboard exist.
 */
export class CombatExecution {
    adapter;
    firing = new Set();
    lastFiredTick = new Map();
    reloads = new Map();
    activeProjectiles = new Map();
    projectileHitsByVictim = new Map();
    constructor(adapter) {
        this.adapter = adapter;
    }
    initialize() {
        this.adapter.initializeReloadBridge();
    }
    startFiring(playerId, weaponId, nowTick) {
        if (weaponDefinition(weaponId).fireMode === "AUTO")
            this.firing.add(playerId);
        return this.tryFire(playerId, weaponId, nowTick);
    }
    fire(playerId, weaponId, nowTick) {
        return this.tryFire(playerId, weaponId, nowTick);
    }
    stopFiring(playerId) {
        this.firing.delete(playerId);
    }
    tick(nowTick) {
        this.tickReloadBridge();
        this.tickAutomaticFire(nowTick);
        this.tickProjectiles(nowTick);
    }
    tickReloadBridge() {
        for (const player of this.adapter.getPlayers()) {
            if (!player.alive)
                continue;
            const phase = this.adapter.getReloadPhase(player.id);
            const active = this.reloads.get(player.id);
            if (!active && phase === 1) {
                this.adapter.setReloadPhase(player.id, 2);
                continue;
            }
            if (!active && phase === 2) {
                this.tryStartReload(player.id);
                if (!this.reloads.has(player.id))
                    this.adapter.setReloadPhase(player.id, 0);
                continue;
            }
            if (!active)
                continue;
            const held = player.heldWeaponId;
            if (held !== active.weaponId || this.isReloadPhaseBlocked()) {
                this.clearReload(player.id);
                continue;
            }
            active.progressTicks++;
            if (active.progressTicks < weaponDefinition(active.weaponId).reloadTicks)
                continue;
            const loadout = this.adapter.getLoadout(player.id);
            const state = loadout ? weaponState(loadout, active.weaponId) : undefined;
            if (loadout && state)
                this.adapter.setLoadout(player.id, withWeaponState(loadout, completeReload(state)));
            this.clearReload(player.id);
        }
    }
    tickAutomaticFire(nowTick) {
        for (const id of [...this.firing]) {
            const player = this.adapter.getPlayer(id);
            const held = player?.heldWeaponId;
            if (!player || !held || weaponDefinition(held).fireMode !== "AUTO") {
                this.firing.delete(id);
                continue;
            }
            this.tryFire(id, held, nowTick);
        }
    }
    tickProjectiles(nowTick) {
        for (const projectile of [...this.activeProjectiles.values()]) {
            if (!this.adapter.isProjectileValid(projectile.id)) {
                this.activeProjectiles.delete(projectile.id);
                continue;
            }
            projectile.ageTicks++;
            projectile.distanceTravelled += PROJECTILE_SPEED;
            if (projectileShouldDespawn(projectile.ageTicks, projectile.distanceTravelled)) {
                this.despawnProjectile(projectile);
                continue;
            }
            const collision = this.adapter.raycastProjectile(projectile.id, projectile.position, projectile.direction, PROJECTILE_SPEED);
            if (collision?.kind === "ENTITY") {
                this.hitProjectile(projectile, collision.targetId, collision.distance, nowTick);
                continue;
            }
            if (collision?.kind === "BLOCK") {
                if (isPenetrableBlock(collision.blockTypeId) && projectile.penetrations === 0) {
                    projectile.penetrations = 1;
                    projectile.damage = damageAfterPenetration(projectile.damage, 1);
                    projectile.position = this.vectorAdd(collision.point, this.vectorScale(projectile.direction, 0.05));
                    if (!this.adapter.moveProjectile(projectile.id, projectile.position))
                        this.despawnProjectile(projectile);
                    continue;
                }
                this.despawnProjectile(projectile);
                continue;
            }
            projectile.position = this.vectorAdd(projectile.position, this.vectorScale(projectile.direction, PROJECTILE_SPEED));
            if (!this.adapter.moveProjectile(projectile.id, projectile.position))
                this.despawnProjectile(projectile);
        }
    }
    handleHurt(event, nowTick) {
        const pendingProjectile = this.projectileHitsByVictim.get(event.victimId);
        const projectileDamage = event.cause === "projectile" || event.cause === "override" || event.hasDamagingProjectile || (pendingProjectile?.pendingDamage === true && pendingProjectile.tick === nowTick);
        if (pendingProjectile?.tick === nowTick)
            pendingProjectile.pendingDamage = false;
        if (event.attackerId && !projectileDamage) {
            const attacker = this.adapter.getPlayer(event.attackerId);
            if (attacker?.heldWeaponId && weaponDefinition(attacker.heldWeaponId).fireMode !== "MELEE") {
                this.adapter.restoreDamage(event.victimId, event.damage);
                return;
            }
        }
        if (event.attackerId) {
            const attacker = this.adapter.getPlayer(event.attackerId);
            const victim = this.adapter.getPlayer(event.victimId);
            if (attacker?.role === victim?.role) {
                this.adapter.restoreDamage(event.victimId, event.damage);
                return;
            }
            if (attacker?.role && victim?.role && event.attackerId !== event.victimId && event.damage > 0)
                return event;
        }
    }
    resolveDeath(event, nowTick) {
        const projectileHit = this.projectileHitsByVictim.get(event.victimId);
        const recentProjectileHit = projectileHit !== undefined && nowTick - projectileHit.tick <= 2;
        const attributedProjectileHit = event.allowProjectileFallback !== false && recentProjectileHit && (!event.attackerId || event.attackerId === projectileHit.shooterId)
            ? projectileHit
            : undefined;
        const killerId = event.attackerId ?? attributedProjectileHit?.shooterId;
        const rewardWeaponId = event.damagingProjectileWeaponId ?? attributedProjectileHit?.weaponId ?? (killerId ? this.adapter.getPlayer(killerId)?.heldWeaponId : undefined);
        this.projectileHitsByVictim.delete(event.victimId);
        this.clearPlayer(event.victimId);
        return {
            killerId,
            rewardWeaponId,
            flags: {
                headshot: attributedProjectileHit?.headshot === true,
                jumpShot: attributedProjectileHit?.jumpShot === true,
                wallbang: attributedProjectileHit?.wallbang === true,
            },
        };
    }
    clearPlayer(playerId) {
        this.firing.delete(playerId);
        this.lastFiredTick.delete(playerId);
        this.clearReload(playerId);
    }
    resetReloadBridge() {
        for (const player of this.adapter.getPlayers())
            this.adapter.setReloadPhase(player.id, 0);
    }
    cleanup() {
        for (const projectile of this.activeProjectiles.values())
            this.despawnProjectile(projectile);
        this.activeProjectiles.clear();
        this.projectileHitsByVictim.clear();
        const playerIds = new Set([...this.adapter.getPlayers().map(player => player.id), ...this.firing, ...this.lastFiredTick.keys(), ...this.reloads.keys()]);
        for (const playerId of playerIds)
            this.clearPlayer(playerId);
        this.firing.clear();
        this.lastFiredTick.clear();
        this.reloads.clear();
    }
    tryStartReload(playerId) {
        const player = this.adapter.getPlayer(playerId);
        const weaponId = player?.heldWeaponId;
        if (!player || !weaponId)
            return false;
        const loadout = this.adapter.getLoadout(playerId);
        const weapon = loadout ? weaponState(loadout, weaponId) : undefined;
        if (!canStartReload({ phase: this.adapter.getPhase(), alive: player.alive, weapon, heldWeaponId: weaponId, reload: this.reloads.get(playerId) }))
            return false;
        this.reloads.set(playerId, { phase: 3, weaponId, progressTicks: 0 });
        this.adapter.setReloadPhase(playerId, 3);
        return true;
    }
    clearReload(playerId) {
        this.reloads.delete(playerId);
        this.adapter.setReloadPhase(playerId, 0);
    }
    tryFire(playerId, requestedId, nowTick) {
        const player = this.adapter.getPlayer(playerId);
        const held = requestedId ?? player?.heldWeaponId;
        if (!player || !held || !player.alive)
            return false;
        const loadout = this.adapter.getLoadout(playerId);
        const state = loadout ? weaponState(loadout, held) : undefined;
        if (!loadout || !state)
            return false;
        const fired = fireWeapon({
            phase: this.adapter.getPhase(),
            alive: player.alive,
            weapon: state,
            heldWeaponId: held,
            reload: this.reloads.get(playerId),
            nowTick,
            lastFiredTick: this.lastFiredTick.get(playerId),
        });
        if (!fired) {
            if (state.magazine === 0)
                this.tryStartReload(playerId);
            return false;
        }
        this.adapter.setLoadout(playerId, withWeaponState(loadout, fired.weapon));
        this.lastFiredTick.set(playerId, nowTick);
        const definition = weaponDefinition(held);
        if (definition.fireMode === "MELEE")
            this.tryKnifeAttack(playerId, definition.baseDamage);
        else {
            for (let index = 0; index < fired.pelletCount; index++) {
                this.spawnProjectile(player, held, definition.baseDamage, player.direction, index, fired.pelletCount, nowTick);
            }
        }
        if (fired.weapon.magazine === 0)
            this.tryStartReload(playerId);
        return true;
    }
    tryKnifeAttack(playerId, damage) {
        const shooter = this.adapter.getPlayer(playerId);
        if (!shooter?.role)
            return;
        const targetId = this.adapter.findMeleeTargets(playerId, 3).find(id => {
            const target = this.adapter.getPlayer(id);
            return target?.alive === true && target.role !== shooter.role;
        });
        if (targetId)
            this.adapter.applyMeleeDamage(playerId, targetId, damage);
    }
    spawnProjectile(player, weaponId, damage, direction, index, count, nowTick) {
        const definition = weaponDefinition(weaponId);
        if (!definition.projectileId)
            return;
        const origin = this.vectorAdd(player.headLocation, this.vectorScale(direction, 0.55));
        const projectileDirection = this.seededSpread(direction, index, count, nowTick);
        const id = this.adapter.spawnProjectile({ shooterId: player.id, weaponId, projectileType: definition.projectileId, origin, direction: projectileDirection });
        if (!id)
            return;
        this.activeProjectiles.set(id, {
            id,
            shooterId: player.id,
            weaponId,
            position: origin,
            direction: projectileDirection,
            damage,
            ageTicks: 0,
            distanceTravelled: 0,
            penetrations: 0,
            jumpShot: !player.isOnGround,
        });
    }
    hitProjectile(projectile, targetId, hitDistance, nowTick) {
        const shooter = this.adapter.getPlayer(projectile.shooterId);
        const target = this.adapter.getPlayer(targetId);
        if (!shooter || !target || !shooter.role || !target.role || !target.alive || !canDamageTarget(shooter.role, target.role)) {
            this.despawnProjectile(projectile);
            return;
        }
        const hitY = projectile.position.y + projectile.direction.y * hitDistance;
        const band = classifyHitBand(hitY, target.location.y);
        const damage = damageForHit(projectile.damage, band);
        this.projectileHitsByVictim.set(target.id, {
            weaponId: projectile.weaponId,
            shooterId: shooter.id,
            tick: nowTick,
            pendingDamage: true,
            headshot: band === "HEAD",
            jumpShot: projectile.jumpShot,
            wallbang: projectile.penetrations > 0,
        });
        this.adapter.applyProjectileDamage(shooter.id, target.id, damage);
        // Measured script damage can consume the native hurt event in the adapter.
        // Do not let its pending marker authorize an unrelated melee hit this tick.
        const appliedHit = this.projectileHitsByVictim.get(target.id);
        if (appliedHit?.tick === nowTick)
            appliedHit.pendingDamage = false;
        this.activeProjectiles.delete(projectile.id);
        this.adapter.despawnProjectile(projectile.id, 1);
    }
    despawnProjectile(projectile) {
        this.activeProjectiles.delete(projectile.id);
        this.adapter.despawnProjectile(projectile.id);
    }
    isReloadPhaseBlocked() {
        const phase = this.adapter.getPhase();
        return phase === "ROUND_END" || phase === "FREEZE" || phase === "LOBBY" || phase === "MAP_VOTE" || phase === "MATCH_END";
    }
    vectorAdd(a, b) {
        return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
    }
    vectorScale(a, scale) {
        return { x: a.x * scale, y: a.y * scale, z: a.z * scale };
    }
    seededSpread(direction, index, count, seed) {
        if (count <= 1)
            return { ...direction };
        let value = (seed * 1664525 + index * 1013904223) >>> 0;
        const random = () => {
            value = (value * 1664525 + 1013904223) >>> 0;
            return value / 0xffffffff;
        };
        const yaw = (random() - 0.5) * 0.08;
        const pitch = (random() - 0.5) * 0.08;
        const length = Math.hypot(direction.x, direction.z) || 1;
        const right = { x: -direction.z / length, y: 0, z: direction.x / length };
        const up = { x: 0, y: 1, z: 0 };
        const next = this.vectorAdd(this.vectorAdd(direction, this.vectorScale(right, yaw)), this.vectorScale(up, pitch));
        const magnitude = Math.hypot(next.x, next.y, next.z) || 1;
        return this.vectorScale(next, 1 / magnitude);
    }
}
