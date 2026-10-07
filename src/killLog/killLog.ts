import type { PlayerMatchState, Team, WeaponId } from "../types.js";
import { createKillLogUiMessage } from "./killLogGlyphs.js";
import { createKillLogMessage, parseKillLogMessage, type KillLogFlags, type KillLogTeamCode } from "./killLogProtocol.js";

export interface KillLogKill {
  killerTeam: Team;
  killerName: string;
  weaponId: WeaponId;
  victimTeam: Team;
  victimName: string;
  flags?: Partial<KillLogFlags>;
}

export function killLogTeamCode(team: Team): KillLogTeamCode {
  return team === "T" ? "0" : "1";
}

export function isKillLogRecipient(player: Pick<PlayerMatchState, "joined" | "connected"> | undefined): boolean {
  return player?.joined === true && player.connected === true;
}

export function createKillLogForKill(kill: KillLogKill): string {
  const protocol = createKillLogMessage({
    killerTeam: killLogTeamCode(kill.killerTeam),
    killerName: kill.killerName,
    weaponId: kill.weaponId,
    headshot: kill.flags?.headshot ?? false,
    jumpShot: kill.flags?.jumpShot ?? false,
    smokeShot: kill.flags?.smokeShot ?? false,
    wallbang: kill.flags?.wallbang ?? false,
    blinded: kill.flags?.blinded ?? false,
    noScope: kill.flags?.noScope ?? false,
    victimTeam: killLogTeamCode(kill.victimTeam),
    victimName: kill.victimName,
  });
  return createKillLogUiMessage(parseKillLogMessage(protocol));
}
