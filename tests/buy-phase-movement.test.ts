import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const utils=readFileSync(new URL("../src/utils.ts",import.meta.url),"utf8");
const game=readFileSync(new URL("../src/game.ts",import.meta.url),"utf8");

test("the movement adapter controls lateral jump and sneak independently",()=>{
  const helper=utils.slice(utils.indexOf("export function applyPlayerMovementPermissions"),utils.indexOf("export function setAdventure"));
  assert.match(helper,/InputPermissionCategory\.LateralMovement,permissions\.lateralEnabled/);
  assert.match(helper,/InputPermissionCategory\.Jump,permissions\.jumpEnabled/);
  assert.match(helper,/InputPermissionCategory\.Sneak,permissions\.sneakEnabled/);
  assert.doesNotMatch(helper,/InputPermissionCategory\.Movement/);
});

test("game movement permissions compose buy phase and active interaction locks",()=>{
  const refresh=game.slice(game.indexOf("private refreshPlayerMovement"),game.indexOf("private refreshAllMovement"));
  assert.match(refresh,/movementPermissionsFor/);
  assert.match(refresh,/this\.state\.phase==="FREEZE"/);
  assert.match(refresh,/this\.bombObjective\.hasInteraction\(player\.id\)/);
  assert.match(refresh,/applyPlayerMovementPermissions/);
});

test("interaction and round transitions always refresh derived movement permissions",()=>{
  const useStart=game.slice(game.indexOf("private onUseStart"),game.indexOf("private tickInteraction"));
  const finish=game.slice(game.indexOf("private clearInteractions"),game.indexOf("private removeShopAccessItems"));
  const cancel=game.slice(game.indexOf("private cancelInteraction"),game.indexOf("private bombMap"));
  const startRound=game.slice(game.indexOf("private applyRoundStart"),game.indexOf("private cleanupRoundObjectives"));
  const goLive=game.slice(game.indexOf('effect.kind==="LIVE"'),game.indexOf('effect.kind==="ROUND_ENDED"'));

  assert.match(useStart,/this\.bombObjective\.startUse\(this\.state/);
  assert.match(finish,/this\.bombObjective\.clearInteractions\(this\.state/);
  assert.match(finish,/this\.refreshBombInteractionPlayers\(transition\.effects\)/);
  assert.match(cancel,/this\.bombObjective\.cancel\(this\.state,id\)/);
  assert.match(startRound,/this\.refreshPlayerMovement\(p\)/);
  assert.match(goLive,/this.removeShopAccessItems()/);
  assert.match(goLive,/this.refreshAllMovement()/);
  assert.doesNotMatch(game,/this\.interaction\.clear\(\)/);
});

test("death and leave cancel an interaction before objective cleanup",()=>{
  const leave=game.slice(game.indexOf("private onLeave"),game.indexOf("private onDeath"));
  const death=game.slice(game.indexOf("private onDeath"),game.indexOf("private onUseStart"));
  assert.ok(leave.indexOf("this.cancelInteraction(e.playerId)")<leave.indexOf("this.dropBomb(e.playerId)"));
  assert.ok(death.indexOf("this.cancelInteraction(playerId)")<death.indexOf("this.dropBomb(playerId"));
  assert.ok(death.indexOf("this.cancelInteraction(playerId)")<death.indexOf("system.runTimeout"));
});

test("spectating match end and admin reset cannot leave movement locked",()=>{
  const spectator=utils.slice(utils.indexOf("export function setSpectator"));
  const endMatch=game.slice(game.indexOf("private endMatch"),game.indexOf("private cleanupRoundObjectives"));
  const admin=game.slice(game.indexOf("private onScriptEvent"));
  assert.match(spectator,/lateralEnabled:true,jumpEnabled:true,sneakEnabled:true/);
  assert.match(endMatch,/this\.refreshPlayerMovement\(p\)/);
  assert.match(admin,/this\.state=resetState\(\);this\.refreshAllMovement\(\)/);
});
