"use client";

import { Award, Warehouse, X, Zap } from "lucide-react";
import { getStats, buildingUpgradeQuote, waveComposition, type GameState } from "@/lib/game";
import { currentChapter, rankInfo } from "@/lib/progression";
import { scenarioForWave } from "@/lib/news";
import { scenarioContextFor } from "@/lib/scenario-mechanics";
import { compact, fa } from "./game-ui";
import { FirstShift } from "./FirstShift";
import HarborGlyph from "./HarborGlyph";
import { canOfferOpeningWave, openingAttentionRules, type OpeningFocus } from "@/lib/opening-attention";
import { openingNextTollIn } from "@/lib/opening-industry";
import { operationForOpening } from "@/lib/opening-operations";
import guide from "@/data/reopening/guide.json";

type Props = {
  game: GameState;
  candidate: OpeningFocus | null;
  highlight: OpeningFocus | null;
  onTank: () => void;
  onHelp: () => void;
  onSkip?: () => void;
  onDismissHint?: () => void;
  hidden: boolean;
  focus: boolean;
  showGift: boolean;
  onCollect: () => void;
  onBoost: () => void;
  onBattle: () => void;
  onJournal: () => void;
  onGift: () => void;
};

/* The tanker port-cycle stage for the peace essential set (D-023): in
   focus mode it takes over the idle bar's heading line (the bar carries
   bank + accumulated + collect and the real export rate beside it).
   Rates mirror Panels' PortCard (loading 0.04/s). */
function portStageLine(game: GameState): string {
  const port = game.idle.port;
  if (port.tanker) {
    const tanker = port.tanker;
    if (tanker.stage === "approach") return `نفتکش در راه بندر است · رسیدن در ${fa(Math.max(1, Math.ceil((1 - tanker.progress) / 0.04)))} ثانیه`;
    if (tanker.stage === "loading") return tanker.load > 0 ? `نفتکش در حال بارگیری · ${fa(Math.floor(tanker.load))} بشکه بار شده` : "نفتکش پهلو گرفته؛ در انتظار نفت مازاد بر سهم پالایش";
    return game.opening ? `نفت‌کش در حال خروج · محموله ${fa(Math.floor(tanker.load))} بشکه`
      : `نفتکش بندر را ترک کرد · ${fa(Math.floor(tanker.load))} بشکه صادر شد`;
  }
  return `نفتکش بعدی تا ${fa(Math.max(1, Math.ceil(port.nextIn)))} ثانیهٔ دیگر · ${fa(port.cycles)} سفر کامل‌شده`;
}

