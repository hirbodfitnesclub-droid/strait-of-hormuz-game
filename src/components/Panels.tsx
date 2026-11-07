"use client";

import { useState, type Dispatch } from "react";
import {
  Activity, Anchor, ArrowLeft, Award, BatteryCharging, Beaker, Blocks, Check, ChevronLeft,
  CircleDollarSign, Droplets, Factory, Flame, FlaskConical, Fuel, Gauge, Gift, Globe2,
  Eye, Heart, LockKeyhole, MapPin, Mountain, PackageOpen, Radio, RotateCcw, Ship, Shield,
  ShieldCheck, Sparkles, Swords, Target, Trophy, Waves, X, Zap,
} from "lucide-react";
import {
  BUILDINGS, CHALLENGE_RULES, ISLANDS, RESEARCH, SLOTS, TOWERS, TOWER_KINDS, getStats, tankerCapacityFor, towerDps, upgradeCost,
  type Action, type BuildingId, type GameState, type Mode, type TowerKind,
  powerBreakdown,
} from "@/lib/game";
import { compact, fa, TargetTypes, TowerGlyph } from "./game-ui";
import { useDialog } from "./useDialog";
import BuildingModel from "./BuildingModel";
import TowerModel from "./TowerModel";
import { operationInfo } from "@/lib/progression";
import { InstallGameButton } from "./MobileExperience";

export type PanelName = "economy" | "defense" | "city" | "research" | "war" | "hero" | "events" | "settings";
type Props = {
  panel: PanelName; game: GameState; dispatch: Dispatch<Action>; close: () => void;
  notify: (message: string) => void; sound: boolean; setSound: (value: boolean) => void;
  vibration: boolean; setVibration: (value: boolean) => void;
  cinematic: boolean; setCinematic: (value: boolean) => void;
  onSelectTower: (slot: number) => void;
  onSelectBuilding: (id: BuildingId) => void;
};

const panelInfo: Record<PanelName, { title: string; subtitle: string }> = {
  economy: { title: "اقتصاد و صنعت", subtitle: "مدیریت منابع ملی" },
  defense: { title: "شبکهٔ دفاعی", subtitle: "برجک‌ها و کارت‌های ارتقا" },
  city: { title: "شهر و زیرساخت", subtitle: "توسعه سرزمین" },
  research: { title: "پژوهشگاه ملی", subtitle: "درخت فناوری" },
  war: { title: "اتاق جنگ", subtitle: "انتخاب عملیات" },
  hero: { title: "فرماندهان", subtitle: "یگان‌های ویژه" },
  events: { title: "مرکز رویدادها", subtitle: "گزارش‌های تنگه" },
  settings: { title: "تنظیمات", subtitle: "مرکز فرماندهی" },
};

const buildingIcons: Record<BuildingId, typeof Factory> = {
  oil: Flame, tank: Gauge, dock: Ship, refinery: Factory, steel: Blocks, arms: Target,
  power: Zap, water: Droplets, city: Mountain, welfare: Heart, optical: Eye,
};

function BuildingCard({ id, game, dispatch, notify, inspect }: { id: BuildingId; game: GameState; dispatch: Dispatch<Action>; notify: (m: string) => void; inspect: (id: BuildingId) => void }) {
  const def = BUILDINGS[id], level = game.buildings[id], cost = upgradeCost(id, level), Icon = buildingIcons[id];
  const stats = getStats(game);
  const output = id === "tank" ? stats.oilCapacity : id === "power" ? stats.powerProduced : id === "water" ? stats.waterProduced : id === "city" ? level * 50 : stats.output(id);
  const tier = level >= 100 ? 5 : level >= 50 ? 4 : level >= 25 ? 3 : level >= 10 ? 2 : 1;
  return <div className="building-card">
    <div className={`building-icon building-${id}`}><BuildingModel id={id} level={level} compact /></div>
    <div className="building-main" role="button" tabIndex={0} onClick={()=>inspect(id)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();inspect(id);}}} aria-label={`مشاهده و ارتقای ${def.short}`}>
      <div className="building-title"><strong>{def.name}</strong><span>سطح {fa(level)}</span></div>
      <p>{def.description}</p>
      <div className="building-meta"><span>{fa(output, 1)} {def.unit}</span><span>دوره {fa(tier)} از ۵</span></div>
      <div className="small-progress"><i style={{ width: `${Math.max(5, level % 10 * 10)}%` }} /></div>
    </div>
    <button className="upgrade-button" disabled={level >= 100} onClick={() => {
      if (game.cash < cost) { notify("دلار کافی برای ارتقا ندارید."); return; }
      dispatch({ type: "upgrade-building", id }); notify(`${def.short} به سطح ${fa(level + 1)} ارتقا یافت.`);
    }}>{level >= 100 ? "حداکثر" : <><span>ارتقا</span><small>${compact(cost)}</small></>}</button>
  </div>;
}

