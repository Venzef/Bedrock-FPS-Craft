import { equipWeapon, initialLoadout, weaponDefinition } from "./weapons.js";
function activePlayer(state, playerId) {
    const player = state.players.find(candidate => candidate.id === playerId);
    return player && player.connected && player.joined && player.alive && player.activeFromRound <= state.round
        ? player
        : undefined;
}
export function canUseShop(state, playerId, openedRound) {
    return state.phase === "FREEZE" && state.round === openedRound && activePlayer(state, playerId) !== undefined;
}
function validShopItem(item) {
    if (!item || !item.id || !Number.isInteger(item.price) || item.price < 0)
        return undefined;
    if (item.amount !== undefined && (!Number.isInteger(item.amount) || item.amount <= 0))
        return undefined;
    if (item.weaponId !== undefined) {
        try {
            const definition = weaponDefinition(item.weaponId);
            if (definition.slot === "KNIFE" || definition.itemId !== item.id || definition.price !== item.price)
                return undefined;
            return { kind: "weapon", item, definition };
        }
        catch {
            return undefined;
        }
    }
    if (item.armorTier === "ARMOR" || item.armorTier === "ARMOR_SET")
        return { kind: "armor", item };
    if (item.armorTier !== undefined)
        return undefined;
    if (item.defuseKit === true && item.id === "fps:defuse_kit")
        return { kind: "defuse-kit", item };
    if (item.defuseKit !== undefined)
        return undefined;
    return { kind: "item", item };
}
function restoreAfterFailure(target, snapshot, loadoutBefore, loadoutWasTouched) {
    try {
        target.restore(snapshot);
    }
    catch { /* The adapter owns best-effort restoration details. */ }
    if (loadoutWasTouched) {
        try {
            target.setLoadout(loadoutBefore);
        }
        catch { /* The state adapter may have become invalid. */ }
    }
}
/**
 * Deep shop purchase module. Callers provide a session and one target
 * adapter; all eligibility, item, price, and mutation ordering stays here.
 */
export class ShopPurchaseTransaction {
    items;
    constructor(items) {
        this.items = items;
    }
    purchaseTerms(item, target) {
        if (item.kind === "defuse-kit") {
            try {
                return { price: item.item.price, owned: target.hasDefuseKit() };
            }
            catch {
                return undefined;
            }
        }
        if (item.kind !== "armor")
            return { price: item.item.price, owned: false };
        let ownedTier;
        try {
            ownedTier = target.armorTier();
        }
        catch {
            return undefined;
        }
        const desiredTier = item.item.armorTier;
        if (ownedTier === "ARMOR_SET" || (ownedTier === "ARMOR" && desiredTier === "ARMOR")) {
            return { price: 0, owned: true };
        }
        if (ownedTier !== "ARMOR" || desiredTier !== "ARMOR_SET") {
            return { price: item.item.price, owned: false };
        }
        const armor = this.items.find(candidate => candidate.armorTier === "ARMOR");
        if (!armor || armor.price > item.item.price)
            return undefined;
        return { price: item.item.price - armor.price, owned: false };
    }
    quote(selection, money, target) {
        const item = validShopItem(selection === undefined ? undefined : this.items[selection]);
        if (!item)
            return undefined;
        const terms = this.purchaseTerms(item, target);
        if (!terms)
            return undefined;
        return {
            item: item.item,
            price: terms.price,
            buyable: !terms.owned && money >= terms.price,
            owned: terms.owned,
        };
    }
    openSession(state, playerId, inBuyZone) {
        if (state.phase !== "FREEZE")
            return { success: false, reason: "phase-changed" };
        if (!activePlayer(state, playerId))
            return { success: false, reason: "player-inactive" };
        if (!inBuyZone)
            return { success: false, reason: "buy-zone-exited" };
        return { success: true, session: { state, playerId, openedRound: state.round } };
    }
    purchase(session, currentState, selection, target) {
        if (currentState !== session.state)
            return { success: false, reason: "stale-session" };
        if (currentState.phase !== "FREEZE")
            return { success: false, reason: "phase-changed" };
        if (currentState.round !== session.openedRound)
            return { success: false, reason: "round-changed" };
        const player = activePlayer(currentState, session.playerId);
        if (!player)
            return { success: false, reason: "player-inactive" };
        try {
            if (!target.inBuyZone())
                return { success: false, reason: "buy-zone-exited" };
        }
        catch {
            return { success: false, reason: "buy-zone-exited" };
        }
        const item = validShopItem(selection === undefined ? undefined : this.items[selection]);
        if (!item)
            return { success: false, reason: "invalid-shop-item" };
        const terms = this.purchaseTerms(item, target);
        if (!terms)
            return { success: false, reason: "equipment-placement-failed" };
        if (terms.owned)
            return { success: false, reason: "already-owned" };
        if (player.money < terms.price)
            return { success: false, reason: "insufficient-money" };
        let snapshot;
        try {
            snapshot = target.snapshot();
        }
        catch {
            return { success: false, reason: "equipment-placement-failed" };
        }
        const loadoutBefore = player.loadout;
        let loadoutWasTouched = false;
        const fail = (reason) => {
            restoreAfterFailure(target, snapshot, loadoutBefore, loadoutWasTouched);
            return { success: false, reason };
        };
        try {
            let replaced;
            if (item.kind === "weapon") {
                const equipped = equipWeapon(loadoutBefore ?? initialLoadout(), item.item.weaponId);
                const placement = target.placeWeapon(item.definition.itemId, item.definition.slot);
                if (!placement.success)
                    return fail(placement.reason);
                loadoutWasTouched = true;
                if (!target.setLoadout(equipped.loadout))
                    return fail("equipment-placement-failed");
                replaced = equipped.replaced;
                target.commitWeaponReplacement(replaced);
            }
            else if (item.kind === "armor") {
                if (!target.equipArmor(item.item.armorTier))
                    return fail("equipment-placement-failed");
            }
            else if (item.kind === "defuse-kit") {
                if (!target.equipDefuseKit())
                    return fail("equipment-placement-failed");
            }
            else if (!target.giveItem(item.item.id, item.item.amount ?? 1)) {
                return fail("inventory-full");
            }
            player.money -= terms.price;
            return { success: true, price: terms.price, itemId: item.item.id, ...(replaced ? { replaced } : {}) };
        }
        catch {
            return fail("equipment-placement-failed");
        }
    }
}
export function removeItemsByType(container, typeId) {
    let removed = 0;
    for (let index = 0; index < container.size; index++) {
        if (container.getItem(index)?.typeId !== typeId)
            continue;
        container.setItem(index);
        removed++;
    }
    return removed;
}
export class OpenShopSessions {
    players = new Set();
    open(playerId) {
        if (this.players.has(playerId))
            return false;
        this.players.add(playerId);
        return true;
    }
    finish(playerId) { this.players.delete(playerId); }
    has(playerId) { return this.players.has(playerId); }
    close(playerId, closeForm) {
        if (!this.players.delete(playerId))
            return false;
        closeForm();
        return true;
    }
}
