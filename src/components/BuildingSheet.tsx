"use client";

import { ArrowLeft, ArrowUp, Check, Coins, Factory, Sparkles, TrendingUp, UsersRound, X, Zap } from "lucide-react";
import { BUILDINGS, buildingUpgradeQuote, getStats, type Action, type BuildingId, type GameState } from "@/lib/game";
import { MANAGERS, type ManagerId, type UpgradeQuantity } from "@/lib/progression";
import { useState, type Dispatch } from "react";
import { compact, fa } from "./game-ui";
import BuildingModel, { buildingTier } from "./BuildingModel";
import { useDialog } from "./useDialog";

type Props = { id:BuildingId; game:GameState; dispatch:Dispatch<Action>; close:()=>void; notify:(message:string)=>void; feedback:()=>void; onEconomy:()=>void; onManagers:()=>void };
const tiers=["پایه","صنعتی","مدرن","پیشرفته","فناوری آینده"];
function outputFor(game:GameState,id:BuildingId){const stats=getStats(game);return id==="tank"?stats.oilCapacity:id==="power"?stats.powerProduced:id==="water"?stats.waterProduced:id==="city"?game.buildings.city*50:stats.output(id);}
export default function BuildingSheet({id,game,dispatch,close,notify,feedback,onEconomy,onManagers}:Props){
  const ref=useDialog<HTMLElement>(close),[quantity,setQuantity]=useState<UpgradeQuantity>(1);
  const definition=BUILDINGS[id],level=game.buildings[id],stats=getStats(game),tier=buildingTier(level),quote=buildingUpgradeQuote(game,id,quantity);
  const output=outputFor(game,id),next=outputFor({...game,buildings:{...game.buildings,[id]:quote.nextLevel}},id),gain=output?Math.round((next/output-1)*100):0;
  const nextMilestone=level<10?10:level<25?25:level<50?50:100;
  const manager:ManagerId|null=id==="oil"||id==="refinery"?"energy":id==="dock"?"harbor":id==="arms"?"supply":null;
  const managerLevel=manager?game.idle.managerLevels[manager]:0;
  const milestoneCrossed=[10,25,50,100].some(m=>level<m&&quote.nextLevel>=m);
  return <div className="tower-sheet-backdrop" onClick={close}><section className="building-sheet idle-building-sheet" ref={ref} role="dialog" aria-modal="true" aria-labelledby="building-sheet-title" tabIndex={-1} onClick={e=>e.stopPropagation()}>
    <div className="sheet-handle"/><header className="tower-sheet-header"><div><span className="sheet-eyebrow">زیرساخت ملی · {tiers[tier-1]}</span><h2 id="building-sheet-title">{definition.name}</h2></div><button className="close-control" onClick={close} aria-label="بستن پنجره ساختمان"><X size={19}/></button></header>
    <div className="building-showcase"><div className="building-showcase-light"/><BuildingModel id={id} level={level}/><span className="showcase-level">سطح {fa(level)}</span><span className="showcase-tier"><Sparkles size={13}/>{tiers[tier-1]}</span>{game.idle.boostRemaining>0&&<span className="showcase-boost"><Zap size={12}/> تولید ×۲</span>}</div>
    <div className="building-sheet-copy"><p>{definition.description}</p><div className="upgrade-comparison"><div><span>{id==="tank"?"ظرفیت فعلی":"تولید فعلی"}</span><strong>{compact(output)}<small>{definition.unit}</small></strong></div><ArrowLeft size={19}/><div><span>بعد از ارتقا {gain>0&&<b>+{fa(gain)}٪</b>}</span><strong className="green-text">{compact(next)}<small>{definition.unit}</small></strong></div></div>
      <div className="evolution-heading"><span>تکامل بعدی</span><strong>{level>=100?"بالاترین سطح":`سطح ${fa(nextMilestone)}`}</strong></div><div className="evolution-meter"><i style={{width:`${level>=100?100:Math.max(4,level/nextMilestone*100)}%`}}/></div><div className="evolution-reward-note"><GiftIcon/><span>{milestoneCrossed?"این ارتقا ظاهر تازه و یک صندوقچه باز می‌کند!":`در سطح ${fa(nextMilestone)}: مدل تکامل‌یافته + صندوقچه`}</span></div>
      {manager&&<button className={`building-manager-row ${managerLevel>0?"active":""}`} onClick={onManagers}><img src={MANAGERS[manager].image} alt=""/><span><strong>{managerLevel>0?MANAGERS[manager].name:"یک متخصص استخدام کنید"}</strong><small>{managerLevel>0?`${MANAGERS[manager].role} · سطح ${fa(managerLevel)}`:MANAGERS[manager].effect}</small></span>{managerLevel>0?<Check size={16}/>:<ArrowLeft size={16}/>}</button>}
      {stats.grid<.9&&<div className="upgrade-grid-warning"><Zap size={14}/> راندمان برق {fa(stats.grid*100)}٪ است؛ نیروگاه را تقویت کنید.</div>}
    </div>
    <footer className="building-sheet-footer"><div className="bulk-upgrade-selector" aria-label="تعداد ارتقا">{([1,10,"max"] as UpgradeQuantity[]).map(value=><button key={value} className={quantity===value?"selected":""} onClick={()=>setQuantity(value)} aria-pressed={quantity===value}>{value==="max"?"حداکثر":`×${fa(value)}`}</button>)}</div><button className="primary-action" disabled={level>=100||!quote.affordable} onClick={()=>{dispatch({type:"upgrade-building",id,quantity});feedback();notify(`${definition.short} به سطح ${fa(quote.nextLevel)} رسید.`);}}><ArrowUp size={17}/><span>{level>=100?"بالاترین سطح":quote.levels?`ارتقا به سطح ${fa(quote.nextLevel)}`:"منابع کافی نیست"}</span><span className="building-upgrade-cost"><Coins size={14}/>${compact(quote.cost)}</span></button>{!quote.affordable&&level<100&&<small>درآمد بندر را جمع کنید یا تعداد ارتقا را کاهش دهید.</small>}<button className="building-economy-link" onClick={onEconomy}>مدیریت همهٔ سازه‌ها <ArrowLeft size={14}/></button></footer>
  </section></div>;
}
function GiftIcon(){return <Sparkles size={13}/>;}
