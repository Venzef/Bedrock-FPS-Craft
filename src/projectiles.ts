import type { Team } from "./types.js";

export const PROJECTILE_MAX_DISTANCE = 73;
export const PROJECTILE_MAX_AGE_TICKS = 4 * 20;
export const HEADSHOT_MULTIPLIER = 2;
export const LEGSHOT_MULTIPLIER = 0.75;

export type HitBand = "HEAD" | "BODY" | "LEGS";

export function classifyHitBand(hitY: number, feetY: number, height = 1.8): HitBand {
  const relative = (hitY - feetY) / Math.max(0.1, height);
  if (relative >= 0.67) return "HEAD";
  if (relative < 0.34) return "LEGS";
  return "BODY";
}

export function damageForHit(baseDamage: number, band: HitBand): number {
  const multiplier = band === "HEAD" ? HEADSHOT_MULTIPLIER : band === "LEGS" ? LEGSHOT_MULTIPLIER : 1;
  return Math.max(0, baseDamage * multiplier);
}

export function canDamageTarget(shooterTeam: Team, targetTeam: Team): boolean {
  return shooterTeam !== targetTeam;
}

export function isPenetrableBlock(typeId: string): boolean {
  const name = typeId.includes(":") ? typeId.slice(typeId.indexOf(":") + 1) : typeId;
  return name === "glass" || name === "glass_pane" || name === "wool" || name.endsWith("_glass") || name.endsWith("_glass_pane") || name.endsWith("_wool");
}

export function damageAfterPenetration(damage: number, penetrationCount: number): number {
  return Math.max(0, damage) * Math.pow(0.5, Math.min(1, Math.max(0, Math.floor(penetrationCount))));
}

export function projectileShouldDespawn(ageTicks: number, distanceTravelled: number): boolean {
  return ageTicks >= PROJECTILE_MAX_AGE_TICKS || distanceTravelled >= PROJECTILE_MAX_DISTANCE;
}
