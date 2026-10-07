/** Measures health removed once, including scripted correction, before releasing death callbacks. */
export class EffectiveDamage {
    report;
    pending = new Map();
    constructor(report) {
        this.report = report;
    }
    isApplying(victimId) { return this.pending.has(victimId); }
    deferDeath(victimId, callback) {
        const callbacks = this.pending.get(victimId);
        if (!callbacks)
            return false;
        callbacks.push(callback);
        return true;
    }
    apply(victimId, attackerId, health, apply) {
        const before = health();
        const callbacks = [];
        this.pending.set(victimId, callbacks);
        try {
            apply();
        }
        finally {
            try {
                this.report(victimId, attackerId, Math.max(0, before - health()));
            }
            finally {
                try {
                    for (const callback of callbacks)
                        callback();
                }
                finally {
                    this.pending.delete(victimId);
                }
            }
        }
    }
}
