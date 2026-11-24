import {freshPortGame, gameReducer, getStats, type GameState, type BuildingId} from "../lib/game";
import {canOfferOpeningWave} from "../lib/opening-attention";
import {openingCollect, openingInputTime, newOpeningIndustry, portEvent} from "../lib/opening-industry";
import type {ManagerId} from "../lib/progression";
import {openingRepairCost} from "../lib/opening-operations";
import {contracts, goodsKeys, modeRules, operations, repeatContractRate, roles, training, works, type Goods, type Role} from "./catalog";
import {illuminate, launch, planFor, sail, score, type RunMode, type Voyage} from "./signals";

export interface Dispatch { ticket:number; sheet:string; option:string; goods:Partial<Record<Goods,number>>; due:number; cash:number; bonds:number }
export interface Report {id:number; mode:RunMode; op:number; win:boolean; stars:number; hp:number; cargo:number|null; quota:number; cash:number; bonds:number; wear:BuildingId[]; manual:number; bestStreak:number; lost:number; points:number; seconds:number}
export interface Harbor {
  port:GameState; run:number; serial:number; stars:Record<string,number>; archive:Record<string,number>; terminal:number[];
  roles:Record<Role,number>; voyage:Voyage|null; result:Report|null; history:Report[]; bonds:number; stamps:string[];
  jobs:Dispatch[]; wall:number; repair:{id:BuildingId;due:number}|null; secondSlot:boolean; depth:number; bestDepth:number;
  bestWeek:{week:number;score:number}|null; week:number; totalBase:number; tradeBadges:number; pennant:number; flags:number[];
  settings:{sound:boolean;motion:boolean;hints:boolean}; migrated:boolean;
}
export function newHarbor(port=freshPortGame(), migrated=false):Harbor {
  const highest=Math.max(0,Math.min(25,port.idle.modeBest.campaign||port.highestWave));
  const stars:Record<string,number>={};
  for(let i=1;i<=highest;i++) stars[i]=Math.max(1,port.idle.stars[String(i)]??port.idle.stars["campaign:"+i]??1);
  if(!port.opening) {
    port.opening=newOpeningIndustry(port.rngState);
    port.opening.activeSeconds=Math.max(0,Math.floor(port.elapsed));
    port.opening.nextPassage=port.opening.activeSeconds+12;
  }
  const ranks={steady:0,pulse:0,weight:0,mixed:0};
  for(const t of port.towers) {
    const key=t.kind==="ew"?"pulse":t.kind==="missile"?"weight":t.kind==="air"?"mixed":"steady";
    ranks[key]=Math.min(6,Math.max(ranks[key],t.tier));
  }
  const o=port.opening;
  if(port.openingOperations?.dockDamage) {
    o.wear={...o.wear,dock:port.openingOperations.dockDamage};
    port.openingOperations={...port.openingOperations,dockDamage:0,serviceDue:null};
  }
  port.phase="peace";port.battle=null;port.speed=1;port.idle.autoBattle=false;
  port.enemies=[];port.shots=[];port.popups=[];port.pendingImpacts=[];port.events=[];
  o.stationMW=roles.reduce((sum,r)=>sum+r.mw*ranks[r.id],0);
  return {port,run:1,serial:0,stars,archive:{...stars},terminal:Object.keys(stars).map(Number),roles:ranks,voyage:null,result:null,history:[],
    bonds:0,stamps:Object.keys(stars).map(id=>"op/"+id),jobs:[],wall:0,repair:null,secondSlot:false,depth:1,bestDepth:0,bestWeek:null,week:0,
    totalBase:0,tradeBadges:0,pennant:0,flags:[0],settings:{sound:true,motion:true,hints:true},migrated};
}
export function clearedThrough(h:Harbor) {
  let n=0;
  while(n<operations.length && h.stars[n+1]>0)n++;
  return n;
}
export function stationPrice(h:Harbor,id:Role) {
  const r=roles.find(row=>row.id===id)!,level=h.roles[id];
  return {cash:Math.ceil(r.cash*Math.pow(1.55,level)),steel:Math.ceil(r.steel*(1+.6*level)),available:clearedThrough(h)+1>=r.from&&level<6};
}
export function entryReason(h:Harbor,op:number) {
  if(op<1 || op>45 || op>clearedThrough(h)+1)return "ابتدا عملیات قبلی را به پایان برسان.";
  if(op===1 && !h.stars[1] && !canOfferOpeningWave(h.port.opening))return "مجوز عبور پس از دو دقیقهٔ کاری و ثبت اولین عوارض می‌رسد.";
  const project=operations[op-1].projects.find(id=>!h.port.opening?.works?.includes(id));
  if(project)return "طرح لازم برای ورود: "+works.find(w=>w.id===project)!.fa;
  return null;
}
export function weekKey(now:number) {return Math.floor((now+3*86400000)/604800000);}
export function weeklyOp(week:number) {return operations[4+((week%20)+20)%20];}
export type Intent =
  | {type:"collect"} | {type:"inspect"} | {type:"upgrade";id:BuildingId;level:number;guided:boolean} | {type:"split";value:number}
  | {type:"manager";id:ManagerId;level:number}
  | {type:"station";role:Role;level:number} | {type:"works";id:string}
  | {type:"repair";id:BuildingId;damage:number;method:"paid"|"service"}
  | {type:"launch";mode:RunMode;op:number;role:Role;spaced:boolean;week:number}
  | {type:"tap";id:number} | {type:"priority"} | {type:"end-practice"} | {type:"close-report";id:number}
  | {type:"dispatch";sheet:string;option:string;serial:number} | {type:"shipment";ticket:number;how:"settle"|"cancel"|"instant"}
  | {type:"second-slot"} | {type:"pennant";color:number} | {type:"new-run";run:number}
  | {type:"setting";key:keyof Harbor["settings"];on:boolean};

