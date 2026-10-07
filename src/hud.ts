import type { HudPlayerSlot, HudSnapshot } from "./types.js";
import { describeFcabContract, encodePlayerHudFrame, type PlayerHudFrameSnapshot } from "./ui/hud_elements/fcab/index.js";

export function interactionGlyphFrame(ticks:number,durationTicks:number):number {
  const {max}=describeFcabContract().fields.progress;
  const progress=clampInteger(ticks,0,Math.max(1,durationTicks));
  return Math.min(max-1,Math.floor(progress/Math.max(1,durationTicks)*max));
}

export function inactivePlayerHudFrame():ReturnType<typeof encodePlayerHudFrame> {
  return encodePlayerHudFrame({held:"WNN",magazine:0,reserve:0});
}

export class PlayerHudComposer {
  private readonly sent=new Map<string,{frame:string;tick:number}>();
  private readonly completions=new Map<string,{kind:"plant"|"defuse";untilTick:number;startedWithKit:boolean}>();

  public latchCompletion(playerId:string,kind:"plant"|"defuse",currentTick:number,startedWithKit=false):void {
    this.completions.set(playerId,{kind,untilTick:currentTick+10,startedWithKit});
  }

  public nextFrame(playerId:string,snapshot:PlayerHudFrameSnapshot,currentTick:number):ReturnType<typeof encodePlayerHudFrame>|undefined {
    const completion=this.completions.get(playerId);
    if(completion&&currentTick>=completion.untilTick)this.completions.delete(playerId);
    const activeCompletion=completion&&currentTick<completion.untilTick?completion:undefined;
    const effective=activeCompletion&&!snapshot.interaction
      ?{...snapshot,interaction:{kind:activeCompletion.kind,frame:20,startedWithKit:activeCompletion.startedWithKit}}
      :snapshot;
    const frame=encodePlayerHudFrame(effective);
    const previous=this.sent.get(playerId);
    if(previous?.frame===frame&&currentTick-previous.tick<20)return undefined;
    this.sent.set(playerId,{frame,tick:currentTick});
    return frame;
  }

  public forget(playerId:string):void { this.sent.delete(playerId);this.completions.delete(playerId); }
  public clear():void { this.sent.clear();this.completions.clear(); }
}

export const HUD_NAME_LENGTH = 16;
export const HUD_SLOT_LENGTH = 19;
export const HUD_HEADER_LENGTH = 12;
export const HUD_TOTAL_LENGTH = 202;
export const HUD_SLOT_OFFSETS = [12,31,50,69,88,107,126,145,164,183] as const;
// JSON UI's %.Ns precision uses UTF-8 byte offsets. Keep wire tokens ASCII;
// the RP maps these markers to private-use visual glyphs.
export const HUD_PLANTED_TOKEN = "BPLNT";
export const HUD_DEFUSED_TOKEN = "BDEFS";

export function utf8ByteLength(value: string): number {
  let bytes=0;
  for(const char of value){
    const code=char.codePointAt(0)??0;
    bytes+=code<=0x7f?1:code<=0x7ff?2:code<=0xffff?3:4;
  }
  return bytes;
}

function truncateUtf8(value: string,maxBytes: number): string {
  let result="",bytes=0;
  for(const char of value){
    const size=utf8ByteLength(char);
    if(bytes+size>maxBytes)break;
    result+=char;bytes+=size;
  }
  return result;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(Number(value) || 0)));
}

function timerField(ticks: number): string {
  const seconds = clampInteger(Math.ceil(ticks / 20), 0, 99 * 60 + 59);
  return `${String(Math.floor(seconds / 60)).padStart(2,"0")}:${String(seconds % 60).padStart(2,"0")}`;
}

function score(value: number): string {
  return String(clampInteger(value, 0, 8));
}

export function emptyHudSlot(): string {
  return `PLN${",".repeat(HUD_NAME_LENGTH)}`;
}

export function formatHudSlot(slot?: HudPlayerSlot): string {
  if (!slot) return emptyHudSlot();
  const truncated=truncateUtf8(slot.name,HUD_NAME_LENGTH);
  const name=truncated+",".repeat(HUD_NAME_LENGTH-utf8ByteLength(truncated));
  return `${slot.alive ? "PLA" : "PLD"}${name}`;
}

export function formatHudTitle(snapshot: HudSnapshot): string {
  const display = snapshot.bombDisplay === "PLANTED"
    ? HUD_PLANTED_TOKEN
    : snapshot.bombDisplay === "DEFUSED"
      ? HUD_DEFUSED_TOKEN
      : timerField(snapshot.timerTicks);
  const slots = [
    ...snapshot.tPlayers.slice(0,5),
    ...Array(Math.max(0,5-snapshot.tPlayers.length)).fill(undefined),
    ...snapshot.ctPlayers.slice(0,5),
    ...Array(Math.max(0,5-snapshot.ctPlayers.length)).fill(undefined),
  ].map(formatHudSlot).join("");
  const value = `TMR${display}A${score(snapshot.tScore)}D${score(snapshot.ctScore)}${slots}`;
  return utf8ByteLength(value) === HUD_TOTAL_LENGTH ? value : `TMR00:00A0D0${emptyHudSlot().repeat(10)}`;
}
