import economy from "../data/reopening/economy.json";
import attention from "../data/reopening/attention.json";
import { canOfferOpeningWave } from "./opening-attention";
import type { BuildingId, GameState, Merchant } from "./game";

const UNIT = 1_000_000;
const { opening, facilities, trade, stock, power, upgrade, offline } = economy;
const ids = Object.keys(facilities) as BuildingId[];
const money = (n: number) => Math.round(n * UNIT) / UNIT;
type EventKind = "first_toll" | "withdraw" | "stall" | "upgrade" | "user_recovery" | "natural_recovery" | "wave_manual" | "help" | "inspect_tank";
type Book = { exportedOil:number; exportIncome:number; tolls:number; collected:number; spent:number };
type PortEvent = { kind: EventKind; at:number; amount?:number; guided?:boolean };
type CarryKey = "well" | "export" | "exportMoney" | "burn" | "reserve" | "refine" | "reserveYield" | "refineYield" | "steelBatch" | "ammoBatch";

export interface OpeningIndustry {
  version: 52;
  seed:number;
  activeSeconds:number;
  /** Fractional active second, persisted independently of the capped combat frame clock. */
  remainder:number;
  phaseAge:number;
  nextPassage:number;
  generated:number;
  lastExportedOil:number;
  lastExportIncome:number;
  lastSteel:number;
  stalled:boolean;
  stallEpisode:number;
  stallStartedAt:number|null;
  inspectedEpisode:number;
  firstTollAt:number|null;
  lastToll:{shipId:number;at:number;amount:number}|null;
  collectedFirstToll:boolean;
  mastery:boolean;
  manualWaveAt:number|null;
  helpRequestedAt:number|null;
  pendingPurchase:{at:number;episode:number;oldCapacity:number;guided:boolean}|null;
  recoveryReceipt:{id:string;episode:number;paidAt:number;positiveAt:number;guided:boolean;helpRequestedAt:number|null}|null;
  ledger:Book;
  events:PortEvent[];
  carry:Partial<Record<CarryKey,number>>;
  offlineHigh:number;
  offlineRemainder:number;
  managerClock:number;
}
export function newOpeningIndustry(seed:number): OpeningIndustry {
  return {version:52,seed,activeSeconds:0,remainder:0,phaseAge:0,nextPassage:Math.ceil(75-.45*opening.security),
    generated:0,lastExportedOil:0,lastExportIncome:0,lastSteel:0,stalled:false,stallEpisode:0,stallStartedAt:null,inspectedEpisode:0,
    firstTollAt:null,lastToll:null,collectedFirstToll:false,mastery:false,manualWaveAt:null,helpRequestedAt:null,pendingPurchase:null,recoveryReceipt:null,
    ledger:{exportedOil:0,exportIncome:0,tolls:0,collected:0,spent:0},events:[],carry:{},offlineHigh:0,offlineRemainder:0,managerClock:0};
}
export function initializeReopening(s:GameState) {
  for (const k of ["oil","fuel","steel","ammo","cash","security"] as const) s[k] = opening[k];
  for (const id of ids) s.buildings[id] = facilities[id].opening_level;
  s.oilSplit=100*opening.export_share;
  s.idle.bank=opening.bank;
  s.idle.port={tanker:{stage:"loading",progress:1,load:opening.tanker_load},nextIn:0,cycles:0,exportedDollars:0};
  s.trafficCount=1;
  s.merchants=[{id:1,kind:"barge",inbound:false,progress:trade.receipt_progress-trade.first_receipt_sec/trade.standard_crossing_s.barge,
    reward:trade.duty.barge,paid:false}];
  s.opening=newOpeningIndustry(s.rngState);
  return s;
}

