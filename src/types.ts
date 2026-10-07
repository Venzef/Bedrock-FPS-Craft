import type { Vector3 } from "@minecraft/server";

export type Team = "T" | "CT";
export type MatchPhase = "LOBBY" | "MAP_VOTE" | "FREEZE" | "LIVE" | "BOMB_PLANTED" | "ROUND_END" | "MATCH_END";
export type SiteId = "A" | "B";
export type RoundEndReason = "defused" | "exploded" | "elimination" | "timeout" | "forfeit" | "admin" | "score";
export type HudBombDisplay = "TIMER" | "PLANTED" | "DEFUSED";
export type WeaponId = "W00" | "W02" | "W03" | "W04" | "W05" | "W14";
export type WeaponSlot = "PRIMARY" | "SECONDARY" | "KNIFE";
export type FireMode = "AUTO" | "SEMI" | "PUMP" | "MELEE";
export type ReloadPhase = 0 | 1 | 2 | 3;
export type ArmorTier = "NONE" | "ARMOR" | "ARMOR_SET";
export type PurchasableArmorTier = Exclude<ArmorTier, "NONE">;

export interface Box { min: Vector3; max: Vector3 }
export interface MapDefinition {
  id: string;
  nameKey: string;
  boundary: Box;
  tSpawns: Vector3[];
  ctSpawns: Vector3[];
  sites: Record<SiteId, Box>;
  buyZones: Record<Team, Box>;
  spectator: Vector3;
  bombRecovery: Vector3;
}

export interface MatchConfig {
  maxPlayersPerTeam: number;
  maxTeamDifference: number;
  roundsPerHalf: number;
  roundsToWin: number;
  maxRounds: number;
  freezeTicks: number;
  roundTicks: number;
  plantTicks: number;
  bombTicks: number;
  defuseTicks: number;
  defuseWithoutKitTicks: number;
  roundEndTicks: number;
  startingMoney: number;
  maxMoney: number;
  winReward: number;
  lossRewardBase: number;
  lossRewardStep: number;
  lossRewardMax: number;
  plantedLossBonus: number;
}

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  itemId: string;
  slot: WeaponSlot;
  fireMode: FireMode;
  magazineSize: number;
  reserveSize: number;
  fireIntervalTicks: number;
  reloadTicks: number;
  baseDamage: number;
  pelletCount?: number;
  price: number;
  killReward: number;
  projectileId?: string;
  scoped?: boolean;
}

export interface WeaponState {
  id: WeaponId;
  magazine: number;
  reserve: number;
}

export interface WeaponReloadState {
  phase: ReloadPhase;
  weaponId: WeaponId;
  progressTicks: number;
}

export interface WeaponLoadout {
  primary?: WeaponState;
  secondary?: WeaponState;
  knife: WeaponState;
}

export interface PlayerMatchState {
  id: string;
  name: string;
  squad: Team;
  money: number;
  alive: boolean;
  activeFromRound: number;
  connected: boolean;
  joined: boolean;
  hasDefuseKit: boolean;
  loadout?: WeaponLoadout;
}

export interface BombState {
  kind: "CARRIED" | "DROPPED" | "PLANTING" | "PLANTED" | "DEFUSING";
  carrierId?: string;
  location?: Vector3;
  droppedEntityId?: string;
  site?: SiteId;
  progressTicks: number;
  timerTicks: number;
  actorId?: string;
}

export interface PersistedMatchState {
  phase: MatchPhase;
  mapId?: string;
  round: number;
  tScore: number;
  ctScore: number;
  lossStreak: Record<Team, number>;
  timerTicks: number;
  players: PlayerMatchState[];
  bomb?: BombState;
  lastRoundWinner?: Team;
  lastRoundReason?: RoundEndReason;
}

export interface HudPlayerSlot {
  name: string;
  alive: boolean;
}

export interface HudSnapshot {
  timerTicks: number;
  tScore: number;
  ctScore: number;
  tPlayers: HudPlayerSlot[];
  ctPlayers: HudPlayerSlot[];
  bombDisplay: HudBombDisplay;
}

export interface ShopItem {
  id: string;
  name: string;
  price: number;
  uiIndex?: number;
  texture?: string;
  amount?: number;
  armorTier?: PurchasableArmorTier;
  weaponId?: WeaponId;
  defuseKit?: boolean;
}
