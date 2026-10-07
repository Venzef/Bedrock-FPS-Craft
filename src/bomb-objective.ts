import type { Vector3 } from "@minecraft/server";
import type { BombState, Box, MatchConfig, PersistedMatchState, SiteId, Team } from "./types.js";

export const BOMB_ITEM = "fps:bomb";

export type PlantMode = "LIVE_OBJECTIVE" | "POST_ROUND";
export type BombInteractionKind = "plant" | "defuse";

export interface BombObjectiveMap {
  boundary: Box;
  bombRecovery: Vector3;
  sites: Record<SiteId, Box>;
}

export interface BombPlayerObservation {
  id: string;
  role: Team | undefined;
  alive: boolean;
  location: Vector3;
  dimensionId: string;
  aimedBomb?: boolean;
}

export interface DroppedBombReference {
  id: string;
  location: Vector3;
  dimensionId: string;
}

/**
 * Minecraft-specific work lives behind this seam. The objective policy only
 * asks for item/entity operations and never imports a Minecraft Entity or
 * inventory container.
 */
export interface BombObjectiveAdapter {
  heldItem(playerId: string): string | undefined;
  removeBomb(playerId: string): void;
  giveBomb(playerId: string): boolean;
  reconcileBombItems(shouldKeep: (playerId: string, alreadyKept: boolean) => boolean): void;
  removeVanillaBombItems(): void;
  ensureDroppedBomb(bomb: BombState): DroppedBombReference | undefined;
  spawnDroppedBomb(location: Vector3, bounceTarget?: Vector3): DroppedBombReference | undefined;
  despawnDroppedBomb(drop: DroppedBombReference): void;
  removeAllDroppedBombs(): void;
  spawnPlantedBomb(playerId: string, location: Vector3, site: SiteId): void;
  removePlantedBombs(): void;
}

export type BombObjectiveEffect =
  | { kind: "INTERACTION_STARTED"; playerId: string; interaction: BombInteractionKind; durationTicks: number; startedWithKit: boolean }
  | { kind: "INTERACTION_CANCELLED"; playerId: string; interaction: BombInteractionKind }
  | { kind: "PLANTED"; playerId: string; site: SiteId; location: Vector3; mode: PlantMode }
  | { kind: "DEFUSED"; playerId: string; startedWithKit: boolean }
  | { kind: "DROPPED"; playerId: string; location: Vector3 }
  | { kind: "PICKED_UP"; playerId: string };

export interface BombObjectiveTransition {
  state: PersistedMatchState;
  effects: readonly BombObjectiveEffect[];
}

export function opposite(team: Team): Team { return team === "T" ? "CT" : "T"; }

export function canKeepBombItem(bomb: BombState | undefined, playerId: string, alreadyKept: boolean): boolean {
  return !alreadyKept && (bomb?.kind === "CARRIED" || bomb?.kind === "PLANTING") && bomb.carrierId === playerId;
}

export function canPickUpDroppedBomb(playerId: string, dropperId: string | undefined, blockedUntilTick: number, currentTick: number): boolean {
  return playerId !== dropperId || currentTick >= blockedUntilTick;
}

export function droppedBombBounceTarget(origin: Vector3, direction: Vector3, distance = 2.5): Vector3 {
  const horizontalLength = Math.hypot(direction.x, direction.z);
  if (horizontalLength === 0) return { ...origin };
  return {
    x: origin.x + (direction.x / horizontalLength) * distance,
    y: origin.y,
    z: origin.z + (direction.z / horizontalLength) * distance,
  };
}

export function bombWasPlanted(bomb: BombState | undefined): boolean {
  return bomb?.kind === "PLANTED" || bomb?.kind === "DEFUSING";
}

export function plantMode(state: Pick<PersistedMatchState, "phase" | "lastRoundWinner" | "lastRoundReason">): PlantMode | undefined {
  if (state.phase === "LIVE") return "LIVE_OBJECTIVE";
  if (state.phase === "ROUND_END" && state.lastRoundWinner === "T" && state.lastRoundReason === "elimination") return "POST_ROUND";
  return undefined;
}

export function completePlantTransition(
  state: PersistedMatchState,
  location: NonNullable<BombState["location"]>,
  config: Pick<MatchConfig, "bombTicks">,
): { mode: PlantMode; state: PersistedMatchState } | undefined {
  const mode = plantMode(state), bomb = state.bomb;
  if (!mode || bomb?.kind !== "PLANTING" || !bomb.site) return undefined;
  const next: PersistedMatchState = {
    ...state,
    bomb: {
      kind: "PLANTED",
      site: bomb.site,
      location: { ...location },
      progressTicks: 0,
      timerTicks: mode === "LIVE_OBJECTIVE" ? config.bombTicks : 0,
    },
  };
  if (mode === "LIVE_OBJECTIVE") next.phase = "BOMB_PLANTED";
  return { mode, state: next };
}

