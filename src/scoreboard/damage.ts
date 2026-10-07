/** Measures health removed once, including scripted correction, before releasing death callbacks. */
export class EffectiveDamage {
  private readonly pending=new Map<string,Array<()=>void>>();
  constructor(private readonly report:(victimId:string,attackerId:string,damage:number)=>void){}
  isApplying(victimId:string):boolean { return this.pending.has(victimId); }
  deferDeath(victimId:string,callback:()=>void):boolean {
    const callbacks=this.pending.get(victimId);if(!callbacks)return false;
    callbacks.push(callback);return true;
  }
  apply(victimId:string,attackerId:string,health:()=>number,apply:()=>void):void {
    const before=health();const callbacks:Array<()=>void>=[];this.pending.set(victimId,callbacks);
    try { apply(); }
    finally {
      try { this.report(victimId,attackerId,Math.max(0,before-health())); }
      finally { try { for(const callback of callbacks)callback(); } finally { this.pending.delete(victimId); } }
    }
  }
}
