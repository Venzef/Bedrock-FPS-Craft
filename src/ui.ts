import { ActionFormData, uiManager, type ActionFormResponse } from "@minecraft/server-ui";
import { system, type Player } from "@minecraft/server";
import { MATCH_CONFIG, SHOP } from "./config.js";
import { canJoinTeam } from "./rules.js";
import { OpenShopSessions, ShopPurchaseTransaction, canUseShop } from "./shop.js";
import { createMinecraftShopPurchaseTarget } from "./shop-minecraft-adapter.js";
import {
  SHOP_UI_CONTRACT,
  buildShopUiSlots,
  encodeShopButtonText,
  getShopFormTitle,
} from "./shop-ui-contract.js";
import type { MapDefinition, PersistedMatchState, Team } from "./types.js";

const openShopSessions=new OpenShopSessions();
const shopPurchase=new ShopPurchaseTransaction(SHOP);
const shopUiSlots=buildShopUiSlots(SHOP);

function nextTick():Promise<void>{
  return new Promise(resolve=>system.run(resolve));
}

export function closeOpenShopForms(players:readonly Player[]):void {
  for(const player of players){
    try { openShopSessions.close(player.id,()=>uiManager.closeAllForms(player)); }
    catch { /* A player can leave while the form is being closed. */ }
  }
}

export function closeAllPlayerForms(players:readonly Player[]):void {
  for(const player of players){
    openShopSessions.finish(player.id);
    try { uiManager.closeAllForms(player); }
    catch { /* A player can leave while the form is being closed. */ }
  }
}

export async function showTeamMenu(player: Player, state: PersistedMatchState): Promise<boolean> {
  const current = state.players.find(p => p.id === player.id);
  const t = state.players.filter(p => p.joined && p.squad === "T").length;
  const ct = state.players.filter(p => p.joined && p.squad === "CT").length;
  const response = await new ActionFormData().title("fps.ui.team").body(`T ${t}/5  |  CT ${ct}/5`).button("fps.team.t").button("fps.team.ct").show(player);
  if (response.canceled || response.selection === undefined) return false;
  const requested: Team = response.selection === 0 ? "T" : "CT";
  const oldT = t - (current?.joined && current.squad === "T" ? 1 : 0), oldCt = ct - (current?.joined && current.squad === "CT" ? 1 : 0);
  if (!canJoinTeam(oldT, oldCt, requested, MATCH_CONFIG.maxPlayersPerTeam, MATCH_CONFIG.maxTeamDifference)) { player.sendMessage("§cTeam is full or unbalanced / 팀 정원 또는 균형 조건을 충족하지 않습니다."); return false; }
  if (current) { current.squad = requested; current.joined = true; }
  return true;
}

export async function showVote(player: Player, maps: MapDefinition[]): Promise<string|undefined> {
  const form = new ActionFormData().title("fps.ui.vote");
  maps.forEach(m => form.button(m.nameKey));
  try {
    const response = await form.show(player);
    return response.canceled || response.selection === undefined ? undefined : maps[response.selection]?.id;
  } catch { return undefined; }
}

export async function showShop(player: Player, getState:()=>PersistedMatchState, map: MapDefinition): Promise<void> {
  const state=getState();
  const openingTarget=createMinecraftShopPurchaseTarget(player,state,map);
  const opened=shopPurchase.openSession(state,player.id,openingTarget.inBuyZone());
  if(!opened.success){
    if(opened.reason==="buy-zone-exited")player.sendMessage("§cBuy zone only / 구매 구역에서만 가능합니다.");
    return;
  }
  if(!openShopSessions.open(player.id))return;
  try {
    while(openShopSessions.has(player.id)){
      const currentState=getState();
      if(currentState!==opened.session.state||!canUseShop(currentState,player.id,opened.session.openedRound))return;
      const ps=currentState.players.find(candidate=>candidate.id===player.id);if(!ps)return;
      const currentTarget=createMinecraftShopPurchaseTarget(player,currentState,map);
      try {
        if(!currentTarget.inBuyZone()){
          player.sendMessage("§cBuy zone only / 구매 구역에서만 가능합니다.");
          return;
        }
      } catch { return; }

      const form=new ActionFormData().title(getShopFormTitle());
      for(const slot of shopUiSlots){
        if(!slot){
          form.button(SHOP_UI_CONTRACT.hiddenMarker);
          continue;
        }
        const quote=shopPurchase.quote(slot.itemIndex,ps.money,currentTarget);
        form.button(encodeShopButtonText(slot.item,quote?.buyable===true),slot.item.texture!);
      }

      let response:ActionFormResponse;
      try { response=await form.show(player); }
      catch { return; }
      if(response.canceled||response.selection===undefined)return;

      // Bedrock may restrict Scoreboard/Inventory writes in the form response callback.
      await nextTick();
      if(!openShopSessions.has(player.id))return;
      const selected=shopUiSlots[response.selection];
      if(!selected)continue;

      const latestState=getState();
      const result=shopPurchase.purchase(
        opened.session,
        latestState,
        selected.itemIndex,
        createMinecraftShopPurchaseTarget(player,latestState,map),
      );
      if(result.success){
        const money=latestState.players.find(candidate=>candidate.id===player.id)?.money;
        player.sendMessage(`§a${selected.item.name} purchased / 구매 완료 §7(-$${result.price}, $${money??0})`);
      }else if(result.reason==="insufficient-money"){
        player.sendMessage("§cNot enough money / 자금이 부족합니다.");
      }else if(result.reason==="already-owned"){
        player.sendMessage("§eAlready owned / 이미 보유한 방어구입니다.");
      }else if(result.reason==="inventory-full"){
        player.sendMessage("§cInventory full / 인벤토리가 가득 찼습니다.");
      }else if(result.reason==="buy-zone-exited"){
        player.sendMessage("§cBuy zone only / 구매 구역에서만 가능합니다.");
        return;
      }else if(["stale-session","phase-changed","round-changed","player-inactive"].includes(result.reason)){
        return;
      }

      // Reopen on a separate tick so the updated money and price colors are visible.
      await nextTick();
    }
  } finally {
    openShopSessions.finish(player.id);
  }
}
