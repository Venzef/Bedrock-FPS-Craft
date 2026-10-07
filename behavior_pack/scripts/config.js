export const TICKS = 20;
export const MATCH_CONFIG = {
    maxPlayersPerTeam: 5,
    maxTeamDifference: 1,
    roundsPerHalf: 7,
    roundsToWin: 8,
    maxRounds: 15,
    freezeTicks: 10 * TICKS,
    roundTicks: 115 * TICKS,
    plantTicks: 3 * TICKS,
    bombTicks: 40 * TICKS,
    defuseTicks: 5 * TICKS,
    defuseWithoutKitTicks: 10 * TICKS,
    roundEndTicks: 7 * TICKS,
    startingMoney: 800,
    maxMoney: 10000,
    winReward: 3250,
    lossRewardBase: 1400,
    lossRewardStep: 500,
    lossRewardMax: 3400,
    plantedLossBonus: 800,
};
export const MAPS = [
    {
        id: "desert_city", nameKey: "Desert City",
        boundary: { min: { x: 80, y: 50, z: -70 }, max: { x: 220, y: 100, z: 70 } },
        tSpawns: [{ x: 95, y: 65, z: 0 }, { x: 95, y: 65, z: 2 }, { x: 95, y: 65, z: -2 }, { x: 97, y: 65, z: 4 }, { x: 97, y: 65, z: -4 }],
        ctSpawns: [{ x: 205, y: 65, z: 0 }, { x: 205, y: 65, z: 2 }, { x: 205, y: 65, z: -2 }, { x: 203, y: 65, z: 4 }, { x: 203, y: 65, z: -4 }],
        sites: {
            A: { min: { x: 175, y: 63, z: -40 }, max: { x: 188, y: 70, z: -27 } },
            B: { min: { x: 175, y: 63, z: 27 }, max: { x: 188, y: 70, z: 40 } },
        },
        buyZones: {
            T: { min: { x: 90, y: 60, z: -8 }, max: { x: 105, y: 72, z: 8 } },
            CT: { min: { x: 195, y: 60, z: -8 }, max: { x: 210, y: 72, z: 8 } },
        }, spectator: { x: 150, y: 88, z: 0 }, bombRecovery: { x: 105, y: 65, z: 0 },
    },
    {
        id: "industrial_facility", nameKey: "Industrial Facility",
        boundary: { min: { x: -220, y: 50, z: -70 }, max: { x: -80, y: 100, z: 70 } },
        tSpawns: [{ x: -205, y: 65, z: 0 }, { x: -205, y: 65, z: 2 }, { x: -205, y: 65, z: -2 }, { x: -203, y: 65, z: 4 }, { x: -203, y: 65, z: -4 }],
        ctSpawns: [{ x: -95, y: 65, z: 0 }, { x: -95, y: 65, z: 2 }, { x: -95, y: 65, z: -2 }, { x: -97, y: 65, z: 4 }, { x: -97, y: 65, z: -4 }],
        sites: {
            A: { min: { x: -125, y: 63, z: -40 }, max: { x: -112, y: 70, z: -27 } },
            B: { min: { x: -125, y: 63, z: 27 }, max: { x: -112, y: 70, z: 40 } },
        },
        buyZones: {
            T: { min: { x: -210, y: 60, z: -8 }, max: { x: -195, y: 72, z: 8 } },
            CT: { min: { x: -105, y: 60, z: -8 }, max: { x: -90, y: 72, z: 8 } },
        }, spectator: { x: -150, y: 88, z: 0 }, bombRecovery: { x: -195, y: 65, z: 0 },
    },
];
export const SHOP = [
    {
        id: "fps:gun_sidearm", name: "USP", price: 500, weaponId: "W05",
        uiIndex: 0, texture: "textures/ui/shop/weapons/usp",
    },
    {
        id: "fps:gun_vector", name: "UMP", price: 1500, weaponId: "W04",
        uiIndex: 5, texture: "textures/ui/shop/weapons/ump",
    },
    {
        id: "fps:gun_ranger", name: "AK47", price: 2800, weaponId: "W00",
        uiIndex: 9, texture: "textures/ui/shop/weapons/akr",
    },
    {
        id: "fps:gun_bulldog", name: "Bulldog", price: 2000, weaponId: "W03",
        uiIndex: 13, texture: "textures/ui/shop/weapons/bulldog",
    },
    {
        id: "fps:gun_longshot", name: "AWP", price: 4500, weaponId: "W02",
        uiIndex: 17, texture: "textures/ui/shop/weapons/awm",
    },
    {
        id: "fps:iron_armor", name: "Armor", price: 600, armorTier: "ARMOR",
        uiIndex: 21, texture: "textures/ui/shop/equipment/armor",
    },
    {
        id: "fps:iron_armor_set", name: "Armor + Helmet", price: 1000, armorTier: "ARMOR_SET",
        uiIndex: 22, texture: "textures/ui/shop/equipment/armor_helmet",
    },
    {
        id: "fps:defuse_kit", name: "Defuse Kit", price: 400, defuseKit: true,
        uiIndex: 23, texture: "textures/ui/shop/equipment/defuse_kit",
    },
];
