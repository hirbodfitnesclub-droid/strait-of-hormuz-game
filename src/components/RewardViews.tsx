"use client";

import { ArrowLeft, Award, Check, ChevronsLeft, Clock3, Coins, Gift, Heart, ShieldAlert, ShieldCheck, Star, Target, Timer, TrendingUp, Trophy, Wheat, Wrench, X, Zap } from "lucide-react";
import type { Dispatch, ReactNode } from "react";
import { TOWERS, type Action, type GameState, type TowerKind } from "@/lib/game";
import { defeatReasonText, type BattleReport, type Reward } from "@/lib/progression";
import { compact, fa } from "./game-ui";
import TowerModel from "./TowerModel";
import { useDialog } from "./useDialog";

function Prize({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return <div className="workshop-prize"><span className="prize-symbol" aria-hidden="true">{icon}</span><strong dir="ltr">{value}</strong><small>{label}</small></div>;
}

export function RewardView({ reward, dispatch, feedback }: { reward: Reward; dispatch: Dispatch<Action>; feedback: () => void }) {
  const close = () => { dispatch({ type: "dismiss-reward", id: reward.id }); feedback(); };
  const ref = useDialog<HTMLElement>(close);
  const cards = Object.entries(reward.cards ?? {}) as [TowerKind, number][];
  return <div className="reward-backdrop"><section className={`reward-dialog workshop-receipt reward-${reward.type}`} ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="reward-title">
    <header className="receipt-header">
      <h2 className="receipt-plaque" id="reward-title"><Gift size={22}/>{reward.title}</h2>
      <button className="reward-close" onClick={close} aria-label="بستن پاداش"><X size={17}/></button>
    </header>
    <p className="receipt-message">{reward.subtitle}</p>
    <div className="reward-art">
      <img src="/assets/reward-crate.png" alt="صندوقچهٔ غنائم"/>
      {reward.type !== "chest" && <span className="reward-art-badge">{reward.type === "milestone" ? <TrendingUp size={20}/> : <Check size={20}/>}</span>}
    </div>
    {cards.length > 0 && <div className="loot-cards">{cards.map(([kind, count], index) => <div className="loot-card" key={kind} style={{ animationDelay: `${.2 + index * .15}s` }}>
      <span className="loot-card-count">×{fa(count)}</span><TowerModel kind={kind} tier={2} preview/>
      <strong>{TOWERS[kind].short}</strong><small>نقشهٔ ارتقای دائمی</small>
    </div>)}</div>}
    <div className="reward-values">
      <Prize icon={<span className="workshop-icon wk-cash"/>} value={`+${compact(reward.cash)}`} label="دلار نفتی"/>
      <Prize icon={<Award/>} value={`+${fa(reward.xp)}`} label="تجربه"/>
      {!!reward.steel && <Prize icon={<span className="workshop-icon wk-steel"/>} value={`+${fa(reward.steel)}`} label="فولاد"/>}
      {!!reward.ammo && <Prize icon={<span className="workshop-icon wk-ammo"/>} value={`+${fa(reward.ammo)}`} label="مهمات"/>}
      {!!reward.chests && <Prize icon={<Gift/>} value={`+${fa(reward.chests)}`} label="صندوقچه"/>}
      {!!reward.boosts && <Prize icon={<Zap/>} value={`+${fa(reward.boosts)}`} label="تقویت تولید"/>}
    </div>
    <button className="primary-action reward-confirm" data-autofocus onClick={close}>ادامه<ChevronsLeft size={22}/></button>
    <small className="reward-saved"><Check size={13}/>پاداش به موجودی شما اضافه شد.</small>
  </section></div>;
}

export function BattleResultView({ report, dispatch, autoBattle, feedback, onDevelop }: { report: BattleReport; dispatch: Dispatch<Action>; autoBattle: boolean; feedback: () => void; onDevelop: () => void }) {
  const accept = () => { dispatch({ type: "claim-battle" }); feedback(); };
  const ref = useDialog<HTMLElement>(accept);
  const next = () => { accept(); dispatch({ type: "start", early: report.victory }); };

  return <div className="reward-backdrop"><section className={`battle-result-dialog workshop-receipt ${report.victory ? "won" : "lost"}`} ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="battle-result-title">
    <header className="receipt-header battle-crest">
      <div className="crest-emblem" aria-hidden="true">{report.victory ? <Trophy size={30}/> : <ShieldAlert size={30}/>}</div>
      <h2 id="battle-result-title" className="receipt-plaque">
        {report.victory && <Wheat className="crest-laurel" aria-hidden="true"/>}
        {report.victory ? "پیروزی" : "شکست در عملیات"}
        {report.victory && <Wheat className="crest-laurel" aria-hidden="true"/>}
      </h2>
    </header>
    <p className="receipt-message"><strong>عملیات {fa(report.wave)}</strong> · {report.title}</p>
    {report.victory && <div className="result-stars" aria-label={`${fa(report.stars)} ستاره از سه`}>
      {[1, 2, 3].map(star => <Star key={star} size={30} fill={star <= report.stars ? "currentColor" : "transparent"} className={star <= report.stars ? "earned" : ""} style={{ animationDelay: `${star * .15}s` }}/>)}
    </div>}
    {report.victory ? <>
      <h3 className="receipt-subplaque">جوایز عملیات</h3>
      <div className="result-prizes">
        <Prize icon={<span className="workshop-icon wk-cash"/>} value={`+$${compact(report.cash)}`} label="دلار نفتی"/>
        <Prize icon={<Award/>} value={`+${fa(report.xp)}`} label="تجربه"/>
        {report.chests > 0 && <Prize icon={<Gift/>} value={`×${fa(report.chests)}`} label="صندوقچه"/>}
      </div>
    </> : <div className="defeat-tip"><Wrench size={22}/><div>
      <strong>{report.reason ? defeatReasonText(report.reason) : "برجک‌ها و مهمات را تقویت کنید."}</strong>
      <p>پیشرفت اقتصادی شما محفوظ است.</p>
    </div></div>}
    <div className="result-stats">
      <span><Target size={16}/>هدف‌های منهدم‌شده<b>{fa(report.destroyed)}</b></span>
      <span><Timer size={16}/>زمان عملیات<b>{fa(Math.round(report.seconds))} ثانیه</b></span>
      <span><Heart size={16}/>سلامت باقی‌مانده<b>{fa(report.hearts)} / ۲۰</b></span>
    </div>
    {report.victory && <label className="auto-battle-control"><input type="checkbox" checked={autoBattle} onChange={() => dispatch({ type: "toggle-auto-battle" })}/><span>موج‌های بعدی خودکار شروع شوند</span></label>}
    <button className="primary-action" data-autofocus onClick={report.victory ? accept : () => { accept(); onDevelop(); }}>
      {report.victory ? "دریافت غنائم و بازگشت" : "تقویت خط دفاعی"}<ChevronsLeft size={23}/>
    </button>
    <button className="result-next" onClick={next}>{report.victory ? "دریافت و رفتن به موج بعدی" : "تلاش دوباره با همین برجک‌ها"}<ArrowLeft size={15}/></button>
  </section></div>;
}

export function OfflineView({ game, dispatch, feedback }: { game: GameState; dispatch: Dispatch<Action>; feedback: () => void }) {
  const offline = game.idle.offline!;
  const claim = () => { dispatch({ type: "claim-offline" }); feedback(); };
  const ref = useDialog<HTMLElement>(claim);
  const hours = Math.floor(offline.seconds / 3600);
  const minutes = Math.floor(offline.seconds % 3600 / 60);
  const duration = [hours > 0 && `${fa(hours)} ساعت`, minutes > 0 && `${fa(minutes)} دقیقه`].filter(Boolean).join(" و ") || "کمتر از یک دقیقه";

  return <div className="reward-backdrop"><section className="offline-dialog workshop-receipt" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="offline-title">
    <header className="receipt-header"><h2 id="offline-title" className="receipt-plaque"><Clock3 size={24}/>درآمد آفلاین</h2></header>
    <p className="receipt-message">در مدت نبود شما <strong>{duration}</strong></p>
    <div className="offline-ledger">
      <Prize icon={<span className="workshop-icon wk-cash"/>} value={`$${compact(offline.cash)}`} label="درآمد آمادهٔ دریافت"/>
      <Prize icon={<ShieldCheck/>} value={`${fa(offline.defense * 100)}٪`} label="پوشش دفاعی تنگه"/>
    </div>
    <div className="offline-crate"><img src="/assets/reward-crate.png" alt="صندوق درآمد ذخیره‌شده"/></div>
    <p className="offline-note">درآمد آفلاین تا ۱۲ ساعت محاسبه می‌شود. دفاع قوی‌تر، درآمد بیشتری حفظ می‌کند.</p>
    <button className="primary-action" data-autofocus onClick={claim}><Coins size={23}/>جمع‌آوری درآمد</button>
  </section></div>;
}
