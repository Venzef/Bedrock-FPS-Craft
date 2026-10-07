import { MATCH_CONFIG } from "./config.js";
import { bombWasPlanted } from "./bomb-objective.js";
import { awardKill, awardRound, eliminationWinner, matchResult, resetMoneyForSideSwitch, roleForSquad, roundAchievements } from "./rules.js";
import type { MatchConfig, MatchPhase, PersistedMatchState, RoundEndReason, Team } from "./types.js";
import type { RoundAchievementResult } from "./rules.js";

export type LifecycleEffect =
  | { kind: "CLEAR_INTERACTIONS"; preservePlant?: boolean }
  | { kind: "CLEANUP_ROUND_OBJECTIVES" }
  | { kind: "REMOVE_GROUND_ITEMS" }
  | { kind: "ROUND_STARTED"; players: readonly RoundPlayerStart[]; bombCarrierId?: string }
  | { kind: "LIVE" }
  | { kind: "ROUND_ENDED"; winner: Team; reason: RoundEndReason; planted: boolean; preservePlant: boolean; roles: ReadonlyMap<string, Team>; achievements: RoundAchievementResult }
  | { kind: "MATCH_ENDED"; winner: Team | "DRAW"; reason: RoundEndReason; roles: ReadonlyMap<string, Team> };

export interface RoundPlayerStart {
  id: string;
  role: Team;
  spawnIndex: number;
}

export type MapVoteBegin =
  | { kind: "STARTED" }
  | { kind: "IGNORED" }
  | { kind: "MISSING_TEAM" };

export type MapVoteCompletion =
  | { kind: "STALE" }
  | { kind: "RETURNED_TO_LOBBY" }
  | { kind: "MAP_SELECTED"; mapId: string };

export interface RoundDeathInput {
  victimId: string;
  killerId?: string;
  killReward: number;
}

const ROUND_PHASES: readonly MatchPhase[] = ["FREEZE", "LIVE", "BOMB_PLANTED", "ROUND_END"];

export class RoundLifecycle {
  private roundParticipants: Record<Team, number> = { T: 0, CT: 0 };
  private roundDeaths: Record<Team, number> = { T: 0, CT: 0 };
  private roundKills = new Map<string, Set<string>>();
  private roundAlivePlayers: Record<Team, Set<string>> = { T: new Set(), CT: new Set() };
  private roundClutchCandidates: Record<Team, string | undefined> = { T: undefined, CT: undefined };
  private roundRoles = new Map<string, Team>();

  public constructor(
    private readonly config: MatchConfig = MATCH_CONFIG,
    private readonly random: () => number = Math.random,
  ) {}

  public hasConnectedTeams(state: PersistedMatchState): boolean {
    return this.hasTeam(state, "T") && this.hasTeam(state, "CT");
  }

  public beginMapVote(state: PersistedMatchState): MapVoteBegin {
    if (state.phase !== "LOBBY") return { kind: "IGNORED" };
    if (!this.hasConnectedTeams(state)) return { kind: "MISSING_TEAM" };
    state.phase = "MAP_VOTE";
    return { kind: "STARTED" };
  }

