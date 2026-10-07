import type { Team } from "../types.js";

export interface ScoreboardPlayer {
  id:string; name:string; role:Team; alive:boolean; money:number;
}
export interface ScoreboardRow {
  name:string; rank:number; kills:number; deaths:number; assists:number;
  alive:boolean; self:boolean; money?:number;
}
export interface ScoreboardSnapshot {
  ctScore:number; tScore:number; allyRole:Team; ct:ScoreboardRow[]; t:ScoreboardRow[];
}
interface Statistics { kills:number; deaths:number; assists:number; order:number }
interface Contribution { damage:number; first:number }

/** Runtime-only: recovery returns the match to the lobby, never restores statistics. */
export class ScoreboardLedger {
  private readonly stats=new Map<string,Statistics>();
  private readonly damage=new Map<string,Map<string,Contribution>>();
  private sequence=0;

  join(id:string):void {
    if(!this.stats.has(id))this.stats.set(id,{kills:0,deaths:0,assists:0,order:this.sequence++});
  }
  leave(id:string):void {
    this.stats.delete(id);this.damage.delete(id);
    for(const contributions of this.damage.values())contributions.delete(id);
  }
  clear():void { this.stats.clear();this.endRound();this.sequence=0; }
  endRound():void { this.damage.clear(); }
  recordDamage(victim:ScoreboardPlayer,attacker:ScoreboardPlayer,amount:number):void {
    if(!Number.isFinite(amount)||amount<=0||victim.id===attacker.id||victim.role===attacker.role)return;
    if(!this.stats.has(victim.id)||!this.stats.has(attacker.id))return;
    const contributions=this.damage.get(victim.id)??new Map<string,Contribution>();
    const previous=contributions.get(attacker.id);
    contributions.set(attacker.id,{damage:(previous?.damage??0)+amount,first:previous?.first??this.sequence++});
    this.damage.set(victim.id,contributions);
  }
  recordDeath(victimId:string,killerId:string|undefined,players:readonly ScoreboardPlayer[]):void {
    const victim=players.find(p=>p.id===victimId),stats=this.stats.get(victimId);
    const contributions=this.damage.get(victimId);this.damage.delete(victimId);
    if(!victim||!stats)return;
    stats.deaths++;
    const killer=players.find(p=>p.id===killerId);
    if(killer&&killer.id!==victimId&&killer.role!==victim.role){
      const killerStats=this.stats.get(killer.id);if(killerStats)killerStats.kills++;
    }
    // Environmental deaths still award the strongest eligible contributor an assist.
    const candidate=[...(contributions??[])].filter(([id])=>
      id!==killerId&&this.stats.has(id)&&players.some(p=>p.id===id&&p.role!==victim.role)
    ).sort((a,b)=>b[1].damage-a[1].damage||a[1].first-b[1].first)[0];
    if(candidate)this.stats.get(candidate[0])!.assists++;
  }
  snapshot(viewerId:string,players:readonly ScoreboardPlayer[],ctScore:number,tScore:number):ScoreboardSnapshot|undefined {
    const viewer=players.find(p=>p.id===viewerId);if(!viewer)return undefined;
    const rows=(role:Team):ScoreboardRow[]=>players.filter(p=>p.role===role&&this.stats.has(p.id))
      .sort((a,b)=>{
        const x=this.stats.get(a.id)!,y=this.stats.get(b.id)!;
        return y.kills-x.kills||y.assists-x.assists||x.deaths-y.deaths||x.order-y.order;
      }).slice(0,5).map((p,index)=>{
        const s=this.stats.get(p.id)!;
        return {name:p.name,rank:index+1,kills:s.kills,deaths:s.deaths,assists:s.assists,
          alive:p.alive,self:p.id===viewerId,...(role===viewer.role?{money:p.money}:{})};
      });
    return {ctScore,tScore,allyRole:viewer.role,ct:rows("CT"),t:rows("T")};
  }
}
