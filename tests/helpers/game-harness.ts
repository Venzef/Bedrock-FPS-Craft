import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import ts from "typescript";

const compiled=new Map<string,string>();
class Container {
  size=36;slots:any[]=Array(36);
  getItem(index:number){return this.slots[index];}
  setItem(index:number,item?:any){this.slots[index]=item;}
  clearAll(){this.slots=Array(36);}
  addItem(item:any){const index=this.slots.findIndex(i=>!i);if(index<0)return item;this.slots[index]=item;}
}
class ItemStack {
  lockMode="none";keepOnDeath=false;amount=1;
  constructor(public typeId:string){}
}
export function gameHarness(){
  const timers:Array<{callback:()=>void;ticks:number}>=[];
  const events=new Map<string,(event:any)=>void>();
  const dimension={id:"overworld",getEntities:()=>[],spawnItem:()=>{},playSound:()=>{}};
  class Player {
    container=new Container();name:string;selectedSlotIndex=0;mode="adventure";isValid=true;
    location={x:0,y:61,z:0};dimension=dimension;title="";actionBar="";isOnGround=true;
    inputPermissions={setPermissionCategory:()=>{}};
    onScreenDisplay={setTitle:(s:string)=>{this.title=s;},setActionBar:(s:string)=>{this.actionBar=s;}};
    constructor(public id:string){this.name=id;}
    health={currentValue:20,effectiveMin:0,effectiveMax:20,setCurrentValue:(value:number)=>{this.health.currentValue=value;}};
    getComponent(name:string){return name==="Inventory"?{container:this.container}:name==="Health"?this.health:undefined;}
    applyDamage(damage:number,source:any){
      const applied=Math.min(this.health.currentValue,damage/2);this.health.currentValue-=applied;
      events.get("entityHurt")?.({hurtEntity:this,damage:applied,damageSource:source});
      if(this.health.currentValue===0)events.get("entityDie")?.({deadEntity:this,damageSource:source});
    }
    getGameMode(){return this.mode;}
    setGameMode(mode:string){this.mode=mode;}
    getViewDirection(){return {x:0,y:0,z:1};}
    getHeadLocation(){return this.location;}
    teleport(location:any){this.location=location;}
    getEntitiesFromViewDirection(){return [];}
    sendMessage(){} playSound(){} runCommand(){}
  }
  const players=[new Player("a"),new Player("b"),new Player("c"),new Player("v"),new Player("lobby")];
  const eventGroup=new Proxy({},{get:(_target,name)=>({subscribe:(callback:any)=>events.set(String(name),callback)})});
  const objective={getScore:()=>0,setScore:()=>{}};
  const world={getAllPlayers:()=>players,getDynamicProperty:()=>undefined,setDynamicProperty:()=>{},sendMessage:()=>{},
    getDimension:()=>dimension,afterEvents:eventGroup,beforeEvents:eventGroup,scoreboard:{getObjective:()=>objective,addObjective:()=>objective}};
  const system={currentTick:10,run:(callback:()=>void)=>timers.push({callback,ticks:1}),runTimeout:(callback:()=>void,ticks:number)=>timers.push({callback,ticks}),runInterval:()=>{},afterEvents:eventGroup};
  const enumProxy=new Proxy({},{get:(_t,key)=>String(key)});
  const server={world,system,Player,ItemStack,EntityComponentTypes:enumProxy,EquipmentSlot:enumProxy,InputPermissionCategory:enumProxy,
    GameMode:{Adventure:"adventure",Spectator:"spectator"},EntityDamageCause:{override:"override",projectile:"projectile",entityAttack:"entityAttack"}};
  const cache=new Map<string,any>();
  const nativeRequire=createRequire(import.meta.url);
  const load=(path:string):any=>{
    if(path==="@minecraft/server")return server;
    if(path==="@minecraft/server-ui")return {uiManager:{closeAllForms:()=>{}},ActionFormData:class {}};
    if(!path.endsWith(".ts"))return nativeRequire(path);
    if(cache.has(path))return cache.get(path).exports;
    let code=compiled.get(path);
    if(!code){code=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;compiled.set(path,code);}
    const module={exports:{}};cache.set(path,module);
    runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:path})((specifier:string)=>load(specifier.startsWith(".")?resolve(dirname(path),specifier.replace(/\.js$/,".ts")):specifier),module,module.exports);
    return module.exports;
  };
  const {Game}=load(resolve("src/game.ts"));
  const game=new Game();
  game.state={phase:"LIVE",round:1,tScore:0,ctScore:0,lossStreak:{T:0,CT:0},timerTicks:400,players:players.map((p,i)=>({
    id:p.id,name:p.name,squad:i<3?"CT":"T",joined:i<4,connected:true,alive:true,activeFromRound:1,money:800,hasDefuseKit:false,
  }))};
  game.start();timers.length=0;
  game.syncScoreboardPlayers();
  return {game,players,timers,events,system};
}