  public completeMapVote(state: PersistedMatchState, votes: ReadonlyMap<string, string>, mapIds: readonly string[]): MapVoteCompletion {
    if (state.phase !== "MAP_VOTE") return { kind: "STALE" };
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

  public startRound(state: PersistedMatchState): LifecycleEffect[] {
    if (!state.mapId) return [];
    this.prepareRoundLedger(state);
    state.phase = "FREEZE";
    state.timerTicks = this.config.freezeTicks;
    state.bomb = undefined;
    if (state.round === this.config.roundsPerHalf + 1) {
      resetMoneyForSideSwitch(state, this.config);
      for (const player of state.players) if (player.joined) {
        player.loadout = undefined;
        player.hasDefuseKit = false;
      }
    }

    const active = state.players.filter(player => player.connected && player.joined && player.activeFromRound <= state.round);
    const spawnIndexes: Record<Team, number> = { T: 0, CT: 0 };
    const players: RoundPlayerStart[] = [];
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

  public goLive(state: PersistedMatchState): LifecycleEffect[] {
    if (state.phase !== "FREEZE") return [];
    state.phase = "LIVE";
    state.timerTicks = this.config.roundTicks;
    return [{ kind: "LIVE" }];
  }

  public checkElimination(state: PersistedMatchState): LifecycleEffect[] {
    if (state.phase !== "LIVE" && state.phase !== "BOMB_PLANTED") return [];
    const alive = (role: Team): boolean => state.players.some(player =>
      player.connected && player.alive && this.currentRoleForSquad(player.squad, state.round) === role,
    );
    const winner = eliminationWinner(state.phase, alive("T"), alive("CT"));
    return winner ? this.endRound(state, winner, "elimination") : [];
  }

  public checkForfeit(state: PersistedMatchState): LifecycleEffect[] {
    const connected = (role: Team): boolean => state.players.some(player =>
      player.connected && player.joined && this.currentRoleForSquad(player.squad, state.round) === role,
    );
    if (!connected("T")) return this.endMatch(state, "CT", "forfeit");
    if (!connected("CT")) return this.endMatch(state, "T", "forfeit");
    return [];
  }

  public recordLeave(state: PersistedMatchState, playerId: string): void {
    if (!ROUND_PHASES.includes(state.phase)) return;
    const role = this.roundRoles.get(playerId);
    if (role) this.roundAlivePlayers[role].delete(playerId);
  }

  public recordDeath(state: PersistedMatchState, input: RoundDeathInput): void {
    if (!ROUND_PHASES.includes(state.phase)) return;
    const victimState=state.players.find(player=>player.id===input.victimId);
    if(victimState)victimState.hasDefuseKit=false;
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
      const victims = this.roundKills.get(input.killerId) ?? new Set<string>();
      victims.add(input.victimId);
      this.roundKills.set(input.killerId, victims);
      awardKill(state, input.killerId, input.killReward, this.config);
    }
  }

  public endRound(state: PersistedMatchState, winner: Team, reason: RoundEndReason): LifecycleEffect[] {
    if (state.phase === "ROUND_END" || state.phase === "MATCH_END" || state.phase === "LOBBY") return [];
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

  public nextRound(state: PersistedMatchState): LifecycleEffect[] {
    const effects: LifecycleEffect[] = [{ kind: "CLEAR_INTERACTIONS" }];
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

  public endMatch(state: PersistedMatchState, winner: Team | "DRAW", reason: RoundEndReason): LifecycleEffect[] {
    const roles = this.captureCurrentRoles(state);
    state.phase = "MATCH_END";
    return [{ kind: "MATCH_ENDED", winner, reason, roles }];
  }

  public currentRole(state: PersistedMatchState, playerId: string): Team | undefined {
    return this.currentRoleForPlayer(state, playerId);
  }

  private prepareRoundLedger(state: PersistedMatchState): void {
    this.roundParticipants = { T: 0, CT: 0 };
    this.roundDeaths = { T: 0, CT: 0 };
    this.roundKills.clear();
    this.roundAlivePlayers = { T: new Set(), CT: new Set() };
    this.roundClutchCandidates = { T: undefined, CT: undefined };
    this.roundRoles = this.captureCurrentRoles(state);
    for (const player of state.players) {
      if (!player.connected || !player.joined || player.activeFromRound > state.round) continue;
      const role = this.roundRoles.get(player.id);
      if (!role) continue;
      this.roundParticipants[role]++;
      this.roundAlivePlayers[role].add(player.id);
    }
    state.lastRoundReason = undefined;
    state.lastRoundWinner = undefined;
  }

  private captureCurrentRoles(state: PersistedMatchState): Map<string, Team> {
    const roles = new Map<string, Team>();
    for (const player of state.players) if (player.joined) roles.set(player.id, this.currentRoleForSquad(player.squad, state.round));
    return roles;
  }

  private currentRoleForPlayer(state: PersistedMatchState, playerId: string): Team | undefined {
    const player = state.players.find(candidate => candidate.id === playerId);
    return player ? this.currentRoleForSquad(player.squad, state.round) : undefined;
  }

  private currentRoleForSquad(squad: Team, round: number): Team {
    return roleForSquad(squad, round, this.config.roundsPerHalf);
  }

  private hasTeam(state: PersistedMatchState, role: Team): boolean {
    return state.players.some(player => player.connected && player.joined && this.currentRoleForSquad(player.squad, state.round) === role);
  }
}
