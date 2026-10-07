import { describeFcabContract } from "./contract.js";
import type { FcabFrame, PlayerHudFrameSnapshot } from "./types.js";

function clampInteger(value: unknown,min: number,max: number): number {
  const numeric=typeof value==="number"&&Number.isFinite(value)?Math.floor(value):min;
  return Math.min(max,Math.max(min,numeric));
}

function numberField(value: unknown,field:ReturnType<typeof describeFcabContract>["fields"]["magazine"]): string {
  return `${field.marker}${String(clampInteger(value,field.min,field.max)).padStart(field.digits,"0")}`;
}

export function encodePlayerHudFrame(snapshot: PlayerHudFrameSnapshot): FcabFrame {
  const contract=describeFcabContract();
  try {
    const candidate=snapshot as unknown as {
      held?:unknown;
      magazine?:unknown;
      reserve?:unknown;
      interaction?:{kind?:unknown;frame?:unknown;startedWithKit?:unknown};
    };
    const held=typeof candidate?.held==="string"?candidate.held:"";
    const allowed:readonly string[]=[...contract.fields.held.gunCodes,contract.fields.held.knife,contract.fields.held.bomb,contract.fields.held.hidden];
    if(!allowed.includes(held))return contract.fallbackFrame;

    const showsAmmo=(contract.fields.held.gunCodes as readonly string[]).includes(held);
    const magazine=numberField(showsAmmo?candidate.magazine:0,contract.fields.magazine);
    const reserve=numberField(showsAmmo?candidate.reserve:0,contract.fields.reserve);
    const interaction=candidate.interaction;
    let interactionCode: typeof contract.fields.interaction.codes[keyof typeof contract.fields.interaction.codes]=contract.fields.interaction.codes.none;
    if(interaction?.kind==="plant")interactionCode=contract.fields.interaction.codes.plant;
    else if(interaction?.kind==="defuse")interactionCode=interaction.startedWithKit===true
      ?contract.fields.interaction.codes.defuseKit
      :contract.fields.interaction.codes.defuse;
    const progress=numberField(interactionCode===contract.fields.interaction.codes.none?0:interaction?.frame,contract.fields.progress);
    const frame=`${contract.prefix}${held}${magazine}${reserve}${interactionCode}${progress}`;
    return frame.length===contract.frameLength&&/^[\x00-\x7f]+$/.test(frame)
      ?frame as FcabFrame
      :contract.fallbackFrame;
  } catch {
    return contract.fallbackFrame;
  }
}
