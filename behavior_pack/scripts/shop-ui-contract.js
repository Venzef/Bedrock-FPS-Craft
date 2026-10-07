export const SHOP_UI_CONTRACT = Object.freeze({
    titlePrefix: "fps_shop:",
    screenId: "main",
    buyableMarker: "BUYABLE:",
    lockedMarker: "LOCKED:",
    hiddenMarker: "HIDDEN:",
    slotCount: 27,
});
export function getShopFormTitle() {
    return `${SHOP_UI_CONTRACT.titlePrefix}${SHOP_UI_CONTRACT.screenId}`;
}
export function encodeShopButtonText(item, buyable) {
    const marker = buyable ? SHOP_UI_CONTRACT.buyableMarker : SHOP_UI_CONTRACT.lockedMarker;
    return `${marker}${item.name}`;
}
export function buildShopUiSlots(items) {
    const slots = Array(SHOP_UI_CONTRACT.slotCount).fill(undefined);
    const itemIds = new Set();
    items.forEach((item, itemIndex) => {
        if (!item.id || itemIds.has(item.id))
            throw new Error(`Duplicate or empty shop item id: ${item.id}`);
        itemIds.add(item.id);
        if (!Number.isInteger(item.uiIndex) || item.uiIndex < 0 || item.uiIndex >= slots.length) {
            throw new Error(`Invalid shop uiIndex for ${item.id}: ${item.uiIndex}`);
        }
        if (!item.texture)
            throw new Error(`Missing shop texture for ${item.id}`);
        if (slots[item.uiIndex])
            throw new Error(`Duplicate shop uiIndex: ${item.uiIndex}`);
        slots[item.uiIndex] = Object.freeze({ item, itemIndex });
    });
    return Object.freeze(slots);
}
