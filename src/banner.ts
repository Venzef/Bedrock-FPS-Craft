import type { Team } from "./types.js";

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
] as const;

export type BannerEvent = typeof BANNER_EVENTS[number];

export type RoundResultBanner = "WIN" | "DEFEAT";

/** Resolve the result from the player's role in the round that just ended. */
export function resultBannerForRole(role: Team | undefined, winner: Team): RoundResultBanner {
  return role === winner ? "WIN" : "DEFEAT";
}

export function bannerMessage(event: BannerEvent): string {
  return `${BANNER_PREFIX}${event}`;
}
