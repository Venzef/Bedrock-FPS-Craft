import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const game=readFileSync(new URL("../src/game.ts",import.meta.url),"utf8");
const lifecycle=readFileSync(new URL("../src/round-lifecycle.ts",import.meta.url),"utf8");
const inventory=readFileSync(new URL("../src/inventory.ts",import.meta.url),"utf8");

function method(from:string,to:string):string {
  return game.slice(game.indexOf(from),game.indexOf(to));
}

test("a delayed death callback revalidates the round and player state before spectating",()=>{
  const onDeath=method("private onDeath","private onUseStart");
  assert.match(onDeath,/deathRound=this\.state\.round/);
  assert.match(onDeath,/shouldApplyDelayedSpectator/);
  assert.match(onDeath,/this\.player\(playerId\)/);
  assert.doesNotMatch(onDeath,/setSpectator\(e\.deadEntity as Player\)/);
});

test("a reconnecting player cannot retain an expired shop opener in any phase",()=>{
  const onSpawn=method("private onSpawn","private giveLobbyTools");
  assert.match(onSpawn,/this\.state\.phase!=="FREEZE"/);
  assert.match(onSpawn,/removeItemsByType\(inv,SHOP_ACCESS_ITEM\)/);
  const matchSpawn=onSpawn.slice(onSpawn.indexOf("else"));
  const clearAt=matchSpawn.indexOf("clearMatchItems(player)");
  const spectatorAt=matchSpawn.indexOf("setSpectator(player)");
  assert.ok(clearAt>=0&&spectatorAt>=0&&clearAt<spectatorAt);
});

test("script recovery removes an expired shop opener without deleting the loadout",()=>{
  const recover=method("private recover","private onSpawn");
  assert.match(recover,/this\.state\.phase!=="FREEZE"/);
  assert.match(recover,/removeItemsByType\(inv,SHOP_ACCESS_ITEM\)/);
  assert.doesNotMatch(recover,/clearMatchItems\(p\)/);
});

