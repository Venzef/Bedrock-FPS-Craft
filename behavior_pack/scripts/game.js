import { EntityComponentTypes, GameMode, ItemStack, Player, system, world } from "@minecraft/server";
import { buildArenas, validateMaps } from "./arena.js";
import { bannerMessage, resultBannerForRole } from "./banner.js";
import { MAPS, MATCH_CONFIG } from "./config.js";
import { FIXED_HOTBAR_LAYOUT, FIXED_HOTBAR_ITEM_TYPES, ensureFixedHotbarItem, sanitizeFixedHotbarInventory, syncWeaponsToFixedHotbar } from "./inventory.js";
import { BOMB_ITEM, BombObjective } from "./bomb-objective.js";
import { MinecraftBombObjectiveAdapter } from "./bomb-objective-adapter.js";
import { activeFromRoundAfterSpawn, movementPermissionsFor, scoreForRole, shouldApplyDelayedSpectator } from "./rules.js";
import { formatHudTitle, inactivePlayerHudFrame, interactionGlyphFrame, PlayerHudComposer } from "./hud.js";
import { isCombatActionAllowed } from "./input-policy.js";
import { ensurePlayer, loadState, resetState, saveState } from "./state.js";
import { removeItemsByType } from "./shop.js";
import { CombatExecution } from "./combat-execution.js";
import { MinecraftCombatAdapter } from "./minecraft-combat-adapter.js";
import { WEAPONS, initialLoadout, isWeaponItem, refillAtBuyPhase, weaponDefinition, weaponIdFromItemType, weaponState, withWeaponState } from "./weapons.js";
import { applyPlayerMovementPermissions, clearMatchItems, distanceSquared, inBox, inventory, isMatchItem, setAdventure, setSpectator } from "./utils.js";
import { closeAllPlayerForms, closeOpenShopForms, showShop, showTeamMenu, showVote } from "./ui.js";
import { RoundLifecycle } from "./round-lifecycle.js";
import { createKillLogForKill, isKillLogRecipient } from "./killLog/killLog.js";
import { ScoreboardLedger } from "./scoreboard/ledger.js";
import { scoreboardTitle } from "./scoreboard/wire.js";
const BOMB = BOMB_ITEM, SHOP_ACCESS_ITEM = FIXED_HOTBAR_ITEM_TYPES.shopAccess;
const DROPPED_WEAPON = "fps:dropped_weapon", DROPPED_WEAPON_TAG = "fps:dropped_weapon";
export class Game {
    state = loadState();
    lifecycle = new RoundLifecycle(MATCH_CONFIG);
    scoreboard = new ScoreboardLedger();
    scoreboardTitles = new Set();
    bombAdapter = new MinecraftBombObjectiveAdapter();
    bombObjective = new BombObjective(this.bombAdapter, { ...MATCH_CONFIG, repickupBlockTicks: 20, droppedBombBounceDistance: 2.5 });
    combatAdapter = new MinecraftCombatAdapter({
        recordDamage: (victim, attacker, damage) => this.recordScoreboardDamage(victim, attacker, damage),
        getPhase: () => this.state.phase,
        getPlayerState: id => {
            const ps = this.ps(id);
            return ps ? { alive: ps.alive, role: this.role(id), loadout: ps.loadout } : undefined;
        },
        setLoadout: (id, loadout) => {
            const ps = this.ps(id);
            if (ps)
                ps.loadout = loadout;
        },
    });
    combat = new CombatExecution(this.combatAdapter);
    playerHud = new PlayerHudComposer();
    votes = new Map();
    dirtyTicks = 0;
    hudActive = false;
    leaveLocations = new Map();
    currentMap() { return MAPS.find(m => m.id === this.state.mapId); }
    player(id) { return id ? world.getAllPlayers().find(p => p.id === id) : undefined; }
    ps(id) { return this.state.players.find(p => p.id === id); }
    ensureLoadout(id) {
        const ps = this.ps(id);
        if (!ps)
            throw new Error(`Unknown player: ${id}`);
        ps.loadout ??= initialLoadout();
        return ps.loadout;
    }
    heldWeapon(player) {
        return weaponIdFromItemType(inventory(player)?.getItem(player.selectedSlotIndex)?.typeId ?? "");
    }
    stateForHeld(player) {
        const id = this.heldWeapon(player);
        if (!id)
            return undefined;
        return weaponState(this.ensureLoadout(player.id), id);
    }
    heldItemId(player) {
        return inventory(player)?.getItem(player.selectedSlotIndex)?.typeId ?? "";
    }
    scoreboardPlayers() {
        return this.state.players.filter(p => p.joined && p.connected).map(p => ({
            id: p.id, name: p.name, role: this.role(p.id), alive: p.alive, money: p.money,
        })).filter(p => p.role !== undefined);
    }
    syncScoreboardPlayers() {
        for (const p of world.getAllPlayers()) {
            const ps = this.ps(p.id), inv = inventory(p);
            if (!inv)
                continue;
            if (!ps?.joined || !ps.connected) {
                removeItemsByType(inv, FIXED_HOTBAR_ITEM_TYPES.scoreboard);
                continue;
            }
            this.scoreboard.join(p.id);
            const existing = inv.getItem(FIXED_HOTBAR_LAYOUT.tactical[0]);
            if (existing?.typeId === FIXED_HOTBAR_ITEM_TYPES.scoreboard && existing.lockMode === "slot" && existing.keepOnDeath)
                continue;
            const result = ensureFixedHotbarItem(inv, new ItemStack(FIXED_HOTBAR_ITEM_TYPES.scoreboard), "SCOREBOARD");
            if (result.success && result.displaced)
                p.dimension.spawnItem(result.displaced, p.location);
        }
    }
    recordScoreboardDamage(victimId, attackerId, damage) {
        if (!["FREEZE", "LIVE", "BOMB_PLANTED", "ROUND_END"].includes(this.state.phase))
            return;
        const players = this.scoreboardPlayers(), victim = players.find(p => p.id === victimId), attacker = players.find(p => p.id === attackerId);
        if (victim && attacker)
            this.scoreboard.recordDamage(victim, attacker, damage);
    }
    titleForPlayer(player, title) {
        const ps = this.ps(player.id);
        const snapshot = ps?.joined && ps.connected && this.heldItemId(player) === FIXED_HOTBAR_ITEM_TYPES.scoreboard
            ? this.scoreboard.snapshot(player.id, this.scoreboardPlayers(), scoreForRole(this.state, "CT", MATCH_CONFIG), scoreForRole(this.state, "T", MATCH_CONFIG)) : undefined;
        if (snapshot)
            this.scoreboardTitles.add(player.id);
        else
            this.scoreboardTitles.delete(player.id);
        return scoreboardTitle(title, snapshot);
    }
    resetScoreboard() {
        this.scoreboard.clear();
        this.scoreboardTitles.clear();
        for (const player of world.getAllPlayers()) {
            const inv = inventory(player);
            if (inv)
                removeItemsByType(inv, FIXED_HOTBAR_ITEM_TYPES.scoreboard);
            player.onScreenDisplay.setTitle("");
        }
    }
    async selectTeam(player) {
        const state = this.state;
        const joined = await showTeamMenu(player, state);
        if (this.state !== state)
            return;
        if (joined && this.ps(player.id)?.connected)
            this.scoreboard.join(player.id);
        system.run(() => { if (this.state === state) {
            this.syncScoreboardPlayers();
            saveState(this.state);
        } });
    }
    aimedAtPlantedBomb(player) {
        try {
            return player.getEntitiesFromViewDirection({
                type: "fps:planted_bomb", maxDistance: 6, ignoreBlockCollision: true, includePassableBlocks: true,
            }).some(hit => hit.entity.typeId === "fps:planted_bomb");
        }
        catch {
            return false;
        }
    }
    syncWeaponsToInventory(player) {
        const ps = this.ps(player.id), inv = inventory(player);
        if (!ps || !inv)
            return;
        const loadout = this.ensureLoadout(player.id);
        const weapons = [];
        for (const state of [loadout.primary, loadout.secondary, loadout.knife]) {
            if (!state)
                continue;
            const definition = weaponDefinition(state.id);
            weapons.push({ slot: definition.slot, item: new ItemStack(definition.itemId) });
        }
        syncWeaponsToFixedHotbar(inv, weapons, isWeaponItem);
    }
    dropWeaponEntity(location, state, direction) {
        try {
            const entity = world.getDimension("overworld").spawnEntity(DROPPED_WEAPON, location);
            entity.addTag(DROPPED_WEAPON_TAG);
            entity.setDynamicProperty("fps:weapon_id", state.id);
            entity.setDynamicProperty("fps:magazine", state.magazine);
            entity.setDynamicProperty("fps:reserve", state.reserve);
            const definition = weaponDefinition(state.id);
            entity.nameTag = `${definition.name} ${state.magazine}/${state.reserve}`;
            if (direction) {
                const target = this.vectorAdd(location, this.vectorScale(direction, 1.5));
                if (entity.tryTeleport(target, { checkForBlocks: true, keepVelocity: false }))
                    entity.applyImpulse({ x: 0, y: .18, z: 0 });
            }
            return entity;
        }
        catch {
            return undefined;
        }
    }
    dropPlayerWeapons(playerId, location) {
        const ps = this.ps(playerId), player = this.player(playerId);
        if (!ps?.loadout)
            return;
        const origin = location ?? player?.location;
        if (!origin)
            return;
        for (const state of [ps.loadout.primary, ps.loadout.secondary])
            if (state)
                this.dropWeaponEntity(origin, state, player?.getViewDirection());
        ps.loadout = initialLoadout();
    }
    tickWeaponDrops() {
        if (this.state.phase !== "LIVE" && this.state.phase !== "BOMB_PLANTED")
            return;
        const dimension = world.getDimension("overworld");
        for (const drop of dimension.getEntities({ type: DROPPED_WEAPON })) {
            const id = drop.getDynamicProperty("fps:weapon_id"), magazine = drop.getDynamicProperty("fps:magazine"), reserve = drop.getDynamicProperty("fps:reserve");
            if (typeof id !== "string" || typeof magazine !== "number" || typeof reserve !== "number") {
                try {
                    drop.kill();
                }
                catch { }
                ;
                continue;
            }
            const weaponId = id, definition = WEAPONS.find(weapon => weapon.id === weaponId);
            if (!definition || definition.slot === "KNIFE") {
                try {
                    drop.kill();
                }
                catch { }
                ;
                continue;
            }
            const target = world.getAllPlayers().find(player => {
                const ps = this.ps(player.id), loadout = ps?.loadout;
                return ps?.alive && ps.joined && ps.connected && player.dimension.id === drop.dimension.id && distanceSquared(player.location, drop.location) <= 4 && !!loadout && !weaponState(loadout, weaponId);
            });
            if (!target)
                continue;
            const ps = this.ps(target.id);
            ps.loadout = withWeaponState(this.ensureLoadout(target.id), { id: weaponId, magazine: Math.max(0, Math.floor(magazine)), reserve: Math.max(0, Math.floor(reserve)) });
            this.syncWeaponsToInventory(target);
            try {
                drop.kill();
            }
            catch { }
            ;
            target.playSound("random.pop");
            saveState(this.state);
        }
    }
    role(id) { return this.lifecycle.currentRole(this.state, id); }
    refreshPlayerMovement(player) {
        const ps = this.ps(player.id);
        applyPlayerMovementPermissions(player, movementPermissionsFor({
            buyPhaseLocked: this.state.phase === "FREEZE" && ps?.connected === true && ps.joined && ps.alive && ps.activeFromRound <= this.state.round,
            interactionLocked: this.bombObjective.hasInteraction(player.id),
        }));
    }
    refreshAllMovement() { for (const player of world.getAllPlayers())
        this.refreshPlayerMovement(player); }
    sendMatchMessage(message) {
        for (const player of world.getAllPlayers()) {
            const ps = this.ps(player.id);
            if (ps?.connected && ps.joined)
                player.sendMessage(message);
        }
    }
    sendBanner(event) {
        const message = bannerMessage(event);
        for (const player of world.getAllPlayers()) {
            const ps = this.ps(player.id);
            if (ps?.connected && ps.joined)
                player.sendMessage(message);
        }
    }
    sendKillLog(killer, victim, weaponId, flags) {
        const killerTeam = this.role(killer.id), victimTeam = this.role(victim.id);
        if (!isKillLogRecipient(this.ps(killer.id)) || !isKillLogRecipient(this.ps(victim.id)))
            return;
        if (!killerTeam || !victimTeam || killer.id === victim.id || killerTeam === victimTeam)
            return;
        const message = createKillLogForKill({ killerTeam, killerName: killer.name, weaponId, victimTeam, victimName: victim.name, flags });
        for (const player of world.getAllPlayers()) {
            if (isKillLogRecipient(this.ps(player.id)))
                player.sendMessage(message);
        }
    }
    sendBannerToRole(event, target, roles) {
        const message = bannerMessage(event);
        for (const player of world.getAllPlayers()) {
            const ps = this.ps(player.id);
            if (ps?.connected && ps.joined && roles.get(player.id) === target)
                player.sendMessage(message);
        }
    }
    sendRoundAchievements(result, winner, roles) {
        if (result.acePlayerId)
            this.sendBannerToRole("ACE", winner, roles);
        if (result.flawless)
            this.sendBannerToRole("FLAWLESS", winner, roles);
        if (result.clutchPlayerId)
            this.sendBannerToRole("CLUTCH", winner, roles);
    }
    sendRoundResultBanners(winner, roles) {
        for (const player of world.getAllPlayers()) {
            const ps = this.ps(player.id);
            const role = roles.get(player.id);
            if (!ps?.connected || !ps.joined || !role)
                continue;
            player.sendMessage(bannerMessage(resultBannerForRole(role, winner)));
        }
    }
    sendMatchResult(winner, roles) {
        if (winner === "DRAW")
            return;
        this.sendRoundResultBanners(winner, roles);
    }
    clearInteractions(options = {}) {
        const transition = this.bombObjective.clearInteractions(this.state, options);
        this.state = transition.state;
        this.refreshBombInteractionPlayers(transition.effects);
    }
    removeShopAccessItems() {
        for (const player of world.getAllPlayers()) {
            const inv = inventory(player);
            if (inv)
                removeItemsByType(inv, SHOP_ACCESS_ITEM);
        }
        for (const entity of world.getDimension("overworld").getEntities({ type: "minecraft:item" })) {
            if (entity.getComponent(EntityComponentTypes.Item)?.itemStack.typeId === SHOP_ACCESS_ITEM) {
                try {
                    if (entity.isValid)
                        entity.remove();
                }
                catch { }
            }
        }
    }
    removeGroundItems() {
        const remove = (entity) => { try {
            if (entity.isValid)
                entity.remove();
        }
        catch { } };
        this.bombAdapter.removeAllDroppedBombs();
        for (const dimensionId of ["overworld", "nether", "the_end"]) {
            const dimension = world.getDimension(dimensionId);
            for (const entity of dimension.getEntities({ type: "minecraft:item" }))
                remove(entity);
            for (const entity of dimension.getEntities({ type: DROPPED_WEAPON }))
                remove(entity);
        }
    }
    giveShopAccessItem(player) {
        const inv = inventory(player);
        if (!inv)
            return false;
        const result = ensureFixedHotbarItem(inv, new ItemStack(SHOP_ACCESS_ITEM), "SHOP_ACCESS");
        if (!result.success)
            return false;
        if (result.displaced)
            player.dimension.spawnItem(result.displaced, player.location);
        return true;
    }
    vectorAdd(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
    vectorScale(a, scale) { return { x: a.x * scale, y: a.y * scale, z: a.z * scale }; }
    start() {
        this.combat.initialize();
        world.afterEvents.playerSpawn.subscribe(e => this.onSpawn(e.player, e.initialSpawn));
        world.beforeEvents.playerLeave.subscribe(e => this.leaveLocations.set(e.player.id, { ...e.player.location }));
        world.afterEvents.playerLeave.subscribe(e => this.onLeave(e));
        world.afterEvents.entityDie.subscribe(e => {
            if (!this.combatAdapter.deferDeath(e.deadEntity.id, () => this.onDeath(e)))
                this.onDeath(e);
        });
        world.afterEvents.playerHotbarSelectedSlotChange.subscribe(() => this.updateHud());
        world.afterEvents.entitySpawn.subscribe(e => this.onEntitySpawn(e));
        world.afterEvents.itemStartUse.subscribe(e => this.onUseStart(e.source, e.itemStack.typeId));
        world.afterEvents.itemUse.subscribe(e => this.onItemUse(e.source, e.itemStack.typeId));
        world.afterEvents.itemStopUse.subscribe(e => { this.combat.stopFiring(e.source.id); this.cancelInteraction(e.source.id); });
        world.afterEvents.itemReleaseUse.subscribe(e => { this.combat.stopFiring(e.source.id); this.cancelInteraction(e.source.id); });
        system.afterEvents.scriptEventReceive.subscribe(e => this.onScriptEvent(e));
        world.afterEvents.entityHurt.subscribe(e => {
            const hurt = this.combatAdapter.hurtEvent(e);
            if (!hurt)
                return;
            const effective = this.combat.handleHurt(hurt, system.currentTick);
            if (effective?.attackerId)
                this.recordScoreboardDamage(effective.victimId, effective.attackerId, effective.damage);
        });
        system.runTimeout(() => { this.recover(); system.runInterval(() => this.tick(), 1); }, 20);
    }
    recover() {
        this.resetScoreboard();
        this.clearInteractions();
        this.state = this.bombObjective.recover(this.state);
        const restartingMatch = this.state.phase !== "LOBBY";
        if (restartingMatch)
            this.cleanupRoundObjectives();
        if (restartingMatch || this.state.phase === "MAP_VOTE" || this.state.phase === "MATCH_END" || (this.state.phase !== "LOBBY" && !this.currentMap()))
            this.state = resetState();
        for (const p of world.getAllPlayers()) {
            const ps = ensurePlayer(this.state, p.id, p.name);
            ps.connected = true;
            const inv = inventory(p);
            if (this.state.phase !== "FREEZE" && inv)
                removeItemsByType(inv, SHOP_ACCESS_ITEM);
            if (this.state.phase !== "LOBBY")
                setSpectator(p);
            else {
                setAdventure(p);
                this.refreshPlayerMovement(p);
                if (world.getDynamicProperty("fps:arenas_built") === true)
                    p.teleport({ x: 0, y: 61, z: 0 });
                this.giveLobbyTools(p);
            }
        }
        this.combat.resetReloadBridge();
        if (this.state.bomb?.kind === "DROPPED" && this.state.bomb.location)
            this.state = this.bombObjective.synchronizeWorld(this.state);
        if (world.getDynamicProperty("fps:arenas_built") !== true)
            world.sendMessage("§eAdmin: run /scriptevent fps:admin build on a new flat world.");
        saveState(this.state);
    }
    onSpawn(player, initial) {
        const ps = ensurePlayer(this.state, player.id, player.name);
        const inv = inventory(player);
        if (this.state.phase !== "FREEZE" && inv)
            removeItemsByType(inv, SHOP_ACCESS_ITEM);
        if (initial)
            system.runTimeout(() => this.selectTeam(player), 20);
        if (this.state.phase === "LOBBY" || this.state.phase === "MAP_VOTE") {
            player.setGameMode(GameMode.Adventure);
            if (world.getDynamicProperty("fps:arenas_built") === true)
                player.teleport({ x: 0, y: 61, z: 0 });
            this.giveLobbyTools(player);
        }
        else {
            clearMatchItems(player);
            ps.alive = false;
            ps.activeFromRound = activeFromRoundAfterSpawn(ps.activeFromRound, this.state.round, initial, ps.joined);
            setSpectator(player);
            const m = this.currentMap();
            if (m)
                player.teleport(m.spectator);
        }
        this.refreshPlayerMovement(player);
        this.syncScoreboardPlayers();
    }
    giveLobbyTools(player) {
        const inv = inventory(player);
        if (!inv)
            return;
        if (![...Array(inv.size).keys()].some(i => inv.getItem(i)?.typeId === "minecraft:compass"))
            inv.addItem(new ItemStack("minecraft:compass"));
        if (![...Array(inv.size).keys()].some(i => inv.getItem(i)?.typeId === "minecraft:clock"))
            inv.addItem(new ItemStack("minecraft:clock"));
    }
    onItemUse(player, typeId) {
        if (typeId === "minecraft:compass" && (this.state.phase === "LOBBY" || this.state.phase === "MAP_VOTE"))
            this.selectTeam(player);
        if (typeId === "minecraft:clock" && this.state.phase === "LOBBY")
            this.beginVote();
        if (typeId === SHOP_ACCESS_ITEM && this.state.phase === "FREEZE") {
            const m = this.currentMap();
            if (m)
                showShop(player, () => this.state, m).then(() => saveState(this.state));
        }
        const weaponId = weaponIdFromItemType(typeId);
        if (weaponId) {
            const action = weaponDefinition(weaponId).slot === "KNIFE" ? "melee" : "fire";
            if (isCombatActionAllowed(action, this.bombObjective.hasInteraction(player.id)))
                this.combat.fire(player.id, weaponId, system.currentTick);
        }
    }
    onLeave(e) {
        this.scoreboard.leave(e.playerId);
        this.scoreboardTitles.delete(e.playerId);
        const ps = this.ps(e.playerId);
        if (!ps)
            return;
        ps.connected = false;
        if (ps.alive && ["FREEZE", "LIVE", "BOMB_PLANTED", "ROUND_END"].includes(this.state.phase))
            this.dropPlayerWeapons(e.playerId, this.leaveLocations.get(e.playerId));
        this.combat.clearPlayer(e.playerId);
        this.playerHud.forget(e.playerId);
        this.cancelInteraction(e.playerId);
        if (this.state.bomb?.carrierId === e.playerId)
            this.dropBomb(e.playerId);
        this.leaveLocations.delete(e.playerId);
        if (!["LOBBY", "MAP_VOTE", "MATCH_END"].includes(this.state.phase)) {
            this.lifecycle.recordLeave(this.state, e.playerId);
            this.checkForfeit();
        }
        saveState(this.state);
    }
    onDeath(e) {
        if (!(e.deadEntity instanceof Player))
            return;
        const playerId = e.deadEntity.id, deathRound = this.state.round;
        const ps = this.ps(playerId);
        if (!ps)
            return;
        ps.alive = false;
        const death = this.combatAdapter.deathEvent(e);
        const attribution = death ? this.combat.resolveDeath(death, system.currentTick) : undefined;
        if (this.state.phase === "FREEZE" || this.state.phase === "LIVE" || this.state.phase === "BOMB_PLANTED" || this.state.phase === "ROUND_END") {
            const killer = attribution?.killerId ? this.player(attribution.killerId) : undefined;
            const rewardWeapon = attribution?.rewardWeaponId;
            if (killer && rewardWeapon && attribution)
                this.sendKillLog(killer, e.deadEntity, rewardWeapon, attribution.flags);
            this.scoreboard.recordDeath(playerId, killer?.id, this.scoreboardPlayers());
            this.lifecycle.recordDeath(this.state, { victimId: playerId, killerId: killer?.id, killReward: rewardWeapon ? weaponDefinition(rewardWeapon).killReward : 0 });
        }
        this.dropPlayerWeapons(playerId, e.deadEntity.location);
        this.cancelInteraction(playerId);
        if (this.state.bomb?.carrierId === playerId)
            this.dropBomb(playerId, e.deadEntity.location);
        clearMatchItems(e.deadEntity, true);
        system.runTimeout(() => {
            const player = this.player(playerId), current = this.ps(playerId);
            if (player && current && shouldApplyDelayedSpectator({ deathRound, currentRound: this.state.round, alive: current.alive, phase: this.state.phase }))
                setSpectator(player);
        }, 1);
        if (this.state.phase === "LIVE" || this.state.phase === "BOMB_PLANTED")
            this.checkElimination();
    }
    onEntitySpawn(e) {
        if (!this.bombAdapter.isBombItemEntity(e.entity))
            return;
        system.run(() => {
            if (!e.entity.isValid)
                return;
            const bomb = this.state.bomb;
            if (bomb?.kind !== "CARRIED" || !bomb.carrierId)
                return;
            const carrier = this.player(bomb.carrierId);
            if (!carrier || !this.ps(carrier.id)?.alive || carrier.dimension.id !== e.entity.dimension.id || distanceSquared(carrier.location, e.entity.location) > 16)
                return;
            if (this.bombAdapter.hasBomb(carrier.id))
                return;
            const location = { ...e.entity.location };
            this.bombAdapter.removeItemEntity(e.entity);
            this.dropBomb(carrier.id, location, carrier.getViewDirection());
        });
    }
    onUseStart(player, typeId) {
        const map = this.currentMap();
        const ps = this.ps(player.id);
        if (!map || !ps || !ps.alive)
            return;
        const bombTransition = this.bombObjective.startUse(this.state, {
            id: player.id, role: this.role(player.id), alive: ps.alive, location: { ...player.location }, dimensionId: player.dimension.id,
            itemId: typeId, aimedBomb: this.aimedAtPlantedBomb(player), map: this.bombMap(map),
        });
        if (bombTransition.effects.some(effect => effect.kind === "INTERACTION_STARTED")) {
            this.combat.stopFiring(player.id);
            this.applyBombTransition(bombTransition);
            return;
        }
        const weaponId = weaponIdFromItemType(typeId);
        if (weaponId) {
            const definition = weaponDefinition(weaponId);
            const action = definition.slot === "KNIFE" ? "melee" : "fire";
            if (!isCombatActionAllowed(action, this.bombObjective.hasInteraction(player.id)))
                return;
            if (definition.fireMode === "AUTO")
                this.combat.startFiring(player.id, weaponId, system.currentTick);
            else
                this.combat.fire(player.id, weaponId, system.currentTick);
            return;
        }
    }
    tickInteraction() {
        const map = this.currentMap();
        if (!map)
            return;
        const players = new Map();
        for (const player of world.getAllPlayers()) {
            const ps = this.ps(player.id);
            players.set(player.id, { id: player.id, role: this.role(player.id), alive: ps?.alive === true, location: { ...player.location }, dimensionId: player.dimension.id, aimedBomb: this.aimedAtPlantedBomb(player) });
        }
        this.applyBombTransition(this.bombObjective.tickInteraction(this.state, { players, map: this.bombMap(map) }));
    }
    cancelInteraction(id) {
        this.applyBombTransition(this.bombObjective.cancel(this.state, id));
    }
    bombMap(map) {
        return { boundary: map.boundary, bombRecovery: map.bombRecovery, sites: map.sites };
    }
    refreshBombInteractionPlayers(effects) {
        for (const effect of effects)
            if (effect.kind === "INTERACTION_STARTED" || effect.kind === "INTERACTION_CANCELLED" ||
                effect.kind === "PLANTED" || effect.kind === "DEFUSED") {
                const player = this.player(effect.playerId);
                if (player)
                    this.refreshPlayerMovement(player);
            }
    }
    applyBombTransition(transition) {
        this.state = transition.state;
        this.refreshBombInteractionPlayers(transition.effects);
        for (const effect of transition.effects) {
            if (effect.kind === "PLANTED") {
                this.playerHud.latchCompletion(effect.playerId, "plant", system.currentTick);
                const player = this.player(effect.playerId);
                if (player)
                    player.dimension.playSound("random.fuse", effect.location);
                this.sendMatchMessage(`§cBomb planted at ${effect.site} / ${effect.site} 지점에 폭탄 설치`);
                saveState(this.state);
            }
            else if (effect.kind === "DEFUSED") {
                this.playerHud.latchCompletion(effect.playerId, "defuse", system.currentTick, effect.startedWithKit);
                this.endRound("CT", "defused");
            }
            else if (effect.kind === "DROPPED") {
                this.sendMatchMessage("§eBomb dropped / 폭탄이 떨어졌습니다.");
                saveState(this.state);
            }
            else if (effect.kind === "PICKED_UP") {
                const player = this.player(effect.playerId);
                if (player)
                    player.playSound("random.pop");
                saveState(this.state);
            }
        }
    }
    dropBomb(id, location, direction) {
        const p = this.player(id), map = this.currentMap(), candidate = location ?? p?.location ?? this.leaveLocations.get(id) ?? this.state.bomb?.location;
        if (!map)
            return;
        this.applyBombTransition(this.bombObjective.drop(this.state, { playerId: id, candidateLocation: candidate, direction, currentTick: system.currentTick, map: this.bombMap(map) }));
    }
    tickBombPickup() {
        const players = world.getAllPlayers().map(player => {
            const ps = this.ps(player.id);
            return { id: player.id, role: this.role(player.id), alive: ps?.alive === true, location: { ...player.location }, dimensionId: player.dimension.id };
        });
        this.applyBombTransition(this.bombObjective.tickPickup(this.state, { currentTick: system.currentTick, players }));
    }
    tick() {
        this.syncScoreboardPlayers();
        this.combat.tick(system.currentTick);
        this.tickWeaponDrops();
        this.tickInteraction();
        this.tickBombPickup();
        if (this.state.phase === "FREEZE" || this.state.phase === "LIVE" || this.state.phase === "BOMB_PLANTED" || this.state.phase === "ROUND_END")
            this.state.timerTicks--;
        if (this.state.phase === "FREEZE" && this.state.timerTicks <= 0)
            this.goLive();
        if (this.state.phase === "LIVE" && this.state.timerTicks <= 0)
            this.endRound("CT", "timeout");
        if (this.state.phase === "BOMB_PLANTED" && this.state.bomb) {
            this.state.bomb.timerTicks--;
            if (this.state.bomb.timerTicks <= 0)
                this.endRound("T", "exploded");
        }
        if (this.state.phase === "ROUND_END" && this.state.timerTicks <= 0)
            this.nextRound();
        this.enforceBoundaries();
        this.updateHud();
        if (++this.dirtyTicks >= 20) {
            this.sanitizeBombObjective();
            this.sanitizeInventories();
            this.sanitizeFixedHotbar();
            saveState(this.state);
            this.dirtyTicks = 0;
        }
    }
    sanitizeInventories() {
        if (["LOBBY", "MAP_VOTE", "MATCH_END"].includes(this.state.phase))
            return;
        for (const p of world.getAllPlayers()) {
            const ps = this.ps(p.id);
            if (!ps?.joined)
                continue;
            const inv = inventory(p);
            if (!inv)
                continue;
            const loadout = ps.loadout;
            sanitizeFixedHotbarInventory(inv, {
                isWeaponItem,
                expectedWeaponType: slot => {
                    const state = slot === "PRIMARY" ? loadout?.primary : slot === "SECONDARY" ? loadout?.secondary : loadout?.knife;
                    return state ? weaponDefinition(state.id).itemId : undefined;
                },
                isMatchItem,
                isObjectiveItem: typeId => typeId === BOMB,
                isDroppableObjectiveItem: typeId => typeId === BOMB,
                isShopAccessItem: typeId => typeId === SHOP_ACCESS_ITEM,
            });
        }
    }
    sanitizeFixedHotbar() {
        if (!["FREEZE", "LIVE", "BOMB_PLANTED"].includes(this.state.phase))
            return;
        for (const p of world.getAllPlayers()) {
            const ps = this.ps(p.id);
            if (!ps?.joined || !ps.connected || !ps.alive || ps.activeFromRound > this.state.round)
                continue;
            if (this.state.phase === "FREEZE")
                this.giveShopAccessItem(p);
            const bomb = this.state.bomb;
            if (this.role(p.id) === "T" && (bomb?.kind === "CARRIED" || bomb?.kind === "PLANTING") && bomb.carrierId === p.id)
                this.bombAdapter.giveBomb(p.id);
        }
    }
    sanitizeBombObjective() {
        if (["LOBBY", "MAP_VOTE", "MATCH_END", "ROUND_END"].includes(this.state.phase))
            return;
        this.state = this.bombObjective.sanitize(this.state);
    }
    updateHud() {
        if (["LOBBY", "MAP_VOTE", "MATCH_END"].includes(this.state.phase)) {
            this.clearHud();
            for (const p of world.getAllPlayers()) {
                const wasShown = this.scoreboardTitles.has(p.id), title = this.titleForPlayer(p, "");
                if (title || wasShown)
                    p.onScreenDisplay.setTitle(title);
            }
            return;
        }
        this.hudActive = true;
        const active = this.state.players.filter(ps => ps.joined && ps.connected && ps.activeFromRound <= this.state.round);
        const slots = (team) => active.filter(ps => this.role(ps.id) === team).sort((a, b) => a.id.localeCompare(b.id)).map(ps => ({ name: ps.name, alive: ps.alive }));
        const snapshot = {
            timerTicks: this.state.timerTicks, tScore: scoreForRole(this.state, "T", MATCH_CONFIG), ctScore: scoreForRole(this.state, "CT", MATCH_CONFIG),
            tPlayers: slots("T"), ctPlayers: slots("CT"),
            bombDisplay: this.state.phase === "BOMB_PLANTED" ? "PLANTED" : this.state.phase === "ROUND_END" && this.state.lastRoundReason === "defused" ? "DEFUSED" : "TIMER",
        };
        for (const p of world.getAllPlayers()) {
            const ps = this.ps(p.id);
            if (!ps?.connected || !ps.joined) {
                this.clearPlayerHud(p);
                continue;
            }
            const title = this.titleForPlayer(p, formatHudTitle(snapshot));
            // JSON UI's hud_title_text_factory consumes Title events, so publish every
            // update just like the protocol reference implementation.
            p.onScreenDisplay.setTitle(title);
            const playerFrame = this.playerHudSnapshot(p, ps);
            const actionBar = this.playerHud.nextFrame(p.id, playerFrame, system.currentTick);
            if (actionBar !== undefined)
                p.onScreenDisplay.setActionBar(actionBar);
        }
    }
    playerHudSnapshot(player, ps) {
        if (!ps.alive || player.getGameMode() === GameMode.Spectator)
            return { held: "WNN", magazine: 0, reserve: 0 };
        const itemId = this.heldItemId(player), weaponId = weaponIdFromItemType(itemId);
        let held = "WNN", magazine = 0, reserve = 0;
        if (itemId === BOMB)
            held = "WFF";
        else if (weaponId) {
            held = weaponId;
            const state = weaponState(this.ensureLoadout(player.id), weaponId);
            magazine = state?.magazine ?? 0;
            reserve = state?.reserve ?? 0;
        }
        const interaction = this.bombObjective.interactionFor(player.id);
        return {
            held, magazine, reserve,
            ...(interaction ? { interaction: {
                    kind: interaction.kind,
                    frame: interactionGlyphFrame(interaction.ticks, interaction.durationTicks),
                    startedWithKit: interaction.startedWithKit,
                } } : {}),
        };
    }
    clearPlayerHud(player) {
        this.scoreboardTitles.delete(player.id);
        player.onScreenDisplay.setTitle("");
        player.onScreenDisplay.setActionBar(inactivePlayerHudFrame());
        this.playerHud.forget(player.id);
    }
    clearHud() {
        if (!this.hudActive)
            return;
        for (const p of world.getAllPlayers())
            this.clearPlayerHud(p);
        this.playerHud.clear();
        this.hudActive = false;
    }
    enforceBoundaries() {
        const map = this.currentMap();
        if (!map || ["LOBBY", "MAP_VOTE", "MATCH_END"].includes(this.state.phase))
            return;
        for (const p of world.getAllPlayers()) {
            const ps = this.ps(p.id);
            if (!ps?.joined || !ps.alive || inBox(p.location, map.boundary))
                continue;
            const team = this.role(p.id);
            if (team)
                p.teleport((team === "T" ? map.tSpawns : map.ctSpawns)[0]);
        }
    }
    async beginVote() {
        const started = this.lifecycle.beginMapVote(this.state);
        if (started.kind === "IGNORED")
            return;
        if (started.kind === "MISSING_TEAM") {
            world.sendMessage("§cAt least one player per team required / 양 팀에 한 명 이상 필요합니다.");
            return;
        }
        const voteState = this.state;
        this.votes.clear();
        for (const p of world.getAllPlayers())
            inventory(p)?.clearAll();
        this.syncScoreboardPlayers();
        const voters = world.getAllPlayers().filter(p => this.ps(p.id)?.joined);
        await Promise.all(voters.map(async (p) => { const vote = await showVote(p, MAPS); if (this.state === voteState && this.state.phase === "MAP_VOTE" && vote)
            this.votes.set(p.id, vote); }));
        if (this.state !== voteState || this.state.phase !== "MAP_VOTE")
            return;
        const completed = this.lifecycle.completeMapVote(this.state, this.votes, MAPS.map(map => map.id));
        this.votes.clear();
        if (completed.kind === "RETURNED_TO_LOBBY") {
            for (const p of world.getAllPlayers())
                this.giveLobbyTools(p);
            world.sendMessage("§cAt least one player per team required / 양 팀에 한 명 이상 필요합니다.");
            saveState(this.state);
            return;
        }
        if (completed.kind === "MAP_SELECTED")
            this.startRound();
    }
    startRound() {
        if (!this.currentMap())
            return;
        this.applyLifecycle(this.lifecycle.startRound(this.state));
    }
    goLive() { this.applyLifecycle(this.lifecycle.goLive(this.state)); }
    checkElimination() { this.applyLifecycle(this.lifecycle.checkElimination(this.state)); }
    checkForfeit() { this.applyLifecycle(this.lifecycle.checkForfeit(this.state)); }
    endRound(winner, reason) { this.applyLifecycle(this.lifecycle.endRound(this.state, winner, reason)); }
    nextRound() { this.applyLifecycle(this.lifecycle.nextRound(this.state)); }
    endMatch(winner, reason) { this.applyLifecycle(this.lifecycle.endMatch(this.state, winner, reason)); }
    applyLifecycle(effects) {
        for (const effect of effects) {
            if (effect.kind === "CLEAR_INTERACTIONS")
                this.clearInteractions({ preservePlant: effect.preservePlant });
            else if (effect.kind === "CLEANUP_ROUND_OBJECTIVES")
                this.cleanupRoundObjectives();
            else if (effect.kind === "REMOVE_GROUND_ITEMS")
                this.removeGroundItems();
            else if (effect.kind === "ROUND_STARTED")
                this.applyRoundStart(effect);
            else if (effect.kind === "LIVE") {
                closeOpenShopForms(world.getAllPlayers());
                this.removeShopAccessItems();
                this.refreshAllMovement();
                this.sendMatchMessage("§aGO!");
                this.sendBanner("ROUND_START");
            }
            else if (effect.kind === "ROUND_ENDED") {
                this.scoreboard.endRound();
                this.sendMatchMessage(`§6${effect.winner} wins (${effect.reason}) / ${effect.winner} 승리`);
                this.sendRoundResultBanners(effect.winner, effect.roles);
                this.sendRoundAchievements(effect.achievements, effect.winner, effect.roles);
                if (effect.reason === "exploded")
                    this.currentMap() && world.getDimension("overworld").playSound("random.explode", this.state.bomb?.location ?? this.currentMap().spectator);
                saveState(this.state);
            }
            else if (effect.kind === "MATCH_ENDED") {
                this.sendMatchMessage(`§6Match result: ${effect.winner} (${effect.reason})`);
                if (effect.reason !== "score")
                    this.sendMatchResult(effect.winner, effect.roles);
                this.clearHud();
                this.cleanupWorld();
                for (const p of world.getAllPlayers()) {
                    clearMatchItems(p, true);
                    this.refreshPlayerMovement(p);
                    setAdventure(p);
                    p.teleport({ x: 0, y: 61, z: 0 });
                }
                const endedState = this.state;
                system.runTimeout(() => { if (this.state !== endedState)
                    return; this.resetScoreboard(); this.state = resetState(); for (const p of world.getAllPlayers()) {
                    ensurePlayer(this.state, p.id, p.name);
                    this.giveLobbyTools(p);
                } saveState(this.state); }, 200);
            }
        }
    }
    applyRoundStart(effect) {
        const map = this.currentMap();
        if (!map)
            return;
        for (const entry of effect.players) {
            const ps = this.ps(entry.id), p = this.player(entry.id);
            if (!ps || !p)
                continue;
            ps.alive = true;
            ps.loadout = refillAtBuyPhase(ps.loadout ?? initialLoadout());
            setAdventure(p);
            this.refreshPlayerMovement(p);
            p.teleport((entry.role === "T" ? map.tSpawns : map.ctSpawns)[entry.spawnIndex % 5]);
            p.runCommand("effect @s regeneration 1 255 true");
            this.syncWeaponsToInventory(p);
            this.giveShopAccessItem(p);
        }
        if (effect.bombCarrierId && this.bombAdapter.giveBomb(effect.bombCarrierId))
            this.state.bomb = { kind: "CARRIED", carrierId: effect.bombCarrierId, progressTicks: 0, timerTicks: 0 };
        this.sendMatchMessage(`§eRound ${this.state.round} / 라운드 ${this.state.round}`);
        if (this.state.round === 1)
            this.sendBanner("MATCH_START");
        if (this.state.round === MATCH_CONFIG.roundsPerHalf)
            this.sendBanner("SIDE_SWITCH_WARNING");
        if (this.state.round === MATCH_CONFIG.roundsPerHalf + 1)
            this.sendBanner("SIDE_SWITCH");
        if (this.state.round === MATCH_CONFIG.maxRounds)
            this.sendBanner("FINAL_ROUND");
        this.sendBanner("BUY_PHASE");
        saveState(this.state);
    }
    cleanupRoundObjectives() {
        this.scoreboard.endRound();
        this.bombObjective.resetRound();
        this.combat.cleanup();
        this.removeShopAccessItems();
        for (const p of world.getAllPlayers()) {
            this.bombAdapter.removeBomb(p.id);
            const inv = inventory(p);
            if (inv)
                for (let i = 0; i < inv.size; i++) {
                    const id = inv.getItem(i)?.typeId;
                    if (id === "minecraft:compass" || id === "minecraft:clock")
                        inv.setItem(i);
                }
        }
        this.bombAdapter.removePlantedBombs();
        this.removeGroundItems();
        this.state.bomb = undefined;
    }
    cleanupWorld() { closeAllPlayerForms(world.getAllPlayers()); this.clearInteractions(); this.cleanupRoundObjectives(); for (const ps of this.state.players)
        ps.hasDefuseKit = false; for (const p of world.getAllPlayers())
        clearMatchItems(p, true); }
    onScriptEvent(e) {
        if (e.id !== "fps:admin" || !(e.sourceEntity instanceof Player))
            return;
        const p = e.sourceEntity;
        if (!p.hasTag("fps_admin")) {
            p.sendMessage("§cAdmin tag required: fps_admin");
            return;
        }
        const command = e.message.trim().toLowerCase();
        if (command === "start")
            this.beginVote();
        else if (command === "stop")
            this.endMatch("DRAW", "admin");
        else if (command === "reset") {
            this.cleanupWorld();
            this.resetScoreboard();
            this.state = resetState();
            this.refreshAllMovement();
            p.sendMessage("Reset complete.");
        }
        else if (command === "status")
            p.sendMessage(JSON.stringify({ phase: this.state.phase, round: this.state.round, score: [this.state.tScore, this.state.ctScore], map: this.state.mapId }));
        else if (command === "build")
            buildArenas().then(() => p.sendMessage("Arenas built."));
        else if (command === "validate")
            p.sendMessage(validateMaps().join("\n") || "All maps valid.");
        else if (command === "team")
            this.selectTeam(p);
        else if (command === "shop") {
            const m = this.currentMap();
            if (m)
                showShop(p, () => this.state, m).then(() => saveState(this.state));
        }
    }
}
