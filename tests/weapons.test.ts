import assert from "node:assert/strict";
import test from "node:test";
import { WEAPONS, canFire, canStartReload, completeReload, consumeShot, createWeaponState, equipWeapon, fireWeapon, initialLoadout, refillAtBuyPhase, shouldKeepWeaponItem, weaponDefinition } from "../src/weapons";

test("the first weapon registry exposes five guns and the fixed knife",()=>{
  assert.deepEqual(WEAPONS.map(weapon=>weapon.id),["W05","W04","W00","W03","W02","W14"]);
  assert.equal(weaponDefinition("W00").name,"AK47");
  assert.equal(weaponDefinition("W02").name,"AWP");
  assert.equal(weaponDefinition("W03").name,"Bulldog");
  assert.equal(weaponDefinition("W04").name,"UMP");
  assert.equal(weaponDefinition("W05").name,"USP");
  assert.equal(weaponDefinition("W14").name,"Knife");
});

test("a shot consumes one round from the magazine without mutating the source state",()=>{
  const before=createWeaponState("W05");
  const after=consumeShot(before);

  assert.deepEqual(before,{id:"W05",magazine:12,reserve:48});
  assert.deepEqual(after,{id:"W05",magazine:11,reserve:48});
  assert.equal(consumeShot({id:"W05",magazine:0,reserve:48}),undefined);
});

test("reload transfers only the needed reserve rounds into the magazine",()=>{
  assert.deepEqual(completeReload({id:"W05",magazine:2,reserve:5}),{
    id:"W05",magazine:7,reserve:0,
  });
  assert.deepEqual(completeReload({id:"W05",magazine:10,reserve:5}),{
    id:"W05",magazine:12,reserve:3,
  });
});

test("buy phase refill restores carried guns and preserves the fixed knife",()=>{
  const loadout=initialLoadout();
  loadout.primary={id:"W00",magazine:1,reserve:2};
  loadout.secondary={id:"W05",magazine:0,reserve:0};

  assert.deepEqual(refillAtBuyPhase(loadout),{
    primary:{id:"W00",magazine:30,reserve:90},
    secondary:{id:"W05",magazine:12,reserve:48},
    knife:{id:"W14",magazine:0,reserve:0},
  });
  assert.deepEqual(loadout.primary,{id:"W00",magazine:1,reserve:2});
});

test("buying a weapon replaces only its slot and returns the old weapon state",()=>{
  const loadout=initialLoadout();
  loadout.primary={id:"W02",magazine:4,reserve:12};
  loadout.secondary={id:"W05",magazine:3,reserve:9};

  const result=equipWeapon(loadout,"W04");

  assert.deepEqual(result.replaced,{id:"W02",magazine:4,reserve:12});
  assert.deepEqual(result.loadout.primary,{id:"W04",magazine:30,reserve:120});
  assert.deepEqual(result.loadout.secondary,{id:"W05",magazine:3,reserve:9});
  assert.deepEqual(loadout.primary,{id:"W02",magazine:4,reserve:12});
});

test("reload starts only for a live loaded gun held by its owner",()=>{
  const weapon={id:"W05" as const,magazine:3,reserve:10};
  const allowed={phase:"LIVE" as const,alive:true,weapon,heldWeaponId:"W05" as const};

  assert.equal(canStartReload(allowed),true);
  assert.equal(canStartReload({...allowed,phase:"FREEZE"}),false);
  assert.equal(canStartReload({...allowed,phase:"ROUND_END"}),false);
  assert.equal(canStartReload({...allowed,heldWeaponId:"W14"}),false);
  assert.equal(canStartReload({...allowed,weapon:{...weapon,magazine:12}}),false);
  assert.equal(canStartReload({...allowed,weapon:{...weapon,reserve:0}}),false);
});

test("firing respects phase, reload lock, magazine and per-weapon interval",()=>{
  const weapon={id:"W04" as const,magazine:3,reserve:10};
  const allowed={phase:"LIVE" as const,alive:true,weapon,heldWeaponId:"W04" as const,nowTick:100,lastFiredTick:98};

  assert.equal(canFire(allowed),true);
  assert.equal(canFire({...allowed,nowTick:99}),false);
  assert.equal(canFire({...allowed,phase:"FREEZE"}),false);
  assert.equal(canFire({...allowed,reload:{phase:3,weaponId:"W04",progressTicks:2}}),false);
  assert.equal(canFire({...allowed,weapon:{...weapon,magazine:0}}),false);
  assert.equal(canFire({...allowed,phase:"ROUND_END"}),true);

  const fired=fireWeapon(allowed);
  assert.deepEqual(fired,{weapon:{id:"W04",magazine:2,reserve:10},pelletCount:1,nextFireTick:102});
  assert.deepEqual(weapon,{id:"W04",magazine:3,reserve:10});
});

test("inventory validation does not re-add a missing weapon",()=>{
  const loadout=initialLoadout();
  loadout.primary=createWeaponState("W04");
  assert.equal(shouldKeepWeaponItem(loadout,0,"fps:gun_vector"),true);
  assert.equal(shouldKeepWeaponItem(loadout,1,"fps:gun_vector"),false);
  assert.equal(shouldKeepWeaponItem(loadout,0,"fps:gun_ranger"),false);
  assert.equal(shouldKeepWeaponItem(loadout,0,"fps:gun_sidearm"),false);
});