test("round-critical inventory items use guaranteed placement while the defuse kit remains passive",()=>{
  const startRound=method("private applyRoundStart","private cleanupRoundObjectives");
  const pickup=method("private tickBombPickup","private tick():void");
  const shopAdapter=readFileSync(new URL("../src/shop-minecraft-adapter.ts",import.meta.url),"utf8");
  assert.match(startRound,/this\.giveShopAccessItem\(p\)/);
  assert.match(startRound,/this\.bombAdapter\.giveBomb\(effect\.bombCarrierId\)/);
  assert.doesNotMatch(startRound,/giveDefuseKit|fps:defuse_kit/);
  assert.match(shopAdapter,/equipDefuseKit:[\s\S]*ps\.hasDefuseKit=true/);
  assert.doesNotMatch(startRound,/giveMarked\(p,SHOP_ACCESS_ITEM\)|giveMarked\(p,KIT\)|giveMarked\(p,BOMB\)/);
  assert.match(pickup,/this\.bombObjective\.tickPickup\(this\.state/);
  assert.doesNotMatch(pickup,/giveMarked\(p,BOMB\)|giveRequiredRoundItem\(p,BOMB/);
});

test("the shop opener uses the ninth visible hotbar slot",()=>{
  assert.match(inventory,/size:9/);
  assert.match(inventory,/tactical:\[3,4,5,6\]/);
  assert.match(inventory,/objective:7/);
  assert.match(inventory,/shopAccess:8/);
  assert.match(game,/ensureFixedHotbarItem\(inv,new ItemStack\(SHOP_ACCESS_ITEM\),"SHOP_ACCESS"\)/);
});

test("fixed hotbar rules keep the bomb droppable and clear utility slots",()=>{
  const sync=method("private syncWeaponsToInventory","private dropWeaponEntity");
  const adapter=readFileSync(new URL("../src/bomb-objective-adapter.ts",import.meta.url),"utf8");

  assert.match(sync,/syncWeaponsToFixedHotbar\(inv,weapons,isWeaponItem\)/);
  assert.match(game,/sanitizeFixedHotbarInventory\(inv/);
  assert.match(adapter,/ensureFixedHotbarItem\(inv,\s*new ItemStack\(BOMB_ITEM\),\s*"DROPPABLE_OBJECTIVE"\)/);
  assert.doesNotMatch(adapter,/DEFUSE_KIT_ITEM|giveDefuseKit/);
  assert.match(inventory,/lockModeForWeapon/);
  assert.match(inventory,/FIXED_HOTBAR_LAYOUT\.tactical/);
});

test("HUD updates do not inject an arbitrary round result field",()=>{
  const updateHud=method("private updateHud","private clearHud");
  assert.doesNotMatch(updateHud,/roundResult/);
});

test("scoreboard and ActionBar HUD are published only to joined match players",()=>{
  const updateHud=method("private updateHud","private playerHudSnapshot");
  assert.match(updateHud,/if\(!ps\?\.connected\|\|!ps\.joined\)\{this\.clearPlayerHud\(p\);continue;\}/);
  const recipientGate=updateHud.indexOf("!ps?.connected||!ps.joined");
  assert.ok(recipientGate>=0&&recipientGate<updateHud.lastIndexOf("setTitle(title)"));
  assert.ok(recipientGate<updateHud.indexOf("setActionBar(actionBar)"));
});

test("match end invalidates the FCAB data bus before stopping its heartbeat",()=>{
  const clearPlayerHud=method("private clearPlayerHud","private clearHud");
  const clearHud=method("private clearHud","private enforceBoundaries");
  assert.match(clearPlayerHud,/setActionBar\(inactivePlayerHudFrame\(\)\)/);
  assert.match(clearHud,/this\.clearPlayerHud\(p\)/);
  assert.match(clearHud,/this\.playerHud\.clear\(\)/);
});

test("in-game text notifications target joined match players instead of the world",()=>{
  const transition=method("private applyBombTransition","private dropBomb");
  const apply=method("private applyLifecycle","private applyRoundStart");
  const roundStart=method("private applyRoundStart","private cleanupRoundObjectives");
  assert.match(transition,/this\.sendMatchMessage\(`§cBomb planted/);
  assert.match(transition,/this\.sendMatchMessage\("§eBomb dropped/);
  assert.match(apply,/this\.sendMatchMessage\("§aGO!"\)/);
  assert.match(apply,/this\.sendMatchMessage\(`§6\$\{effect\.winner\} wins/);
  assert.match(apply,/this\.sendMatchMessage\(`§6Match result/);
  assert.match(roundStart,/this\.sendMatchMessage\(`§eRound/);
  for(const section of [transition,apply,roundStart])assert.doesNotMatch(section,/world\.sendMessage/);
});

test("spectator mode hides the weapon HUD even if persisted alive state is stale",()=>{
  const playerHudSnapshot=method("private playerHudSnapshot","private clearHud");
  assert.match(playerHudSnapshot,/player\.getGameMode\(\)===GameMode\.Spectator/);
  assert.match(playerHudSnapshot,/held:"WNN",magazine:0,reserve:0/);
});

test("round 8 starts with the side-switch money reset",()=>{
  const startRound=method("private startRound","private goLive");
  assert.match(startRound,/this\.lifecycle\.startRound\(this\.state\)/);
  assert.match(lifecycle,/state\.round\s*===\s*this\.config\.roundsPerHalf\s*\+\s*1/);
  assert.match(lifecycle,/resetMoneyForSideSwitch\(state,\s*this\.config\)/);
});

test("round end removes every ground item without removing the planted objective",()=>{
  const endRound=method("private applyLifecycle","private applyRoundStart");
  const cleanup=method("private cleanupRoundObjectives","private cleanupWorld");
  const groundItems=method("private removeGroundItems","private giveRequiredRoundItem");

  assert.match(endRound,/this\.removeGroundItems\(\)/);
  assert.match(cleanup,/this\.removeGroundItems\(\)/);
  assert.match(groundItems,/getEntities\(\{type:"minecraft:item"\}\)/);
  const bombAdapter=readFileSync(new URL("../src/bomb-objective-adapter.ts",import.meta.url),"utf8");
  assert.match(bombAdapter,/getEntities\(\{ type: DROPPED_BOMB \}\)/);
  assert.match(groundItems,/getEntities\(\{type:DROPPED_WEAPON\}\)/);
  assert.match(groundItems,/entity\.remove\(\)/);
  assert.doesNotMatch(groundItems,/entity\.kill\(\)/);
});

test("dropped weapons cannot re-enter inventories outside active combat",()=>{
  const pickup=method("private tickWeaponDrops","private role");
  assert.match(pickup,/this\.state\.phase!=="LIVE"&&this\.state\.phase!=="BOMB_PLANTED"/);
  assert.match(pickup,/return/);
});

test("match end clears combat items after world cleanup and retains the scoreboard until reset",()=>{
  const endMatch=method("private endMatch","private cleanupRoundObjectives");
  const cleanupWorld=method("private cleanupWorld","private onScriptEvent");

  assert.match(endMatch,/this\.cleanupWorld\(\)/);
  assert.match(endMatch,/clearMatchItems\(p,true\)/);
  assert.match(endMatch,/this\.resetScoreboard\(\);this\.state=resetState\(\)/);
  assert.match(cleanupWorld,/this\.cleanupRoundObjectives\(\)/);
});

test("each round result banner uses a snapshot of the round's team roles",()=>{
  const endRound=method("private endRound","private nextRound");
  const apply=method("private applyLifecycle","private applyRoundStart");
  const sender=method("private sendRoundResultBanners","private clearInteractions");
  assert.match(endRound,/this\.lifecycle\.endRound\(this\.state,winner,reason\)/);
  assert.match(lifecycle,/const roles\s*=\s*this\.captureCurrentRoles\(state\)/);
  assert.match(apply,/this\.sendRoundResultBanners\(effect\.winner,effect\.roles\)/);
  assert.match(sender,/const role=roles\.get\(player\.id\)/);
  assert.match(sender,/resultBannerForRole\(role,winner\)/);
  assert.doesNotMatch(sender,/this\.role\(player\.id\)/);
  assert.match(apply,/this\.sendRoundAchievements\(effect\.achievements,effect\.winner,effect\.roles\)/);
});

test("round achievement tracking records kills, deaths, and last-survivor transitions per round",()=>{
  const leave=method("private onLeave","private onDeath");
  const death=method("private onDeath","private onEntitySpawn");
  assert.match(lifecycle,/this\.roundKills\.clear\(\)/);
  assert.match(lifecycle,/this\.roundAlivePlayers\s*=\s*\{\s*T:\s*new Set\(\),\s*CT:\s*new Set\(\)\s*\}/);
  assert.match(lifecycle,/this\.roundClutchCandidates\s*=\s*\{\s*T:\s*undefined,\s*CT:\s*undefined\s*\}/);
  assert.match(leave,/this\.lifecycle\.recordLeave\(this\.state,e\.playerId\)/);
  assert.match(death,/this\.state\.phase==="FREEZE"\|\|this\.state\.phase==="LIVE"\|\|this\.state\.phase==="BOMB_PLANTED"/);
  assert.match(death,/this\.lifecycle\.recordDeath\(this\.state/);
  assert.match(lifecycle,/victims\.add\(input\.victimId\)/);
  assert.match(lifecycle,/before\s*>=\s*2\s*&&\s*victimAlive\.size\s*===\s*1/);
});

test("round achievements are sent only to the winning role so the losing role keeps defeat",()=>{
  const achievements=method("private sendRoundAchievements","private captureCurrentRoundRoles");
  const roleSender=method("private sendBannerToRole","private sendRoundResultBanners");
  assert.match(achievements,/this\.sendBannerToRole\("ACE",winner,roles\)/);
  assert.match(achievements,/this\.sendBannerToRole\("FLAWLESS",winner,roles\)/);
  assert.match(achievements,/this\.sendBannerToRole\("CLUTCH",winner,roles\)/);
  assert.doesNotMatch(achievements,/this\.sendBanner\("ACE"\)|this\.sendBanner\("FLAWLESS"\)|this\.sendBanner\("CLUTCH"\)/);
  assert.match(roleSender,/roles\.get\(player\.id\)===target/);
  assert.match(roleSender,/player\.sendMessage\(message\)/);
});

test("map voting cannot be restarted over an active round",()=>{
  const beginVote=method("async beginVote","private startRound");
  assert.match(beginVote,/this\.lifecycle\.beginMapVote\(this\.state\)/);
  assert.match(lifecycle,/if\s*\(state\.phase\s*!==\s*"LOBBY"\)/);
});

test("map voting only opens for players who selected a team",()=>{
  const beginVote=method("async beginVote","private startRound");
  assert.match(beginVote,/world\.getAllPlayers\(\)\.filter\(p=>this\.ps\(p\.id\)\?\.joined\)/);
  assert.match(beginVote,/Promise\.all\(voters\.map\(async p=>/);
});

test("startup recovery finishes before the game tick can advance a persisted round",()=>{
  const start=method("start(): void","private recover");
  const recoverAt=start.indexOf("this.recover()");
  const intervalAt=start.indexOf("system.runInterval(() => this.tick(),1)");
  assert.ok(recoverAt>=0&&intervalAt>recoverAt);
});

test("recovery validates state before reconciling players and restores a valid lobby mode",()=>{
  const recover=method("private recover","private onSpawn");
  const clearAt=recover.indexOf("this.clearInteractions()");
  const validateAt=recover.indexOf("!this.currentMap()");
  const playersAt=recover.indexOf("for (const p of world.getAllPlayers())");
  assert.ok(clearAt>=0&&validateAt>clearAt&&playersAt>validateAt);
  assert.match(recover,/this\.state=this\.bombObjective\.recover\(this\.state\)/);
  assert.match(recover,/setAdventure\(p\)/);
  assert.match(recover,/this\.giveLobbyTools\(p\)/);
});

test("an awaited map vote expires after reset or match stop",()=>{
  const beginVote=method("async beginVote","private startRound");
  const responseAt=beginVote.indexOf("await Promise.all");
  const guardAt=beginVote.indexOf('this.state!==voteState||this.state.phase!=="MAP_VOTE"');
  const startAt=beginVote.indexOf("this.startRound()");
  assert.match(beginVote,/const voteState=this\.state/);
  assert.ok(responseAt>=0&&guardAt>responseAt&&startAt>guardAt);
  const cleanup=method("private cleanupWorld","private onScriptEvent");
  assert.match(cleanup,/closeAllPlayerForms\(world\.getAllPlayers\(\)\)/);
});

test("map voting returns safely to the lobby if a team disconnects",()=>{
  const beginVote=method("async beginVote","private startRound");
  const responseAt=beginVote.indexOf("await Promise.all");
  const recheckAt=beginVote.indexOf('completed=this.lifecycle.completeMapVote');
  const lobbyAt=beginVote.indexOf('completed.kind==="RETURNED_TO_LOBBY"',recheckAt);
  assert.ok(responseAt>=0&&recheckAt>responseAt&&lobbyAt>recheckAt);
  assert.match(beginVote.slice(recheckAt),/this\.giveLobbyTools\(p\)/);
  assert.match(lifecycle,/state\.phase\s*=\s*"LOBBY"/);
});

test("shop callers provide a live state accessor so replaced state expires the transaction",()=>{
  const itemUse=method("private onItemUse","private onLeave");
  const admin=game.slice(game.indexOf("private onScriptEvent"));
  assert.match(itemUse,/showShop\(player,\(\)=>this\.state,m\)/);
  assert.match(admin,/showShop\(p,\(\)=>this\.state,m\)/);
});
