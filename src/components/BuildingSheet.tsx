"use client";

import { ArrowLeft, ArrowUp, Check, Settings, Sparkles, X, Zap } from "lucide-react";
import Image from "next/image";
import { BUILDINGS, buildingUpgradeQuote, getStats, type Action, type BuildingId, type GameState } from "@/lib/game";
import { MANAGERS, type ManagerId, type UpgradeQuantity } from "@/lib/progression";
import { useState, type Dispatch } from "react";
import { compact, fa } from "./game-ui";
import BuildingModel, { buildingTier } from "./BuildingModel";
import { useDialog } from "./useDialog";

type Props = { id:BuildingId; game:GameState; dispatch:Dispatch<Action>; close:()=>void; notify:(message:string)=>void; feedback:()=>void; onEconomy:()=>void; onManagers:()=>void };
const tiers=["پایه","صنعتی","مدرن","پیشرفته","فناوری آینده"];
/* «روی چیا اثر داره» (D-023): one short effect summary per building,
   derived from the economy code by audit round 2 (team 3, §6) — shown
   verbatim in the sheet so a player sees what a building FEEDS before
   paying for an upgrade. */
const BUILDING_EFFECTS: Record<BuildingId,string> = {
  oil: "نفت خام تولید می‌کند — خوراک صادرات و پالایش؛ هر سطح ۵ مگاوات برق مصرف می‌کند.",
  tank: "سقف ذخیرهٔ نفت را بالا می‌برد (هر سطح ۵۰۰ بشکه)؛ مخزن پر یعنی توقف تولید و از دست رفتن صادرات.",
  dock: "سقف سرعت بارگیری نفتکش را تعیین می‌کند؛ صادرات واقعی هرگز از ظرفیت اسکله بالاتر نمی‌رود.",
  refinery: "از سهم غیرصادراتی نفت سوخت می‌سازد (هر ۱۰ نفت → ۵ سوخت)؛ سوخت نیروگاه و ناوگان از اینجاست و هر سطح ۱۵ مگاوات برق و آب مصرف می‌کند.",
  steel: "فولاد تولید می‌کند — مادهٔ ساخت و ارتقای برجک‌ها؛ پرمصرف‌ترین ساختمان برقی است (هر سطح ۲۵ مگاوات).",
  arms: "مهمات تولید می‌کند — هر شلیک برجک مهمات مصرف می‌کند و با اتمام مهمات، آتش متوقف می‌شود؛ هر سطح ۳۰ مگاوات برق می‌خواهد.",
  power: "برق شبکه را تأمین می‌کند (هر سطح ۶۰ مگاوات)؛ کمبود برق، تولید همهٔ ساختمان‌ها و آسیب همهٔ برجک‌ها را به همان نسبت کم می‌کند و بدون سوخت، نیروگاه به ۲۰٪ توان می‌افتد.",
  water: "آب شهرک و پالایشگاه را تأمین می‌کند؛ کمبود آب مستقیماً پایداری را پایین می‌کشد.",
  city: "جمعیت می‌سازد و تا ۳۰ واحد از پایداری را تأمین می‌کند؛ در عوض آب و برق مصرف می‌کند.",
  welfare: "هر سطح +۴ پایداری می‌دهد (تا سقف +۲۰)؛ پایداری بالاتر یعنی ضریب تولید بیشتر برای همهٔ ساختمان‌ها.",
  optical: "هر سطح +۳٪ به برد همهٔ برجک‌ها اضافه می‌کند و از همان سطح ۱، کشتی‌های قاچاق را روی نقشه آشکار می‌کند.",
};
function outputFor(game:GameState,id:BuildingId){const stats=getStats(game);return id==="tank"?stats.oilCapacity:id==="power"?stats.powerProduced:id==="water"?stats.waterProduced:id==="city"?game.buildings.city*50:stats.output(id);}
export default function BuildingSheet({id,game,dispatch,close,notify,feedback,onEconomy,onManagers}:Props){
  const ref=useDialog<HTMLElement>(close),[quantity,setQuantity]=useState<UpgradeQuantity>(1);
  const definition=BUILDINGS[id],level=game.buildings[id],stats=getStats(game),tier=buildingTier(level),quote=buildingUpgradeQuote(game,id,quantity);
  const output=outputFor(game,id),next=outputFor({...game,buildings:{...game.buildings,[id]:quote.nextLevel}},id),gain=output?Math.round((next/output-1)*100):0;
  const nextMilestone=level<10?10:level<25?25:level<50?50:100;
  const manager:ManagerId|null=id==="oil"||id==="refinery"?"energy":id==="dock"?"harbor":id==="arms"?"supply":null;
  const managerLevel=manager?game.idle.managerLevels[manager]:0;
  const milestoneCrossed=[10,25,50,100].some(m=>level<m&&quote.nextLevel>=m);
  return <div className="tower-sheet-backdrop workshop-sheet-backdrop" onClick={close}><section className="building-sheet idle-building-sheet workshop-sheet" ref={ref} role="dialog" aria-modal="true" aria-labelledby="building-sheet-title" tabIndex={-1} onClick={e=>e.stopPropagation()}>
    <header className="tower-sheet-header workshop-sheet-header">
      <div className="workshop-heading"><Settings size={23} aria-hidden="true"/><h2 id="building-sheet-title">ارتقای زیرساخت</h2></div>
      <button className="close-control" onClick={close} aria-label="بستن پنجره ساختمان"><X size={19}/></button>
    </header>
    <div className="workshop-building-body">
    <div className="building-showcase"><div className="workshop-building-intro"><span>{tiers[tier-1]}</span><h3>{definition.name}</h3><span className="showcase-level">سطح {fa(level)}{quote.levels>0&&<> <ArrowLeft size={13} aria-hidden="true"/> {fa(quote.nextLevel)}</>}</span></div><BuildingModel id={id} level={level}/>{game.idle.boostRemaining>0&&<span className="showcase-boost"><Zap size={12}/> تولید ×۲</span>}</div>
    <div className="building-sheet-copy"><p>{definition.description}</p><div className="upgrade-comparison"><div><span>{id==="tank"?"ظرفیت فعلی":"تولید فعلی"}</span><strong>{compact(output)}<small>{definition.unit}</small></strong></div><ArrowLeft size={19}/><div><span>بعد از ارتقا {gain>0&&<b>+{fa(gain)}٪</b>}</span><strong className="green-text">{compact(next)}<small>{definition.unit}</small></strong></div></div>
      <div className="building-effect"><span className="building-effect-label"><Sparkles size={12}/>اثر روی بندر</span><p>{BUILDING_EFFECTS[id]}</p></div>
      <div className="evolution-heading"><span>تکامل بعدی</span><strong>{level>=100?"بالاترین سطح":`سطح ${fa(nextMilestone)}`}</strong></div><div className="evolution-meter"><i style={{width:`${level>=100?100:Math.max(4,level/nextMilestone*100)}%`}}/></div><div className="evolution-reward-note"><GiftIcon/><span>{milestoneCrossed?"این ارتقا ظاهر تازه و یک صندوقچه باز می‌کند!":`در سطح ${fa(nextMilestone)}: مدل تکامل‌یافته + صندوقچه`}</span></div>
      {manager&&<button className={`building-manager-row ${managerLevel>0?"active":""}`} onClick={onManagers}><Image src={MANAGERS[manager].image} width={33} height={39} alt="" unoptimized/><span><strong>{managerLevel>0?MANAGERS[manager].name:"یک متخصص استخدام کنید"}</strong><small>{managerLevel>0?`${MANAGERS[manager].role} · سطح ${fa(managerLevel)}`:MANAGERS[manager].effect}</small></span>{managerLevel>0?<Check size={16}/>:<ArrowLeft size={16}/>}</button>}
      {stats.grid<.9&&<div className="upgrade-grid-warning"><Zap size={14}/> راندمان برق {fa(stats.grid*100)}٪ است؛ نیروگاه را تقویت کنید.</div>}
    </div>
    </div>
    <footer className="building-sheet-footer"><div className="bulk-upgrade-selector" aria-label="تعداد ارتقا">{([1,10,"max"] as UpgradeQuantity[]).map(value=><button key={value} className={quantity===value?"selected":""} onClick={()=>setQuantity(value)} aria-pressed={quantity===value}>{value==="max"?"حداکثر":`×${fa(value)}`}</button>)}</div><button className="primary-action" disabled={level>=100||!quote.affordable} onClick={()=>{dispatch({type:"upgrade-building",id,quantity});feedback();notify(`${definition.short} به سطح ${fa(quote.nextLevel)} رسید.`);}}><ArrowUp size={17}/><span>{level>=100?"بالاترین سطح":quote.levels?`ارتقا به سطح ${fa(quote.nextLevel)}`:"منابع کافی نیست"}</span><span className="building-upgrade-cost"><i className="workshop-icon wk-cash" aria-hidden="true"/>{compact(quote.cost)} دلار</span></button>{!quote.affordable&&level<100&&<small>درآمد بندر را جمع کنید یا تعداد ارتقا را کاهش دهید.</small>}<button className="building-economy-link" onClick={onEconomy}>مدیریت همهٔ سازه‌ها <ArrowLeft size={14}/></button></footer>
  </section></div>;
}
function GiftIcon(){return <Sparkles size={13}/>;}
