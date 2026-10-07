export interface InventoryItemLike { readonly typeId:string }

/**
 * The concrete Minecraft item keeps the lock mode on the stack.  Keeping the
 * property structural makes InventoryContainerLike useful with an in-memory
 * adapter as well as with the Script API container.
 */
export interface LockableInventoryItemLike extends InventoryItemLike { lockMode?:string; keepOnDeath?:boolean }

export interface InventoryContainerLike<TItem extends InventoryItemLike> {
  readonly size:number;
  getItem(index:number):TItem|undefined;
  setItem(index:number,item?:TItem):void;
}

export type EnsureInventoryItemResult<TItem extends InventoryItemLike> =
  | { success:true; slot:number; displaced?:TItem }
  | { success:false };

export function ensureInventoryItem<TItem extends InventoryItemLike>(
  container:InventoryContainerLike<TItem>,
  item:TItem,
  preferredSlot?:number,
):EnsureInventoryItemResult<TItem> {
  let emptySlot:number|undefined;
  for(let index=0;index<container.size;index++){
    const existing=container.getItem(index);
    if(existing?.typeId===item.typeId)return {success:true,slot:index};
    if(!existing&&emptySlot===undefined)emptySlot=index;
  }
  if(emptySlot!==undefined){container.setItem(emptySlot,item);return {success:true,slot:emptySlot};}
  if(typeof preferredSlot==="number"&&Number.isInteger(preferredSlot)&&preferredSlot>=0&&preferredSlot<container.size){
    const displaced=container.getItem(preferredSlot);
    container.setItem(preferredSlot,item);
    return displaced===undefined
      ? {success:true,slot:preferredSlot}
      : {success:true,slot:preferredSlot,displaced};
  }
  return {success:false};
}

export function ensureItemAtSlot<TItem extends InventoryItemLike>(
  container:InventoryContainerLike<TItem>,
  item:TItem,
  preferredSlot:number,
):EnsureInventoryItemResult<TItem> {
  if(!Number.isInteger(preferredSlot)||preferredSlot<0||preferredSlot>=container.size)return {success:false};
  const matchingSlots:number[]=[];
  for(let index=0;index<container.size;index++){
    if(container.getItem(index)?.typeId===item.typeId)matchingSlots.push(index);
  }
  if(matchingSlots.includes(preferredSlot)){
    for(const index of matchingSlots)if(index!==preferredSlot)container.setItem(index);
    return {success:true,slot:preferredSlot};
  }
  const sourceSlot=matchingSlots[0];
  const displaced=container.getItem(preferredSlot);
  if(sourceSlot!==undefined){
    const sourceItem=container.getItem(sourceSlot);
    if(!sourceItem)return {success:false};
    for(const index of matchingSlots)if(index!==sourceSlot)container.setItem(index);
    container.setItem(sourceSlot);
    container.setItem(preferredSlot,sourceItem);
  }else{
    container.setItem(preferredSlot,item);
  }
  return displaced===undefined
    ? {success:true,slot:preferredSlot}
    : {success:true,slot:preferredSlot,displaced};
}

/**
 * The match hotbar is deliberately defined here, beside the container seam.
 * These are Script API indexes; the visible HUD numbers are index + 1.
 */
export const FIXED_HOTBAR_LAYOUT = {
  size:9,
  primary:0,
  secondary:1,
  knife:2,
  tactical:[3,4,5,6] as const,
  objective:7,
  shopAccess:8,
} as const;

export const FIXED_HOTBAR_ITEM_TYPES = {
  shopAccess:"minecraft:emerald",
  scoreboard:"fps:scoreboard",
} as const;

export type FixedHotbarWeaponSlot = "PRIMARY"|"SECONDARY"|"KNIFE";
export type FixedHotbarItemKind = "OBJECTIVE"|"DROPPABLE_OBJECTIVE"|"SHOP_ACCESS"|"SCOREBOARD";
export type FixedHotbarWeapon<TItem extends LockableInventoryItemLike> = {
  slot:FixedHotbarWeaponSlot;
  item:TItem;
};

export interface FixedHotbarSanitizePolicy {
  isWeaponItem:(typeId:string)=>boolean;
  expectedWeaponType:(slot:FixedHotbarWeaponSlot)=>string|undefined;
  isMatchItem:(typeId:string)=>boolean;
  isObjectiveItem:(typeId:string)=>boolean;
  isDroppableObjectiveItem:(typeId:string)=>boolean;
  isShopAccessItem:(typeId:string)=>boolean;
}

const LOCK_NONE="none";
const LOCK_SLOT="slot";

export function fixedHotbarSlotForWeapon(slot:FixedHotbarWeaponSlot):number {
  if(slot==="PRIMARY")return FIXED_HOTBAR_LAYOUT.primary;
  if(slot==="SECONDARY")return FIXED_HOTBAR_LAYOUT.secondary;
  return FIXED_HOTBAR_LAYOUT.knife;
}

export function fixedHotbarWeaponSlotAt(index:number):FixedHotbarWeaponSlot|undefined {
  if(index===FIXED_HOTBAR_LAYOUT.primary)return "PRIMARY";
  if(index===FIXED_HOTBAR_LAYOUT.secondary)return "SECONDARY";
  if(index===FIXED_HOTBAR_LAYOUT.knife)return "KNIFE";
  return undefined;
}

function fixedHotbarSlotForItem(kind:FixedHotbarItemKind):number {
  if(kind==="SCOREBOARD")return FIXED_HOTBAR_LAYOUT.tactical[0];
  return kind==="SHOP_ACCESS" ? FIXED_HOTBAR_LAYOUT.shopAccess : FIXED_HOTBAR_LAYOUT.objective;
}

