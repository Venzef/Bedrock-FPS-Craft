export { bombWasPlanted, canKeepBombItem, canPickUpDroppedBomb, completePlantTransition, droppedBombBounceTarget, plantMode, recoverInterruptedBomb, } from "./bomb-objective.js";
export function opposite(team) { return team === "T" ? "CT" : "T"; }
export function roundAchievements(input) {
    if (input.reason === "forfeit" || input.reason === "admin" || input.reason === "score")
        return { flawless: false };
    let acePlayerId;
    const fullFiveVersusFive = input.participants.T === 5 && input.participants.CT === 5;
    if (fullFiveVersusFive) {
        for (const [playerId, victims] of input.killsByPlayer) {
            if (input.roles.get(playerId) === input.winner && victims.size === 5) {
                acePlayerId = playerId;
                break;
            }
        }
    }
    const flawless = input.participants[input.winner] > 0 && input.deaths[input.winner] === 0 && input.survivors[input.winner].size === input.participants[input.winner];
    const clutchPlayerId = input.clutchCandidates[input.winner];
    return { acePlayerId, clutchPlayerId, flawless };
}
export function activeFromRoundAfterSpawn(activeFromRound, currentRound, initialSpawn, joined) {
    return initialSpawn && joined ? Math.max(activeFromRound, currentRound + 1) : activeFromRound;
}
export function movementPermissionsFor(lock) {
    return {
        lateralEnabled: !(lock.buyPhaseLocked || lock.interactionLocked),
        jumpEnabled: !(lock.buyPhaseLocked || lock.interactionLocked),
        sneakEnabled: true,
    };
}
export function shouldApplyDelayedSpectator(context) {
    const roundPhase = context.phase === "FREEZE" || context.phase === "LIVE" || context.phase === "BOMB_PLANTED" || context.phase === "ROUND_END";
    return context.deathRound === context.currentRound && !context.alive && roundPhase;
}
export function eliminationWinner(phase, tAlive, ctAlive) {
    if (!ctAlive)
        return "T";
    if (!tAlive && phase !== "BOMB_PLANTED")
        return "CT";
    return undefined;
}
export function roleForSquad(squad, round, roundsPerHalf) {
    return round <= roundsPerHalf ? squad : opposite(squad);
}
export function resetMoneyForSideSwitch(state, config) {
    for (const player of state.players)
        if (player.joined)
            player.money = config.startingMoney;
}
export function canJoinTeam(tCount, ctCount, requested, max, maxDiff) {
    const nextT = tCount + (requested === "T" ? 1 : 0);
    const nextCt = ctCount + (requested === "CT" ? 1 : 0);
    return (requested === "T" ? nextT : nextCt) <= max && Math.abs(nextT - nextCt) <= maxDiff;
}
export function lossReward(streak, config) {
    return Math.min(config.lossRewardMax, config.lossRewardBase + Math.max(0, streak - 1) * config.lossRewardStep);
}
export function awardRound(state, winner, config, bombWasPlanted) {
    const winningSquad = roleForSquad("T", state.round, config.roundsPerHalf) === winner ? "T" : "CT";
    if (winningSquad === "T")
        state.tScore++;
    else
        state.ctScore++;
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
export function awardKill(state, playerId, reward, config) {
    const player = state.players.find(candidate => candidate.id === playerId);
    if (player)
        player.money = Math.min(config.maxMoney, player.money + reward);
}
export function scoreForRole(state, role, config) {
    const tSquadRole = roleForSquad("T", state.round, config.roundsPerHalf);
    return role === tSquadRole ? state.tScore : state.ctScore;
}
export function matchResult(state, config) {
    if (state.tScore >= config.roundsToWin)
        return "T";
    if (state.ctScore >= config.roundsToWin)
        return "CT";
    if (state.round >= config.maxRounds)
        return state.tScore > state.ctScore ? "T" : "CT";
    return undefined;
}
export function formatTicks(ticks) {
    const seconds = Math.max(0, Math.ceil(ticks / 20));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
