import type { MatchPhase, WeaponDefinition, WeaponId, WeaponLoadout, WeaponReloadState, WeaponState } from "./types.js";
import { fixedHotbarWeaponSlotAt } from "./inventory.js";

export const WEAPONS: readonly WeaponDefinition[] = [
  {
    id:"W05", name:"USP", itemId:"fps:gun_sidearm", slot:"SECONDARY", fireMode:"AUTO",
    magazineSize:12, reserveSize:48, fireIntervalTicks:6, reloadTicks:30, baseDamage:4,
    price:500, killReward:300, projectileId:"fps:bullet_sidearm",
  },
  {
    id:"W04", name:"UMP", itemId:"fps:gun_vector", slot:"PRIMARY", fireMode:"AUTO",
    magazineSize:30, reserveSize:120, fireIntervalTicks:2, reloadTicks:40, baseDamage:3,
    price:1500, killReward:800, projectileId:"fps:bullet_vector",
  },
  {
    id:"W00", name:"AK47", itemId:"fps:gun_ranger", slot:"PRIMARY", fireMode:"AUTO",
    magazineSize:30, reserveSize:90, fireIntervalTicks:3, reloadTicks:45, baseDamage:7,
    price:2800, killReward:300, projectileId:"fps:bullet_ranger",
  },
  {
    id:"W03", name:"Bulldog", itemId:"fps:gun_bulldog", slot:"PRIMARY", fireMode:"PUMP",
    magazineSize:8, reserveSize:32, fireIntervalTicks:20, reloadTicks:50, baseDamage:3,
    pelletCount:8, price:2000, killReward:600, projectileId:"fps:bullet_bulldog",
  },
  {
    id:"W02", name:"AWP", itemId:"fps:gun_longshot", slot:"PRIMARY", fireMode:"SEMI",
    magazineSize:5, reserveSize:20, fireIntervalTicks:20, reloadTicks:50, baseDamage:20,
    price:4500, killReward:300, projectileId:"fps:bullet_longshot", scoped:true,
  },
  {
    id:"W14", name:"Knife", itemId:"fps:knife", slot:"KNIFE", fireMode:"MELEE",
    magazineSize:0, reserveSize:0, fireIntervalTicks:10, reloadTicks:0, baseDamage:6,
    price:0, killReward:800,
  },
] as const;

const BY_ID = new Map(WEAPONS.map(weapon=>[weapon.id,weapon]));

export function weaponDefinition(id: WeaponId): WeaponDefinition {
  const definition=BY_ID.get(id);
  if(!definition)throw new Error(`Unknown weapon id: ${id}`);
  return definition;
}

export function createWeaponState(id: WeaponId): WeaponState {
  const definition=weaponDefinition(id);
  return {id,magazine:definition.magazineSize,reserve:definition.reserveSize};
}

export function consumeShot(state: WeaponState): WeaponState|undefined {
  if(state.magazine<=0)return undefined;
  return {...state,magazine:state.magazine-1};
}

export function completeReload(state: WeaponState): WeaponState {
  const definition=weaponDefinition(state.id);
  const needed=Math.max(0,definition.magazineSize-state.magazine);
  const loaded=Math.min(needed,Math.max(0,state.reserve));
  return {...state,magazine:state.magazine+loaded,reserve:state.reserve-loaded};
}

export function canStartReload(context: {
  phase: MatchPhase;
  alive: boolean;
  weapon?: WeaponState;
  heldWeaponId?: WeaponId;
  reload?: WeaponReloadState;
}): boolean {
  if (!context.alive || !context.weapon) return false;
  if (context.phase !== "LIVE" && context.phase !== "BOMB_PLANTED") return false;
  if (context.heldWeaponId !== context.weapon.id || context.reload) return false;
  const definition = weaponDefinition(context.weapon.id);
  return definition.slot !== "KNIFE" &&
    context.weapon.magazine < definition.magazineSize &&
    context.weapon.reserve > 0;
}

export interface FireContext {
  phase: MatchPhase;
  alive: boolean;
  weapon?: WeaponState;
  heldWeaponId?: WeaponId;
  reload?: WeaponReloadState;
  nowTick: number;
  lastFiredTick?: number;
}

export interface FiredShot {
  weapon: WeaponState;
  pelletCount: number;
  nextFireTick: number;
}

export function canFire(context: FireContext): boolean {
  if (!context.alive || !context.weapon) return false;
  if (context.phase !== "LIVE" && context.phase !== "BOMB_PLANTED" && context.phase !== "ROUND_END") return false;
  if (context.heldWeaponId !== context.weapon.id || context.reload) return false;
  const definition = weaponDefinition(context.weapon.id);
  if (context.weapon.magazine <= 0) return false;
  return context.lastFiredTick === undefined || context.nowTick >= context.lastFiredTick + definition.fireIntervalTicks;
}

export function fireWeapon(context: FireContext): FiredShot | undefined {
  if (!canFire(context) || !context.weapon) return undefined;
  const definition = weaponDefinition(context.weapon.id);
  const weapon = consumeShot(context.weapon);
  if (!weapon) return undefined;
  return {
    weapon,
    pelletCount: definition.pelletCount ?? 1,
    nextFireTick: context.nowTick + definition.fireIntervalTicks,
  };
}

export function weaponIdFromItemType(typeId: string): WeaponId | undefined {
  return WEAPONS.find(weapon => weapon.itemId === typeId)?.id;
}

export function isWeaponItem(typeId: string): boolean {
  return weaponIdFromItemType(typeId) !== undefined;
}

export function weaponState(loadout: WeaponLoadout, id: WeaponId): WeaponState | undefined {
  const definition = weaponDefinition(id);
  return definition.slot === "PRIMARY" ? loadout.primary : definition.slot === "SECONDARY" ? loadout.secondary : loadout.knife;
}

export function withWeaponState(loadout: WeaponLoadout, state: WeaponState): WeaponLoadout {
  const definition = weaponDefinition(state.id);
  if (definition.slot === "PRIMARY") return {...loadout, primary:{...state}};
  if (definition.slot === "SECONDARY") return {...loadout, secondary:{...state}};
  return {...loadout, knife:{...state}};
}

export function shouldKeepWeaponItem(loadout: WeaponLoadout, slot: number, typeId: string): boolean {
  const id=weaponIdFromItemType(typeId);
  const hotbarSlot=fixedHotbarWeaponSlotAt(slot);
  if(!id||!hotbarSlot)return false;
  const expected=hotbarSlot==="PRIMARY"?loadout.primary:hotbarSlot==="SECONDARY"?loadout.secondary:loadout.knife;
  return !!expected&&expected.id===id&&weaponDefinition(id).itemId===typeId;
}

export function initialLoadout(): WeaponLoadout {
  return {knife:createWeaponState("W14")};
}

export function refillAtBuyPhase(loadout: WeaponLoadout): WeaponLoadout {
  return {
    primary:loadout.primary ? createWeaponState(loadout.primary.id) : undefined,
    secondary:loadout.secondary ? createWeaponState(loadout.secondary.id) : undefined,
    knife:createWeaponState("W14"),
  };
}

export function equipWeapon(loadout: WeaponLoadout, id: WeaponId): {loadout: WeaponLoadout; replaced?: WeaponState} {
  const definition=weaponDefinition(id);
  if(definition.slot==="KNIFE")return {loadout:{...loadout,knife:createWeaponState("W14")}};
  const key=definition.slot==="PRIMARY" ? "primary" : "secondary";
  return {
    loadout:{...loadout,[key]:createWeaponState(id)},
    replaced:loadout[key],
  };
}