/** Port & tanker card: live cycle state from idle.port (stage, load,
 *  countdowns) plus the REAL export rate when the ECO team's stat exists.
 *  realExportRate is consumed defensively — until it lands in getStats the
 *  rate row simply stays hidden instead of showing the theoretical rate
 *  (audit finding: HUD showed theoretical dollarRate as if it were real). */
function PortCard({ game }: { game: GameState }) {
  const stats = getStats(game);
  const port = game.idle.port ?? { tanker: null, nextIn: 0, cycles: 0 };
  const capacity = tankerCapacityFor(game.buildings.dock);
  const tanker = port.tanker;
  const realRate = (stats as { realExportRate?: number }).realExportRate;
  const stageLabel = !tanker ? "در انتظار نفت‌کش بعدی" : tanker.stage === "approach" ? "نفت‌کش در راه پهلوگیری است" : tanker.stage === "loading" ? "در حال بارگیری نفت خام" : "در حال خروج از بندر";
  const stagePct = !tanker ? 0 : tanker.stage === "loading" ? tanker.load / Math.max(1, capacity) : tanker.progress;
  const stageEta = tanker && tanker.stage === "approach" ? Math.ceil((1 - tanker.progress) / 0.04) : tanker && tanker.stage === "depart" ? Math.ceil(tanker.progress / 0.04) : null;
  return <section className="port-card" aria-label="وضعیت بندر و نفت‌کش">
    <div className="port-card-head"><span><Ship size={18} /></span><div><h3>بندر و نفت‌کش</h3><p>{stageLabel}</p></div><span className="tiny-badge">چرخهٔ تکمیل‌شده: {fa(port.cycles)}</span></div>
    <div className="small-progress"><i style={{ width: `${Math.round(stagePct * 100)}%` }} /></div>
    <div className="port-card-rows">
      {tanker ? <span>بار نفت‌کش <b>{compact(tanker.load)} / {compact(capacity)} بشکه</b></span> : <span>نفت‌کش بعدی <b>تا {fa(Math.max(0, Math.ceil(port.nextIn)))} ثانیهٔ دیگر</b></span>}
      {stageEta !== null && <span>پایان این مرحله <b>~{fa(stageEta)} ثانیه</b></span>}
      <span>سهم صادرات از تولید (α) <b>{fa(game.oilSplit)}٪</b></span>
      {typeof realRate === "number" && <span>نرخ صادرات واقعی <b className="green-text">+${fa(realRate, 1)}/ث</b></span>}
    </div>
  </section>;
}

function Economy({ game, dispatch, notify, onSelectBuilding }: Props) {
  const stats = getStats(game);
  return <>
    <div className="drawer-intro"><div className="intro-icon gold"><Factory size={23} /></div><div><strong>چرخ اقتصاد را به حرکت درآورید</strong><p>تولید، پالایش و صادرات نفت، پشتیبان دفاع تنگه است.</p></div></div>
    <div className="summary-grid three">
      <div><span>تولید نفت</span><strong>{fa(stats.oilRate, 1)} <small>بشکه/ث</small></strong></div>
      <div><span>درآمد صادرات</span><strong className="green-text">+${fa(stats.dollarRate, 1)} <small>/ ثانیه</small></strong></div>
      <div><span>ظرفیت مخزن</span><strong>{compact(game.oil)} <small>/ {compact(stats.oilCapacity)}</small></strong></div>
    </div>
    <section className="oil-allocation"><div className="allocation-heading"><span><Droplets size={18} /></span><div><h3>نفت به کدام مسیر برود؟</h3><p>انتخاب شما فوراً روی درآمد و تولید اثر می‌گذارد.</p></div></div><div className="allocation-presets">{[{value:70,label:"درآمد بیشتر",sub:"صادرات ۷۰٪"},{value:40,label:"متعادل",sub:"صادرات ۴۰٪"},{value:20,label:"تولید دفاعی",sub:"پالایش ۸۰٪"}].map(preset => <button key={preset.value} className={game.oilSplit === preset.value ? "selected" : ""} onClick={() => dispatch({type:"split",value:preset.value})}><strong>{preset.label}</strong><span>{preset.sub}</span>{game.oilSplit === preset.value && <Check size={12}/>}</button>)}</div><div className="allocation-labels"><span>صادرات <b>{fa(game.oilSplit)}٪</b></span><span>پالایش <b>{fa(100-game.oilSplit)}٪</b></span></div><input type="range" dir="ltr" min="0" max="100" value={game.oilSplit} onChange={e=>dispatch({type:"split",value:Number(e.target.value)})} aria-label="درصد صادرات نفت" style={{background:`linear-gradient(to right,#eac788 ${game.oilSplit}%,#3a5655 ${game.oilSplit}%)`}} /><div className="supply-resources"><span><Droplets size={14}/> نفت <b>{compact(game.oil)}</b></span><span><Fuel size={14}/> سوخت <b>{compact(game.fuel)}</b></span><span><Zap size={14}/> برق <b>{fa(stats.grid*100)}٪</b></span></div></section>
    <PortCard game={game} />
    <div className="drawer-section-heading"><div><strong>زنجیره تأمین</strong><p>هر ۱۰ سطح، تولید سازه دو برابر می‌شود.</p></div><span className="tiny-badge">۶ سازه</span></div>
    <div className="building-list">{(["oil", "tank", "dock", "refinery", "steel", "arms"] as BuildingId[]).map(id => <BuildingCard key={id} id={id} game={game} dispatch={dispatch} notify={notify} inspect={onSelectBuilding} />)}</div>
    <div className="drawer-note"><Flame size={16} /> نفت بیشتر برای پالایش، سوخت و مهمات بیشتری برای دفاع فراهم می‌کند.</div>
  </>;
}