const record = (v:unknown):v is Record<string,unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const valid = (v:unknown):v is number => typeof v==="number" && Number.isFinite(v) && v>=0;
export function restoreOpeningIndustry(raw:unknown):OpeningIndustry|undefined {
  if (!record(raw) || raw.version!==52 || !valid(raw.seed)) return undefined;
  const result=newOpeningIndustry(raw.seed);
  for (const key of ["activeSeconds","phaseAge","nextPassage","generated","lastExportedOil","lastExportIncome","lastSteel","stallEpisode","offlineHigh","inspectedEpisode"] as const) {
    const n=raw[key]; if (valid(n)) result[key]=n;
  }
  result.activeSeconds=Math.min(Number.MAX_SAFE_INTEGER,Math.floor(result.activeSeconds));
  for (const key of ["remainder","offlineRemainder","managerClock"] as const) {
    const n=raw[key]; if (valid(n)) result[key]=n % (key==="remainder"?1:key==="offlineRemainder"?offline.clock_wall_per_industry_second:10);
  }
  for (const key of ["firstTollAt","manualWaveAt","helpRequestedAt","stallStartedAt"] as const) {
    const n=raw[key]; if (valid(n) && n<=openingInputTime(result)) result[key]=n;
  }
  for (const key of ["stalled","mastery","collectedFirstToll"] as const) result[key]=raw[key]===true;
  if (record(raw.ledger)) for(const key of Object.keys(result.ledger) as (keyof Book)[]) {
    const n=raw.ledger[key]; if(valid(n)) result.ledger[key]=n;
  }
  const receipt=raw.lastToll;
  if(record(receipt)&&valid(receipt.shipId)&&valid(receipt.at)&&receipt.at<=result.activeSeconds&&valid(receipt.amount)) result.lastToll={shipId:receipt.shipId,at:receipt.at,amount:receipt.amount};
  const pending=raw.pendingPurchase;
  if(record(pending)&&valid(pending.at)&&pending.at<=openingInputTime(result)&&openingInputTime(result)-pending.at<=attention.episode_apply_window_active_s&&pending.episode===result.stallEpisode&&valid(pending.oldCapacity))
    result.pendingPurchase={at:pending.at,episode:result.stallEpisode,oldCapacity:pending.oldCapacity,guided:pending.guided===true};
  const recovery=raw.recoveryReceipt;
  if(record(recovery)&&typeof recovery.id==="string"&&valid(recovery.episode)&&valid(recovery.paidAt)&&valid(recovery.positiveAt)&&recovery.paidAt<=recovery.positiveAt&&recovery.positiveAt<=result.activeSeconds)
    result.recoveryReceipt={id:recovery.id.slice(0,100),episode:recovery.episode,paidAt:recovery.paidAt,positiveAt:recovery.positiveAt,
      guided:recovery.guided===true,helpRequestedAt:valid(recovery.helpRequestedAt)?recovery.helpRequestedAt:null};
  if(record(raw.carry)) for (const k of ["well","export","exportMoney","burn","reserve","refine","reserveYield","refineYield","steelBatch","ammoBatch"] as const) {
    const n=raw.carry[k]; if(valid(n)&&n<1) result.carry[k]=n;
  }
  const kinds:EventKind[]=["first_toll","withdraw","stall","upgrade","user_recovery","natural_recovery","wave_manual","help","inspect_tank"];
  if(Array.isArray(raw.events)) for(const e of raw.events.slice(-96)) {
    if(record(e) && kinds.includes(e.kind as EventKind) && valid(e.at)&&e.at<=Math.min(180,openingInputTime(result)))
      result.events.push({kind:e.kind as EventKind,at:e.at,...(valid(e.amount)?{amount:e.amount}:{}),...(typeof e.guided==="boolean"?{guided:e.guided}:{})});
  }
  return result;
}
export function openingInputTime(o:OpeningIndustry) { return o.activeSeconds+o.remainder; }
export function portEvent(o:OpeningIndustry,kind:EventKind,amount?:number,guided?:boolean,at=o.activeSeconds) {
  // The first three minutes form a durable, bounded observation log; all-time totals live in the ledger.
  if(o.events.length<96 && at<=180) o.events.push({kind,at,amount,guided});
}
export function openingPrice(id:BuildingId,fromLevel:number) {
  const level=Math.max(0,Math.min(99,Math.floor(fromLevel)));
  const early=Math.min(19,level),late=level-early;
  const den=BigInt(100)**BigInt(level);
  const num=BigInt(facilities[id].base_capex)*BigInt(112)**BigInt(early)*BigInt(105)**BigInt(late);
  return Number((num+den-BigInt(1))/den);
}
export function openingCapacity(s:GameState) {
  return stock.oil_tank_capacity_per_level*s.buildings.tank*(s.research.includes("tanktech")?1.2:1);
}
export function openingNextTollIn(s:GameState) {
  const pending=s.merchants.filter(m=>!m.paid).map(m=>Math.max(0,Math.ceil((trade.receipt_progress-m.progress)*trade.standard_crossing_s[m.kind]-1e-9)));
  const n=s.trafficCount+1;
  const kind=s.security>=80&&n%7===0?"tanker":s.security>=50&&n%4===0?"container":s.security>=20&&n%2===0?"bulk":"barge";
  const future=(s.opening?.nextPassage??0)-(s.opening?.activeSeconds??0)+Math.ceil(trade.receipt_progress*trade.standard_crossing_s[kind]);
  return Math.min(future,...pending);
}
export function openingWaveAvailable(s:GameState) {
  return canOfferOpeningWave(s.opening);
}
export function openingStats(s:GameState,towerMW:number,dockEfficiency:number) {
  const b=s.buildings;
  const burn=power.fuel_per_s_per_level*b.power*(s.research.includes("gas")?.7:1);
  const powerProduced=facilities.power.base_output*b.power*(s.research.includes("oilmaster")?1.15:1)*
    (power.emergency_fraction+(1-power.emergency_fraction)*Math.min(1,burn>0?s.fuel/burn:1));
  const powerUsed=towerMW+ids.reduce((sum,id)=>sum+facilities[id].mw_per_level*b[id],0);
  const grid=Math.min(1,powerProduced/Math.max(1,powerUsed));
  const waterProduced=facilities.water.base_output*b.water*grid*(s.research.includes("watertech")?2:1);
  const waterUsed=power.water_usage.city*b.city+power.water_usage.refinery*b.refinery;
  const water=Math.min(1,waterProduced/Math.max(1,waterUsed));
  const stability=Math.min(100,40*water+15*Math.min(b.city,2)+Math.min(20,4*b.welfare)+.1*s.security+
    (s.research.includes("housing")?5:0)+(s.research.includes("stability")?5:0));
  const productionBoost=s.idle.boostRemaining>0?2:1;
  const multi=grid*(.8+.002*stability)*productionBoost;
  function output(id:BuildingId) {
    const milestoneBonus=upgrade.output_bonus_facilities.includes(id)?1+.12*upgrade.milestones.filter(m=>b[id]>=m).length:1;
    return facilities[id].base_output*b[id]*milestoneBonus*multi*(id==="dock"?dockEfficiency:1);
  }
  const oilRate=output("oil")*(s.research.includes("drill")?1.25:1)*(s.research.includes("seabed")?1.1:1)*(1+.15*s.idle.managerLevels.energy)
    +(s.idle.platforms?.length??0)*8*grid;
  const exportRate=output("dock")*(s.oilSplit/100)*(s.research.includes("dockauto")?1.25:1);
  const unitPrice=trade.oil_unit_price*(s.research.includes("trade")?1.5:1);
  return {powerProduced,powerUsed,waterProduced,waterUsed,grid,stability,multi,productionBoost,output,oilRate,
    exportRate,dollarRate:exportRate*unitPrice,oilCapacity:openingCapacity(s),bankCapacity:1600+375*(b.dock-1),
    realExportRate:s.opening?.lastExportIncome??0,avgExportRate:s.idle.exportWindowDollars/Math.max(60,s.idle.exportWindowTime),
    steelRate:s.opening?.lastSteel??0,unitPrice,burn,water};
}

