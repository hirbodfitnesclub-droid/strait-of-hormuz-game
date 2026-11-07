"use client";

import { useState, type Dispatch } from "react";
import { ArrowLeft, ArrowUp, Blocks, Check, ChevronDown, Coins, Crosshair, LockKeyhole, Pause, Ruler, Shield, Sparkles, Trash2, X, Zap } from "lucide-react";
import { PRIORITY_LABELS, SLOTS, TOWERS, TOWER_KINDS, getRange, towerDps, towerUpgradeCost, type Action, type GameState, type TowerKind } from "@/lib/game";
import { compact, fa, TargetTypes, TowerGlyph } from "./game-ui";
import { useDialog } from "./useDialog";
import TowerModel from "./TowerModel";

type Props = { game: GameState; slot: number; kind: TowerKind; onKindChange: (kind: TowerKind) => void; dispatch: Dispatch<Action>; close: () => void; onResearch: () => void; onBuild: (kind: TowerKind) => void; feedback: () => void; notify: (text: string) => void };
const roles: Record<TowerKind, string> = { cannon: "رگبار سریع · ضد تندرو و پهپاد", heavy: "انفجار منطقه‌ای · ضد دسته‌ها", missile: "دوربرد سنگین · شکار ناو", air: "پدافند و لیزر · هوا و دریا", ew: "کندکننده و سونار · پشتیبانی", boat: "رهگیر دریایی · سد مسیر" };