function Defense({ game, dispatch, notify, onSelectTower, close }: Props) {
  const [tab, setTab] = useState<"installed" | "cards">("installed");
  const empty = SLOTS.find(slot => game.islands.includes(slot.island) && !game.towers.some(t => t.slot === slot.id));
  return <>
    <div className="drawer-intro"><div className="intro-icon gold"><Shield size={23}/></div><div><strong>خط دفاعی شما، در یک نگاه</strong><p>برای ارتقای هر برجک، آن را از فهرست انتخاب کنید.</p></div></div>
    <div className="defense-tabs"><button className={tab === "installed" ? "active" : ""} onClick={()=>setTab("installed")}>برجک‌های مستقر <span>{fa(game.towers.length)}</span></button><button className={tab === "cards" ? "active" : ""} onClick={()=>setTab("cards")}>کارت‌های ارتقا {game.chests > 0 && <i/>}</button></div>
    {tab === "installed" ? <><div className="installed-towers">{game.towers.map(tower => <button key={tower.slot} className="installed-tower" onClick={()=>onSelectTower(tower.slot)}><span className={`installed-icon tower-color-${tower.kind}`}><TowerModel kind={tower.kind} tier={tower.tier} branch={tower.branch} preview /></span><span className="installed-copy"><strong>{tower.tier === 4 && tower.branch !== null ? TOWERS[tower.kind].branches[tower.branch] : TOWERS[tower.kind].short}</strong><small>{SLOTS[tower.slot].label} · سطح {fa(tower.tier)}</small></span><span className="installed-power"><b>{fa(towerDps(game,tower))}</b><small>قدرت</small></span><ChevronLeft size={17}/></button>)}</div><button className="primary-action new-tower-action" disabled={!empty} onClick={()=>{if(empty)onSelectTower(empty.id);}}><Shield size={17}/>{empty ? "ساخت برجک جدید" : "تمام جایگاه‌های آزاد پر شده‌اند"}{empty && <ArrowLeft size={17}/>}</button><div className="drawer-note"><Target size={16}/> برجک‌ها خودکار شلیک می‌کنند. ارتقای آن‌ها از تعداد زیاد برجک‌های ضعیف مؤثرتر است.</div></> : <>
      <button className="chest-banner" onClick={()=>{if(!game.chests){notify("با شکست غول‌آخرها صندوقچه دریافت می‌کنید.");return;}dispatch({type:"open-chest"});close();}}><span className="chest-icon"><Gift size={22}/></span><span><strong>صندوقچه غنائم</strong><small>{fa(game.chests)} صندوقچه آمادهٔ باز کردن</small></span><span className="chest-open">باز کردن <ChevronLeft size={15}/></span></button>
      <div className="drawer-section-heading"><div><strong>قدرتی که ماندگار است</strong><p>هر ۳ کارت یکسان، قدرت پایهٔ برجک را ۱۰٪ افزایش می‌دهد.</p></div></div>
      <div className="blueprint-list">{TOWER_KINDS.map(kind=>{const def=TOWERS[kind],card=game.cards[kind];return <div className="blueprint-card" key={kind}><div className={`blueprint-icon tower-color-${kind}`}><TowerGlyph kind={kind} size={25}/></div><div className="blueprint-copy"><div><strong>{def.short}</strong><span>سطح {fa(card.level)}</span></div><p>{def.description}</p><TargetTypes targets={def.targets}/></div><button className="card-count" onClick={()=>{if(card.count<3){notify("برای ارتقا، ۳ کارت یکسان جمع کنید.");return;}dispatch({type:"upgrade-card",kind});notify("کارت ارتقا یافت؛ قدرت پایه افزایش پیدا کرد.");}}><strong>{fa(card.count)}/۳</strong><small>{card.count>=3 ? "ارتقا" : "کارت"}</small></button></div>;})}</div>
    </>}
  </>;
}

