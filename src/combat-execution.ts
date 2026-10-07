import type { MatchPhase, ReloadPhase, Team, WeaponId, WeaponLoadout, WeaponReloadState } from "./types.js";
import { canDamageTarget, classifyHitBand, damageAfterPenetration, damageForHit, isPenetrableBlock, projectileShouldDespawn } from "./projectiles.js";
import { canStartReload, completeReload, fireWeapon, weaponDefinition, weaponState, withWeaponState } from "./weapons.js";

export interface CombatVector3 {
  x: number;
  y: number;
  z: number;
}

export interface CombatPlayerSnapshot {
  id: string;
  alive: boolean;
  role?: Team;
  heldWeaponId?: WeaponId;
  isOnGround: boolean;
  location: CombatVector3;
  headLocation: CombatVector3;
  direction: CombatVector3;
}

export interface ProjectileSpawnRequest {
  shooterId: string;
  weaponId: WeaponId;
  projectileType: string;
  origin: CombatVector3;
  direction: CombatVector3;
}

export type ProjectileCollision =
  | { kind: "ENTITY"; targetId: string; distance: number }
  | { kind: "BLOCK"; blockTypeId: string; point: CombatVector3; distance: number };

export interface CombatExecutionAdapter {
  initializeReloadBridge(): void;
  getPhase(): MatchPhase;
  getPlayers(): readonly CombatPlayerSnapshot[];
  getPlayer(id: string): CombatPlayerSnapshot | undefined;
  getLoadout(id: string): WeaponLoadout | undefined;
  setLoadout(id: string, loadout: WeaponLoadout): void;

  getReloadPhase(playerId: string): number;
  setReloadPhase(playerId: string, phase: ReloadPhase): void;

  spawnProjectile(request: ProjectileSpawnRequest): string | undefined;
  isProjectileValid(projectileId: string): boolean;
  raycastProjectile(projectileId: string, origin: CombatVector3, direction: CombatVector3, maxDistance: number): ProjectileCollision | undefined;
  moveProjectile(projectileId: string, position: CombatVector3): boolean;
  despawnProjectile(projectileId: string, delayTicks?: number): void;
  applyProjectileDamage(shooterId: string, targetId: string, damage: number): void;
  applyMeleeDamage(attackerId: string, targetId: string, damage: number): void;
  findMeleeTargets(playerId: string, maxDistance: number): readonly string[];
  restoreDamage(victimId: string, damage: number): void;
}

export interface CombatHurtEvent {
  victimId: string;
  attackerId?: string;
  damage: number;
  cause: string;
  hasDamagingProjectile: boolean;
}

export interface CombatDeathEvent {
  victimId: string;
  attackerId?: string;
  damagingProjectileWeaponId?: WeaponId;
  allowProjectileFallback?:boolean;
}

export interface CombatDeathAttribution {
  killerId?: string;
  rewardWeaponId?: WeaponId;
  flags: {
    headshot: boolean;
    jumpShot: boolean;
    wallbang: boolean;
  };
}

interface ActiveProjectile {
  id: string;
  shooterId: string;
  weaponId: WeaponId;
  position: CombatVector3;
  direction: CombatVector3;
  damage: number;
  ageTicks: number;
  distanceTravelled: number;
  penetrations: number;
  jumpShot: boolean;
}

interface ProjectileHitRecord {
  weaponId: WeaponId;
  shooterId: string;
  tick: number;
  pendingDamage: boolean;
  headshot: boolean;
  jumpShot: boolean;
  wallbang: boolean;
}

const PROJECTILE_SPEED = 4;

/**
 * Owns the complete combat execution sequence. Its adapter is the only seam
 * where Minecraft entities, health, raycasts, and the reload scoreboard exist.
 */
export class CombatExecution {
  private readonly firing = new Set<string>();
  private readonly lastFiredTick = new Map<string, number>();
  private readonly reloads = new Map<string, WeaponReloadState>();
  private readonly activeProjectiles = new Map<string, ActiveProjectile>();
  private readonly projectileHitsByVictim = new Map<string, ProjectileHitRecord>();

  public constructor(private readonly adapter: CombatExecutionAdapter) {}

  public initialize(): void {
    this.adapter.initializeReloadBridge();
  }

