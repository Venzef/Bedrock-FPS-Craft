export type CombatAction="fire"|"melee"|"reload";

export function isCombatActionAllowed(action:CombatAction,hasBombInteraction:boolean):boolean {
  return !hasBombInteraction||action==="reload";
}
