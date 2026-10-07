import { system } from "@minecraft/server";
import { Game } from "./game.js";
// Dynamic properties are unavailable during module early-execution. Deferring
// construction by one system tick guarantees the world is ready for reads.
system.run(() => new Game().start());
