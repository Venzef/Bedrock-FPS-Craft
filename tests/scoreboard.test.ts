import assert from "node:assert/strict";
import test from "node:test";
import { ScoreboardLedger, type ScoreboardPlayer } from "../src/scoreboard/ledger";
import { decodeScoreboard, encodeScoreboard, SCOREBOARD_WIRE, scoreboardTitle } from "../src/scoreboard/wire";
import { EffectiveDamage } from "../src/scoreboard/damage";
import { formatHudTitle, utf8ByteLength } from "../src/hud";
import { roleForSquad } from "../src/rules";

function fixture(){
  const ledger=new ScoreboardLedger();
  const players:ScoreboardPlayer[]=["a","b","c","v","w"].map((id,i)=>({id,name:id,role:i<3?"CT":"T",alive:true,money:800+i}));
  players.forEach(p=>ledger.join(p.id));
  const stats=(id:string)=>{const s=ledger.snapshot(id,players,2,1)!;return [...s.ct,...s.t].find(r=>r.self)!;};
  const hit=(id:string,n:number,v="v")=>ledger.recordDamage(players.find(p=>p.id===v)!,players.find(p=>p.id===id)!,n);
  return {ledger,players,stats,hit};
}
test("enemy kills and every actual death accumulate for the match",()=>{
  const {ledger,players,stats}=fixture();
  ledger.recordDeath("v","a",players);ledger.endRound();ledger.recordDeath("v","a",players);
  assert.equal(stats("a").kills,2);assert.equal(stats("v").deaths,2);
  ledger.clear();players.forEach(p=>ledger.join(p.id));assert.equal(stats("a").kills,0);
});
for(const killer of [undefined,"v","w"])test(`environment, suicide and teamkill do not grant K (${killer})`,()=>{
  const {ledger,players,stats}=fixture();ledger.recordDeath("v",killer,players);
  assert.equal(stats("v").deaths,1);assert.equal(players.reduce((sum,p)=>sum+stats(p.id).kills,0),0);
});
test("one highest cumulative contributor assists; the direct killer is excluded",()=>{
  const {ledger,players,stats,hit}=fixture();hit("a",50);hit("b",2);hit("c",3);hit("b",2);
  ledger.recordDeath("v","a",players);
  assert.equal(stats("b").assists,1);assert.equal(stats("a").assists,0);assert.equal(stats("c").assists,0);
});
test("damage ties use first hit on this victim, not joining or reaching the total first",()=>{
  const {ledger,players,stats,hit}=fixture();hit("c",1);hit("b",4);hit("c",3);
  ledger.recordDeath("v","a",players);assert.equal(stats("c").assists,1);assert.equal(stats("b").assists,0);
});
test("positive damage has no threshold; invalid, friendly and self damage do not contribute",()=>{
  const {ledger,players,stats,hit}=fixture();hit("v",99);hit("w",99);hit("c",NaN);hit("c",Infinity);hit("c",0);hit("c",-1);hit("b",0.01);
  ledger.recordDeath("v","a",players);assert.equal(stats("b").assists,1);assert.equal(stats("w").assists,0);
});
test("death and round end clear victim damage without clearing cumulative statistics",()=>{
  const {ledger,players,stats,hit}=fixture();hit("b",4);ledger.recordDeath("v","a",players);ledger.recordDeath("v","a",players);
  assert.equal(stats("b").assists,1);hit("b",4);ledger.endRound();ledger.recordDeath("v","a",players);assert.equal(stats("b").assists,1);
});
test("disconnect hard deletes statistics and both sides of contribution relationships",()=>{
  const {ledger,players,stats,hit}=fixture();hit("b",4);hit("a",3);ledger.recordDeath("w","b",players);
  ledger.leave("b");assert.ok(!ledger.snapshot("a",players,0,0)!.ct.some(p=>p.name==="b"));ledger.join("b");
  ledger.recordDeath("v","c",players);assert.equal(stats("a").assists,1);assert.equal(stats("b").assists,0);assert.equal(stats("b").kills,0);
  hit("b",4);ledger.leave("v");ledger.join("v");ledger.recordDeath("v","a",players);assert.equal(stats("b").assists,0);
});
test("sort order is K descending, A descending, D ascending, then joining order",()=>{
  const {ledger,players,hit}=fixture();
  assert.deepEqual(ledger.snapshot("a",players,0,0)!.ct.map(p=>p.name),["a","b","c"]);
  ledger.recordDeath("a",undefined,players);assert.deepEqual(ledger.snapshot("a",players,0,0)!.ct.map(p=>p.name),["b","c","a"]);
  hit("a",1);ledger.recordDeath("v",undefined,players);assert.deepEqual(ledger.snapshot("a",players,0,0)!.ct.map(p=>p.name),["a","b","c"]);
  ledger.recordDeath("v","c",players);const rows=ledger.snapshot("a",players,0,0)!.ct;
  assert.deepEqual(rows.map(p=>p.name),["c","a","b"]);assert.deepEqual(rows.map(p=>p.rank),[1,2,3]);
});
test("roles and money disclosure swap at halftime while KDA and joining order survive",()=>{
  const {ledger,players}=fixture();ledger.recordDeath("v","a",players);
  const before=ledger.snapshot("a",players,3,4)!;assert.equal(before.ct[0].kills,1);assert.ok(!("money" in before.t[0]));
  const switched=players.map(p=>({...p,role:roleForSquad(p.role,8,7)}));
  const after=ledger.snapshot("a",switched,4,3)!;assert.equal(after.t[0].kills,1);assert.equal(after.allyRole,"T");assert.ok(!("money" in after.ct[0]));
  assert.equal(after.t[0].money,800);
});
test("UTF-8 names and five rows per team retain fixed byte offsets and redact enemy money defensively",()=>{
  const {ledger,players}=fixture();players[0].name="한글😀 Mixed player long name";players[0].money=10000;
  const snapshot=ledger.snapshot("a",players,8,7)!;
  snapshot.t[0].money=9876; // even an accidentally over-disclosed input is redacted by the encoder
  const frame=encodeScoreboard(snapshot);assert.equal(utf8ByteLength(frame),SCOREBOARD_WIRE.length);assert.ok(!frame.includes("9876"));
  const decoded=decodeScoreboard(frame);assert.equal(decoded.ct[0].money,10000);assert.equal(decoded.ct[0].name,"한글😀 Mixed player long nam");
  assert.ok(!("money" in decoded.t[0]));assert.equal(decoded.t[0].name,"v");assert.equal(decoded.ct[0].self,true);
  const title=formatHudTitle({timerTicks:100,tScore:7,ctScore:8,tPlayers:[],ctPlayers:[],bombDisplay:"TIMER"});
  assert.equal(utf8ByteLength(title),202);assert.ok(scoreboardTitle(title,snapshot).startsWith(title));assert.equal(scoreboardTitle(title),title);
  assert.equal(utf8ByteLength(scoreboardTitle("",snapshot)),202+488);
});
test("damage correction records actual health loss once, before lethal callbacks",()=>{
  const {ledger,players,stats}=fixture();let hp=20;let reports=0;
  const accounting=new EffectiveDamage((v,a,n)=>{reports++;ledger.recordDamage(players.find(p=>p.id===v)!,players.find(p=>p.id===a)!,n);});
  accounting.apply("v","b",()=>hp,()=>{hp-=2;assert.equal(accounting.isApplying("v"),true);hp-=6;});
  accounting.apply("v","c",()=>hp,()=>{hp-=7;});
  accounting.apply("v","a",()=>hp,()=>{hp=0;assert.equal(accounting.deferDeath("v",()=>ledger.recordDeath("v","a",players)),true);});
  assert.equal(reports,3);assert.equal(stats("b").assists,1);assert.equal(accounting.isApplying("v"),false);
});
test("an unapplied damage request contributes nothing and exceptions release the transaction",()=>{
  const amounts:number[]=[];const accounting=new EffectiveDamage((_v,_a,n)=>amounts.push(n));
  assert.throws(()=>accounting.apply("v","a",()=>20,()=>{throw new Error("rejected");}));
  assert.deepEqual(amounts,[0]);assert.equal(accounting.isApplying("v"),false);assert.equal(accounting.deferDeath("v",()=>{}),false);
});
