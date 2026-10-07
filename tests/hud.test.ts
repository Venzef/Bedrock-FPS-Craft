import assert from "node:assert/strict";
import test from "node:test";
import { formatHudSlot, formatHudTitle, HUD_SLOT_OFFSETS, HUD_TOTAL_LENGTH, inactivePlayerHudFrame, interactionGlyphFrame, PlayerHudComposer, utf8ByteLength } from "../src/hud";
import { encodePlayerHudFrame } from "../src/ui/hud_elements/fcab/index";

test("player HUD composes weapon ammo and defuse progress into one fixed FCAB frame",()=>{
  const frame=encodePlayerHudFrame({
    held:"W04",magazine:30,reserve:120,
    interaction:{kind:"defuse",frame:7},
  });

  assert.equal(frame,"FCABW04A030R120I2G07");
  assert.equal(Buffer.byteLength(frame,"utf8"),20);
});

test("a defuse kit selects the five-second I3 presentation without changing wire length",()=>{
  const frame=encodePlayerHudFrame({
    held:"W04",magazine:30,reserve:120,
    interaction:{kind:"defuse",frame:7,startedWithKit:true},
  });

  assert.equal(frame,"FCABW04A030R120I3G07");
  assert.equal(Buffer.byteLength(frame,"utf8"),20);
});

test("bomb HUD discards stale firearm ammo while keeping plant progress",()=>{
  assert.equal(encodePlayerHudFrame({
    held:"WFF",magazine:30,reserve:120,
    interaction:{kind:"plant",frame:19},
  }),"FCABWFFA000R000I1G19");
});

test("knife and hidden weapon codes never leak stale firearm ammo",()=>{
  assert.deepEqual([
    encodePlayerHudFrame({held:"W14",magazine:30,reserve:120}),
    encodePlayerHudFrame({held:"WNN",magazine:30,reserve:120}),
  ],["FCABW14A000R000I0G00","FCABWNNA000R000I0G00"]);
});

test("player HUD sends changes immediately and unchanged state on a 20 tick heartbeat",()=>{
  const composer=new PlayerHudComposer();
  const snapshot={held:"W04" as const,magazine:30,reserve:120};

  assert.equal(composer.nextFrame("player",snapshot,0),"FCABW04A030R120I0G00");
  assert.equal(composer.nextFrame("player",snapshot,1),undefined);
  assert.equal(composer.nextFrame("player",snapshot,20),"FCABW04A030R120I0G00");
});

test("the inactive player HUD frame explicitly hides every FCAB renderer",()=>{
  assert.equal(inactivePlayerHudFrame(),"FCABWNNA000R000I0G00");
});

test("active interaction progress maps to G00 through G19 and reserves G20 for confirmed completion",()=>{
  assert.deepEqual([
    interactionGlyphFrame(0,100),
    interactionGlyphFrame(50,100),
    interactionGlyphFrame(99,100),
    interactionGlyphFrame(100,100),
  ],[0,10,19,19]);
});

test("confirmed defuse completion latches G20 for exactly 10 ticks",()=>{
  const composer=new PlayerHudComposer();
  const snapshot={held:"W04" as const,magazine:7,reserve:48};
  composer.latchCompletion("player","defuse",100);

  assert.equal(composer.nextFrame("player",snapshot,100),"FCABW04A007R048I2G20");
  assert.equal(composer.nextFrame("player",snapshot,109),undefined);
  assert.equal(composer.nextFrame("player",snapshot,110),"FCABW04A007R048I0G00");
});

test("confirmed kit defuse completion keeps the I3 presentation",()=>{
  const composer=new PlayerHudComposer();
  const snapshot={held:"W04" as const,magazine:7,reserve:48};
  composer.latchCompletion("player","defuse",100,true);

  assert.equal(composer.nextFrame("player",snapshot,100),"FCABW04A007R048I3G20");
});

test("HUD protocol preserves fixed header, slots, and total length",()=>{
  const title=formatHudTitle({
    timerTicks:20,tScore:0,ctScore:0,bombDisplay:"TIMER",
    tPlayers:[{name:"baboo479425",alive:true}],ctPlayers:[],
  });
  assert.equal(HUD_TOTAL_LENGTH,202);
  assert.equal(title.length,HUD_TOTAL_LENGTH);
  assert.equal(utf8ByteLength(title),HUD_TOTAL_LENGTH);
  assert.equal(title.slice(0,12),"TMR00:01A0D0");
  assert.equal(title.slice(HUD_SLOT_OFFSETS[0],HUD_SLOT_OFFSETS[0]+19),formatHudSlot({name:"baboo479425",alive:true}));
  assert.equal(title.slice(HUD_SLOT_OFFSETS[1],HUD_SLOT_OFFSETS[1]+19),`PLN${",".repeat(16)}`);
});

test("HUD does not append a round result suffix",()=>{
  const title=formatHudTitle({
    timerTicks:0,tScore:2,ctScore:1,
    tPlayers:[{name:"T",alive:true}],ctPlayers:[{name:"CT",alive:false}],bombDisplay:"TIMER",
  });
  assert.equal(title.length,202);
  assert.doesNotMatch(title,/RWIN|RLOS/);
  assert.equal(title.slice(HUD_SLOT_OFFSETS[0],HUD_SLOT_OFFSETS[0]+19),formatHudSlot({name:"T",alive:true}));
});

test("HUD uses planted and defused five-character fields",()=>{
  const base={timerTicks:0,tScore:7,ctScore:6,tPlayers:[],ctPlayers:[]};
  const planted=formatHudTitle({...base,bombDisplay:"PLANTED"});
  const defused=formatHudTitle({...base,ctScore:7,bombDisplay:"DEFUSED"});
  assert.equal(planted.slice(0,12),"TMRBPLNTA7D6");
  assert.equal(defused.slice(0,12),"TMRBDEFSA7D7");
  for(const title of [planted,defused]){
    const bytes=Buffer.from(title,"utf8");
    assert.equal(bytes.length,HUD_TOTAL_LENGTH);
    assert.match(bytes.subarray(8,10).toString("utf8"),/^A[0-8]$/);
    assert.match(bytes.subarray(10,12).toString("utf8"),/^D[0-8]$/);
    assert.match(bytes.subarray(12,15).toString("utf8"),/^PL[ADN]$/);
  }
});

test("HUD truncates names and swaps alive prefix without changing slot length",()=>{
  assert.equal(formatHudSlot({name:"12345678901234567890",alive:true}),"PLA1234567890123456");
  assert.equal(formatHudSlot({name:"short",alive:false}),`PLDshort${",".repeat(11)}`);
});

test("HUD pads player slots to 19 UTF-8 bytes",()=>{
  const slot=formatHudSlot({name:"가나다라마바사",alive:true});
  assert.equal(utf8ByteLength(slot),19);
  assert.equal(slot,"PLA가나다라마,");
});
