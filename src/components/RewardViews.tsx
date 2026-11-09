"use client";

import { ArrowLeft, Award, Check, Clock3, Coins, Gift, PackageOpen, ShieldCheck, Sparkles, Star, Target, TrendingUp, X, Zap } from "lucide-react";
import type { Dispatch } from "react";
import { TOWERS, type Action, type GameState, type TowerKind } from "@/lib/game";
import { defeatReasonText, type BattleReport, type Reward } from "@/lib/progression";
import { compact, fa } from "./game-ui";
import TowerModel from "./TowerModel";
import { useDialog } from "./useDialog";

export function RewardView({ reward, dispatch, feedback }: { reward: Reward; dispatch: Dispatch<Action>; feedback: () => void }) {
  const close = () => { dispatch({ type:"dismiss-reward", id:reward.id }); feedback(); };
  const ref = useDialog<HTMLElement>(close);
  const cards = Object.entries(reward.cards ?? {}) as [TowerKind, number][];
  return <div className="reward-backdrop"><section className={`reward-dialog reward-${reward.type}`} ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="reward-title">
    <button className="reward-close" onClick={close} aria-label="بستن پاداش"><X size={18}/></button>
    <div className="reward-rays" aria-hidden="true"/><div className="reward-sparkles" aria-hidden="true">{Array.from({length:10},(_,i)=><i key={i} style={{left:`${8+i*9}%`,animationDelay:`${i*.11}s`}}/>)}</div>
    <span className="reward-kicker">{reward.type==="chest"?"صندوقچهٔ غنائم":reward.type==="milestone"?"تکامل سازه":reward.type==="daily"?"یک شروع پربار":reward.type==="contract"?"قرارداد موفق":"یک قدم به فرمانروایی نزدیک‌تر"}</span>
    <div className="reward-art"><img src="/assets/reward-crate.png" alt="صندوقچه غنائم"/>{reward.type!=="chest"&&<span className="reward-art-badge">{reward.type==="milestone"?<TrendingUp size={24}/>:<Check size={24}/>}</span>}</div>
    <h2 id="reward-title">{reward.title}</h2><p className="reward-subtitle">{reward.subtitle}</p>
    {cards.length>0&&<div className="loot-cards">{cards.map(([kind,count],index)=><div className="loot-card" key={kind} style={{animationDelay:`${.2+index*.15}s`}}><span className="loot-card-count">×{fa(count)}</span><TowerModel kind={kind} tier={2} preview/><strong>{TOWERS[kind].short}</strong><small>نقشهٔ ارتقای دائمی</small></div>)}</div>}
    <div className="reward-values"><div><Coins size={19}/><strong>+{compact(reward.cash)}</strong><span>دلار نفتی</span></div><div><Award size={19}/><strong>+{fa(reward.xp)}</strong><span>تجربه</span></div>{!!reward.chests&&<div><Gift size={19}/><strong>+{fa(reward.chests)}</strong><span>صندوقچه</span></div>}{!!reward.boosts&&<div><Zap size={19}/><strong>+{fa(reward.boosts)}</strong><span>تقویت تولید</span></div>}</div>
    <button className="primary-action reward-confirm" data-autofocus onClick={close}>عالیه، ادامه بدیم <ArrowLeft size={18}/></button>
    <small className="reward-saved"><Check size={12}/> پاداش به موجودی شما اضافه شد.</small>
  </section></div>;
}