function withPort(h:Harbor) {return {...h,port:{...h.port,opening:{...h.port.opening!,ledger:{...h.port.opening!.ledger},events:[...h.port.opening!.events]},idle:{...h.port.idle}}};}
function newStamp(h:Harbor,key:string,amount:number) {
  if(h.stamps.includes(key))return 0;
  h.stamps=[...h.stamps,key];h.bonds+=amount;return amount;
}
function finish(input:Harbor):Harbor {
  const v=input.voyage;
  if(!v?.done)return input;
  const h=withPort(input),op=planFor(v),points=score(v);
  const report:Report={id:v.id,mode:v.mode,op:v.op,...points,hp:v.hp,cargo:v.cargo,cash:0,bonds:0,wear:[],manual:v.manual,bestStreak:v.bestStreak,lost:v.escaped,seconds:Math.ceil(v.time)};
  if(v.mode==="campaign") {
    if(points.win) {
      report.cash=h.stars[v.op]?op.repeatCash:op.firstCash;
      report.bonds=newStamp(h,"op/"+v.op,op.bonds);
      h.port.cash+=report.cash;h.port.idle.xp+=20+points.stars*5;
      h.stars={...h.stars,[v.op]:Math.max(points.stars,h.stars[v.op]??0)};
      h.archive={...h.archive,[v.op]:Math.max(points.stars,h.archive[v.op]??0)};
    }
    if(!h.terminal.includes(v.op)) {
      h.terminal=[...h.terminal,v.op];
      if(v.op>=3) {
        const severe=!points.win||v.hp<10||(v.cargo!==null&&v.cargo<4);
        const light=v.hp<17||(op.escort!==null&&v.cargo!==null&&3*v.cargo<2*op.escort);
        const count=severe?2:light?1:0;
        const targets=op.vulnerable.filter(id=>h.port.buildings[id]>0).slice(0,v.op<11?1:2);
        if(!targets.length)targets.push("dock");
        const wear={...h.port.opening!.wear};
        for(let i=0;i<count;i++) {
          const id=targets[i%targets.length];
          if((wear[id]??0)<3){wear[id]=(wear[id]??0)+1;report.wear.push(id);}
        }
        h.port.opening!.wear=wear;
      }
    }
  } else if(v.mode==="endless") {
    if(points.win) {
      h.depth++;h.bestDepth=Math.max(h.bestDepth,v.depth);
      const prizes=modeRules.endless.personal_depth_grants;
      const key="depth/"+v.depth,first=!h.stamps.includes(key);
      if(v.depth<=50 && first) {
        report.cash=modeRules.endless.per_depth_soft_once;h.port.cash+=report.cash;
        report.bonds=newStamp(h,key,prizes[String(v.depth) as keyof typeof prizes]??0);
      }
    } else h.depth=1+Math.floor((v.depth-1)/5)*5;
  } else if(v.mode==="weekly" && (h.bestWeek?.week!==h.week || h.bestWeek.score<points.points))h.bestWeek={week:h.week,score:points.points};
  h.voyage=null;h.result=report;
  if(v.mode!=="practice")h.history=[report,...h.history].slice(0,18);
  return h;
}
function payRepair(h:Harbor,id:BuildingId) {
  const price=openingRepairCost(h.port.buildings[id]);
  if(h.port.cash<price.cash)openingCollect(h.port,true);
  h.port.opening!.ledger.spent+=Math.min(h.port.cash,price.cash);
  h.port.cash=Math.max(0,h.port.cash-price.cash);h.port.steel=Math.max(0,h.port.steel-price.steel);
  const wear={...h.port.opening!.wear};wear[id]=Math.max(0,(wear[id]??0)-1);h.port.opening!.wear=wear;h.repair=null;
}
export function repairQuote(h:Harbor,id:BuildingId) {
  const price=openingRepairCost(h.port.buildings[id]);
  return {...price,affordable:h.port.steel>=price.steel && h.port.cash+Math.floor(h.port.idle.bank)>=price.cash};
}
export function advance(h:Harbor,seconds:number,battleSeconds:number):Harbor {
  if(!Number.isFinite(seconds)||seconds<0)return h;
  const port=seconds>0?gameReducer(h.port,{type:"advance",steps:0,battlePaused:true,openingElapsed:seconds}):h.port;
  if(port!==h.port){port.elapsed+=seconds;port.popups=[];}
  let next={...h,port,wall:h.wall+seconds};
  if(next.repair && next.port.opening!.activeSeconds>=next.repair.due){next=withPort(next);payRepair(next,next.repair!.id);}
  for(let i=0;i<Math.floor(battleSeconds*4+.00001)&&next.voyage;i++) next=finish({...next,voyage:sail(next.voyage)});
  return next;
}
function reserve(h:Harbor) {
  const amounts:Partial<Record<Goods,number>>={};
  for(const job of h.jobs)for(const k of goodsKeys)amounts[k]=(amounts[k]??0)+(job.goods[k]??0);
  h.port.opening!.reserved=amounts;
}
export function contractQuote(h:Harbor,sheet:string,option:string) {
  const contract=contracts.find(c=>c.id===sheet),offer=contract?.options.find(o=>o.id===option);
  if(!contract||!offer)return null;
  const manifest=offer.manifest as Partial<Record<Goods,number>>;
  const affordable=goodsKeys.every(k=>h.port[k]>=(manifest[k]??0)) && h.port.fuel-(manifest.fuel??0)>=offer.reserves_after.fuel;
  const repeat=h.stamps.includes("sheet/"+sheet);
  return {contract,offer,manifest,affordable,cash:repeat?Math.floor(offer.cash*repeatContractRate):offer.cash,bonds:repeat?0:contract.account_first_bonds};
}
export function nextPrestige(h:Harbor) {
  const r=modeRules.prestige,o=h.port.opening!;
  const totalBase=h.totalBase+(o.ledger.exportIncome+o.ledger.tolls)/(o.priceFactor??1);
  const tradeBadges=Math.max(h.tradeBadges,Math.floor(Math.sqrt(totalBase/r.revenue_rial_per_squared_badge)));
  const ladder=r.income_percent_by_completed_resets,percent=Math.min(r.income_cap_percent,ladder[Math.min(h.run,ladder.length-1)]+tradeBadges*r.trade_badge_extra_income_points);
  return {totalBase,tradeBadges,percent};
}
export function act(input:Harbor,a:Intent):Harbor {
  const h=withPort(input),p=h.port,o=p.opening!;
  switch(a.type) {
    case "setting":return {...input,settings:{...input.settings,[a.key]:a.on}};
    case "tap":return h.voyage?finish({...h,voyage:illuminate(h.voyage,a.id)}):input;
    case "priority":return h.voyage?{...h,voyage:{...h.voyage,policy:h.voyage.policy==="soon"?"marked":"soon"}}:input;
    case "end-practice":return h.voyage?.mode==="practice"?{...h,voyage:null}:input;
    case "close-report":return h.result?.id===a.id?{...h,result:null}:input;
    case "collect":return {...h,port:gameReducer(p,{type:"collect-income"})};
    case "inspect":return {...h,port:gameReducer(p,{type:"opening-inspect-tank"})};
    case "split":return {...h,port:gameReducer(p,{type:"split",value:a.value})};
    case "upgrade":return {...h,port:gameReducer(p,{type:"upgrade-building",id:a.id,expectedLevel:a.level,guided:a.guided})};
    case "manager":return p.idle.managerLevels[a.id]===a.level?{...h,port:gameReducer(p,{type:"hire-manager",id:a.id})}:input;
    case "station": {
      const q=stationPrice(h,a.role);
      if(h.voyage||!q.available||h.roles[a.role]!==a.level||p.cash<q.cash||p.steel<q.steel)return input;
      p.cash-=q.cash;p.steel-=q.steel;o.ledger.spent+=q.cash;
      h.roles={...h.roles,[a.role]:a.level+1};o.stationMW=roles.reduce((n,r)=>n+r.mw*h.roles[r.id],0);break;
    }
    case "works": {
      const w=works.find(w=>w.id===a.id);
      if(!w||clearedThrough(h)<w.reveal_after||o.works?.includes(w.id)||p.cash<w.cash||p.steel<w.steel)return input;
      p.cash-=w.cash;p.steel-=w.steel;o.ledger.spent+=w.cash;o.works=[...o.works??[],w.id];break;
    }
    case "repair": {
      if(h.repair||!p.buildings[a.id]||!a.damage||o.wear?.[a.id]!==a.damage)return input;
      const q=repairQuote(h,a.id);
      if(q.affordable && a.method==="paid")payRepair(h,a.id);
      else if(!q.affordable && a.method==="service")h.repair={id:a.id,due:o.activeSeconds+30};
      else return input;
      break;
    }
    case "launch": {
      if(h.voyage||h.result)return input;
      if(a.mode==="campaign"&&entryReason(h,a.op))return input;
      if(a.mode==="endless"&&!h.archive[45])return input;
      const op=a.mode==="practice"?training:a.mode==="endless"?operations[35+(h.depth-1)%10]:a.mode==="weekly"?weeklyOp(a.week):operations[a.op-1];
      if(!op)return input;
      const standard=a.mode==="weekly"||a.mode==="practice";
      const role=standard?"steady":a.role;
      const rank=standard?1:Math.max(op.id===1?1:0,h.roles[role]);
      if(a.mode==="campaign" && op.id===1 && o.manualWaveAt===null) {
        o.manualWaveAt=openingInputTime(o);portEvent(o,"wave_manual",undefined,undefined,o.manualWaveAt);
      }
      h.week=a.week;
      h.voyage=launch(++h.serial,op,a.mode,role,rank,standard?1:Math.max(.55,getStats(p).grid)*(1+.015*(h.run-1+h.tradeBadges)),a.spaced,h.depth);
      if(!standard)h.voyage.radioBoost=1+.08*p.idle.managerLevels.supply;
      break;
    }
    case "dispatch": {
      const q=contractQuote(h,a.sheet,a.option);
      if(!q||a.serial!==h.serial||!q.affordable||clearedThrough(h)<q.contract.requires_op_cleared||h.jobs.some(j=>j.sheet===a.sheet)||h.jobs.length>=(h.secondSlot?2:1))return input;
      for(const k of goodsKeys)p[k]-=q.manifest[k]??0;
      h.jobs=[...h.jobs,{ticket:++h.serial,sheet:a.sheet,option:a.option,goods:{...q.manifest},due:h.wall+q.offer.service_wall_s,cash:q.cash,bonds:q.bonds}];
      reserve(h);break;
    }
    case "shipment": {
      const job=h.jobs.find(j=>j.ticket===a.ticket);
      if(!job)return input;
      if(a.how==="cancel") {for(const k of goodsKeys)p[k]+=job.goods[k]??0;}
      else {
        if(job.due>h.wall) {if(a.how!=="instant"||h.bonds<25)return input;h.bonds-=25;}
        p.cash+=job.cash;newStamp(h,"sheet/"+job.sheet,job.bonds);
      }
      h.jobs=h.jobs.filter(j=>j.ticket!==a.ticket);reserve(h);break;
    }
    case "second-slot":
      if(h.secondSlot||h.bonds<280||clearedThrough(h)<25)return input;
      h.bonds-=280;h.secondSlot=true;break;
    case "pennant":
      if(![0,1,2,3].includes(a.color))return input;
      if(!h.flags.includes(a.color)){if(h.bonds<2)return input;h.bonds-=2;h.flags=[...h.flags,a.color];}
      h.pennant=a.color;break;
    case "new-run": {
      if(a.run!==h.run||!h.stars[45]||h.voyage||h.jobs.length||h.result)return input;
      const award=nextPrestige(h),next=newHarbor();
      next.run=h.run+1;next.serial=h.serial;next.port.opening!.priceFactor=award.percent/100;
      next.port.opening!.mastery=o.mastery;next.port.idle.managerLevels={...p.idle.managerLevels};
      return {...next,bonds:h.bonds,stamps:h.stamps,archive:h.archive,pennant:h.pennant,flags:h.flags,bestDepth:h.bestDepth,bestWeek:h.bestWeek,settings:h.settings,
        totalBase:award.totalBase,tradeBadges:award.tradeBadges,history:h.history,secondSlot:h.secondSlot,wall:h.wall};
    }
  }
  return h;
}
