"use client";

import { ArrowLeft, Check, ChevronDown, Sparkles, X, Zap } from "lucide-react";
import Image from "next/image";
import { BUILDINGS, buildingUpgradeQuote, getStats, type Action, type BuildingId, type GameState } from "@/lib/game";
import { MANAGERS, type ManagerId, type UpgradeQuantity } from "@/lib/progression";
import { useState, type Dispatch } from "react";
import { compact, fa } from "./game-ui";
import BuildingModel, { buildingTier } from "./BuildingModel";
import { useDialog } from "./useDialog";
import OpeningDockRepair from "./OpeningDockRepair";
import { openingAttentionRules } from "@/lib/opening-attention";
import economy from "@/data/reopening/economy.json";

type Props = { guided?:boolean; id:BuildingId; game:GameState; dispatch:Dispatch<Action>; close:()=>void; notify:(message:string)=>void; feedback:()=>void; onEconomy:()=>void; onManagers:()=>void; onPower:()=>void };
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
const outputArt: Partial<Record<BuildingId, string>> = {
  oil: "/assets/workshop/oil.webp", tank: "/assets/workshop/oil.webp", dock: "/assets/workshop/oil.webp",
  refinery: "/assets/workshop/fuel.webp", steel: "/assets/workshop/steel.webp", arms: "/assets/workshop/ammo.webp",
  optical: "/assets/workshop/instruments/radar.webp",
};
function outputFor(game: GameState, id: BuildingId) {
  const stats = getStats(game);
  switch (id) {
    case "tank": return stats.oilCapacity;
    case "dock": return stats.output("dock") * (game.research.includes("dockauto") ? 1.25 : 1) * (game.research.includes("pipe") ? 1.5 : 1);
    case "power": return stats.powerProduced;
    case "water": return stats.waterProduced;
    case "city": return game.buildings.city * 50;
    case "welfare": return Math.min(20, game.buildings.welfare * 4);
    case "optical": return game.buildings.optical * 3;
    default: return stats.output(id);
  }
}
export default function BuildingSheet({id,game,guided=false,dispatch,close,notify,feedback,onEconomy,onManagers,onPower}:Props){
  const ref=useDialog<HTMLElement>(close),[quantity,setQuantity]=useState<UpgradeQuantity>(1);
  const definition=BUILDINGS[id],level=game.buildings[id],stats=getStats(game),tier=buildingTier(level),quote=buildingUpgradeQuote(game,id,quantity);
  const preview = {...game,buildings:{...game.buildings,[id]:quote.nextLevel}};
  const projected = getStats(preview);
  const output=outputFor(game,id),next=outputFor(preview,id),gain=output?Math.round((next/output-1)*100):0;
  const openingTank = !!game.opening && id === "tank";
  const [helpVisible, setHelpVisible] = useState(false);
  const lowPowerQuote = !!game.opening && game.mode === "campaign" && game.wave <= openingAttentionRules.gate_power.through_operation
    && projected.grid < stats.grid && projected.grid < openingAttentionRules.gate_power.min_projected_fraction;
  const nextMilestone=level<10?10:level<25?25:level<50?50:100;
  const manager:ManagerId|null=id==="oil"||id==="refinery"?"energy":id==="dock"?"harbor":id==="arms"?"supply":null;
  const managerLevel=manager?game.idle.managerLevels[manager]:0;
  const milestoneCrossed=[10,25,50,100].some(m=>level<m&&quote.nextLevel>=m);
  const minimumOnly = quantity === "max" && quote.levels === 0 && level < 100;
  const price = minimumOnly ? buildingUpgradeQuote(game, id, 1).cost : quote.cost;
  const unit = id === "optical" ? "٪ برد" : definition.unit;
  const meterLabel = id === "tank" ? "ظرفیت ذخیره" : id === "dock" ? "سرعت بارگیری" : id === "city" ? "جمعیت" : id === "welfare" ? "سهم پایداری" : id === "optical" ? "افزایش برد" : "توان تولید";
  return <div className="tower-sheet-backdrop workshop-sheet-backdrop" onClick={close}>
    <section className="building-sheet idle-building-sheet workshop-sheet" ref={ref} role="dialog" aria-modal="true" aria-labelledby="building-sheet-title" tabIndex={-1} onClick={e=>e.stopPropagation()}>
      <header className="tower-sheet-header workshop-sheet-header">
        <div className="workshop-heading"><Image src="/assets/workshop/instruments/gear.webp" width={38} height={38} alt="" unoptimized/><h2 id="building-sheet-title">{openingTank ? "افزایش ظرفیت مخزن" : "ارتقای زیرساخت"}</h2></div>
        <button className="close-control" onClick={close} aria-label="بستن پنجره ساختمان"><X size={19}/></button>
      </header>
      <div className="workshop-building-body">
        <div className="building-showcase">
          <BuildingModel id={id} level={level}/>
          <div className="workshop-building-intro"><small>{tiers[tier-1]}</small><h3>{definition.name}</h3><span className="showcase-level">سطح {fa(level)}{quote.levels>0 && <><ArrowLeft size={14} aria-hidden="true"/> {fa(quote.nextLevel)}</>}</span></div>
          {game.idle.boostRemaining>0 && <span className="showcase-boost"><Zap size={12}/> تولید ×۲</span>}
        </div>
        <div className="building-sheet-copy">
          <div className="upgrade-comparison">
            <Image src={outputArt[id] ?? `/assets/buildings/${id}.png`} alt="" width={48} height={48} unoptimized />
            <div><span>{meterLabel}</span><p><strong>{compact(output)}</strong>{quote.levels > 0 && <><ArrowLeft size={19}/><strong className="green-text">{compact(next)}</strong></>} <small>{unit}</small></p></div>
            {gain>0 && <b className="gain-ticket">+{fa(gain)}٪</b>}
          </div>
          {openingTank && <div className="opening-capacity-note">
            <span><Zap size={15}/>مصرف برق با ارتقا بیشتر می‌شود. {fa(economy.facilities.tank.mw_per_level * quote.levels)} مگاوات</span>
            {game.opening?.stalled && <button type="button" aria-expanded={helpVisible} onClick={() => {
              if (!helpVisible) dispatch({type:"opening-help"});
              setHelpVisible(!helpVisible);
            }}>راهنمای این توقف</button>}
            {helpVisible && <p>با افزایش ظرفیت، پمپ جا برای نفت تازه دارد. می‌توانی تا بازگشت نفت‌کش هم صبر کنی.</p>}
          </div>}
          {id === "dock" && <OpeningDockRepair game={game} dispatch={dispatch}/>}
          <details className="building-blueprint">
            <summary>اثر ساختمان و تکامل <ChevronDown size={17} /></summary>
            <p>{definition.description}</p><p>{BUILDING_EFFECTS[id]}</p>
            <div className="evolution-heading"><span>تکامل بعدی</span><strong>{level>=100?"بالاترین سطح":`سطح ${fa(nextMilestone)}`}</strong></div>
            <div className="evolution-meter"><i style={{width:`${level>=100?100:Math.max(4,level/nextMilestone*100)}%`}}/></div>
            {level < 100 && <div className="evolution-reward-note"><Sparkles size={15}/>{milestoneCrossed?"این ارتقا ظاهر تازه و یک صندوقچه باز می‌کند!":`در سطح ${fa(nextMilestone)} مدل تکامل‌یافته و صندوقچه باز می‌شوند.`}</div>}
            {manager && <button className={`building-manager-row ${managerLevel>0?"active":""}`} onClick={onManagers}><Image src={MANAGERS[manager].image} width={33} height={39} alt="" unoptimized/><span><strong>{managerLevel>0?MANAGERS[manager].name:"یک متخصص استخدام کنید"}</strong><small>{managerLevel>0?`${MANAGERS[manager].role} · سطح ${fa(managerLevel)}`:MANAGERS[manager].effect}</small></span>{managerLevel>0?<Check size={16}/>:<ArrowLeft size={16}/>}</button>}
            <button className="building-economy-link" onClick={onEconomy}>مدیریت همهٔ سازه‌ها <ArrowLeft size={14}/></button>
          </details>
          {stats.grid<.9 && <div className="upgrade-grid-warning"><Zap size={15}/> راندمان برق {fa(stats.grid*100)}٪ است.</div>}
        </div>
      </div>
      <footer className="building-sheet-footer">
        {level < 100 && <>
          {!openingTank && <div className="building-order-quantity"><span>تعداد ارتقا</span><div className="bulk-upgrade-selector" aria-label="تعداد ارتقا">{([1,10,"max"] as UpgradeQuantity[]).map(value=><button key={value} className={quantity===value?"selected":""} onClick={()=>setQuantity(value)} aria-pressed={quantity===value}>{value==="max"?"حداکثر":`×${fa(value)}`}</button>)}</div></div>}
          <div className="build-cost"><b>{minimumOnly ? "هزینهٔ یک سطح" : "هزینهٔ ارتقا"}</b><span className={!quote.affordable ? "missing-cost" : ""}><i className="workshop-icon wk-cash" aria-hidden="true"/> {compact(price)} {game.opening ? "اعتبار بندر" : "دلار"}</span></div>
        </>}
        {lowPowerQuote && quote.affordable && <div className="opening-grid-warning"><span>تأمین برق پس از ساخت {fa(projected.grid * 100)}٪ می‌شود.</span><button onClick={onPower}>دیدن نیروگاه</button></div>}
        <button className="primary-action" disabled={level>=100||!quote.affordable} onClick={()=>{
          dispatch({type:"upgrade-building",id,quantity,guided,expectedLevel:level});feedback();notify(`${definition.short} به سطح ${fa(quote.nextLevel)} رسید.`);}}>
          <Image src="/assets/workshop/instruments/upgrade.webp" width={31} height={31} alt="" unoptimized/><span>{level>=100?"بالاترین سطح":lowPowerQuote && quote.affordable ? "با همین تراز بساز" : openingTank && quote.affordable ? `افزایش · ${fa(price)} اعتبار` : quote.levels?`ارتقا به سطح ${fa(quote.nextLevel)}`:"منابع کافی نیست"}</span>
        </button>
        {openingTank && !quote.affordable && game.cash + Math.floor(game.idle.bank) >= price && level < 100 &&
          <button className="opening-withdraw" onClick={() => { dispatch({type:"collect-income"}); feedback(); }}>برداشت از خزانه</button>}
        {!quote.affordable && level<100 && <small>درآمد بندر را جمع کنید یا تعداد ارتقا را کاهش دهید.</small>}
      </footer>
    </section>
  </div>;
}
