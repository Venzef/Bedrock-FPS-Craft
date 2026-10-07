import { world } from "@minecraft/server";
import { MAPS } from "./config.js";
async function cmd(d, command) { await d.runCommand(command); }
export async function buildArenas() {
    const d = world.getDimension("overworld");
    // Lobby
    await cmd(d, "fill -18 60 -18 18 60 18 smooth_stone");
    await cmd(d, "gamerule keepinventory true");
    await cmd(d, "fill -18 61 -18 18 70 -18 glass");
    await cmd(d, "fill -18 61 18 18 70 18 glass");
    await cmd(d, "fill -18 61 -17 -18 70 17 glass");
    await cmd(d, "fill 18 61 -17 18 70 17 glass");
    await cmd(d, "setworldspawn 0 61 0");
    // Desert City: sandstone shell, three lanes, cover, marked sites.
    await cmd(d, "fill 80 60 -70 220 60 70 sandstone");
    await cmd(d, "fill 80 61 -70 220 76 -70 sandstone");
    await cmd(d, "fill 80 61 70 220 76 70 sandstone");
    await cmd(d, "fill 80 61 -69 80 76 69 sandstone");
    await cmd(d, "fill 220 61 -69 220 76 69 sandstone");
    for (const z of [-45, 45])
        await cmd(d, `fill 115 61 ${z - 8} 170 67 ${z + 8} sandstone hollow`);
    for (const z of [-34, 34])
        await cmd(d, `fill 175 61 ${z - 6} 189 65 ${z + 6} cut_sandstone hollow`);
    await cmd(d, "fill 175 61 -40 188 61 -27 red_concrete");
    await cmd(d, "fill 175 61 27 188 61 40 yellow_concrete");
    for (const z of [-50, -15, 15, 50])
        await cmd(d, `fill 135 61 ${z - 3} 140 65 ${z + 3} stripped_oak_log`);
    // Industrial Facility: concrete shell with warehouses and central ducts.
    await cmd(d, "fill -220 60 -70 -80 60 70 gray_concrete");
    await cmd(d, "fill -220 61 -70 -80 80 -70 iron_block");
    await cmd(d, "fill -220 61 70 -80 80 70 iron_block");
    await cmd(d, "fill -220 61 -69 -220 80 69 iron_block");
    await cmd(d, "fill -80 61 -69 -80 80 69 iron_block");
    for (const z of [-43, 43])
        await cmd(d, `fill -188 61 ${z - 10} -140 72 ${z + 10} light_gray_concrete hollow`);
    await cmd(d, "fill -170 61 -8 -130 68 8 polished_andesite hollow");
    await cmd(d, "fill -125 61 -40 -112 61 -27 red_concrete");
    await cmd(d, "fill -125 61 27 -112 61 40 yellow_concrete");
    for (const z of [-52, -20, 20, 52])
        await cmd(d, `fill -165 61 ${z - 3} -158 66 ${z + 3} copper_block`);
    world.setDynamicProperty("fps:arenas_built", true);
}
export function validateMaps() {
    const errors = [];
    for (const m of MAPS) {
        if (m.tSpawns.length < 5 || m.ctSpawns.length < 5)
            errors.push(`${m.id}: requires five spawns per team`);
        for (const site of ["A", "B"])
            if (!m.sites[site])
                errors.push(`${m.id}: missing site ${site}`);
        if (!m.buyZones.T || !m.buyZones.CT)
            errors.push(`${m.id}: missing buy zone`);
        if (!m.spectator)
            errors.push(`${m.id}: missing spectator position`);
        if (!m.bombRecovery)
            errors.push(`${m.id}: missing bomb recovery position`);
        if (m.boundary.min.x >= m.boundary.max.x || m.boundary.min.y >= m.boundary.max.y || m.boundary.min.z >= m.boundary.max.z)
            errors.push(`${m.id}: invalid boundary`);
    }
    return errors;
}