export default function IdleHud(props:Props){
  const {game}=props,stats=getStats(game),rank=rankInfo(game.idle.xp),chapter=currentChapter(game),battle=game.phase==="battle",manager=game.idle.managerLevels.harbor>0;
  /* Real export $/s (ECO stat, R11) — presented as live income ONLY while a
     tanker is docked and loading (realExportRate is 0 otherwise); the
     theoretical dollarRate is never presented as live income. */
  const realRate=stats.realExportRate;
  const opening = game.opening;
  const waveReady = canOfferOpeningWave(opening);
  const bankCap = stats.bankCapacity;
  const treasuryHint = props.highlight === "treasury" || props.highlight === "treasury_to_tank";
  const cannotFundTank = opening?.stalled && game.cash + Math.floor(game.idle.bank) < buildingUpgradeQuote(game, "tank", 1).cost;
  const rescueAvailable = opening?.stalled && !props.onSkip && opening.stallStartedAt !== null &&
    opening.activeSeconds - opening.stallStartedAt >= openingAttentionRules.optional_rescue_wait_s;
  const firstShift = opening && opening.manualWaveAt === null && !battle;
  const optionalGuide = firstShift && props.onSkip;
  const openingCopy = opening?.stalled ? guide.sequence[3].copy_fa
    : opening?.firstTollAt === null ? guide.sequence[1].copy_fa
    : !opening?.collectedFirstToll ? guide.sequence[2].copy_fa
    : waveReady ? guide.sequence[5].copy_fa : null;
  const bankFull = Math.min(1, game.idle.bank / bankCap);
  /* Expanded peace only: the next wave's composition (moved here from the
     removed wave-hud card; focus mode keeps only the essential set). */
  const previewUnits = !props.focus && !battle ? waveComposition(game.wave, scenarioForWave(game.wave, game.mode, scenarioContextFor(game))) : [];
  if (firstShift && props.focus && !props.hidden) return <FirstShift game={game} focus={props.candidate} highlight={props.highlight}
    onTank={props.onTank} onCollect={props.onCollect} onBattle={props.onBattle} onHelp={props.onHelp} onSkip={props.onSkip} onDismissHint={props.onDismissHint}/>;
  return <>
    {!props.focus&&<div className="commander-progress"><button className="rank-medal" onClick={props.onJournal} title={rank.title} aria-label={`رتبه ${rank.title}`}><Award size={26}/><strong>{fa(rank.level)}</strong></button><div><span className="chapter-label">فصل {fa(chapter.index+1)} <i/> {chapter.title}</span><h1>{rank.title}</h1><div className="commander-xp"><i style={{width:`${rank.progress*100}%`}}/></div><small><span>{fa(game.idle.xp)} / {fa(rank.next)} تجربه</span></small></div></div>}
    {!props.hidden&&<>
      {!battle&&previewUnits.length>0&&<div className="wave-preview peace-preview" aria-label="ترکیب موج بعدی">{previewUnits.map(u => <span key={u.kind === "boss" ? `boss-${u.boss}` : u.kind} className={`preview-unit unit-${u.kind}${u.kind === "boss" ? ` boss-${u.boss}` : ""}`} title={u.kind === "boss" ? "غول‌آخر" : u.kind === "speed" ? "تندرو" : u.kind === "corvette" ? "ناوچه" : u.kind === "air" ? "هوایی" : u.kind === "sub" ? "زیردریایی" : "ناوشکن"}>{u.kind === "boss" ? "☠" : u.kind === "air" ? "✈" : u.kind === "sub" ? "⚓" : u.kind === "destroyer" ? "⬢" : u.kind === "corvette" ? "⬣" : "▲"}<b>{fa(u.count)}</b></span>)}</div>}
      {!battle && <>
        <div className="peace-orders">
          {waveReady && <button className="idle-battle-start" data-opening-highlight={props.highlight === "wave" ? "wave" : undefined} onClick={props.onBattle} aria-label="شروع دفاع">
            <HarborGlyph symbol="flag" />
            <span className="order-copy"><strong>{game.phase === "defeat" ? "دوباره بجنگ" : "دفاع از بندر"}</strong>
              <small>{game.phase === "intermission" && !operationForOpening(game) ? "فراخوان زودهنگام · ۲۵٪+" : `عملیات ${fa(game.wave)}`}</small></span>
          </button>}
          {props.showGift && <button className="gift-parcel" onClick={props.onGift} aria-label="هدیهٔ روزانه آمادهٔ دریافت است"><HarborGlyph symbol="gift" /></button>}
        </div>
        {opening && (opening.stalled || optionalGuide || props.onDismissHint) && <div className="opening-status">
          {opening.stalled && <button className="opening-tank-status" data-opening-highlight={props.highlight === "tank" ? "tank" : undefined}
            onClick={props.onTank} aria-label="بررسی مخزن پُر و توقف تولید">
            <Warehouse size={19} aria-hidden="true"/><span><strong>مخزن پُر · تولید متوقف</strong><small>{cannotFundTank ? `عوارض بعدی حدود ${fa(openingNextTollIn(game))} ثانیهٔ دیگر` : "بررسی مخزن"}</small></span>
          </button>}
          {rescueAvailable && <button className="opening-help" onClick={props.onHelp}>کمک برای این توقف</button>}
          {optionalGuide && <div className="opening-guide">
            {!opening.stalled && openingCopy && <span>{openingCopy}</span>}
            <button className="opening-skip" onClick={props.onSkip} aria-label="رد کردن آموزش">رد آموزش</button>
          </div>}
          {props.onDismissHint && <button className="opening-dismiss" onClick={props.onDismissHint} aria-label="بستن راهنمای این مورد" title="بستن راهنمای این مورد"><X size={14}/></button>}
        </div>}
        <div className="idle-command-bar" onPointerDown={event => event.stopPropagation()}>
          <div className="income-receipt">
            {opening?.lastToll && <span className="opening-toll-receipt">عوارض عبور +{fa(opening.lastToll.amount)} اعتبار بندر</span>}
            <span>{props.focus ? portStageLine(game) : manager ? "برداشت خودکار بندر" : "درآمد انباشتهٔ بندر"}</span>
            {realRate > 0 && <bdi>{opening ? `فروش نفت +${fa(realRate, 1)} اعتبار بندر/ث` : `+$${fa(realRate, 1)}/ث`}</bdi>}
          </div>
          <button className={`collect-income ${bankFull > .85 ? "bank-near-cap" : ""}`} data-opening-highlight={treasuryHint ? props.highlight : undefined} disabled={game.idle.bank < 1} onClick={props.onCollect} aria-label="جمع‌آوری درآمد">
            <span className="collect-coin workshop-icon wk-cash" aria-hidden="true"/>
            <span className="collect-text"><strong>{props.candidate === "treasury_to_tank" ? "برداشت برای مخزن" : opening ? "برداشت از خزانه" : "دریافت درآمد"}</strong>
              <small><bdi>{opening ? `${compact(game.idle.bank)} اعتبار بندر` : `$${compact(game.idle.bank)}`}</bdi>{!opening && game.idle.collectionStreak > 0 && ` · پاداش ${fa(game.idle.collectionStreak * 4)}٪`}</small></span>
            <i className="bank-cap-bar" style={{ width: `${bankFull * 100}%` }}/>
          </button>
          {!props.focus && <button className="production-boost" onClick={props.onBoost} disabled={game.idle.boostCharges <= 0 && game.idle.boostRemaining <= 0} aria-label="تولید دوبرابر">
            <Zap size={18} fill="currentColor"/><strong>{game.idle.boostRemaining > 0 ? `${fa(Math.ceil(game.idle.boostRemaining))}ث` : "×۲"}</strong>
            <small>{game.idle.boostRemaining > 0 ? "فعال" : `${fa(game.idle.boostCharges)} شارژ`}</small>
          </button>}
        </div>
      </>}

    </>}
  </>;
}
