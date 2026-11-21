"use client";

import { useState, type Dispatch } from "react";
import { Anchor, ArrowLeft, Award, BookOpen, Check, ChevronDown, ChevronsLeft, Clock3, Coins, Crown, Flag, Gift, LockKeyhole, Microscope, Shield, Ship, UsersRound, Wrench, X, Zap } from "lucide-react";
import { type Action, type GameState } from "@/lib/game";
import { CHAPTERS, CONTRACTS, MANAGERS, MISSIONS, currentChapter, currentMission, managerCost, missionProgress, rankInfo, type ContractId, type ManagerId, type Mission, type MissionTarget } from "@/lib/progression";
import { DAILY_REWARDS, type DailyStatus } from "@/lib/daily";
import { compact, fa } from "./game-ui";
import { useDialog } from "./useDialog";

export type ProgressPanel = "missions" | "managers" | "contracts" | "daily";

type Props = {
  panel: ProgressPanel;
  game: GameState;
  dispatch: Dispatch<Action>;
  close: () => void;
  navigate: (target: MissionTarget) => void;
  feedback: () => void;
  notify: (text: string) => void;
  daily: DailyStatus | null;
  dailyBusy: boolean;
  dailyError: boolean;
  claimDaily: () => void;
  reloadDaily: () => void;
  dailyWebOnly?: boolean;
};

const headings = {
  missions: { title: "مأموریت‌ها", art: "helm" },
  managers: { title: "مدیریت بندر", art: "helm" },
  contracts: { title: "قراردادهای تجاری", art: "freighter" },
  daily: { title: "هدیهٔ روزانه", art: "gift" },
};

function MissionIllustration({ mission }: { mission: Mission }) {
  const icons = { collect: Coins, building: Wrench, manager: UsersRound, tower: Shield, battle: Flag, research: Microscope, chest: Gift, contract: Ship, island: Anchor, journal: BookOpen };
  const Icon = icons[mission.navigate.kind];
  const illustrations: Partial<Record<MissionTarget["kind"], string>> = {
    collect: "/assets/workshop/cash.webp",
    manager: "/assets/workshop/progression/harbor.webp",
    chest: "/assets/workshop/progression/strongbox.webp",
    contract: "/assets/workshop/progression/freighter.webp",
    island: "/assets/workshop/progression/lighthouse.webp",
  };
  const building = mission.metricId;
  const image = mission.navigate.kind === "building" && building
    ? building === "oil" || building === "tank" ? "/assets/workshop/progression/barrels.webp"
      : building === "steel" ? "/assets/workshop/steel.webp"
      : building === "dock" ? "/assets/workshop/progression/freighter.webp"
      : `/assets/buildings/${building}.png`
    : illustrations[mission.navigate.kind];
  return <span className={`mission-node mission-art-${mission.navigate.kind}`} aria-hidden="true">
    {image ? <img src={image} alt="" loading="lazy"/> : <Icon size={28}/>}
  </span>;
}

