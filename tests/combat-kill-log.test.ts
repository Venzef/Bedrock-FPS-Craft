import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CombatExecution,
  type CombatExecutionAdapter,
  type CombatPlayerSnapshot,
  type ProjectileCollision,
  type ProjectileSpawnRequest,
} from "../src/combat-execution";
import type { MatchPhase, ReloadPhase, WeaponId, WeaponLoadout } from "../src/types";
import { createWeaponState } from "../src/weapons";

class KillLogCombatAdapter implements CombatExecutionAdapter {
  public phase: MatchPhase = "LIVE";
  public collisions: ProjectileCollision[] = [];
  private readonly loadouts = new Map<string, WeaponLoadout>([
    ["shooter", {primary:createWeaponState("W00"),knife:createWeaponState("W14")}],
    ["target", {knife:createWeaponState("W14")}],
  ]);
  private readonly players: CombatPlayerSnapshot[] = [
    {id:"shooter",alive:true,role:"T",heldWeaponId:"W00",isOnGround:true,location:{x:0,y:0,z:0},headLocation:{x:0,y:1.7,z:0},direction:{x:0,y:0,z:1}},
    {id:"target",alive:true,role:"CT",heldWeaponId:"W14",isOnGround:true,location:{x:0,y:0,z:2},headLocation:{x:0,y:1.7,z:2},direction:{x:0,y:0,z:-1}},
  ];

  public setShooterOnGround(isOnGround:boolean):void { this.players[0].isOnGround=isOnGround; }

  public initializeReloadBridge(): void {}
  public getPhase(): MatchPhase { return this.phase; }
  public getPlayers(): readonly CombatPlayerSnapshot[] { return this.players; }
  public getPlayer(id: string): CombatPlayerSnapshot | undefined { return this.players.find(player=>player.id===id); }
  public getLoadout(id: string): WeaponLoadout | undefined { return this.loadouts.get(id); }
  public setLoadout(id: string, loadout: WeaponLoadout): void { this.loadouts.set(id,loadout); }
  public getReloadPhase(): number { return 0; }
  public setReloadPhase(_playerId: string, _phase: ReloadPhase): void {}
  public spawnProjectile(_request: ProjectileSpawnRequest): string { return "projectile"; }
  public isProjectileValid(): boolean { return true; }
  public raycastProjectile(): ProjectileCollision | undefined { return this.collisions.shift(); }
  public moveProjectile(): boolean { return true; }
  public despawnProjectile(): void {}
  public applyProjectileDamage(): void {}
  public applyMeleeDamage(): void {}
  public findMeleeTargets(): readonly string[] { return []; }
  public restoreDamage(): void {}
}

function fireInto(collisions: ProjectileCollision[],shooterOnGround=true): {combat:CombatExecution;adapter:KillLogCombatAdapter} {
  const adapter=new KillLogCombatAdapter();
  const combat=new CombatExecution(adapter);
  adapter.setShooterOnGround(shooterOnGround);
  adapter.collisions.push(...collisions);
  assert.equal(combat.fire("shooter","W00",10),true);
  return {combat,adapter};
}

test("a lethal head-band projectile preserves the headshot flag for death attribution",()=>{
  const {combat}=fireInto([{kind:"ENTITY",targetId:"target",distance:1}]);
  combat.tickProjectiles(11);
  const attribution=combat.resolveDeath({victimId:"target",attackerId:"shooter"},11);
  assert.deepEqual(attribution,{killerId:"shooter",rewardWeaponId:"W00",flags:{headshot:true,jumpShot:false,wallbang:false}});
});

test("a projectile that penetrates a supported block preserves the wallbang flag",()=>{
  const {combat}=fireInto([
    {kind:"BLOCK",blockTypeId:"minecraft:glass",point:{x:0,y:0.9,z:1},distance:1},
    {kind:"ENTITY",targetId:"target",distance:1},
  ]);
  combat.tickProjectiles(11);
  combat.tickProjectiles(12);
  const attribution=combat.resolveDeath({victimId:"target",attackerId:"shooter"},12);
  assert.deepEqual(attribution,{killerId:"shooter",rewardWeaponId:"W00",flags:{headshot:false,jumpShot:false,wallbang:true}});
});

test("stale projectile metadata cannot decorate a later unrelated death",()=>{
  const {combat}=fireInto([{kind:"ENTITY",targetId:"target",distance:1}]);
  combat.tickProjectiles(11);
  const attribution=combat.resolveDeath({victimId:"target",attackerId:"shooter"},14);
  assert.deepEqual(attribution,{killerId:"shooter",rewardWeaponId:"W00",flags:{headshot:false,jumpShot:false,wallbang:false}});
});

test("an environmental death cannot borrow a projectile kill from the same tick",()=>{
  const {combat}=fireInto([{kind:"ENTITY",targetId:"target",distance:1}]);
  combat.tickProjectiles(11);
  assert.deepEqual(combat.resolveDeath({victimId:"target",allowProjectileFallback:false},11),{
    killerId:undefined,rewardWeaponId:undefined,flags:{headshot:false,jumpShot:false,wallbang:false},
  });
});

test("a measured projectile cannot authorize gun melee damage later in the same tick",()=>{
  const {combat}=fireInto([{kind:"ENTITY",targetId:"target",distance:1}]);
  combat.tickProjectiles(11);
  assert.equal(combat.handleHurt({victimId:"target",attackerId:"shooter",damage:1,cause:"entityAttack",hasDamagingProjectile:false},11),undefined);
});

test("jumpShot is captured when firing and survives landing before the lethal hit",()=>{
  const {combat,adapter}=fireInto([{kind:"ENTITY",targetId:"target",distance:1}],false);
  adapter.setShooterOnGround(true);
  combat.tickProjectiles(11);
  const attribution=combat.resolveDeath({victimId:"target",attackerId:"shooter"},11);
  assert.deepEqual(attribution,{killerId:"shooter",rewardWeaponId:"W00",flags:{headshot:true,jumpShot:true,wallbang:false}});
});

test("the Minecraft adapter captures the firing player's grounded state",()=>{
  const source=readFileSync(new URL("../src/minecraft-combat-adapter.ts",import.meta.url),"utf8");
  assert.match(source,/isOnGround:\s*this\.isPlayerOnGround\(player\)/);
});