export function recoverInterruptedBomb(bomb: BombState | undefined): BombState | undefined {
  if (bomb?.kind === "PLANTING") return { kind: "CARRIED", carrierId: bomb.carrierId, progressTicks: 0, timerTicks: 0 };
  if (bomb?.kind === "DEFUSING") return {
    kind: "PLANTED",
    site: bomb.site,
    location: bomb.location ? { ...bomb.location } : undefined,
    progressTicks: 0,
    timerTicks: bomb.timerTicks,
  };
  return bomb;
}

interface ActiveInteraction {
  kind: BombInteractionKind;
  origin: Vector3;
  ticks: number;
  durationTicks: number;
  startedWithKit: boolean;
  heldItemId: string;
}

export interface BombInteractionProgress {
  kind: BombInteractionKind;
  ticks: number;
  durationTicks: number;
  startedWithKit: boolean;
}

export interface BombObjectiveConfig extends Pick<MatchConfig, "plantTicks" | "defuseTicks" | "defuseWithoutKitTicks" | "bombTicks"> {
  repickupBlockTicks: number;
  droppedBombBounceDistance: number;
}

export interface StartBombInteractionInput extends BombPlayerObservation {
  itemId: string;
  aimedBomb?: boolean;
  map: BombObjectiveMap;
}

export interface TickBombInteractionInput {
  players: ReadonlyMap<string, BombPlayerObservation>;
  map: BombObjectiveMap;
}

export interface DropBombInput {
  playerId: string;
  candidateLocation?: Vector3;
  direction?: Vector3;
  currentTick: number;
  map: BombObjectiveMap;
}

export interface PickupBombInput {
  currentTick: number;
  players: readonly BombPlayerObservation[];
}

function copyStateWithBomb(state: PersistedMatchState, bomb: BombState | undefined): PersistedMatchState {
  const next = { ...state };
  if (bomb) next.bomb = { ...bomb, location: bomb.location ? { ...bomb.location } : undefined };
  else delete next.bomb;
  return next;
}

function inBox(point: Vector3, box: Box): boolean {
  return point.x >= box.min.x && point.x <= box.max.x &&
    point.y >= box.min.y && point.y <= box.max.y &&
    point.z >= box.min.z && point.z <= box.max.z;
}

function distanceSquared(a: Vector3, b: Vector3): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
}

function distanceToBombBounds(location:Vector3,bombLocation:Vector3):number {
  const halfWidth=0.75/2,height=0.4;
  const dx=Math.max(Math.abs(location.x-bombLocation.x)-halfWidth,0);
  const dy=location.y<bombLocation.y?bombLocation.y-location.y:Math.max(location.y-(bombLocation.y+height),0);
  const dz=Math.max(Math.abs(location.z-bombLocation.z)-halfWidth,0);
  return Math.hypot(dx,dy,dz);
}

function canHoldToDefuse(itemId:string):boolean {
  return itemId==="fps:knife"||itemId.startsWith("fps:gun_");
}

function startedInteractionEffect(playerId:string,interaction:BombInteractionKind,durationTicks:number,startedWithKit:boolean):BombObjectiveEffect {
  return {kind:"INTERACTION_STARTED",playerId,interaction,durationTicks,startedWithKit};
}

function cancelledInteractionEffect(playerId:string,interaction:BombInteractionKind):BombObjectiveEffect {
  return {kind:"INTERACTION_CANCELLED",playerId,interaction};
}

/**
 * Deep module for the bomb objective. Game supplies observations and consumes
 * effects; all state-machine rules and transient interaction bookkeeping stay
 * here, including the post-round T-elimination planting exception.
 */
export class BombObjective {
  private readonly interactions = new Map<string, ActiveInteraction>();
  private bombDropperId: string | undefined;
  private bombPickupBlockedUntilTick = 0;

  public constructor(
    private readonly adapter: BombObjectiveAdapter,
    private readonly config: BombObjectiveConfig,
  ) {}

  public hasInteraction(playerId: string): boolean {
    return this.interactions.has(playerId);
  }

  public interactionFor(playerId:string):BombInteractionProgress|undefined {
    const active=this.interactions.get(playerId);
    return active?{kind:active.kind,ticks:active.ticks,durationTicks:active.durationTicks,startedWithKit:active.startedWithKit}:undefined;
  }