function Missions({ game, dispatch, navigate, close, feedback }: Props) {
  const chapter = currentChapter(game);
  const [selected, setSelected] = useState(chapter.index);
  const active = currentMission(game);
  const rank = rankInfo(game.idle.xp);
  const items = MISSIONS.filter(item => item.chapter === selected);

  function act(mission: Mission) {
    if (missionProgress(game, mission).complete) {
      dispatch({ type: "claim-mission", id: mission.id });
      close();
      feedback();
    } else {
      close();
      navigate(mission.navigate);
    }
  }

  return <>
    <div className="chapter-selector">
      <BookOpen size={18} aria-hidden="true"/>
      <select aria-label="انتخاب فصل مأموریت‌ها" tabIndex={0} value={selected} onChange={event => setSelected(Number(event.target.value))}>
        {CHAPTERS.map((item, index) => <option key={item.title} value={index}>
          فصل {fa(index + 1)} · {item.title}{index > chapter.index ? " (قفل)" : ""}
        </option>)}
      </select>
      <ChevronDown size={15} aria-hidden="true"/>
    </div>
    <div className="journey-missions">{items.map(mission => {
      const done = game.idle.claimedMissions.includes(mission.id);
      const isCurrent = active?.id === mission.id;
      const progress = missionProgress(game, mission);
      return <article key={mission.id} className={`journey-mission workshop-ticket ${done ? "done" : isCurrent ? "current" : "locked"}`}>
        <MissionIllustration mission={mission}/>
        <div className="mission-detail">
          <details className="mission-brief">
            <summary>{mission.title}<ChevronDown size={13} aria-hidden="true"/></summary>
            <p>{mission.description}</p>
            <div className="mission-prizes">
              <span title="دلار نفتی"><Coins size={13}/>{compact(mission.cash)}</span>
              <span title="تجربه"><Award size={13}/>{fa(mission.xp)}</span>
              {!!mission.chests && <span title="صندوقچه"><Gift size={13}/>{fa(mission.chests)}</span>}
              {!!mission.boosts && <span title="تقویت تولید"><Zap size={13}/>{fa(mission.boosts)}</span>}
            </div>
          </details>
          <div className="mission-meter" role="progressbar" aria-label={mission.title} aria-valuenow={progress.value} aria-valuemin={0} aria-valuemax={progress.target}>
            <i style={{ width: `${progress.fraction * 100}%` }}/>
            <b>{fa(progress.value)} / {fa(progress.target)}</b>
          </div>
        </div>
        {isCurrent ? <button className="mission-go" aria-label={`${progress.complete ? "دریافت پاداش" : "رفتن به"} ${mission.title}`} onClick={() => act(mission)}>
          {progress.complete ? <Gift size={21}/> : <ChevronsLeft size={22}/>}
        </button> : <span className={`mission-stamp ${done ? "complete" : ""}`} aria-label={done ? "انجام شد" : "قفل"}>
          {done ? <Check size={21}/> : <LockKeyhole size={15}/>}
        </span>}
      </article>;
    })}</div>
    <div className="journey-rank">
      <span><Award size={27}/><b>{fa(rank.level)}</b></span>
      <div><strong>{rank.title}</strong><small>{fa(game.idle.xp)} تجربه</small><div className="journey-xp"><i style={{ width: `${rank.progress * 100}%` }}/></div></div>
      <span className="journey-total">{fa(game.idle.claimedMissions.length)}<small>از {fa(MISSIONS.length)} مأموریت</small></span>
    </div>
    {active?.chapter === selected && missionProgress(game, active).complete && <button className="primary-action mission-payout" onClick={() => act(active)}>
      <span className="workshop-icon wk-cash" aria-hidden="true"/>دریافت پاداش
    </button>}
    {!active && <div className="journey-finished"><Crown size={24}/><strong>تمام فصل‌ها را فتح کردید.</strong></div>}
  </>;
}