function City({ game, dispatch, notify, onSelectBuilding }: Props) {
  const [prestigeArmed, setPrestigeArmed] = useState(false);
  const stats = getStats(game);
  return <>
    <div className="drawer-intro"><div className="intro-icon teal"><BatteryCharging size={23} /></div><div><strong>پشتوانه یک تنگه قدرتمند</strong><p>برق، آب و رفاه، راندمان صنعت و پدافند را تعیین می‌کنند.</p></div></div>
    <div className="summary-grid three"><div><span>تراز برق</span><strong className={stats.powerProduced >= stats.powerUsed ? "green-text" : "red-text"}>{stats.powerProduced >= stats.powerUsed ? "+" : ""}{fa(stats.powerProduced - stats.powerUsed)} <small>MW</small></strong></div><div><span>تراز آب</span><strong className="green-text">+{fa(stats.waterProduced - stats.waterUsed)}</strong></div><div><span>پایداری ملی</span><strong>{fa(stats.stability)}٪</strong></div></div>
    {(() => { const pb = powerBreakdown(game); const max = Math.max(1, ...pb.consumers.map(c => c.mw)); return <section className="grid-breakdown"><div className="grid-breakdown-head"><strong>مصرف شبکهٔ برق</strong><span>تولید {fa(pb.produced)} · مصرف {fa(pb.used)} MW</span></div>{pb.consumers.length === 0 ? <p className="grid-empty">هنوز مصرف‌کننده‌ای ساخته نشده است.</p> : pb.consumers.map(c => <div className="grid-row" key={c.id}><span>{c.name}</span><div className="grid-bar"><i style={{ width: `${Math.max(4, (c.mw / max) * 100)}%` }} className={pb.produced >= pb.used ? "" : "over"} /></div><b>{fa(c.mw)} MW</b></div>)}{pb.produced < pb.used && <p className="grid-warn">مصرف از تولید بیشتر است — راندمان شبکه به {fa(pb.grid * 100)}٪ افت کرده؛ نیروگاه بسازید یا مصرف را کم کنید.</p>}</section>; })()}
    <div className="drawer-section-heading"><div><strong>زیرساخت‌های حیاتی</strong><p>راندمان شبکه برق: {fa(stats.grid * 100)}٪</p></div></div>
    <div className="building-list">{(["power", "water", "city"] as BuildingId[]).map(id => <BuildingCard key={id} id={id} game={game} dispatch={dispatch} notify={notify} inspect={onSelectBuilding} />)}</div>
    <div className="drawer-section-heading space-top"><div><strong>گسترش قلمرو</strong><p>جزایر جدید، جایگاه‌های تاکتیکی بیشتری آزاد می‌کنند.</p></div></div>
    <div className="island-grid">{ISLANDS.filter(i => i.cost > 0).map(island => <div className="island-card" key={island.id}><Mountain size={19} /><strong>{island.name}</strong><button disabled={game.islands.includes(island.id)} onClick={() => {
      if (game.cash < island.cost) { notify("دلار کافی برای آزادسازی جزیره ندارید."); return; }
      dispatch({ type: "unlock", island: island.id }); notify(`${island.name} آزاد شد.`);
    }}>{game.islands.includes(island.id) ? "آزاد شده" : `آزادسازی $${compact(island.cost)}`}</button></div>)}</div>
    <div className="prestige-box"><Award size={24} /><div><strong>طرح جامع توسعه ملی</strong><p>با رسیدن به موج ۱۰ و ۱۰۰ هزار دلار، وارد فاز جدید شوید و نشان دائمی بگیرید.</p><small>نشان اقتدار: {fa(game.prestige)}</small></div><button disabled={game.cash < 100000 || game.highestWave < 10} onClick={() => setPrestigeArmed(true)}>بررسی فرمان</button></div>
    {prestigeArmed && <div className="prestige-confirm" role="alertdialog" aria-label="تأیید طرح جامع توسعه ملی">
      <strong>پیش از امضای فرمان، دقیقاً چه اتفاقی می‌افتد؟</strong>
      <div className="prestige-lists">
        <div><h4>از نو شروع می‌شود</h4><ul>
          <li>دلار و همهٔ منابع (نفت، سوخت، فولاد، مهمات)</li>
          <li>سطح همهٔ ساختمان‌ها</li>
          <li>همهٔ برجک‌های مستقر — خط دفاع از نو ساخته می‌شود</li>
          <li>سکوهای نفتی، بانک بندر و چرخهٔ نفت‌کش</li>
          <li>مأموریت‌های دریافت‌شده و قرارداد فعال</li>
          <li>نبرد از موج ۱</li>
        </ul></div>
        <div><h4>حفظ می‌شود</h4><ul>
          <li>همهٔ پژوهش‌های تکمیل‌شده</li>
          <li>کارت‌های ارتقای برجک‌ها و سطحشان</li>
          <li>مدیرها و سطحشان</li>
          <li>جزیره‌های آزادشده</li>
          <li>فرماندهان و صندوقچه‌ها</li>
          <li>رکورد بالاترین موج و ستاره‌های کمپین</li>
        </ul></div>
      </div>
      <p>پاداش فوری: ۲۰۰ تجربه + ۲ صندوقچه + ۲ شارژ تقویت تولید؛ و هر نشان اقتدار برای همیشه +۱۰٪ تولید و آسیب برجک‌ها می‌دهد.</p>
      <div className="prestige-actions"><button className="prestige-go" onClick={() => { dispatch({ type: "prestige" }); setPrestigeArmed(false); notify("فاز جدید توسعه ملی آغاز شد."); }}>امضای فرمان و شروع فاز تازه</button><button onClick={() => setPrestigeArmed(false)}>انصراف</button></div>
    </div>}
  </>;
}

