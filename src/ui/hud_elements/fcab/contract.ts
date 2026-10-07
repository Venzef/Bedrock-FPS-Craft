import type { FcabContractDescription, FcabFrame } from "./types.js";

const held = Object.freeze({
  offset: 4,
  width: 3,
  gunPrefix: "W0",
  gunCodes: Object.freeze(["W00", "W02", "W03", "W04", "W05"] as const),
  knife: "W14" as const,
  bomb: "WFF" as const,
  hidden: "WNN" as const,
});

const magazine = Object.freeze({marker:"A",offset:7,width:4,digits:3,min:0,max:999});
const reserve = Object.freeze({marker:"R",offset:11,width:4,digits:3,min:0,max:999});
const interaction = Object.freeze({
  offset: 15,
  width: 2,
  codes: Object.freeze({none:"I0" as const,plant:"I1" as const,defuse:"I2" as const,defuseKit:"I3" as const}),
});
const progress = Object.freeze({marker:"G",offset:17,width:3,digits:2,min:0,max:20});
const fields = Object.freeze({held,magazine,reserve,interaction,progress});
const prefix="FCAB";
const frameLength=progress.offset+progress.width;
const fallbackFrame=`${prefix}${held.hidden}${magazine.marker}${"0".repeat(magazine.digits)}${reserve.marker}${"0".repeat(reserve.digits)}${interaction.codes.none}${progress.marker}${"0".repeat(progress.digits)}` as FcabFrame;

const contract: FcabContractDescription = Object.freeze({
  prefix,
  frameLength,
  fallbackFrame,
  fields,
});

export function describeFcabContract(): Readonly<FcabContractDescription> {
  return contract;
}
