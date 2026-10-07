import type { MatchConfig, MatchPhase, PersistedMatchState, RoundEndReason, Team } from "./types.js";
export {
  bombWasPlanted,
  canKeepBombItem,
  canPickUpDroppedBomb,
  completePlantTransition,
  droppedBombBounceTarget,
  plantMode,
  recoverInterruptedBomb,
} from "./bomb-objective.js";
export type { PlantMode } from "./bomb-objective.js";

export interface RoundAchievementInput {
  winner:Team;
  reason:RoundEndReason;
  participants:Record<Team,number>;
  deaths:Record<Team,number>;
  roles:ReadonlyMap<string,Team>;
  killsByPlayer:ReadonlyMap<string,ReadonlySet<string>>;
  clutchCandidates:Record<Team,string|undefined>;
  survivors:Record<Team,ReadonlySet<string>>;
}

export interface RoundAchievementResult {
  acePlayerId?:string;
  clutchPlayerId?:string;
  flawless:boolean;
}

export function opposite(team: Team): Team { return team === "T" ? "CT" : "T"; }

export function roundAchievements(input:RoundAchievementInput):RoundAchievementResult {
  if(input.reason==="forfeit"||input.reason==="admin"||input.reason==="score")return {flawless:false};
  let acePlayerId:string|undefined;
  const fullFiveVersusFive=input.participants.T===5&&input.participants.CT===5;
  if(fullFiveVersusFive){
    for(const [playerId,victims] of input.killsByPlayer){
      if(input.roles.get(playerId)===input.winner&&victims.size===5){acePlayerId=playerId;break;}
    }
  }
  const flawless=input.participants[input.winner]>0&&input.deaths[input.winner]===0&&input.survivors[input.winner].size===input.participants[input.winner];
  const clutchPlayerId=input.clutchCandidates[input.winner];
  return {acePlayerId,clutchPlayerId,flawless};
}

export function activeFromRoundAfterSpawn(activeFromRound: number, currentRound: number, initialSpawn: boolean, joined: boolean): number {
  return initialSpawn && joined ? Math.max(activeFromRound,currentRound+1) : activeFromRound;
}

export function movementPermissionsFor(lock: {buyPhaseLocked:boolean;interactionLocked:boolean}) {
  return {
    lateralEnabled: !(lock.buyPhaseLocked || lock.interactionLocked),
    jumpEnabled: !(lock.buyPhaseLocked || lock.interactionLocked),
    sneakEnabled: true,
  };
}

export function shouldApplyDelayedSpectator(context: {
  deathRound:number;
  currentRound:number;
  alive:boolean;
  phase:MatchPhase;
}):boolean {
  const roundPhase=context.phase==="FREEZE"||context.phase==="LIVE"||context.phase==="BOMB_PLANTED"||context.phase==="ROUND_END";
  return context.deathRound===context.currentRound&&!context.alive&&roundPhase;
}

export function eliminationWinner(phase: MatchPhase, tAlive: boolean, ctAlive: boolean): Team | undefined {
  if (!ctAlive) return "T";
  if (!tAlive && phase !== "BOMB_PLANTED") return "CT";
  return undefined;
}

export function roleForSquad(squad: Team, round: number, roundsPerHalf: number): Team {
  return round <= roundsPerHalf ? squad : opposite(squad);
}

export function resetMoneyForSideSwitch(state: PersistedMatchState, config: MatchConfig): void {
  for (const player of state.players) if (player.joined) player.money=config.startingMoney;
}

export function canJoinTeam(tCount: number, ctCount: number, requested: Team, max: number, maxDiff: number): boolean {
  const nextT = tCount + (requested === "T" ? 1 : 0);
  const nextCt = ctCount + (requested === "CT" ? 1 : 0);
  return (requested === "T" ? nextT : nextCt) <= max && Math.abs(nextT - nextCt) <= maxDiff;
}

export function lossReward(streak: number, config: MatchConfig): number {
  return Math.min(config.lossRewardMax, config.lossRewardBase + Math.max(0, streak - 1) * config.lossRewardStep);
}

export function awardRound(state: PersistedMatchState, winner: Team, config: MatchConfig, bombWasPlanted: boolean): void {
  const winningSquad = roleForSquad("T",state.round,config.roundsPerHalf) === winner ? "T" : "CT";
  if (winningSquad === "T") state.tScore++; else state.ctScore++;
  const loser = opposite(winner);
  state.lossStreak[winner] = 0;
  state.lossStreak[loser]++;
  const loserReward = lossReward(state.lossStreak[loser], config);
  for (const player of state.players) {
    const role = roleForSquad(player.squad, state.round, config.roundsPerHalf);
    const reward = role === winner ? config.winReward : loserReward + (role === "T" && bombWasPlanted ? config.plantedLossBonus : 0);
    player.money = Math.min(config.maxMoney, player.money + reward);
  }
}

export function awardKill(state: PersistedMatchState, playerId: string, reward: number, config: MatchConfig): void {
  const player = state.players.find(candidate => candidate.id === playerId);
  if (player) player.money = Math.min(config.maxMoney, player.money + reward);
}

export function scoreForRole(state: PersistedMatchState, role: Team, config: MatchConfig): number {
  const tSquadRole=roleForSquad("T",state.round,config.roundsPerHalf);
  return role===tSquadRole?state.tScore:state.ctScore;
}

export function matchResult(state: PersistedMatchState, config: MatchConfig): Team | undefined {
  if (state.tScore >= config.roundsToWin) return "T";
  if (state.ctScore >= config.roundsToWin) return "CT";
  if (state.round >= config.maxRounds) return state.tScore > state.ctScore ? "T" : "CT";
  return undefined;
}

export function formatTicks(ticks: number): string {
  const seconds = Math.max(0, Math.ceil(ticks / 20));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
