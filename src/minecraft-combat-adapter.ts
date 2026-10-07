import { EntityComponentTypes, EntityDamageCause, Player, system, world, type Entity, type EntityDieAfterEvent, type EntityHurtAfterEvent, type ScoreboardObjective } from "@minecraft/server";
import type { CombatDeathEvent, CombatExecutionAdapter, CombatHurtEvent, CombatPlayerSnapshot, CombatVector3, ProjectileCollision, ProjectileSpawnRequest } from "./combat-execution.js";
import type { MatchPhase, ReloadPhase, Team, WeaponId, WeaponLoadout } from "./types.js";
import { inventory } from "./utils.js";
import { weaponIdFromItemType } from "./weapons.js";
import { EffectiveDamage } from "./scoreboard/damage.js";

const PROJECTILE_TAG = "fps:projectile";
const RELOAD_OBJECTIVE = "fps_reload";

export interface MinecraftCombatStateAccess {
  getPhase(): MatchPhase;
  getPlayerState(id: string): { alive: boolean; role?: Team; loadout?: WeaponLoadout } | undefined;
  setLoadout(id: string, loadout: WeaponLoadout): void;
  recordDamage?(victimId:string,attackerId:string,damage:number):void;
}

/** The Minecraft-side adapter for combat execution and the reload bridge. */
export class MinecraftCombatAdapter implements CombatExecutionAdapter {
  private readonly projectileEntities = new Map<string, Entity>();
  private readonly damage=new EffectiveDamage((victim,attacker,amount)=>this.state.recordDamage?.(victim,attacker,amount));

  public deferDeath(victimId:string,callback:()=>void):boolean { return this.damage.deferDeath(victimId,callback); }

  public constructor(private readonly state: MinecraftCombatStateAccess) {}

  public initializeReloadBridge(): void {
    this.reloadObjective();
  }

  public getPhase(): MatchPhase {
    return this.state.getPhase();
  }

  public getPlayers(): readonly CombatPlayerSnapshot[] {
    return world.getAllPlayers().map(player => this.snapshot(player)).filter((player): player is CombatPlayerSnapshot => player !== undefined);
  }

  public getPlayer(id: string): CombatPlayerSnapshot | undefined {
    const player = this.findPlayer(id);
    return player ? this.snapshot(player) : undefined;
  }

  public getLoadout(id: string): WeaponLoadout | undefined {
    return this.state.getPlayerState(id)?.loadout;
  }

  public setLoadout(id: string, loadout: WeaponLoadout): void {
    this.state.setLoadout(id, loadout);
  }

  public getReloadPhase(playerId: string): number {
    const objective = this.reloadObjective();
    const player = this.findPlayer(playerId);
    if (!objective || !player) return 0;
    try {
      return objective.getScore(player.scoreboardIdentity ?? player.name) ?? 0;
    } catch {
      return 0;
    }
  }

  public setReloadPhase(playerId: string, phase: ReloadPhase): void {
    const objective = this.reloadObjective();
    const player = this.findPlayer(playerId);
    if (!objective || !player) return;
    try {
      objective.setScore(player.scoreboardIdentity ?? player.name, phase);
    } catch {}
  }

  public spawnProjectile(request: ProjectileSpawnRequest): string | undefined {
    const shooter = this.findPlayer(request.shooterId);
    if (!shooter) return undefined;
    try {
      const entity = shooter.dimension.spawnEntity(request.projectileType, request.origin);
      entity.addTag(PROJECTILE_TAG);
      entity.setDynamicProperty("fps:shooter", request.shooterId);
      entity.setDynamicProperty("fps:weapon_id", request.weaponId);
      this.projectileEntities.set(entity.id, entity);
      return entity.id;
    } catch {
      return undefined;
    }
  }

  public isProjectileValid(projectileId: string): boolean {
    return this.projectileEntities.get(projectileId)?.isValid === true;
  }

  public raycastProjectile(projectileId: string, origin: CombatVector3, direction: CombatVector3, maxDistance: number): ProjectileCollision | undefined {
    const projectile = this.projectileEntities.get(projectileId);
    if (!projectile) return undefined;
    const dimension = projectile.dimension;

    let blockHit;
    try {
      blockHit = dimension.getBlockFromRay(origin, direction, { maxDistance, includeLiquidBlocks: true, includePassableBlocks: true });
    } catch {
      blockHit = undefined;
    }
    let blockDistance = Number.POSITIVE_INFINITY;
    let blockPoint: CombatVector3 | undefined;
    if (blockHit) {
      blockPoint = this.vectorAdd(blockHit.block.location, blockHit.faceLocation);
      blockDistance = this.distance(blockPoint, origin);
    }

    let entityHit;
    try {
      entityHit = dimension.getEntitiesFromRay(origin, direction, { maxDistance, ignoreBlockCollision: true, includePassableBlocks: true })
        .filter(hit => hit.entity instanceof Player && hit.entity.id !== (projectile.getDynamicProperty("fps:shooter") ?? ""))
        .sort((a, b) => a.distance - b.distance)[0];
    } catch {
      entityHit = undefined;
    }
    if (entityHit && entityHit.distance <= blockDistance) return { kind: "ENTITY", targetId: entityHit.entity.id, distance: entityHit.distance };
    if (blockHit && blockPoint && blockDistance <= maxDistance) return { kind: "BLOCK", blockTypeId: blockHit.block.typeId, point: blockPoint, distance: blockDistance };
    return undefined;
  }

