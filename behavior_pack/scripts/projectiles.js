export const PROJECTILE_MAX_DISTANCE = 73;
export const PROJECTILE_MAX_AGE_TICKS = 4 * 20;
export const HEADSHOT_MULTIPLIER = 2;
export const LEGSHOT_MULTIPLIER = 0.75;
export function classifyHitBand(hitY, feetY, height = 1.8) {
    const relative = (hitY - feetY) / Math.max(0.1, height);
    if (relative >= 0.67)
        return "HEAD";
    if (relative < 0.34)
        return "LEGS";
    return "BODY";
}
export function damageForHit(baseDamage, band) {
    const multiplier = band === "HEAD" ? HEADSHOT_MULTIPLIER : band === "LEGS" ? LEGSHOT_MULTIPLIER : 1;
    return Math.max(0, baseDamage * multiplier);
}
export function canDamageTarget(shooterTeam, targetTeam) {
    return shooterTeam !== targetTeam;
}
export function isPenetrableBlock(typeId) {
    const name = typeId.includes(":") ? typeId.slice(typeId.indexOf(":") + 1) : typeId;
    return name === "glass" || name === "glass_pane" || name === "wool" || name.endsWith("_glass") || name.endsWith("_glass_pane") || name.endsWith("_wool");
}
export function damageAfterPenetration(damage, penetrationCount) {
    return Math.max(0, damage) * Math.pow(0.5, Math.min(1, Math.max(0, Math.floor(penetrationCount))));
}
export function projectileShouldDespawn(ageTicks, distanceTravelled) {
    return ageTicks >= PROJECTILE_MAX_AGE_TICKS || distanceTravelled >= PROJECTILE_MAX_DISTANCE;
}