export function BattleResultView({ report, dispatch, autoBattle, feedback, onDevelop }: { report: BattleReport; dispatch: Dispatch<Action>; autoBattle: boolean; feedback: () => void; onDevelop: () => void }) {
  const accept = () => { dispatch({type:"claim-battle"}); feedback(); };
  const ref = useDialog<HTMLElement>(accept);
  const next = () => { accept(); dispatch({type:"start",early:report.victory}); };
  return <div className="reward-backdrop"><section className={`battle-result-dialog ${report.victory?"won":"lost"}`} ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="battle-result-title">
    <span className="result-eyebrow">گزارش عملیات {fa(report.wave)}</span><div className="result-emblem">{report.victory?<ShieldCheck size={42}/>:<ShieldCheck size={42}/>}</div>
    <h2 id="battle-result-title">{report.victory?"تنگه امن ماند!":"این نبرد تمام نشده."}</h2><p>{report.title}</p>
    {report.victory&&<div className="result-stars" aria-label={`${report.stars} ستاره از سه`}>{[1,2,3].map(star=><Star key={star} size={39} fill={star<=report.stars?"currentColor":"transparent"} className={star<=report.stars?"earned":""} style={{animationDelay:`${star*.15}s`}}/>)}</div>}
    <div className="result-stats"><span><Target size={15}/><b>{fa(report.destroyed)}</b> هدف منهدم</span><span><Clock3 size={15}/><b>{fa(Math.round(report.seconds))}</b> ثانیه</span><span><ShieldCheck size={15}/><b>{fa(report.hearts)}/۲۰</b> سلامت</span></div>
    {report.victory?<div className="result-prizes"><div><Coins size={20}/><span>پاداش عملیات</span><strong>+${compact(report.cash)}</strong></div><div><Award size={20}/><span>تجربهٔ فرمانده</span><strong>+{fa(report.xp)}</strong></div>{report.chests>0&&<div><Gift size={20}/><span>صندوقچهٔ غنائم</span><strong>×{fa(report.chests)}</strong></div>}</div>:<div className="defeat-tip"><TrendingUp size={20}/><div><strong>{report.reason ? defeatReasonText(report.reason) : "یک ارتقای خوب، ورق را برمی‌گرداند."}</strong><p>{report.reason ? "پیشرفت اقتصادی شما محفوظ است؛ خط دفاع را برای همین تهدید تقویت کنید." : "برجک‌ها و مهمات را تقویت کنید؛ پیشرفت اقتصادی شما محفوظ است."}</p></div></div>}
    {report.victory&&<label className="auto-battle-control"><input type="checkbox" checked={autoBattle} onChange={()=>dispatch({type:"toggle-auto-battle"})}/><span>موج‌های بعدی خودکار شروع شوند</span></label>}
    <button className="primary-action" data-autofocus onClick={report.victory?accept:()=>{accept();onDevelop();}}>{report.victory?"دریافت غنائم و بازگشت":"تقویت خط دفاعی"}<ArrowLeft size={18}/></button>
    <button className="result-next" onClick={next}>{report.victory?"دریافت و رفتن به موج بعدی":"تلاش دوباره با همین برجک‌ها"}<ChevronArrow/></button>
  </section></div>;
}
function ChevronArrow(){return <ArrowLeft size={14}/>;}

export function OfflineView({ game, dispatch, feedback }: { game: GameState; dispatch: Dispatch<Action>; feedback: () => void }) {
  const offline=game.idle.offline!;
  const claim=()=>{dispatch({type:"claim-offline"});feedback();};
  const ref=useDialog<HTMLElement>(claim);
  const hours=Math.floor(offline.seconds/3600),minutes=Math.max(1,Math.floor(offline.seconds%3600/60));
  return <div className="reward-backdrop"><section className="offline-dialog" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="offline-title"><span className="offline-icon"><Clock3 size={28}/></span><span className="reward-kicker">خوش برگشتید، فرمانده</span><h2 id="offline-title">بندر در نبود شما کار کرد.</h2><p>{hours>0?`${fa(hours)} ساعت و `:""}{fa(minutes)} دقیقه فعالیتِ خودکار</p><div className="offline-crate"><img src="/assets/reward-crate.png" alt="درآمد ذخیره‌شده"/></div><div className="offline-amount"><Coins size={23}/><strong>${compact(offline.cash)}</strong></div><span className="offline-amount-label">درآمد آمادهٔ دریافت</span><div className="offline-security"><ShieldCheck size={18}/><span>پوشش دفاعی تنگه</span><strong>{fa(offline.defense*100)}٪</strong></div><div className="offline-note">درآمد آفلاین تا ۱۲ ساعت محاسبه می‌شود؛ دفاع قوی‌تر، درآمد بیشتری حفظ می‌کند.</div><button className="primary-action" data-autofocus onClick={claim}>جمع‌آوری درآمد <ArrowLeft size={18}/></button></section></div>;
}