function Research({ game, dispatch, notify }: Props) {
  const [branch,setBranch]=useState<"energy"|"defense"|"city">("energy");
  const [showAll,setShowAll]=useState(false);
  const items=RESEARCH.filter(item=>item.branch===branch);
  const completed=items.filter(item=>game.research.includes(item.id)).length;
  const next=items.findIndex(item=>!game.research.includes(item.id));
  const visible=showAll ? items : next<0 ? items.slice(-2) : items.filter((_,index)=>index>=Math.max(0,next-1)&&index<=next+1);
  return <>
    <div className="drawer-intro"><div className="intro-icon teal"><FlaskConical size={23}/></div><div><strong>هر پژوهش، یک برتری تازه</strong><p>یک فناوری را تکمیل کنید تا قدم بعدی باز شود.</p></div></div>
    <div className="research-tabs">{[{id:"energy" as const,name:"انرژی",icon:Flame},{id:"defense" as const,name:"مهندسی دفاع",icon:Shield},{id:"city" as const,name:"شهرسازی",icon:Globe2}].map(tab=><button key={tab.id} className={branch===tab.id ? "active" : ""} onClick={()=>{setBranch(tab.id);setShowAll(false);}}><tab.icon size={15}/>{tab.name}</button>)}</div>
    <div className="research-overview"><div><strong>{next<0 ? "این شاخه تکمیل شد" : "مسیر پیشرفت شما"}</strong><span>{fa(completed)} از ۱۰ پژوهش</span></div><div className="research-steps">{items.map(item=><i key={item.id} className={game.research.includes(item.id) ? "complete" : item.id===items[next]?.id ? "next" : ""}/>)}</div></div>
    <div className="research-list">{visible.map(tech=>{
      const index=items.findIndex(item=>item.id===tech.id),done=game.research.includes(tech.id),locked=index>0&&!game.research.includes(items[index-1].id);
      return <div className={`research-card ${done ? "researched" : ""} ${locked ? "locked" : ""} ${index===next ? "next-research" : ""}`} key={tech.id}><div className="tech-index">{done ? <Check size={16}/> : locked ? <LockKeyhole size={15}/> : <FlaskConical size={16}/>}</div><div><strong>{tech.name}</strong><p>{tech.description}</p>{index===next&&<small className="next-tech-tag">آمادهٔ پژوهش</small>}</div><button disabled={done||locked} onClick={()=>{if(game.cash<tech.cost){notify("برای این پژوهش، دلار بیشتری نیاز دارید.");return;}dispatch({type:"research",id:tech.id});notify("فناوری جدید آماده شد و اثر آن اعمال شد.");}}>{done ? "تکمیل شد" : locked ? "قدم بعد" : <><span>پژوهش</span><small>${compact(tech.cost)}</small></>}</button></div>;
    })}</div>
    <button className="all-research-toggle" onClick={()=>setShowAll(!showAll)} aria-expanded={showAll}>{showAll ? "نمایش فقط قدم‌های نزدیک" : "نمایش همهٔ ۱۰ پژوهش"}<ChevronLeft size={15}/></button>
    <div className="drawer-note"><Check size={15}/> اثر فناوری‌های تکمیل‌شده در تمام نبردها و تولید منابع اعمال می‌شود.</div>
  </>;
}