  public startUse(state: PersistedMatchState, input: StartBombInteractionInput): BombObjectiveTransition {
    if (!input.alive||this.interactions.size>0) return { state, effects: [] };
    if (input.itemId === BOMB_ITEM && input.role === "T") {
      const mode = plantMode(state), bomb = state.bomb;
      if (mode && bomb?.kind === "CARRIED" && bomb.carrierId === input.id) {
        const site = (Object.keys(input.map.sites) as SiteId[]).find(candidate => inBox(input.location, input.map.sites[candidate]));
        if (site) {
          this.interactions.set(input.id, { kind: "plant", origin: { ...input.location }, ticks: 0, durationTicks:this.config.plantTicks, startedWithKit:false, heldItemId:input.itemId });
          const next = copyStateWithBomb(state, {
            kind: "PLANTING", carrierId: input.id, actorId: input.id, site, progressTicks: 0, timerTicks: 0,
          });
          return { state: next, effects: [startedInteractionEffect(input.id,"plant",this.config.plantTicks,false)] };
        }
      }
    }
    if (canHoldToDefuse(input.itemId) && input.role === "CT" && input.aimedBomb) {
      const bomb = state.bomb;
      if (state.phase === "BOMB_PLANTED" && bomb?.kind === "PLANTED" && bomb.location && distanceToBombBounds(input.location,bomb.location) <= 0.5) {
        const startedWithKit=state.players.find(player=>player.id===input.id)?.hasDefuseKit===true;
        const durationTicks=startedWithKit?this.config.defuseTicks:this.config.defuseWithoutKitTicks;
        this.interactions.set(input.id, { kind: "defuse", origin: { ...input.location }, ticks: 0, durationTicks, startedWithKit, heldItemId:input.itemId });
        const next = copyStateWithBomb(state, { ...bomb, kind: "DEFUSING", actorId: input.id, progressTicks: 0 });
        return { state: next, effects: [startedInteractionEffect(input.id,"defuse",durationTicks,startedWithKit)] };
      }
    }
    return { state, effects: [] };
  }

  public tickInteraction(state: PersistedMatchState, input: TickBombInteractionInput): BombObjectiveTransition {
    let next = state;
    const effects: BombObjectiveEffect[] = [];
    for (const [id, active] of [...this.interactions]) {
      const player = input.players.get(id), bomb = next.bomb;
      if (!player || !player.alive || !bomb || (active.kind==="plant"&&distanceSquared(player.location,active.origin)>0.25)) {
        const cancelled = this.cancel(next, id);
        next = cancelled.state;
        effects.push(...cancelled.effects);
        continue;
      }
      const held = this.adapter.heldItem(id);
      if (active.kind === "plant") {
        const site = bomb.site;
        if (held !== BOMB_ITEM || !site || !inBox(player.location, input.map.sites[site]) || !plantMode(next)) {
          const cancelled = this.cancel(next, id);
          next = cancelled.state;
          effects.push(...cancelled.effects);
          continue;
        }
        active.ticks++;
        next = copyStateWithBomb(next, { ...bomb, progressTicks: active.ticks });
        if (active.ticks < active.durationTicks) continue;
        const planted = completePlantTransition(next, player.location, this.config);
        if (!planted) {
          const cancelled = this.cancel(next, id);
          next = cancelled.state;
          effects.push(...cancelled.effects);
          continue;
        }
        this.adapter.removeBomb(id);
        this.adapter.spawnPlantedBomb(id, player.location, planted.state.bomb!.site!);
        this.interactions.delete(id);
        next = planted.state;
        effects.push({ kind: "PLANTED", playerId: id, site: planted.state.bomb!.site!, location: { ...player.location }, mode: planted.mode });
        continue;
      }
      if (held !== active.heldItemId || bomb.kind !== "DEFUSING" || !bomb.location || !player.aimedBomb || distanceToBombBounds(player.location,bomb.location)>0.5 || next.phase !== "BOMB_PLANTED") {
        const cancelled = this.cancel(next, id);
        next = cancelled.state;
        effects.push(...cancelled.effects);
        continue;
      }
      active.ticks++;
      next = copyStateWithBomb(next, { ...bomb, progressTicks: active.ticks });
      if (active.ticks < active.durationTicks) continue;
      this.interactions.delete(id);
      next = copyStateWithBomb(next, { ...next.bomb!, kind: "PLANTED", actorId: undefined, progressTicks: 0 });
      effects.push({ kind: "DEFUSED", playerId: id, startedWithKit:active.startedWithKit });
    }
    return { state: next, effects };
  }

  public cancel(state: PersistedMatchState, playerId: string): BombObjectiveTransition {
    const active = this.interactions.get(playerId);
    this.interactions.delete(playerId);
    if (!active) return { state, effects: [] };
    if (state.bomb?.actorId !== playerId) {
      return { state, effects: [cancelledInteractionEffect(playerId,active.kind)] };
    }
    const next = copyStateWithBomb(state, recoverInterruptedBomb(state.bomb));
    return { state: next, effects: [cancelledInteractionEffect(playerId,active.kind)] };
  }