function lockModeForWeapon(slot:FixedHotbarWeaponSlot):string {
  return slot==="KNIFE" ? LOCK_SLOT : LOCK_NONE;
}

function setLockMode<TItem extends LockableInventoryItemLike>(item:TItem,lockMode:string):TItem {
  item.lockMode=lockMode;
  return item;
}

/**
 * Places a match item in its semantic fixed slot.  The generic
 * ensureItemAtSlot implementation supplies the important behaviour: an
 * existing copy is reused, duplicates are removed, and a displaced item is
 * returned to the caller for world-dropping. The bomb uses no item lock so a
 * carrier can hand it to a teammate; other objective items remain locked.
 */
export function ensureFixedHotbarItem<TItem extends LockableInventoryItemLike>(
  container:InventoryContainerLike<TItem>,
  item:TItem,
  kind:FixedHotbarItemKind,
):EnsureInventoryItemResult<TItem> {
  const result=ensureItemAtSlot(container,item,fixedHotbarSlotForItem(kind));
  if(!result.success)return result;
  const placed=container.getItem(result.slot);
  if(placed){
    if(kind==="SCOREBOARD")placed.keepOnDeath=true;
    container.setItem(result.slot,setLockMode(placed,kind==="DROPPABLE_OBJECTIVE"?LOCK_NONE:LOCK_SLOT));
  }
  return result;
}

export function ensureWeaponInFixedHotbar<TItem extends LockableInventoryItemLike>(
  container:InventoryContainerLike<TItem>,
  item:TItem,
  slot:FixedHotbarWeaponSlot,
):EnsureInventoryItemResult<TItem> {
  const result=ensureItemAtSlot(container,item,fixedHotbarSlotForWeapon(slot));
  if(!result.success)return result;
  const placed=container.getItem(result.slot);
  if(placed)container.setItem(result.slot,setLockMode(placed,lockModeForWeapon(slot)));
  return result;
}

/**
 * Reconciles the weapon and reservation portion of the fixed hotbar.  Weapon
 * stacks are droppable, while the knife is locked to its slot. Scoreboard, objective and
 * shop stacks are deliberately preserved: a dropped weapon can be recovered
 * while its carrier is still carrying a fixed objective item.
 */
export function syncWeaponsToFixedHotbar<TItem extends LockableInventoryItemLike>(
  container:InventoryContainerLike<TItem>,
  weapons:readonly FixedHotbarWeapon<TItem>[],
  isWeaponItem:(typeId:string)=>boolean,
):void {
  for(let index=0;index<container.size;index++){
    if(isWeaponItem(container.getItem(index)?.typeId??""))container.setItem(index);
  }
  for(let index=0;index<FIXED_HOTBAR_LAYOUT.objective;index++){
    if(index===FIXED_HOTBAR_LAYOUT.tactical[0]&&container.getItem(index)?.typeId===FIXED_HOTBAR_ITEM_TYPES.scoreboard)continue;
    container.setItem(index);
  }
  for(const weapon of weapons){
    const slot=fixedHotbarSlotForWeapon(weapon.slot);
    if(slot>=container.size)continue;
    container.setItem(slot,setLockMode(weapon.item,lockModeForWeapon(weapon.slot)));
  }
}

/**
 * Reconciles weapon copies and the reserved tactical area without knowing
 * anything about Game, rounds, or Minecraft.  Objective and shop items that
 * are elsewhere are intentionally left for ensureFixedHotbarItem: the bomb
 * objective owns whether an item is currently allowed to exist.
 */
export function sanitizeFixedHotbarInventory<TItem extends LockableInventoryItemLike>(
  container:InventoryContainerLike<TItem>,
  policy:FixedHotbarSanitizePolicy,
):void {
  const keptWeaponTypes=new Set<string>();
  for(let index=0;index<container.size;index++){
    const item=container.getItem(index);if(!item)continue;
    if(item.typeId===FIXED_HOTBAR_ITEM_TYPES.scoreboard){
      if(index===FIXED_HOTBAR_LAYOUT.tactical[0]){item.keepOnDeath=true;container.setItem(index,setLockMode(item,LOCK_SLOT));}
      else container.setItem(index);
      continue;
    }
    if((FIXED_HOTBAR_LAYOUT.tactical as readonly number[]).includes(index)){
      container.setItem(index);continue;
    }
    if(policy.isWeaponItem(item.typeId)){
      const slot=fixedHotbarWeaponSlotAt(index);
      const expected=slot&&policy.expectedWeaponType(slot);
      if(!slot||!expected||expected!==item.typeId||keptWeaponTypes.has(item.typeId)){
        container.setItem(index);continue;
      }
      keptWeaponTypes.add(item.typeId);
      container.setItem(index,setLockMode(item,lockModeForWeapon(slot)));
      continue;
    }
    if(!policy.isMatchItem(item.typeId)){
      container.setItem(index);continue;
    }
    if(index===FIXED_HOTBAR_LAYOUT.objective&&policy.isObjectiveItem(item.typeId)){
      container.setItem(index,setLockMode(item,policy.isDroppableObjectiveItem(item.typeId)?LOCK_NONE:LOCK_SLOT));
    }else if(index===FIXED_HOTBAR_LAYOUT.shopAccess&&policy.isShopAccessItem(item.typeId)){
      container.setItem(index,setLockMode(item,LOCK_SLOT));
    }
  }
}
