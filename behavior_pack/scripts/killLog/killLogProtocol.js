export const KILLLOG_PROTOCOL_HEADER = "FPSCRAFT:KILLLOG:ADD:";
export const KILLLOG_PROTOCOL_END = ":END";
export const KILLLOG_NAME_LENGTH = 16;
export const KILLLOG_PROTOCOL_LENGTH = 74;
function formatKillerName(name) {
    return String(name).slice(0, KILLLOG_NAME_LENGTH).padStart(KILLLOG_NAME_LENGTH, ",");
}
function formatVictimName(name) {
    return String(name).slice(0, KILLLOG_NAME_LENGTH).padEnd(KILLLOG_NAME_LENGTH, ",");
}
function formatTeam(team) {
    const value = String(team);
    if (!/^[0-9]$/.test(value))
        throw new Error(`[KillLog] Team must be one digit. Received: ${team}`);
    return value;
}
function formatWeaponId(weaponId) {
    const numericId = String(weaponId).replace(/^W/, "").padStart(2, "0").slice(-2);
    if (!/^\d{2}$/.test(numericId))
        throw new Error(`[KillLog] Invalid weapon ID: ${weaponId}`);
    return `W${numericId}`;
}
function flag(prefix, value) {
    return `${prefix}${value ? 1 : 0}`;
}
export function createKillLogMessage(input) {
    const message = KILLLOG_PROTOCOL_HEADER +
        formatTeam(input.killerTeam) +
        formatKillerName(input.killerName) +
        formatWeaponId(input.weaponId) +
        flag("H", input.headshot) +
        flag("J", input.jumpShot) +
        flag("S", input.smokeShot) +
        flag("W", input.wallbang) +
        flag("B", input.blinded) +
        flag("N", input.noScope) +
        formatTeam(input.victimTeam) +
        formatVictimName(input.victimName) +
        KILLLOG_PROTOCOL_END;
    validateKillLogMessage(message);
    return message;
}
export function validateKillLogMessage(message) {
    if (typeof message !== "string")
        throw new Error("[KillLog] Protocol must be a string.");
    if (message.length !== KILLLOG_PROTOCOL_LENGTH) {
        throw new Error(`[KillLog] Invalid protocol length. Expected ${KILLLOG_PROTOCOL_LENGTH}, received ${message.length}.`);
    }
    if (!message.startsWith(KILLLOG_PROTOCOL_HEADER))
        throw new Error("[KillLog] Invalid protocol header.");
    if (!message.endsWith(KILLLOG_PROTOCOL_END))
        throw new Error("[KillLog] Invalid protocol terminator.");
    const markers = [
        [38, "W"], [41, "H"], [43, "J"], [45, "S"], [47, "W"], [49, "B"], [51, "N"],
    ];
    for (const [index, expected] of markers) {
        if (message[index] !== expected) {
            throw new Error(`[KillLog] Invalid marker at index ${index}. Expected "${expected}", received "${message[index]}".`);
        }
    }
    for (const index of [42, 44, 46, 48, 50, 52]) {
        if (message[index] !== "0" && message[index] !== "1") {
            throw new Error(`[KillLog] Invalid flag value at index ${index}: ${message[index]}`);
        }
    }
    return true;
}
export function parseKillLogMessage(message) {
    validateKillLogMessage(message);
    return {
        killerTeam: message.slice(21, 22),
        killerName: message.slice(22, 38).replace(/^,+/, ""),
        weapon: message.slice(38, 41),
        flags: {
            headshot: message.slice(42, 43) === "1",
            jumpShot: message.slice(44, 45) === "1",
            smokeShot: message.slice(46, 47) === "1",
            wallbang: message.slice(48, 49) === "1",
            blinded: message.slice(50, 51) === "1",
            noScope: message.slice(52, 53) === "1",
        },
        victimTeam: message.slice(53, 54),
        victimName: message.slice(54, 70).replace(/,+$/, ""),
    };
}