export default function TowerSheet(props: Props) {
  const { game, slot, kind, dispatch, close, notify } = props;
  const ref = useDialog<HTMLElement>(close);
  const [advanced, setAdvanced] = useState(false);
  const [confirmSell, setConfirmSell] = useState(false);
  const tower = game.towers.find(t => t.slot === slot), def = TOWERS[tower?.kind ?? kind];
  const cost = tower ? towerUpgradeCost(tower) : { cash: def.cost, steel: def.steel };
  const affordable = game.cash >= cost.cash && game.steel >= cost.steel;
  const preview = tower ?? { slot, kind, tier: 1, branch: null, priority: "first" as const };
  const dpsNow = towerDps(game, preview);
  const dpsNext = tower && tower.tier < 4 ? towerDps(game, { ...tower, tier: tower.tier + 1 }) : null;
  const dpsGain = dpsNext ? Math.round((dpsNext / Math.max(1, dpsNow) - 1) * 100) : 0;
  const rangeNow = getRange(game, preview);
  const upgrade = (branch?: number) => {
    if (!affordable) return;
    dispatch({ type: "upgrade-tower", slot, branch }); props.feedback(); notify(tower && tower.tier === 3 ? "برج ویژه فعال شد؛ قدرت آتش جهش کرد!" : "برجک ارتقا یافت؛ دفاع شما قدرتمندتر شد.");
  };
  const name = tower?.tier === 4 && tower.branch !== null ? def.branches[tower.branch] : def.short;

  return <div className="tower-sheet-backdrop" onClick={close}>
    <section className="tower-sheet" ref={ref} role="dialog" aria-modal="true" aria-labelledby="tower-sheet-title" tabIndex={-1} onClick={e => e.stopPropagation()}>
      <div className="sheet-handle" />
      <header className="tower-sheet-header"><div><span className="sheet-eyebrow">جایگاه {SLOTS[slot].label} · {def.short}{game.phase === "battle" && <small><Pause size={10} /> نبرد موقتاً متوقف است</small>}</span><h2 id="tower-sheet-title">{tower ? name : "یک برجک انتخاب کنید"}</h2></div><button className="close-control" onClick={close} aria-label="بستن منوی برجک"><X size={19} /></button></header>
      <div className="tower-sheet-body">
        {!tower ? <div className="tower-choice-grid">{TOWER_KINDS.map(item => {
          const selected = item === kind, definition = TOWERS[item];
          const canAfford = game.cash >= definition.cost && game.steel >= definition.steel;
          const dps = towerDps(game, { slot, kind: item, tier: 1, branch: null, priority: "first" });
          return <button key={item} className={`tower-choice ${selected ? "chosen" : ""} ${canAfford ? "" : "unaffordable"}`} onClick={() => props.onKindChange(item)} aria-pressed={selected} aria-label={`انتخاب ${definition.short}`}>
            <span className={`choice-icon tower-color-${item}`}><TowerModel kind={item} tier={1} preview /></span><span className="choice-copy"><strong>{definition.short}</strong><small>{roles[item]}</small><small className="choice-dps">قدرت {fa(dps)} · برد {fa(definition.range)}</small></span>
            <span className="choice-bottom"><TargetTypes targets={definition.targets} /><span>${compact(definition.cost)} + {fa(definition.steel)}⚙</span></span>{selected && <span className="choice-check"><Check size={11} /></span>}
          </button>;
        })}</div> : <div className="selected-tower-card"><span className={`selected-tower-art tower-color-${tower.kind}`}><TowerModel kind={tower.kind} tier={tower.tier} branch={tower.branch} preview /></span><div><span className="tier-label">سطح {fa(tower.tier)} از ۴{tower.tier === 4 ? " · ویژه" : ""}</span><p>{tower.tier === 4 && tower.branch !== null ? `شاخه ${def.branches[tower.branch]} — ${def.description}` : def.description}</p><TargetTypes targets={def.targets} /></div><div className="level-pips">{[1, 2, 3, 4].map(level => <i className={level <= tower.tier ? "filled" : ""} key={level} />)}</div></div>}
        <div className="tower-specs"><div><Crosshair size={14} /><span>قدرت <strong>{fa(dpsNow)}</strong></span>{dpsNext && <small className="dps-gain">↗ {fa(dpsNext)} (+{fa(dpsGain)}٪)</small>}</div><div><Ruler size={14} /><span>برد <strong>{fa(rangeNow, 1)}</strong></span></div><div><Zap size={14} /><span>{tower ? `نرخ ${fa(TOWERS[tower.kind].rate, 2)}/ث` : "ساخت فوری"}</span></div></div>
        {tower?.tier === 3 && game.research.includes("special") && <div className="special-branches"><p><Sparkles size={14} /> مسیر ویژه را انتخاب کنید — هر شاخه سبک نبرد را عوض می‌کند</p>{def.branches.map((branch, index) => <button key={branch} disabled={!affordable} onClick={() => upgrade(index)}><span><span className="branch-model"><TowerModel kind={tower.kind} tier={4} branch={index} preview /></span><span className="branch-copy"><strong>{branch}</strong><small>{index === 0 ? "قدرت پایدار و مطمئن" : "آسیب انفجاری و تخصصی"}</small></span></span><span>${compact(cost.cash)} <ArrowLeft size={15} /></span></button>)}</div>}
        {tower && <div className="tower-advanced"><button className="advanced-toggle" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced}>تنظیمات بیشتر <ChevronDown size={14} className={advanced ? "rotated" : ""} /></button>{advanced && <div className="advanced-content"><button className="priority-toggle" onClick={() => dispatch({ type: "priority", slot })}><Crosshair size={15} /><span>هدف‌گیری</span><strong>{PRIORITY_LABELS[tower.priority]}</strong></button><div className="priority-hint">اولین: نزدیک‌ترین به بندر · قوی‌ترین: باس‌کش · هوایی: ضد پهپاد</div>{!confirmSell ? <button className="sell-tower" onClick={() => setConfirmSell(true)}><Trash2 size={14} /> فروش برجک</button> : <div className="sell-confirm"><span>برجک فروخته شود؟</span><button onClick={() => { dispatch({ type: "sell-tower", slot }); close(); notify("برجک فروخته شد و بخشی از منابع بازگشت."); }}>بله، فروش</button><button onClick={() => setConfirmSell(false)}>انصراف</button></div>}</div>}</div>}
      </div>
      {(!tower || tower.tier < 3) && <footer className="tower-sheet-footer"><div className="build-cost"><span><Coins size={14} /> ${compact(cost.cash)}</span><span><Blocks size={14} /> {fa(cost.steel)} فولاد</span>{!affordable && <small>منابع کافی نیست — درآمد جمع کن یا فولاد بساز</small>}</div><button className="primary-action build-confirm" data-autofocus disabled={!affordable} onClick={() => tower ? upgrade() : props.onBuild(kind)}>{tower ? <><ArrowUp size={18} /> ارتقا به سطح {fa(tower.tier + 1)} <Shield size={14} /></> : <><PlusIcon /> ساخت {def.short}</>}<ArrowLeft size={17} /></button></footer>}
      {tower?.tier === 3 && !game.research.includes("special") && <footer className="tower-sheet-footer"><p className="unlock-note">برای ادامهٔ ارتقا، فناوری برجک‌های ویژه را پژوهش کنید.</p><button className="primary-action" onClick={props.onResearch}><LockKeyhole size={16} /> رفتن به پژوهشگاه <ArrowLeft size={16} /></button></footer>}
      {tower?.tier === 4 && <div className="max-tower-note"><Sparkles size={15} /> این برجک به بالاترین سطح رسیده است — کارت‌هایش را برای قدرت دائمی ارتقا بده.</div>}
    </section>
  </div>;
}
function PlusIcon() { return <span className="build-plus">+</span>; }
