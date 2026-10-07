import type { WeaponState } from "../../../types.js";

declare const fcabFrameBrand: unique symbol;

export type FcabFrame = string & { readonly [fcabFrameBrand]: "FcabFrame" };
export type PlayerHudHeldCode = WeaponState["id"] | "WFF" | "WNN";
export type PlayerHudInteractionKind = "plant" | "defuse";

export interface PlayerHudFrameSnapshot {
  held: PlayerHudHeldCode;
  magazine: number;
  reserve: number;
  interaction?: {
    kind: PlayerHudInteractionKind;
    frame: number;
    startedWithKit?: boolean;
  };
}

export interface FcabNumberFieldDescription {
  readonly marker: string;
  readonly offset: number;
  readonly width: number;
  readonly digits: number;
  readonly min: number;
  readonly max: number;
}

export interface FcabContractDescription {
  readonly prefix: string;
  readonly frameLength: number;
  readonly fallbackFrame: FcabFrame;
  readonly fields: {
    readonly held: {
      readonly offset: number;
      readonly width: number;
      readonly gunPrefix: string;
      readonly gunCodes: readonly WeaponState["id"][];
      readonly knife: "W14";
      readonly bomb: "WFF";
      readonly hidden: "WNN";
    };
    readonly magazine: FcabNumberFieldDescription;
    readonly reserve: FcabNumberFieldDescription;
    readonly interaction: {
      readonly offset: number;
      readonly width: number;
      readonly codes: {
        readonly none: "I0";
        readonly plant: "I1";
        readonly defuse: "I2";
        readonly defuseKit: "I3";
      };
    };
    readonly progress: FcabNumberFieldDescription;
  };
}
