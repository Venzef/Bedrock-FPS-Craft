import { MATCH_CONFIG } from "./config.js";
import { bombWasPlanted } from "./bomb-objective.js";
import { awardKill, awardRound, eliminationWinner, matchResult, resetMoneyForSideSwitch, roleForSquad, roundAchievements } from "./rules.js";
const ROUND_PHASES = ["FREEZE", "LIVE", "BOMB_PLANTED", "ROUND_END"];
export class RoundLifecycle {
    config;
    random;
    roundParticipants = { T: 0, CT: 0 };
    roundDeaths = { T: 0, CT: 0 };
    roundKills = new Map();
    roundAlivePlayers = { T: new Set(), CT: new Set() };
    roundClutchCandidates = { T: undefined, CT: undefined };
    roundRoles = new Map();
    constructor(config = MATCH_CONFIG, random = Math.random) {
        this.config = config;
        this.random = random;
    }
    hasConnectedTeams(state) {
        return this.hasTeam(state, "T") && this.hasTeam(state, "CT");
    }
    beginMapVote(state) {
        if (state.phase !== "LOBBY")
            return { kind: "IGNORED" };
        if (!this.hasConnectedTeams(state))
            return { kind: "MISSING_TEAM" };
        state.phase = "MAP_VOTE";
        return { kind: "STARTED" };
    }
    completeMapVote(state, votes, mapIds) {
        if (state.phase !== "MAP_VOTE")
            return { kind: "STALE" };
        if (!this.hasConnectedTeams(state)) {
            state.phase = "LOBBY";
            return { kind: "RETURNED_TO_LOBBY" };
        }
        const counts = mapIds.map(id => ({ id, count: [...votes.values()].filter(vote => vote === id).length }));
        const maximum = Math.max(...counts.map(entry => entry.count));
        const tied = counts.filter(entry => entry.count === maximum);
        const mapId = tied[Math.floor(this.random() * tied.length)].id;
        state.mapId = mapId;
        state.round = 1;
        state.tScore = 0;
        state.ctScore = 0;
        state.lossStreak = { T: 0, CT: 0 };
        state.lastRoundReason = undefined;
        state.lastRoundWinner = undefined;
        return { kind: "MAP_SELECTED", mapId };
    }
    startRound(state) {
        if (!state.mapId)
            return [];
        this.prepareRoundLedger(state);
        state.phase = "FREEZE";
        state.timerTicks = this.config.freezeTicks;
        state.bomb = undefined;
        if (state.round === this.config.roundsPerHalf + 1) {
            resetMoneyForSideSwitch(state, this.config);
            for (const player of state.players)
                if (player.joined) {
                    player.loadout = undefined;
                    player.hasDefuseKit = false;
                }
        }
        const active = state.players.filter(player => player.connected && player.joined && player.activeFromRound <= state.round);
        const spawnIndexes = { T: 0, CT: 0 };
        const players = [];
        for (const player of active) {
            const role = this.currentRoleForSquad(player.squad, state.round);
            players.push({ id: player.id, role, spawnIndex: spawnIndexes[role]++ });
        }
        const terrorists = players.filter(player => player.role === "T");
        const carrier = terrorists[Math.floor(this.random() * terrorists.length)];
        return [
            { kind: "CLEAR_INTERACTIONS" },
            { kind: "CLEANUP_ROUND_OBJECTIVES" },
            { kind: "ROUND_STARTED", players, bombCarrierId: carrier?.id },
        ];
    }
    goLive(state) {
        if (state.phase !== "FREEZE")
            return [];
        state.phase = "LIVE";
        state.timerTicks = this.config.roundTicks;
        return [{ kind: "LIVE" }];
    }
    checkElimination(state) {
        if (state.phase !== "LIVE" && state.phase !== "BOMB_PLANTED")
            return [];
        const alive = (role) => state.players.some(player => player.connected && player.alive && this.currentRoleForSquad(player.squad, state.round) === role);
        const winner = eliminationWinner(state.phase, alive("T"), alive("CT"));
        return winner ? this.endRound(state, winner, "elimination") : [];
    }
    checkForfeit(state) {
        const connected = (role) => state.players.some(player => player.connected && player.joined && this.currentRoleForSquad(player.squad, state.round) === role);
        if (!connected("T"))
            return this.endMatch(state, "CT", "forfeit");
        if (!connected("CT"))
            return this.endMatch(state, "T", "forfeit");
        return [];
    }
    recordLeave(state, playerId) {
        if (!ROUND_PHASES.includes(state.phase))
            return;
        const role = this.roundRoles.get(playerId);
        if (role)
            this.roundAlivePlayers[role].delete(playerId);
    }
    recordDeath(state, input) {
        if (!ROUND_PHASES.includes(state.phase))
            return;
        const victimState = state.players.find(player => player.id === input.victimId);
        if (victimState)
            victimState.hasDefuseKit = false;
        const victimRole = this.roundRoles.get(input.victimId) ?? this.currentRoleForPlayer(state, input.victimId);
        const victimAlive = victimRole ? this.roundAlivePlayers[victimRole] : undefined;
        const victimWasParticipant = Boolean(victimAlive?.has(input.victimId));
        if (victimRole && victimAlive?.has(input.victimId) && state.phase !== "ROUND_END") {
            const before = victimAlive.size;
            victimAlive.delete(input.victimId);
            this.roundDeaths[victimRole]++;
            const enemyRole = victimRole === "T" ? "CT" : "T";
            if (before >= 2 && victimAlive.size === 1 && this.roundAlivePlayers[enemyRole].size >= 2) {
                this.roundClutchCandidates[victimRole] = [...victimAlive][0];
            }
        }
        const killerRole = input.killerId ? this.roundRoles.get(input.killerId) ?? this.currentRoleForPlayer(state, input.killerId) : undefined;
        if (input.killerId && victimWasParticipant && victimRole && killerRole && killerRole !== victimRole) {
            const victims = this.roundKills.get(input.killerId) ?? new Set();
            victims.add(input.victimId);
            this.roundKills.set(input.killerId, victims);
            awardKill(state, input.killerId, input.killReward, this.config);
        }
    }
    endRound(state, winner, reason) {
        if (state.phase === "ROUND_END" || state.phase === "MATCH_END" || state.phase === "LOBBY")
            return [];
        const planted = bombWasPlanted(state.bomb);
        const roles = this.captureCurrentRoles(state);
        awardRound(state, winner, this.config, planted);
        state.phase = "ROUND_END";
        state.timerTicks = this.config.roundEndTicks;
        state.lastRoundWinner = winner;
        state.lastRoundReason = reason;
        const preservePlant = winner === "T" && reason === "elimination";
        const achievements = roundAchievements({
            winner,
            reason,
            participants: this.roundParticipants,
            deaths: this.roundDeaths,
            roles,
            killsByPlayer: this.roundKills,
            clutchCandidates: this.roundClutchCandidates,
            survivors: this.roundAlivePlayers,
        });
        this.roundRoles = roles;
        return [
            { kind: "CLEAR_INTERACTIONS", preservePlant },
            { kind: "REMOVE_GROUND_ITEMS" },
            { kind: "ROUND_ENDED", winner, reason, planted, preservePlant, roles, achievements },
        ];
    }
    nextRound(state) {
        const effects = [{ kind: "CLEAR_INTERACTIONS" }];
        const result = matchResult(state, this.config);
        if (result) {
            state.phase = "MATCH_END";
            effects.push({ kind: "MATCH_ENDED", winner: result, reason: "score", roles: this.captureCurrentRoles(state) });
            return effects;
        }
        state.round++;
        const startEffects = this.startRound(state);
        effects.push(...startEffects.filter(effect => effect.kind !== "CLEAR_INTERACTIONS"));
        return effects;
    }
    endMatch(state, winner, reason) {
        const roles = this.captureCurrentRoles(state);
        state.phase = "MATCH_END";
        return [{ kind: "MATCH_ENDED", winner, reason, roles }];
    }
    currentRole(state, playerId) {
        return this.currentRoleForPlayer(state, playerId);
    }
    prepareRoundLedger(state) {
        this.roundParticipants = { T: 0, CT: 0 };
        this.roundDeaths = { T: 0, CT: 0 };
        this.roundKills.clear();
        this.roundAlivePlayers = { T: new Set(), CT: new Set() };
        this.roundClutchCandidates = { T: undefined, CT: undefined };
        this.roundRoles = this.captureCurrentRoles(state);
        for (const player of state.players) {
            if (!player.connected || !player.joined || player.activeFromRound > state.round)
                continue;
            const role = this.roundRoles.get(player.id);
            if (!role)
                continue;
            this.roundParticipants[role]++;
            this.roundAlivePlayers[role].add(player.id);
        }
        state.lastRoundReason = undefined;
        state.lastRoundWinner = undefined;
    }
    captureCurrentRoles(state) {
        const roles = new Map();
        for (const player of state.players)
            if (player.joined)
                roles.set(player.id, this.currentRoleForSquad(player.squad, state.round));
        return roles;
    }
    currentRoleForPlayer(state, playerId) {
        const player = state.players.find(candidate => candidate.id === playerId);
        return player ? this.currentRoleForSquad(player.squad, state.round) : undefined;
    }
    currentRoleForSquad(squad, round) {
        return roleForSquad(squad, round, this.config.roundsPerHalf);
    }
    hasTeam(state, role) {
        return state.players.some(player => player.connected && player.joined && this.currentRoleForSquad(player.squad, state.round) === role);
    }
}
