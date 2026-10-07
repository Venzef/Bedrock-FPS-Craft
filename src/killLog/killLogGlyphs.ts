import type { KillLogFlags, KillLogTeamCode, ParsedKillLogMessage } from "./killLogProtocol.js";

export const KILLLOG_UI_HEADER = "FPSCRAFT:KILLLOG:ADD:";

export const WEAPON_GLYPHS: Readonly<Record<string, string>> = Object.freeze({
  W00: "\uE800", // AK47
  W01: "\uE804", // M4A1
  W02: "\uE801", // AWP
  W03: "\uE802", // Shotgun
  W04: "\uE803", // UMP
  W05: "\uE810", // USP
  W06: "\uE811", // G22
  W07: "\uE812", // Desert Eagle
  W08: "\uE813", // TEC-9
  W09: "\uE814", // F/S
  W10: "\uE815", // P350
  W11: "\uE816", // Berettas
  W12: "\uE820", // HE Grenade
  W13: "\uE821", // Molotov
  W14: "\uE830", // Knife
  W15: "\uE831", // Bayonet
  W16: "\uE832", // Karambit
});

export const FLAG_GLYPHS: Readonly<Record<keyof KillLogFlags, string>> = Object.freeze({
  headshot: "\uE1F0",
  jumpShot: "\uE1F1",
  smokeShot: "\uE1F4",
  wallbang: "\uE1F2",
  blinded: "\uE1F5",
  noScope: "\uE1F3",
});

const FLAG_ORDER: readonly (keyof KillLogFlags)[] = [
  "headshot", "jumpShot", "smokeShot", "wallbang", "blinded", "noScope",
];

const TEAM_COLORS: Readonly<Record<KillLogTeamCode, string>> = Object.freeze({
  "0": "\u00A7c",
  "1": "\u00A7b",
});
const RESET_COLOR = "\u00A7r";

export function getWeaponGlyph(weaponId: string): string {
  const glyph = WEAPON_GLYPHS[weaponId];
  if (!glyph) {
    console.warn(`[KillLog] Unknown weapon glyph ID: ${weaponId}`);
    return "";
  }
  return glyph;
}

export function getFlagGlyphs(flags: KillLogFlags): string {
  return FLAG_ORDER.filter(flagName => flags[flagName]).map(flagName => FLAG_GLYPHS[flagName]).join("");
}

export function createKillLogDisplay(parsed: ParsedKillLogMessage): string {
  const weaponGlyph = getWeaponGlyph(parsed.weapon);
  const flagGlyphs = getFlagGlyphs(parsed.flags);
  const killerColor = TEAM_COLORS[parsed.killerTeam];
  const victimColor = TEAM_COLORS[parsed.victimTeam];
  return `${killerColor}${parsed.killerName} ${RESET_COLOR}${weaponGlyph}${flagGlyphs ? ` ${RESET_COLOR}${flagGlyphs}` : ""} ${victimColor}${parsed.victimName}${RESET_COLOR}`;
}

export function createKillLogUiMessage(parsed: ParsedKillLogMessage): string {
  return `${KILLLOG_UI_HEADER}\n${createKillLogDisplay(parsed)}`;
}
