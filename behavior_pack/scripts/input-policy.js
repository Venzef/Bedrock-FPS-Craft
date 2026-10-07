export function isCombatActionAllowed(action, hasBombInteraction) {
    return !hasBombInteraction || action === "reload";
}
