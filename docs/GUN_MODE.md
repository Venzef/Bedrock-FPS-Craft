# Gun mode

The match uses the Kill Log-aligned weapon registry in `src/weapons.ts`.

- Buyable weapons are W00 AK47, W02 AWP, W03 Bulldog, W04 UMP, and W05 USP. W14 is the fixed knife.
- Using the Script API's zero-based indices, weapons occupy hotbar slots 0 (primary), 1 (secondary), and 2 (knife). These are visible positions 1, 2, and 3. Primary and secondary weapons use an unrestricted item lock so they can be dropped; the knife remains locked to its slot.
- API hotbar slots 3–6 are reserved empty utility slots for grenades, flash, smoke, and thermite. API slot 7 is the fixed C4 slot and remains droppable for teammate handoffs. The defuse kit is passive state and never occupies an inventory slot. API slot 8 (visible hotbar position 9) is the fixed shop opener slot.
- Ammo is persisted in the player loadout, refilled at each buy phase, and sent through the 20-byte `FCAB` ActionBar data bus. Guns render `magazine / reserve`; the knife and C4 render `- / -`; invalid, dead, and spectator states use `WNN` to hide the weapon HUD.
- Right-click fires. Automatic weapons continue while the use input is held.
- Projectiles are real `fps:bullet_*` entities. They stop on blocks, can penetrate one glass/glass-pane/wool block at half damage, and expire at four seconds or 73 blocks.
- Primary/secondary weapons drop as `fps:dropped_weapon` entities on death and can be recovered into an empty matching slot. Drops are removed at round end.

## Left-click reload bridge

The behavior pack attaches `controller.animation.fps.reload_bridge` to the vanilla player. When a custom gun enters the vanilla left-click attack animation (`variable.attack_time > 0`), the behavior controller writes one `fps_reload` scoreboard signal at phase `1`.

The server consumes the `fps_reload` objective with these phases:

`0 waiting → 1 input latch → 2 reload start request → 3 reload-in-progress lock`

The script accepts phase `1`, advances it to `2`, starts a valid reload from phase `2`, and keeps the score at `3` until completion or cancellation. Reload is canceled by weapon switch, death, round end, or a phase change; damage and movement do not cancel it. Right-click remains the firing input.

On a test world, the server-side reload contract can be exercised with:

```mcfunction
/scoreboard players set <player> fps_reload 1
```
