export const BANNER_PREFIX = "FPSCRAFT:BANNER:";
export const BANNER_EVENTS = [
    "WIN",
    "DEFEAT",
    "MATCH_START",
    "SIDE_SWITCH_WARNING",
    "FINAL_ROUND",
    "ROUND_START",
    "BUY_PHASE",
    "SIDE_SWITCH",
    "ACE",
    "FLAWLESS",
    "CLUTCH",
];
/** Resolve the result from the player's role in the round that just ended. */
export function resultBannerForRole(role, winner) {
    return role === winner ? "WIN" : "DEFEAT";
}
export function bannerMessage(event) {
    return `${BANNER_PREFIX}${event}`;
}