  public startFiring(playerId: string, weaponId: WeaponId, nowTick: number): boolean {
    if (weaponDefinition(weaponId).fireMode === "AUTO") this.firing.add(playerId);
    return this.tryFire(playerId, weaponId, nowTick);
  }

  public fire(playerId: string, weaponId: WeaponId | undefined, nowTick: number): boolean {
    return this.tryFire(playerId, weaponId, nowTick);
  }

  public stopFiring(playerId: string): void {
    this.firing.delete(playerId);
  }

  public tick(nowTick: number): void {
    this.tickReloadBridge();
    this.tickAutomaticFire(nowTick);
    this.tickProjectiles(nowTick);
  }

  public tickReloadBridge(): void {
    for (const player of this.adapter.getPlayers()) {
      if (!player.alive) continue;
      const phase = this.adapter.getReloadPhase(player.id);
      const active = this.reloads.get(player.id);
      if (!active && phase === 1) {
        this.adapter.setReloadPhase(player.id, 2);
        continue;
      }
      if (!active && phase === 2) {
        this.tryStartReload(player.id);
        if (!this.reloads.has(player.id)) this.adapter.setReloadPhase(player.id, 0);
        continue;
      }
      if (!active) continue;

      const held = player.heldWeaponId;
      if (held !== active.weaponId || this.isReloadPhaseBlocked()) {
        this.clearReload(player.id);
        continue;
      }
      active.progressTicks++;
      if (active.progressTicks < weaponDefinition(active.weaponId).reloadTicks) continue;

      const loadout = this.adapter.getLoadout(player.id);
      const state = loadout ? weaponState(loadout, active.weaponId) : undefined;
      if (loadout && state) this.adapter.setLoadout(player.id, withWeaponState(loadout, completeReload(state)));
      this.clearReload(player.id);
    }
  }

  public tickAutomaticFire(nowTick: number): void {
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

  public tickProjectiles(nowTick: number): void {
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
          if (!this.adapter.moveProjectile(projectile.id, projectile.position)) this.despawnProjectile(projectile);
          continue;
        }
        this.despawnProjectile(projectile);
        continue;
      }

