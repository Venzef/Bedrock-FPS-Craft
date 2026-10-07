export const BOMB_ITEM = "fps:bomb";
export function opposite(team) { return team === "T" ? "CT" : "T"; }
export function canKeepBombItem(bomb, playerId, alreadyKept) {
    return !alreadyKept && (bomb?.kind === "CARRIED" || bomb?.kind === "PLANTING") && bomb.carrierId === playerId;
}
export function canPickUpDroppedBomb(playerId, dropperId, blockedUntilTick, currentTick) {
    return playerId !== dropperId || currentTick >= blockedUntilTick;
}
export function droppedBombBounceTarget(origin, direction, distance = 2.5) {
    const horizontalLength = Math.hypot(direction.x, direction.z);
    if (horizontalLength === 0)
        return { ...origin };
    return {
        x: origin.x + (direction.x / horizontalLength) * distance,
        y: origin.y,
        z: origin.z + (direction.z / horizontalLength) * distance,
    };
}
export function bombWasPlanted(bomb) {
    return bomb?.kind === "PLANTED" || bomb?.kind === "DEFUSING";
}
export function plantMode(state) {
    if (state.phase === "LIVE")
        return "LIVE_OBJECTIVE";
    if (state.phase === "ROUND_END" && state.lastRoundWinner === "T" && state.lastRoundReason === "elimination")
        return "POST_ROUND";
    return undefined;
}
export function completePlantTransition(state, location, config) {
    const mode = plantMode(state), bomb = state.bomb;
    if (!mode || bomb?.kind !== "PLANTING" || !bomb.site)
        return undefined;
    const next = {
        ...state,
        bomb: {
            kind: "PLANTED",
            site: bomb.site,
            location: { ...location },
            progressTicks: 0,
            timerTicks: mode === "LIVE_OBJECTIVE" ? config.bombTicks : 0,
        },
    };
    if (mode === "LIVE_OBJECTIVE")
        next.phase = "BOMB_PLANTED";
    return { mode, state: next };
}
export function recoverInterruptedBomb(bomb) {
    if (bomb?.kind === "PLANTING")
        return { kind: "CARRIED", carrierId: bomb.carrierId, progressTicks: 0, timerTicks: 0 };
    if (bomb?.kind === "DEFUSING")
        return {
            kind: "PLANTED",
            site: bomb.site,
            location: bomb.location ? { ...bomb.location } : undefined,
            progressTicks: 0,
            timerTicks: bomb.timerTicks,
        };
    return bomb;
}
function copyStateWithBomb(state, bomb) {
    const next = { ...state };
    if (bomb)
        next.bomb = { ...bomb, location: bomb.location ? { ...bomb.location } : undefined };
    else
        delete next.bomb;
    return next;
}
function inBox(point, box) {
    return point.x >= box.min.x && point.x <= box.max.x &&
        point.y >= box.min.y && point.y <= box.max.y &&
        point.z >= box.min.z && point.z <= box.max.z;
}
function distanceSquared(a, b) {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
}
function distanceToBombBounds(location, bombLocation) {
    const halfWidth = 0.75 / 2, height = 0.4;
    const dx = Math.max(Math.abs(location.x - bombLocation.x) - halfWidth, 0);
    const dy = location.y < bombLocation.y ? bombLocation.y - location.y : Math.max(location.y - (bombLocation.y + height), 0);
    const dz = Math.max(Math.abs(location.z - bombLocation.z) - halfWidth, 0);
    return Math.hypot(dx, dy, dz);
}
function canHoldToDefuse(itemId) {
    return itemId === "fps:knife" || itemId.startsWith("fps:gun_");
}
function startedInteractionEffect(playerId, interaction, durationTicks, startedWithKit) {
    return { kind: "INTERACTION_STARTED", playerId, interaction, durationTicks, startedWithKit };
}
function cancelledInteractionEffect(playerId, interaction) {
    return { kind: "INTERACTION_CANCELLED", playerId, interaction };
}
/**
 * Deep module for the bomb objective. Game supplies observations and consumes
 * effects; all state-machine rules and transient interaction bookkeeping stay
 * here, including the post-round T-elimination planting exception.
 */