const modes: { id: Mode; title: string; en: string; description: string; icon: typeof Target; badge: string }[] = [
  { id: "campaign", title: "کمپین عملیاتی", en: "CAMPAIGN", description: "۲۵ عملیات برای دفاع از تنگه؛ هر ۵ موج یک غول‌آخر.", icon: Target, badge: "۲۵ عملیات" },
  { id: "endless", title: "بقای بی‌نهایت", en: "INFINITE", description: "تا آخرین قلب مقاومت کنید و رکورد تازه‌ای ثبت کنید.", icon: Waves, badge: "بی‌پایان" },
  { id: "challenge", title: "چالش تاکتیکی", en: "CHALLENGE", description: "نبرد در شب طوفانی با ۵۰٪ برد کمتر برجک‌ها.", icon: Swords, badge: "جایزه ویژه" },
];
function War({game,dispatch,close,notify}:Props){
  const [mode,setMode]=useState<Mode>(game.mode),[selected,setSelected]=useState(Math.min(25,game.highestWave+1));
  const operation=operationInfo(selected),power=game.towers.reduce((total,tower)=>total+towerDps(game,tower),30),ready=power>=operation.recommendedPower;
  const start=()=>{if(mode==="campaign")dispatch({type:"select-operation",wave:selected});else dispatch({type:"mode",mode});dispatch({type:"start"});close();notify("عملیات آغاز شد؛ برجک‌ها خودکار دفاع می‌کنند.");};
  return <><div className="operation-mode-tabs">{modes.map(item=><button key={item.id} className={mode===item.id?"active":""} onClick={()=>setMode(item.id)}><item.icon size={17}/><span>{item.title}</span></button>)}</div>
    {mode==="campaign"?<><div className="operations-summary"><div><span>کمپین آب‌های آزاد</span><strong>۲۵ عملیات. یک تنگه.</strong></div><span><Trophy size={17}/>{fa(Math.min(25,game.highestWave))}/۲۵</span></div><div className="operation-grid">{Array.from({length:25},(_,i)=>{const wave=i+1,locked=wave>game.highestWave+1,stars=game.idle.stars[String(wave)]??0;return <button key={wave} className={`operation-node ${selected===wave?"selected":""} ${stars?"completed":""} ${wave%5===0?"boss":""}`} disabled={locked} onClick={()=>setSelected(wave)} aria-label={`عملیات ${fa(wave)}، ${operationInfo(wave).title}${locked?"، قفل":""}`}><span>{locked?<LockKeyhole size={17}/>:wave%5===0?<Swords size={21}/>:fa(wave)}</span><small>{stars?"★".repeat(stars):wave%5===0?"غول‌آخر":"···"}</small></button>;})}</div><article className={`operation-briefing ${operation.boss?"boss-briefing":""}`}><div><span>عملیات {fa(selected)}</span><h3>{operation.title}</h3>{operation.bossName&&<p>هدف ویژه: {operation.bossName}</p>}</div><div className="operation-rewards"><span><CircleDollarSign size={14}/>${compact(operation.cash)}</span><span><Award size={14}/>{fa(operation.xp)} تجربه</span>{operation.boss&&<span><Gift size={14}/>۲ صندوقچه</span>}</div><div className="readiness-row"><span><ShieldCheck size={15}/>{ready?"دفاع شما آماده است":"تقویت دفاع پیشنهاد می‌شود"}</span><strong className={ready?"green-text":""}>{fa(power)} / {fa(operation.recommendedPower)}</strong></div><p className="operation-tip">{operation.tip}</p></article></>:<div className="alternate-mode"><span>{mode==="endless"?<Waves size={40}/>:<Swords size={40}/>}</span><h3>{mode==="endless"?"تا آخرین قلب مقاومت کن":"برتری در شرایط دشوار"}</h3><p>{mode==="endless"?"موج‌ها ادامه پیدا می‌کنند و هر بار قوی‌تر می‌شوند. بهترین رکورد شما ذخیره می‌شود.":`قانون این نبرد: «${CHALLENGE_RULES[(game.idle.challengeRuns ?? 0) % 3].name}» — ${CHALLENGE_RULES[(game.idle.challengeRuns ?? 0) % 3].description}`}</p><div><Trophy size={17}/> بهترین موج: {fa(game.highestWave)}</div></div>}
    <button className="primary-action operation-start" onClick={start}><Swords size={18}/>{mode==="campaign"?`شروع عملیات ${fa(selected)}`:"شروع نبرد"}<ArrowLeft size={17}/></button><div className="drawer-note"><ShieldCheck size={16}/> سلامت و تدارکات را بررسی کنید. نتیجهٔ هر عملیات با ستاره و غنائم ثبت می‌شود.</div></>;
}

