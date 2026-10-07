import { world } from "@minecraft/server";
import { MATCH_CONFIG } from "./config.js";
import { initialLoadout, weaponDefinition } from "./weapons.js";
import type { PersistedMatchState, WeaponLoadout, WeaponState } from "./types.js";

const STATE_KEY = "fps:match_state";

function sanitizeWeaponState(state:unknown):WeaponState|undefined {
  if(!state||typeof state!=="object")return undefined;
  const candidate=state as Partial<WeaponState>;
  if(typeof candidate.id!=="string"||!/^W\d{2}$/.test(candidate.id))return undefined;
  try {
    const definition=weaponDefinition(candidate.id as WeaponState["id"]);
    const magazine=Number(candidate.magazine),reserve=Number(candidate.reserve);
    if(!Number.isFinite(magazine)||!Number.isFinite(reserve))return undefined;
    return {id:definition.id,magazine:Math.max(0,Math.min(definition.magazineSize,Math.floor(magazine))),reserve:Math.max(0,Math.min(definition.reserveSize,Math.floor(reserve)))};
  } catch { return undefined; }
}

function sanitizeLoadout(value:unknown):WeaponLoadout {
  const fallback=initialLoadout();
  if(!value||typeof value!=="object")return fallback;
  const candidate=value as Partial<WeaponLoadout>;
  const primary=sanitizeWeaponState(candidate.primary),secondary=sanitizeWeaponState(candidate.secondary),knife=sanitizeWeaponState(candidate.knife);
  return {
    primary:primary&&weaponDefinition(primary.id).slot==="PRIMARY"?primary:undefined,
    secondary:secondary&&weaponDefinition(secondary.id).slot==="SECONDARY"?secondary:undefined,
    knife:knife?.id==="W14"?knife:fallback.knife,
  };
}

export function initialState(): PersistedMatchState {
  return { phase:"LOBBY", round:1, tScore:0, ctScore:0, lossStreak:{T:0,CT:0}, timerTicks:0, players:[] };
}

export function loadState(): PersistedMatchState {
  const raw = world.getDynamicProperty(STATE_KEY);
  if (typeof raw !== "string") return initialState();
  try {
    const parsed = JSON.parse(raw) as PersistedMatchState;
    if (!parsed?.players || !parsed.lossStreak) return initialState();
    parsed.round = Math.max(1,Math.min(MATCH_CONFIG.maxRounds,Math.floor(parsed.round||1)));
    parsed.tScore = Math.max(0,Math.min(MATCH_CONFIG.roundsToWin,Math.floor(parsed.tScore||0)));
    parsed.ctScore = Math.max(0,Math.min(MATCH_CONFIG.roundsToWin,Math.floor(parsed.ctScore||0)));
    for(const player of parsed.players){
      player.money=Math.max(0,Math.min(MATCH_CONFIG.maxMoney,Math.floor(player.money||0)));
      player.activeFromRound=Math.max(1,Math.floor(player.activeFromRound||1));
      player.loadout=sanitizeLoadout(player.loadout);
      player.hasDefuseKit=player.hasDefuseKit===true;
    }
    return parsed;
  } catch { return initialState(); }
}

export function saveState(state: PersistedMatchState): void {
  world.setDynamicProperty(STATE_KEY, JSON.stringify(state));
}

export function resetState(): PersistedMatchState {
  const state = initialState();
  saveState(state);
  return state;
}

export function ensurePlayer(state: PersistedMatchState, id: string, name: string) {
  let found = state.players.find(p => p.id === id);
  if (!found) {
    found = { id, name, squad:"T", money:MATCH_CONFIG.startingMoney, alive:false, activeFromRound:state.round + (state.phase === "LOBBY" ? 0 : 1), connected:true, joined:false, hasDefuseKit:false };
    state.players.push(found);
  }
  found.name = name; found.connected = true; found.joined ??= true;
  return found;
}