  public clearInteractions(state: PersistedMatchState, options: { preservePlant?: boolean } = {}): BombObjectiveTransition {
    let next = state;
    const effects: BombObjectiveEffect[] = [];
    for (const [id, active] of [...this.interactions]) {
      const currentPlant = active.kind === "plant" && next.bomb?.kind === "PLANTING" && next.bomb.actorId === id;
      if (options.preservePlant && currentPlant && plantMode(next) === "POST_ROUND") continue;
      const cancelled = this.cancel(next, id);
      next = cancelled.state;
      effects.push(...cancelled.effects);
    }
    return { state: next, effects };
  }

  public recover(state: PersistedMatchState): PersistedMatchState {
    this.interactions.clear();
    this.bombDropperId = undefined;
    this.bombPickupBlockedUntilTick = 0;
    return copyStateWithBomb(state, recoverInterruptedBomb(state.bomb));
  }

  public drop(state: PersistedMatchState, input: DropBombInput): BombObjectiveTransition {
    const cancelled = this.cancel(state, input.playerId);
    const prepared = cancelled.state;
    if (prepared.bomb?.carrierId !== input.playerId) return cancelled;
    const candidate = input.candidateLocation ?? input.map.bombRecovery;
    const location = inBox(candidate, input.map.boundary) ? candidate : input.map.bombRecovery;
    const bounceTarget = input.direction ? droppedBombBounceTarget(location, input.direction, this.config.droppedBombBounceDistance) : undefined;
    this.adapter.removeBomb(input.playerId);
    this.adapter.removeVanillaBombItems();
    this.adapter.removeAllDroppedBombs();
    const dropped = this.adapter.spawnDroppedBomb(location, bounceTarget);
    if (!dropped) {
      this.adapter.giveBomb(input.playerId);
      return cancelled;
    }
    this.bombDropperId = input.playerId;
    this.bombPickupBlockedUntilTick = input.currentTick + this.config.repickupBlockTicks;
    const next = copyStateWithBomb(prepared, {
      kind: "DROPPED", location: { ...dropped.location }, droppedEntityId: dropped.id, progressTicks: 0, timerTicks: 0,
    });
    return {
      state: next,
      effects: [...cancelled.effects, { kind: "DROPPED", playerId: input.playerId, location: { ...dropped.location } }],
    };
  }

  public tickPickup(state: PersistedMatchState, input: PickupBombInput): BombObjectiveTransition {
    const bomb = state.bomb;
    if (bomb?.kind !== "DROPPED" || !bomb.location) return { state, effects: [] };
    const dropped = this.adapter.ensureDroppedBomb(bomb);
    if (!dropped) return { state, effects: [] };
    let next = copyStateWithBomb(state, { ...bomb, location: { ...dropped.location }, droppedEntityId: dropped.id });
    const player = input.players.find(candidate =>
      candidate.dimensionId === dropped.dimensionId && candidate.alive && candidate.role === "T" &&
      canPickUpDroppedBomb(candidate.id, this.bombDropperId, this.bombPickupBlockedUntilTick, input.currentTick) &&
      distanceSquared(candidate.location, dropped.location) <= 4,
    );
    if (!player || !this.adapter.giveBomb(player.id)) return { state: next, effects: [] };
    this.adapter.despawnDroppedBomb(dropped);
    next = copyStateWithBomb(next, { kind: "CARRIED", carrierId: player.id, location: undefined, droppedEntityId: undefined, progressTicks: 0, timerTicks: 0 });
    this.bombDropperId = undefined;
    this.bombPickupBlockedUntilTick = 0;
    return { state: next, effects: [{ kind: "PICKED_UP", playerId: player.id }] };
  }

  public synchronizeWorld(state: PersistedMatchState): PersistedMatchState {
    this.adapter.removeVanillaBombItems();
    if (state.bomb?.kind !== "DROPPED" || !state.bomb.location) {
      this.adapter.removeAllDroppedBombs();
      return state;
    }
    const dropped = this.adapter.ensureDroppedBomb(state.bomb);
    return dropped ? copyStateWithBomb(state, { ...state.bomb, location: { ...dropped.location }, droppedEntityId: dropped.id }) : state;
  }

  public sanitize(state: PersistedMatchState): PersistedMatchState {
    this.adapter.reconcileBombItems((playerId, alreadyKept) => canKeepBombItem(state.bomb, playerId, alreadyKept));
    return this.synchronizeWorld(state);
  }

  public resetRound(): void {
    this.interactions.clear();
    this.bombDropperId = undefined;
    this.bombPickupBlockedUntilTick = 0;
  }
}