// Transfer integer millionths; retain sub-microunit work only when the flow was not constrained by stock or room.
function flow(o:OpeningIndustry,key:CarryKey,potential:number,bound:number) {
  const raw=Math.max(0,potential)*UNIT+(o.carry[key]??0);
  const whole=Math.floor(raw+1e-7);
  const amount=Math.min(whole,Math.floor(Math.max(0,bound)*UNIT+1e-7));
  o.carry[key]=amount<whole?0:Math.max(0,raw-whole);
  return amount/UNIT;
}
export function openingCollect(s:GameState,manual:boolean) {
  const o=s.opening!;
  const amount=Math.floor(s.idle.bank);
  if(amount<1) return;
  s.cash=money(s.cash+amount); s.idle.bank=money(s.idle.bank-amount);
  s.idle.collected+=amount; s.idle.collections++; o.ledger.collected+=amount;
  if(manual) {
    s.idle.lastCollectionAt=s.elapsed;
    if(o.firstTollAt!==null) o.collectedFirstToll=true;
    portEvent(o,"withdraw",amount,undefined,openingInputTime(o));
  }
}
export function openingTankOrder(s:GameState,cost:number,oldCapacity:number,guided:boolean) {
  const o=s.opening!;
  o.ledger.spent+=cost;
  portEvent(o,"upgrade",cost,guided,openingInputTime(o));
  if(o.stalled&&!o.pendingPurchase) o.pendingPurchase={at:openingInputTime(o),episode:o.stallEpisode,oldCapacity,guided};
}
function commerceSecond(s:GameState,o:OpeningIndustry,bankCap:number,position:(ship:Merchant,layout:GameState["layout"])=>{x:number;y:number}) {
  for(const ship of s.merchants) {
    ship.progress+=1/trade.standard_crossing_s[ship.kind];
    if(!ship.paid && ship.progress+1e-10>=trade.receipt_progress) {
      ship.paid=true;
      const credited=money(Math.max(0,Math.min(ship.reward,bankCap-s.idle.bank)));
      s.idle.bank=money(s.idle.bank+credited);
      s.idle.lifetimeIncome=money(s.idle.lifetimeIncome+credited);
      o.ledger.tolls=money(o.ledger.tolls+credited);
      o.lastToll={shipId:ship.id,at:o.activeSeconds,amount:credited};
      if(credited>0 && o.firstTollAt===null) {o.firstTollAt=o.activeSeconds;portEvent(o,"first_toll",credited);}
      if(credited>0) s.popups.push({id:s.nextId++,merchantId:ship.id,...position(ship,s.layout),text:`عوارض +${credited.toLocaleString("fa-IR")}`,life:2});
    }
  }
  s.merchants=s.merchants.filter(m=>m.progress<1);
  if(o.activeSeconds>=o.nextPassage) {
    const n=++s.trafficCount;
    const kind=s.security>=80&&n%7===0?"tanker":s.security>=50&&n%4===0?"container":s.security>=20&&n%2===0?"bulk":"barge";
    s.merchants.push({id:s.nextId++,progress:0,inbound:n%2===0,kind,reward:trade.duty[kind],paid:false});
    o.nextPassage=o.activeSeconds+Math.ceil(75-.45*s.security);
  }
}
type Rates=ReturnType<typeof openingStats>;
type Dependencies={rates:(s:GameState)=>Rates; position:(ship:Merchant,layout:GameState["layout"])=>{x:number;y:number}; service:(s:GameState)=>void; timers:(s:GameState,dt:number)=>void; exportWindow:(s:GameState,dt:number)=>void};
function quantum(s:GameState,o:OpeningIndustry,deps:Dependencies,online:boolean) {
  if(online) {
    o.activeSeconds++;
    deps.timers(s,1);
  }
  deps.exportWindow(s,1);
  const r=deps.rates(s);
  const priorOil=s.oil;
  o.generated=flow(o,"well",r.oilRate,r.oilCapacity-s.oil);
  s.oil=money(s.oil+o.generated);
  const burn=flow(o,"burn",r.burn,s.fuel);
  s.fuel=money(s.fuel-burn);
  const fuelCap=stock.fuel_cap*(s.research.includes("reserve")?1.2:1);
  const guard=Math.min(fuelCap,power.normal_generator_fuel_guard_s*r.burn);
  const yieldRatio=stock.packages.refine.fuel_out/stock.packages.refine.oil*(s.research.includes("refine")?1.2:1);
  const refinery=r.output("refinery")*(.6+.4*r.water)*(s.research.includes("pipe")?1.5:1)*(1+.15*s.idle.managerLevels.energy);
  const reserve=flow(o,"reserve",refinery,Math.min(s.oil,(guard-s.fuel)/yieldRatio,(fuelCap-s.fuel)/yieldRatio));
  s.oil=money(s.oil-reserve); s.fuel=money(s.fuel+flow(o,"reserveYield",reserve*yieldRatio,fuelCap-s.fuel));
  const pack=stock.packages;
  const arms=flow(o,"ammoBatch",r.output("arms")/pack.ammo.ammo_out,
    Math.min((s.fuel-guard)/pack.ammo.fuel,s.steel/pack.ammo.steel,(stock.initial_ammo_make_to-s.ammo)/pack.ammo.ammo_out));
  s.fuel=money(s.fuel-arms*pack.ammo.fuel);s.steel=money(s.steel-arms*pack.ammo.steel);s.ammo=money(s.ammo+arms*pack.ammo.ammo_out);
  const steel=flow(o,"steelBatch",r.output("steel")/pack.steel.steel_out,
    Math.min(s.oil/pack.steel.oil,(s.fuel-guard)/pack.steel.fuel,(stock.initial_steel_make_to-s.steel)/pack.steel.steel_out));
  s.oil=money(s.oil-steel*pack.steel.oil);s.fuel=money(s.fuel-steel*pack.steel.fuel);o.lastSteel=money(steel*pack.steel.steel_out);s.steel=money(s.steel+o.lastSteel);
  const port=s.idle.port,tanker=port.tanker;
  o.lastExportedOil=0;o.lastExportIncome=0;
  if(tanker?.stage==="loading") {
    const capacity=500+500*s.buildings.dock;
    const room=Math.max(0,r.bankCapacity-s.idle.bank);
    const moved=flow(o,"export",r.exportRate,Math.min(s.oil,capacity-tanker.load,room/r.unitPrice));
    const paid=flow(o,"exportMoney",moved*r.unitPrice,room);
    s.oil=money(s.oil-moved); tanker.load=money(tanker.load+moved);
    s.idle.bank=money(s.idle.bank+paid);port.exportedDollars=money(port.exportedDollars+paid);
    s.idle.lifetimeIncome=money(s.idle.lifetimeIncome+paid);s.idle.exportWindowDollars=money(s.idle.exportWindowDollars+paid);
    o.lastExportedOil=moved;o.lastExportIncome=paid;
    o.ledger.exportedOil=money(o.ledger.exportedOil+moved);o.ledger.exportIncome=money(o.ledger.exportIncome+paid);
    if(tanker.load>=capacity || (s.oil===0&&tanker.load>0)) {tanker.stage="depart"; o.phaseAge=0;tanker.progress=1;}
  } else {
    o.phaseAge++;
    if(!tanker) {
      port.nextIn=Math.max(0,trade.between_tankers_seconds-o.phaseAge);
      if(port.nextIn===0) {port.tanker={stage:"approach",progress:0,load:0};o.phaseAge=0;}
    } else if(tanker.stage==="depart") {
      tanker.progress=Math.max(0,1-o.phaseAge/trade.departure_seconds);
      if(o.phaseAge>=trade.departure_seconds) {port.tanker=null;port.nextIn=trade.between_tankers_seconds;port.cycles++;o.phaseAge=0;}
    } else {
      tanker.progress=Math.min(1,o.phaseAge/trade.arrival_seconds);
      if(tanker.progress===1){tanker.stage="loading";o.phaseAge=0;}
    }
  }
  const refined=flow(o,"refine",Math.max(0,refinery-reserve)*(1-s.oilSplit/100),Math.min(s.oil,(fuelCap-s.fuel)/yieldRatio));
  s.oil=money(s.oil-refined);s.fuel=money(s.fuel+flow(o,"refineYield",refined*yieldRatio,fuelCap-s.fuel));
  if(online) commerceSecond(s,o,r.bankCapacity,deps.position);
  if(s.idle.managerLevels.harbor>0 && ++o.managerClock>=10) {o.managerClock=0;openingCollect(s,false);}
  const blocked=o.generated===0&&priorOil>=r.oilCapacity&&r.oilRate>0;
  if(online && !o.stalled && blocked) {o.stallEpisode++;o.stallStartedAt=o.activeSeconds;portEvent(o,"stall");}
  if(o.stalled && !blocked && o.generated>0) {
    const p=o.pendingPurchase;
    if(online && p&&p.episode===o.stallEpisode&&o.activeSeconds-p.at<=attention.episode_apply_window_active_s&&priorOil>=p.oldCapacity) {
      o.mastery=true;
      o.recoveryReceipt ??= {id:`opening:${o.seed}:tank:${p.episode}`,episode:p.episode,paidAt:p.at,positiveAt:o.activeSeconds,guided:p.guided,helpRequestedAt:o.helpRequestedAt};
      portEvent(o,"user_recovery",o.generated,p.guided);
    } else if(online) portEvent(o,"natural_recovery",o.generated);
  }
  o.stalled=blocked;
  if(!blocked) o.stallStartedAt=null;
  if(o.pendingPurchase && (!blocked||!online||o.activeSeconds-o.pendingPurchase.at>attention.episode_apply_window_active_s)) o.pendingPurchase=null;
}
export function advanceReopening(s:GameState,dt:number,deps:Dependencies) {
  const o=s.opening;
  if(!o||!Number.isFinite(dt)||dt<=0) return;
  const elapsed=o.remainder+dt;
  const whole=Math.floor(elapsed+1e-10);
  o.remainder=Math.max(0,elapsed-whole);
  for(let i=0;i<whole;i++) quantum(s,o,deps,true);
  deps.service(s);
}
export function settleReopeningAbsence(s:GameState,from:number,to:number,deps:Dependencies) {
  const o=s.opening!;
  if(!Number.isFinite(from)||!Number.isFinite(to)||to<=Math.max(from,o.offlineHigh))return;
  const actual=Math.floor((to-Math.max(from,o.offlineHigh))/1000);
  o.offlineHigh=to;
  if(actual<offline.minimum_wall_seconds)return;
  const cap=s.idle.managerLevels.harbor>=1?offline.tier_caps_s.harbor_manager_rank_1:s.buildings.tank>=3?offline.tier_caps_s.tank_level_3:offline.tier_caps_s.base;
  const period=offline.clock_wall_per_industry_second;
  const firstTick=period-o.offlineRemainder;
  const n=Math.min(cap,actual)+o.offlineRemainder;
  const ticks=Math.floor(n/period);
  o.offlineRemainder=n%offline.clock_wall_per_industry_second;
  const boostAtExit=s.idle.boostRemaining;
  for(let i=0;i<ticks;i++) {
    s.idle.boostRemaining=Math.max(0,boostAtExit-(firstTick+i*period));
    quantum(s,o,deps,false);
  }
  s.idle.boostRemaining=boostAtExit; // existing wall-time timer bookkeeping owns its expiry.
}