export class BombObjective {
    adapter;
    config;
    interactions = new Map();
    bombDropperId;
    bombPickupBlockedUntilTick = 0;
    constructor(adapter, config) {
        this.adapter = adapter;
        this.config = config;
    }
    hasInteraction(playerId) {
        return this.interactions.has(playerId);
    }
    interactionFor(playerId) {
        const active = this.interactions.get(playerId);
        return active ? { kind: active.kind, ticks: active.ticks, durationTicks: active.durationTicks, startedWithKit: active.startedWithKit } : undefined;
    }
    startUse(state, input) {
        if (!input.alive || this.interactions.size > 0)
            return { state, effects: [] };
        if (input.itemId === BOMB_ITEM && input.role === "T") {
            const mode = plantMode(state), bomb = state.bomb;
            if (mode && bomb?.kind === "CARRIED" && bomb.carrierId === input.id) {
                const site = Object.keys(input.map.sites).find(candidate => inBox(input.location, input.map.sites[candidate]));
                if (site) {
                    this.interactions.set(input.id, { kind: "plant", origin: { ...input.location }, ticks: 0, durationTicks: this.config.plantTicks, startedWithKit: false, heldItemId: input.itemId });
                    const next = copyStateWithBomb(state, {
                        kind: "PLANTING", carrierId: input.id, actorId: input.id, site, progressTicks: 0, timerTicks: 0,
                    });
                    return { state: next, effects: [startedInteractionEffect(input.id, "plant", this.config.plantTicks, false)] };
                }
            }
        }
        if (canHoldToDefuse(input.itemId) && input.role === "CT" && input.aimedBomb) {
            const bomb = state.bomb;
            if (state.phase === "BOMB_PLANTED" && bomb?.kind === "PLANTED" && bomb.location && distanceToBombBounds(input.location, bomb.location) <= 0.5) {
                const startedWithKit = state.players.find(player => player.id === input.id)?.hasDefuseKit === true;
                const durationTicks = startedWithKit ? this.config.defuseTicks : this.config.defuseWithoutKitTicks;
                this.interactions.set(input.id, { kind: "defuse", origin: { ...input.location }, ticks: 0, durationTicks, startedWithKit, heldItemId: input.itemId });
                const next = copyStateWithBomb(state, { ...bomb, kind: "DEFUSING", actorId: input.id, progressTicks: 0 });
                return { state: next, effects: [startedInteractionEffect(input.id, "defuse", durationTicks, startedWithKit)] };
            }
        }
        return { state, effects: [] };
    }
    tickInteraction(state, input) {
        let next = state;
        const effects = [];
        for (const [id, active] of [...this.interactions]) {
            const player = input.players.get(id), bomb = next.bomb;
            if (!player || !player.alive || !bomb || (active.kind === "plant" && distanceSquared(player.location, active.origin) > 0.25)) {
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
                if (active.ticks < active.durationTicks)
                    continue;
                const planted = completePlantTransition(next, player.location, this.config);
                if (!planted) {
                    const cancelled = this.cancel(next, id);
                    next = cancelled.state;
                    effects.push(...cancelled.effects);
                    continue;
                }
                this.adapter.removeBomb(id);
                this.adapter.spawnPlantedBomb(id, player.location, planted.state.bomb.site);
                this.interactions.delete(id);
                next = planted.state;
                effects.push({ kind: "PLANTED", playerId: id, site: planted.state.bomb.site, location: { ...player.location }, mode: planted.mode });
                continue;
            }
            if (held !== active.heldItemId || bomb.kind !== "DEFUSING" || !bomb.location || !player.aimedBomb || distanceToBombBounds(player.location, bomb.location) > 0.5 || next.phase !== "BOMB_PLANTED") {
                const cancelled = this.cancel(next, id);
                next = cancelled.state;
                effects.push(...cancelled.effects);
                continue;
            }
            active.ticks++;
            next = copyStateWithBomb(next, { ...bomb, progressTicks: active.ticks });
            if (active.ticks < active.durationTicks)
                continue;
            this.interactions.delete(id);
            next = copyStateWithBomb(next, { ...next.bomb, kind: "PLANTED", actorId: undefined, progressTicks: 0 });
            effects.push({ kind: "DEFUSED", playerId: id, startedWithKit: active.startedWithKit });
        }
        return { state: next, effects };
    }
    cancel(state, playerId) {
        const active = this.interactions.get(playerId);
        this.interactions.delete(playerId);
        if (!active)
            return { state, effects: [] };
        if (state.bomb?.actorId !== playerId) {
            return { state, effects: [cancelledInteractionEffect(playerId, active.kind)] };
        }
        const next = copyStateWithBomb(state, recoverInterruptedBomb(state.bomb));
        return { state: next, effects: [cancelledInteractionEffect(playerId, active.kind)] };
    }
    clearInteractions(state, options = {}) {
        let next = state;
        const effects = [];
        for (const [id, active] of [...this.interactions]) {
            const currentPlant = active.kind === "plant" && next.bomb?.kind === "PLANTING" && next.bomb.actorId === id;
            if (options.preservePlant && currentPlant && plantMode(next) === "POST_ROUND")
                continue;
            const cancelled = this.cancel(next, id);
            next = cancelled.state;
            effects.push(...cancelled.effects);
        }
        return { state: next, effects };
    }
    recover(state) {
        this.interactions.clear();
        this.bombDropperId = undefined;
        this.bombPickupBlockedUntilTick = 0;
        return copyStateWithBomb(state, recoverInterruptedBomb(state.bomb));
    }
    drop(state, input) {
        const cancelled = this.cancel(state, input.playerId);
        const prepared = cancelled.state;
        if (prepared.bomb?.carrierId !== input.playerId)
            return cancelled;
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
    tickPickup(state, input) {
        const bomb = state.bomb;
        if (bomb?.kind !== "DROPPED" || !bomb.location)
            return { state, effects: [] };
        const dropped = this.adapter.ensureDroppedBomb(bomb);
        if (!dropped)
            return { state, effects: [] };
        let next = copyStateWithBomb(state, { ...bomb, location: { ...dropped.location }, droppedEntityId: dropped.id });
        const player = input.players.find(candidate => candidate.dimensionId === dropped.dimensionId && candidate.alive && candidate.role === "T" &&
            canPickUpDroppedBomb(candidate.id, this.bombDropperId, this.bombPickupBlockedUntilTick, input.currentTick) &&
            distanceSquared(candidate.location, dropped.location) <= 4);
        if (!player || !this.adapter.giveBomb(player.id))
            return { state: next, effects: [] };
        this.adapter.despawnDroppedBomb(dropped);
        next = copyStateWithBomb(next, { kind: "CARRIED", carrierId: player.id, location: undefined, droppedEntityId: undefined, progressTicks: 0, timerTicks: 0 });
        this.bombDropperId = undefined;
        this.bombPickupBlockedUntilTick = 0;
        return { state: next, effects: [{ kind: "PICKED_UP", playerId: player.id }] };
    }
    synchronizeWorld(state) {
        this.adapter.removeVanillaBombItems();
        if (state.bomb?.kind !== "DROPPED" || !state.bomb.location) {
            this.adapter.removeAllDroppedBombs();
            return state;
        }
        const dropped = this.adapter.ensureDroppedBomb(state.bomb);
        return dropped ? copyStateWithBomb(state, { ...state.bomb, location: { ...dropped.location }, droppedEntityId: dropped.id }) : state;
    }
    sanitize(state) {
        this.adapter.reconcileBombItems((playerId, alreadyKept) => canKeepBombItem(state.bomb, playerId, alreadyKept));
        return this.synchronizeWorld(state);
    }
    resetRound() {
        this.interactions.clear();
        this.bombDropperId = undefined;
        this.bombPickupBlockedUntilTick = 0;
    }
}