function Managers({ game, dispatch, feedback, notify, navigate, close }: Props) {
  const count = Object.values(game.idle.managerLevels).filter(level => level > 0).length;
  return <>
    <div className="manager-list">{(Object.keys(MANAGERS) as ManagerId[]).map(id => {
      const manager = MANAGERS[id];
      const level = game.idle.managerLevels[id];
      const cost = managerCost(id, level);
      const unlocked = game.idle.xp >= manager.unlockXp;
      return <article className={`manager-card workshop-ticket manager-${manager.color} ${level > 0 ? "hired" : ""}`} key={id}>
        <div className="manager-portrait"><img src={`/assets/workshop/progression/${id}.webp`} alt=""/></div>
        <div className="manager-details"><h3>{manager.name}</h3><span className="manager-role">{manager.role} · {level ? `سطح ${fa(level)}` : "متخصص"}</span></div>
        <div className="manager-action">{unlocked ? <>
          <button disabled={level >= 5 || game.cash < cost} onClick={() => {
            dispatch({ type: "hire-manager", id });
            feedback();
            notify(level ? "مدیر آموزش دید؛ اثر تخصصی او افزایش یافت." : `${manager.name} به تیم شما پیوست.`);
          }}>
            {level >= 5 ? <><Check size={14}/> بیشترین سطح</> : <><span>{level ? "آموزش" : "استخدام"}</span><strong>{compact(cost)} $</strong></>}
          </button>
          {game.cash < cost && level < 5 && <small>کسری بودجه</small>}
        </> : <button className="manager-unlock" aria-label={`باز کردن ${manager.name} با ${fa(manager.unlockXp)} تجربه، رفتن به مأموریت‌ها`} onClick={() => { close(); navigate({ kind: "journal" }); }}>
          <LockKeyhole size={14}/><span>{fa(manager.unlockXp)} تجربه</span>
        </button>}</div>
        <details className="manager-profile"><summary><span className="manager-perk">{manager.effect}</span><ChevronDown size={14}/></summary>
          <p>{manager.description}</p><div className="manager-training" aria-label={`سطح ${fa(level)} از ۵`}>{[1, 2, 3, 4, 5].map(i => <i key={i} className={level >= i ? "filled" : ""}/>)}</div>
        </details>
      </article>;
    })}</div>
    <div className="manager-summary"><UsersRound size={20}/><div><strong>{fa(count)} مدیر در حال خدمت</strong><p>اثر مدیرها هنگام غیبت شما هم ادامه دارد.</p></div></div>
  </>;
}


function Contracts({ game, dispatch, close, feedback, notify }: Props) {
  const active = game.idle.contract;
  const definition = active ? CONTRACTS[active.id] : null;
  return <>
    {active && definition && <div className="active-contract workshop-ticket">
      <span className="contract-live"><i/>{active.elapsed >= definition.duration ? "محموله رسید" : "در مسیر آبراه"}</span>
      <h3>{definition.title}</h3><p>{definition.destination}</p>
      <div className="contract-track"><img src="/assets/workshop/progression/freighter.webp" alt="" style={{ right: `${Math.min(79, active.elapsed / definition.duration * 79)}%` }}/><i style={{ width: `${Math.min(100, active.elapsed / definition.duration * 100)}%` }}/></div>
      <div className="contract-countdown"><span><Clock3 size={14}/>{fa(Math.max(0, Math.ceil(definition.duration - active.elapsed)))} ثانیه</span><strong>${compact(definition.cash)}</strong></div>
      <button className="primary-action" disabled={active.elapsed < definition.duration} onClick={() => { dispatch({ type: "claim-contract" }); feedback(); close(); }}>
        {active.elapsed >= definition.duration ? "تسویهٔ قرارداد" : "محموله در راه است"}<ArrowLeft size={16}/>
      </button>
    </div>}
    <div className="contract-catalog">{(Object.keys(CONTRACTS) as ContractId[]).map(id => {
      const contract = CONTRACTS[id];
      const locked = game.highestWave < contract.unlock;
      return <article className={`trade-contract workshop-ticket ${locked ? "locked" : ""}`} key={id}>
        <span className="trade-contract-icon"><img src="/assets/workshop/progression/freighter.webp" alt=""/></span>
        <div><h3>{contract.title}</h3><p>{contract.destination}</p>
          <span className="trade-contract-meta"><Clock3 size={12}/>{fa(contract.duration / 60)} دقیقه <i/> سود خالص <b>+${compact(contract.cash - contract.cost)}</b></span>
        </div>
        <button disabled={!!active || locked || game.cash < contract.cost} onClick={() => {
          dispatch({ type: "start-contract", id }); feedback(); notify("کشتی محموله از مسیر امن آبراه حرکت کرد.");
        }}>{locked ? <><LockKeyhole size={13}/> موج {fa(contract.unlock)}</> : <><span>اعزام</span><strong>${compact(contract.cost)}</strong></>}</button>
      </article>;
    })}</div>
    <div className="drawer-note"><Award size={16}/> قراردادهای موفق علاوه بر درآمد، تجربهٔ فرماندهی هم می‌دهند.</div>
  </>;
}