      projectile.position = this.vectorAdd(projectile.position, this.vectorScale(projectile.direction, PROJECTILE_SPEED));
      if (!this.adapter.moveProjectile(projectile.id, projectile.position)) this.despawnProjectile(projectile);
    }
  }

  public handleHurt(event: CombatHurtEvent, nowTick: number): CombatHurtEvent|undefined {
    const pendingProjectile = this.projectileHitsByVictim.get(event.victimId);
    const projectileDamage = event.cause === "projectile" || event.cause === "override" || event.hasDamagingProjectile || (pendingProjectile?.pendingDamage === true && pendingProjectile.tick === nowTick);
    if (pendingProjectile?.tick === nowTick) pendingProjectile.pendingDamage = false;

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
      if (attacker?.role === victim?.role) { this.adapter.restoreDamage(event.victimId, event.damage);return; }
      if(attacker?.role&&victim?.role&&event.attackerId!==event.victimId&&event.damage>0)return event;
    }
  }

  public resolveDeath(event: CombatDeathEvent, nowTick: number): CombatDeathAttribution {
    const projectileHit = this.projectileHitsByVictim.get(event.victimId);
    const recentProjectileHit = projectileHit !== undefined && nowTick - projectileHit.tick <= 2;
    const attributedProjectileHit = event.allowProjectileFallback!==false && recentProjectileHit && (!event.attackerId || event.attackerId === projectileHit.shooterId)
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

  public clearPlayer(playerId: string): void {
    this.firing.delete(playerId);
    this.lastFiredTick.delete(playerId);
    this.clearReload(playerId);
  }

  public resetReloadBridge(): void {
    for (const player of this.adapter.getPlayers()) this.adapter.setReloadPhase(player.id, 0);
  }

  public cleanup(): void {
    for (const projectile of this.activeProjectiles.values()) this.despawnProjectile(projectile);
    this.activeProjectiles.clear();
    this.projectileHitsByVictim.clear();
    const playerIds = new Set([...this.adapter.getPlayers().map(player => player.id), ...this.firing, ...this.lastFiredTick.keys(), ...this.reloads.keys()]);
    for (const playerId of playerIds) this.clearPlayer(playerId);
    this.firing.clear();
    this.lastFiredTick.clear();
    this.reloads.clear();
  }

  private tryStartReload(playerId: string): boolean {
    const player = this.adapter.getPlayer(playerId);
    const weaponId = player?.heldWeaponId;
    if (!player || !weaponId) return false;
    const loadout = this.adapter.getLoadout(playerId);
    const weapon = loadout ? weaponState(loadout, weaponId) : undefined;
    if (!canStartReload({ phase: this.adapter.getPhase(), alive: player.alive, weapon, heldWeaponId: weaponId, reload: this.reloads.get(playerId) })) return false;
    this.reloads.set(playerId, { phase: 3, weaponId, progressTicks: 0 });
    this.adapter.setReloadPhase(playerId, 3);
    return true;
  }

  private clearReload(playerId: string): void {
    this.reloads.delete(playerId);
    this.adapter.setReloadPhase(playerId, 0);
  }

  private tryFire(playerId: string, requestedId: WeaponId | undefined, nowTick: number): boolean {
    const player = this.adapter.getPlayer(playerId);
    const held = requestedId ?? player?.heldWeaponId;
    if (!player || !held || !player.alive) return false;

    const loadout = this.adapter.getLoadout(playerId);
    const state = loadout ? weaponState(loadout, held) : undefined;
    if (!loadout || !state) return false;
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
      if (state.magazine === 0) this.tryStartReload(playerId);
      return false;
    }

    this.adapter.setLoadout(playerId, withWeaponState(loadout, fired.weapon));
    this.lastFiredTick.set(playerId, nowTick);
    const definition = weaponDefinition(held);
    if (definition.fireMode === "MELEE") this.tryKnifeAttack(playerId, definition.baseDamage);
    else {
      for (let index = 0; index < fired.pelletCount; index++) {
        this.spawnProjectile(player, held, definition.baseDamage, player.direction, index, fired.pelletCount, nowTick);
      }
    }
    if (fired.weapon.magazine === 0) this.tryStartReload(playerId);
    return true;
  }

  private tryKnifeAttack(playerId: string, damage: number): void {
    const shooter = this.adapter.getPlayer(playerId);
    if (!shooter?.role) return;
    const targetId = this.adapter.findMeleeTargets(playerId, 3).find(id => {
      const target = this.adapter.getPlayer(id);
      return target?.alive === true && target.role !== shooter.role;
    });
    if (targetId) this.adapter.applyMeleeDamage(playerId, targetId, damage);
  }

  private spawnProjectile(player: CombatPlayerSnapshot, weaponId: WeaponId, damage: number, direction: CombatVector3, index: number, count: number, nowTick: number): void {
    const definition = weaponDefinition(weaponId);
    if (!definition.projectileId) return;
    const origin = this.vectorAdd(player.headLocation, this.vectorScale(direction, 0.55));
    const projectileDirection = this.seededSpread(direction, index, count, nowTick);
    const id = this.adapter.spawnProjectile({ shooterId: player.id, weaponId, projectileType: definition.projectileId, origin, direction: projectileDirection });
    if (!id) return;
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

  private hitProjectile(projectile: ActiveProjectile, targetId: string, hitDistance: number, nowTick: number): void {
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
    const appliedHit=this.projectileHitsByVictim.get(target.id);
    if(appliedHit?.tick===nowTick)appliedHit.pendingDamage=false;
    this.activeProjectiles.delete(projectile.id);
    this.adapter.despawnProjectile(projectile.id, 1);
  }

  private despawnProjectile(projectile: ActiveProjectile): void {
    this.activeProjectiles.delete(projectile.id);
    this.adapter.despawnProjectile(projectile.id);
  }

  private isReloadPhaseBlocked(): boolean {
    const phase = this.adapter.getPhase();
    return phase === "ROUND_END" || phase === "FREEZE" || phase === "LOBBY" || phase === "MAP_VOTE" || phase === "MATCH_END";
  }

  private vectorAdd(a: CombatVector3, b: CombatVector3): CombatVector3 {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }

  private vectorScale(a: CombatVector3, scale: number): CombatVector3 {
    return { x: a.x * scale, y: a.y * scale, z: a.z * scale };
  }

  private seededSpread(direction: CombatVector3, index: number, count: number, seed: number): CombatVector3 {
    if (count <= 1) return { ...direction };
    let value = (seed * 1664525 + index * 1013904223) >>> 0;
    const random = (): number => {
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
