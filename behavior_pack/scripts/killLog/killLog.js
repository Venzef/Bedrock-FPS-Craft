import { createKillLogUiMessage } from "./killLogGlyphs.js";
import { createKillLogMessage, parseKillLogMessage } from "./killLogProtocol.js";
export function killLogTeamCode(team) {
    return team === "T" ? "0" : "1";
}
export function isKillLogRecipient(player) {
    return player?.joined === true && player.connected === true;
}
export function createKillLogForKill(kill) {
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