  public moveProjectile(projectileId: string, position: CombatVector3): boolean {
    const projectile = this.projectileEntities.get(projectileId);
    if (!projectile) return false;
    try {
      projectile.tryTeleport(position, { checkForBlocks: false, keepVelocity: false });
      return true;
    } catch {
      return false;
    }
  }

  public despawnProjectile(projectileId: string, delayTicks = 0): void {
    if (delayTicks > 0) {
      system.runTimeout(() => this.despawnProjectile(projectileId), delayTicks);
      return;
    }
    const projectile = this.projectileEntities.get(projectileId);
    this.projectileEntities.delete(projectileId);
    try {
      if (projectile?.isValid) projectile.remove();
    } catch {}
  }

  public applyProjectileDamage(shooterId: string, targetId: string, damage: number): void {
    const shooter = this.findPlayer(shooterId);
    const target = this.findPlayer(targetId);
    if (!shooter || !target) return;
    const health = target.getComponent(EntityComponentTypes.Health);
    const healthBefore = health?.currentValue;
    if(!health||healthBefore===undefined)return;
    this.damage.apply(targetId,shooterId,()=>{try{return health.currentValue;}catch{return 0;}},()=>{
    try {
      target.applyDamage(damage, { cause: EntityDamageCause.override, damagingEntity: shooter });
    } catch {}
    try {
      const healthAfter = health.currentValue;
      const applied = Math.max(0, healthBefore - healthAfter);
      const remaining = Math.max(0, damage - applied);
      if (remaining > 0) health.setCurrentValue(Math.max(health.effectiveMin, healthAfter - remaining));
    } catch {}
    });
  }

  public applyMeleeDamage(attackerId: string, targetId: string, damage: number): void {
    const attacker = this.findPlayer(attackerId);
    const target = this.findPlayer(targetId);
    if (!attacker || !target) return;
    const health=target.getComponent(EntityComponentTypes.Health);if(!health)return;
    this.damage.apply(targetId,attackerId,()=>{try{return health.currentValue;}catch{return 0;}},()=>{
      try { target.applyDamage(damage, { cause: EntityDamageCause.entityAttack, damagingEntity: attacker }); } catch {}
    });
  }

  public findMeleeTargets(playerId: string, maxDistance: number): readonly string[] {
    const player = this.findPlayer(playerId);
    if (!player) return [];
    try {
      return player.getEntitiesFromViewDirection({ maxDistance, includePassableBlocks: true })
        .filter(entry => entry.entity instanceof Player && entry.entity.id !== playerId)
        .map(entry => entry.entity.id);
    } catch {
      return [];
    }
  }

  public restoreDamage(victimId: string, damage: number): void {
    const victim = this.findPlayer(victimId);
    const health = victim?.getComponent(EntityComponentTypes.Health);
    if (!health) return;
    try {
      health.setCurrentValue(Math.min(health.effectiveMax, health.currentValue + damage));
    } catch {}
  }

  public hurtEvent(event: EntityHurtAfterEvent): CombatHurtEvent | undefined {
    if (!(event.hurtEntity instanceof Player)) return undefined;
    if(this.damage.isApplying(event.hurtEntity.id))return undefined;
    const attacker = event.damageSource.damagingEntity;
    return {
      victimId: event.hurtEntity.id,
      attackerId: attacker instanceof Player ? attacker.id : undefined,
      damage: event.damage,
      cause: event.damageSource.cause,
      hasDamagingProjectile: event.damageSource.damagingProjectile !== undefined,
    };
  }

  public deathEvent(event: EntityDieAfterEvent): CombatDeathEvent | undefined {
    if (!(event.deadEntity instanceof Player)) return undefined;
    const attacker = event.damageSource.damagingEntity;
    const projectile = event.damageSource.damagingProjectile;
    const weaponId = projectile?.getDynamicProperty("fps:weapon_id");
    return {
      victimId: event.deadEntity.id,
      attackerId: attacker instanceof Player ? attacker.id : undefined,
      allowProjectileFallback:this.damage.isApplying(event.deadEntity.id)||event.damageSource.cause===EntityDamageCause.override||event.damageSource.cause===EntityDamageCause.projectile,
      damagingProjectileWeaponId: typeof weaponId === "string" && weaponId.startsWith("W") ? weaponId as WeaponId : undefined,
    };
  }

  private reloadObjective(): ScoreboardObjective | undefined {
    try {
      return world.scoreboard.getObjective(RELOAD_OBJECTIVE) ?? world.scoreboard.addObjective(RELOAD_OBJECTIVE, "FPS reload bridge");
    } catch {
      return undefined;
    }
  }

  private findPlayer(id: string): Player | undefined {
    return world.getAllPlayers().find(player => player.id === id);
  }

  private snapshot(player: Player): CombatPlayerSnapshot | undefined {
    const matchState = this.state.getPlayerState(player.id);
    if (!matchState) return undefined;
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

  private isPlayerOnGround(player: Player): boolean {
    try {
      return player.isOnGround;
    } catch {
      // A failed API read must not create a false-positive jump-shot flag.
      return true;
    }
  }

  private vectorAdd(a: CombatVector3, b: CombatVector3): CombatVector3 {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }

  private distance(a: CombatVector3, b: CombatVector3): number {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }
}