function Daily({ daily, dailyBusy, dailyError, claimDaily, reloadDaily, dailyWebOnly }: Props) {
  const step = daily?.step;
  return <>
    <div className="daily-calendar">
      <div className="calendar-rings" aria-hidden="true"><i/><i/><i/><i/><i/></div>
      {DAILY_REWARDS.map((reward, i) => {
        const day = i + 1;
        const today = step === day;
        const claimed = (step !== undefined && day < step) || (today && daily?.available === false);
        return <div className={`daily-day ${today ? "today" : ""} ${claimed ? "claimed" : ""} ${day === 7 ? "grand" : ""}`} key={day} aria-current={today ? "date" : undefined}>
          <span className="calendar-day-label">روز {fa(day)}</span>
          {day === 7 && <img className="grand-harbor" src="/assets/workshop/progression/lighthouse.webp" alt=""/>}
          <div className="day-symbol" aria-hidden="true">{day === 7 ? <span className="workshop-icon wk-anchor"/> : reward.chests ? <img src="/assets/workshop/progression/gift.webp" alt=""/> : <span className="workshop-icon wk-cash"/>}</div>
          <strong>${compact(reward.cash)}</strong>
          <small>{[reward.chests > 0 && `${fa(reward.chests)} صندوقچه`, reward.boosts > 0 && `${fa(reward.boosts)} تقویت`].filter(Boolean).join(" · ")}</small>
          {claimed && <span className="day-check" aria-label="دریافت شد"><Check size={13}/></span>}
        </div>;
      })}
    </div>
    {dailyWebOnly ? <div className="daily-error daily-web-only"><p>هدیهٔ روزانه در نسخهٔ وب در دسترس است.</p></div> :
      dailyError ? <div className="daily-error"><p>هدیه آماده نشد. فضای ذخیرهٔ دستگاه را بررسی و دوباره تلاش کنید.</p><button className="primary-action" onClick={reloadDaily}>تلاش دوباره</button></div> :
      <button className="primary-action daily-claim" data-autofocus disabled={!daily || dailyBusy || !daily.available} onClick={claimDaily}>
        <img className="day-gift-icon" src="/assets/workshop/progression/gift.webp" alt=""/>{dailyBusy ? "در حال ثبت پاداش…" : !daily ? "در حال آماده‌سازی هدیه…" : daily.available ? "دریافت هدیهٔ امروز" : "هدیهٔ امروز دریافت شد"}
      </button>}
    <p className="daily-server-note"><Shield size={14}/>پیشرفت هفت‌روزه‌تان حفظ می‌شود.{!dailyWebOnly && " هدیهٔ بعدی با آغاز روز تهران آماده می‌شود."}</p>
  </>;
}

export default function ProgressionPanels(props: Props) {
  const heading = headings[props.panel];
  const ref = useDialog<HTMLElement>(props.close);
  return <div className="drawer-overlay workshop-progress-overlay" onClick={props.close}>
    <section className={`drawer progression-drawer panel-${props.panel}`} ref={ref} role="dialog" aria-modal="true" aria-labelledby="progress-panel-title" tabIndex={-1} onClick={event => event.stopPropagation()}>
      <header className="drawer-header">
        {props.panel === "missions" && <img className="journal-clamp" src="/assets/workshop/progression/clip.webp" alt=""/>}
        <h2 id="progress-panel-title"><img className="progress-heading-icon" src={`/assets/workshop/progression/${heading.art}.webp`} alt=""/>{heading.title}</h2>
        <button className="icon-close" onClick={props.close} aria-label="بستن"><X size={19}/></button>
      </header>
      <div className="drawer-body">
        {props.panel === "missions" && <Missions {...props}/>}
        {props.panel === "managers" && <Managers {...props}/>}
        {props.panel === "contracts" && <Contracts {...props}/>}
        {props.panel === "daily" && <Daily {...props}/>}
      </div>
    </section>
  </div>;
}
