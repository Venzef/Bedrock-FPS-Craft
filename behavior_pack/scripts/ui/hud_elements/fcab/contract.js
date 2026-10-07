const held = Object.freeze({
    offset: 4,
    width: 3,
    gunPrefix: "W0",
    gunCodes: Object.freeze(["W00", "W02", "W03", "W04", "W05"]),
    knife: "W14",
    bomb: "WFF",
    hidden: "WNN",
});
const magazine = Object.freeze({ marker: "A", offset: 7, width: 4, digits: 3, min: 0, max: 999 });
const reserve = Object.freeze({ marker: "R", offset: 11, width: 4, digits: 3, min: 0, max: 999 });
const interaction = Object.freeze({
    offset: 15,
    width: 2,
    codes: Object.freeze({ none: "I0", plant: "I1", defuse: "I2", defuseKit: "I3" }),
});
const progress = Object.freeze({ marker: "G", offset: 17, width: 3, digits: 2, min: 0, max: 20 });
const fields = Object.freeze({ held, magazine, reserve, interaction, progress });
const prefix = "FCAB";
const frameLength = progress.offset + progress.width;
const fallbackFrame = `${prefix}${held.hidden}${magazine.marker}${"0".repeat(magazine.digits)}${reserve.marker}${"0".repeat(reserve.digits)}${interaction.codes.none}${progress.marker}${"0".repeat(progress.digits)}`;
const contract = Object.freeze({
    prefix,
    frameLength,
    fallbackFrame,
    fields,
});
export function describeFcabContract() {
    return contract;
}