function Heroes({ game, dispatch, notify, close }: Props) {
  const heroes = [
    { name: "ناخدا یکم تکاور", ship: "ناوچه شهید سلیمانی", skill: "+۲۰٪ سرعت شلیک برجک‌های نزدیک", icon: Ship },
    { name: "دریادار مهندس", ship: "ناو پهپادبر", skill: "حمله به قوی‌ترین هدف در میدان", icon: Radio },
    { name: "فرمانده زیردریایی فاتح", ship: "زیردریایی شکارچی", skill: "تخصص در شکار ناوهای سنگین", icon: Anchor },
  ];
  const inBattle = game.phase === "battle";
  return <><div className="drawer-intro"><div className="intro-icon gold"><Award size={23} /></div><div><strong>فرمانده خود را انتخاب کنید</strong><p>یگان فرمانده را روی نقشه لمس کنید و به آبراه بفرستید.</p></div></div>{inBattle && <div className="drawer-note"><LockKeyhole size={15} /> وسط نبرد تعویض فرمانده ممکن نیست؛ تغییر پرسونا فقط بیرون از نبرد انجام می‌شود.</div>}<div className="hero-list">{heroes.map((hero, i) => <div className={`hero-card ${game.hero.active === i ? "chosen" : ""}`} key={hero.name}><div className="hero-avatar"><hero.icon size={24} /></div><div><strong>{hero.name}</strong><span>{hero.ship}</span><p><Sparkles size={13} /> {hero.skill}</p></div><button disabled={inBattle} onClick={() => { dispatch({ type: "hero-select", hero: i }); close(); notify("فرمانده انتخاب شد. برای جابه‌جایی، ناو قهرمان را لمس کنید."); }}>{game.hero.active === i ? "انتخاب‌شده" : inBattle ? "قفل در نبرد" : "انتخاب"}</button></div>)}</div>
  {game.highestWave >= 5 ? <><div className="drawer-section-heading space-top"><div><strong>فرمانده دوم — استقرار همزمان</strong><p>دو فرمانده می‌توانند همزمان در آبراه بجنگند؛ پرسونا باید متفاوت از فرمانده اول باشد.</p></div></div><div className="hero-list">{heroes.map((hero, i) => { const deployed = game.hero2?.active === i, isFirst = game.hero.active === i, swapLocked = inBattle && !!game.hero2; return <div className={`hero-card ${deployed ? "chosen" : ""}`} key={`h2-${hero.name}`}><div className="hero-avatar"><hero.icon size={24} /></div><div><strong>{hero.name}</strong><span>{hero.ship}</span><p><Sparkles size={13} /> {hero.skill}</p></div><button disabled={isFirst || swapLocked} onClick={() => { if (game.hero2) { dispatch({ type: "hero2-select", hero: i }); notify("پرسونای فرمانده دوم تغییر کرد."); } else { if (game.cash < 3000) { notify("برای استقرار فرمانده دوم ۳۰۰۰ دلار لازم است."); return; } dispatch({ type: "deploy-hero2", hero: i }); notify("فرمانده دوم در آبراه مستقر شد."); } close(); }}>{isFirst ? "فرمانده اول" : deployed ? "فرمانده دوم" : swapLocked ? "قفل در نبرد" : game.hero2 ? "جایگزینی" : "استقرار · $۳٬۰۰۰"}</button></div>; })}</div>{game.hero2 && <button className="all-research-toggle" onClick={() => { dispatch({ type: "recall-hero2" }); notify("فرمانده دوم فراخوانده شد."); }}>فراخوان فرمانده دوم</button>}</> : <div className="drawer-note"><LockKeyhole size={15} /> فرمانده دوم پس از شکست نخستین غول‌آخر (موج ۵) آزاد می‌شود.</div>}</>;
}
function Events({ game, dispatch, notify }: Props) {
  const titles = { spill: "بحران نشت نفت", storm: "طوفان حاره‌ای مونسون", vip: "اسکورت کاروان ویژه" };
  const descriptions = { spill: "لوله زیرآبی آسیب دیده است؛ کشتی مهار را اعزام کنید.", storm: "برد برجک‌ها ۲۰٪ کاهش یافته است. مراقب آبراه باشید.", vip: "یک کاروان دیپلماتیک از تنگه عبور می‌کند؛ از آن پشتیبانی کنید." };
  return <><div className="drawer-intro"><div className="intro-icon gold"><Activity size={23} /></div><div><strong>گزارش زنده منطقه</strong><p>در برابر بحران‌ها واکنش به‌موقع نشان دهید.</p></div></div>{game.event ? <div className="event-card"><span className="event-alert">رویداد فعال</span><strong>{titles[game.event]}</strong><p>{descriptions[game.event]}</p><span className="event-countdown">پایان خودکار رویداد تا {fa(Math.max(0, Math.ceil(60 - game.eventClock)))} ثانیه</span><button onClick={() => {
    if (game.event === "spill" && game.cash < 300) { notify("برای اعزام کشتی ۳۰۰ دلار نیاز است."); return; }
    dispatch({ type: "resolve-event" }); notify("فرمان رسیدگی به رویداد ثبت شد.");
  }}>{game.event === "spill" ? "اعزام کشتی مهار · $۳۰۰" : game.event === "vip" ? "پشتیبانی از کاروان" : "عبور از طوفان"}</button></div> : <div className="empty-event"><ShieldCheck size={32} /><strong>همه چیز آرام است</strong><p>در حال حاضر رویداد فعالی در تنگه گزارش نشده است. رویداد بعدی تا حدود {fa(Math.max(0, Math.ceil(180 - game.eventClock)))} ثانیهٔ دیگر گزارش می‌شود.</p></div>}<div className="drawer-section-heading space-top"><div><strong>گزارش فرماندهی</strong><p>آخرین وضعیت منطقه تحت کنترل شما</p></div></div><div className="report-row"><span><Ship size={16} /> کشتی‌های عبوری</span><strong>{fa(game.trafficCount)}</strong></div><div className="report-row"><span><Target size={16} /> دشمنان منهدم‌شده</span><strong>{fa(game.destroyed)}</strong></div><div className="report-row"><span><ShieldCheck size={16} /> امنیت آبراه</span><strong>{fa(game.security)}٪</strong></div></>;
}
function Settings({ dispatch, notify, sound, setSound, vibration, setVibration, cinematic, setCinematic }: Props) {
  const settings = [
    {name:"صدای بازی",description:"صدای شلیک، انفجار و مهارت‌ها",value:sound,set:setSound},
    {name:"جلوه‌های سینمایی",description:"دنبالهٔ موشک، ذرات، دود و ضربهٔ دوربین",value:cinematic,set:setCinematic},
    {name:"لرزش لمسی",description:"بازخورد کوتاه در دستگاه‌های سازگار",value:vibration,set:setVibration},
  ];
  return <><div className="drawer-intro"><div className="intro-icon teal"><SettingsIcon /></div><div><strong>به سبک خودتان فرماندهی کنید</strong><p>این تنظیمات روی دستگاه شما حفظ می‌شوند.</p></div></div>{settings.map(setting=><div className="setting-row" key={setting.name}><div><strong>{setting.name}</strong><p>{setting.description}</p></div><button className={`switch ${setting.value ? "on" : ""}`} role="switch" aria-checked={setting.value} onClick={()=>setting.set(!setting.value)} aria-label={setting.name}><i/></button></div>)}<div className="drawer-note"><Sparkles size={16}/> با فعال بودن «کاهش حرکت» در تنظیمات دستگاه، افکت‌ها خودکار ملایم‌تر می‌شوند.</div><InstallGameButton /><div className="save-status"><Check size={16}/> ذخیرهٔ خودکار روی دستگاه فعال است.</div><details className="danger-settings"><summary>مدیریت پیشرفت بازی <ChevronLeft size={14}/></summary><p>شروع دوباره، ذخیرهٔ فعلی و پیشرفت بازی را پاک می‌کند.</p><button className="reset-button" onClick={()=>{if(window.confirm("تمام پیشرفت بازی پاک می‌شود. از شروع دوباره مطمئنید؟")){dispatch({type:"reset"});notify("یک فرماندهی تازه آغاز شد.");}}}><RotateCcw size={16}/> شروع دوباره بازی</button></details><p className="version-label">تنگه هرمز · فرمانروایی زنده · نسخهٔ ۴.۰<br/><a href="/assets/CREDITS.txt" target="_blank" rel="noreferrer">منابع و مجوز مدل‌های آزاد ↗</a></p></>;
}
function SettingsIcon(){return <Activity size={22}/>;}

export default function Panels(props: Props) {
  const { panel, close } = props, info = panelInfo[panel];
  const dialogRef = useDialog<HTMLElement>(close);
  return <div className="drawer-overlay" onClick={close} role="presentation">
    <section ref={dialogRef} className="drawer" tabIndex={-1} role="dialog" aria-modal="true" aria-label={info.title} onClick={e => e.stopPropagation()}>
      <div className="drawer-header"><div><span>{info.subtitle}</span><h2>{info.title}</h2></div><button className="icon-close" onClick={close} aria-label="بستن"><X size={19} /></button></div>
      <div className="drawer-body">
        {panel === "economy" && <Economy {...props} />}
        {panel === "defense" && <Defense {...props} />}
        {panel === "city" && <City {...props} />}
        {panel === "research" && <Research {...props} />}
        {panel === "war" && <War {...props} />}
        {panel === "hero" && <Heroes {...props} />}
        {panel === "events" && <Events {...props} />}
        {panel === "settings" && <Settings {...props} />}
      </div>
    </section>
  </div>;
}
