"use client";

import { useState, type Dispatch } from "react";
import { ArrowLeft, ArrowUp, Blocks, Check, ChevronDown, Coins, Crosshair, LockKeyhole, Pause, Shield, Sparkles, Trash2, X } from "lucide-react";
import { PRIORITY_LABELS, SLOTS, TOWERS, TOWER_KINDS, damageTech, getRange, getStats, towerDps, towerPowerMw, towerUpgradeCost, type Action, type GameState, type Tower, type TowerKind } from "@/lib/game";
import { specInterval, weaponSpec } from "@/lib/weapons-spec";
import { compact, fa, sellRefund, TargetTypes } from "./game-ui";
import { useDialog } from "./useDialog";
import TowerModel from "./TowerModel";

type Props = { game: GameState; slot: number; kind: TowerKind; onKindChange: (kind: TowerKind) => void; dispatch: Dispatch<Action>; close: () => void; onResearch: () => void; onBuild: (kind: TowerKind) => void; feedback: () => void; notify: (text: string) => void };
const roles: Record<TowerKind, string> = { cannon: "رگبار سریع · ضد تندرو و پهپاد", heavy: "انفجار منطقه‌ای · ضد دسته‌ها", missile: "دوربرد سنگین · شکار ناو", air: "پدافند و لیزر · هوا و دریا", ew: "کندکننده و سونار · پشتیبانی", boat: "رهگیر دریایی · سد مسیر" };

/** Real behavior of each of the 12 tier-4 branches — written from the
 *  canonical weapons spec (damage / rate / units / mode) and each branch's
 *  defining mechanic in checklist §۱, never a shared generic line
 *  (audit مهم-۴۸: both branch buttons used to show one generic text). */
const BRANCH_INFO: Record<string, string> = {
  "cannon:0": "رگبار فوق‌سریع ۱۴ شلیک در ثانیه؛ پهپادها و اهداف نزدیک را درو می‌کند و موشک‌های ورودی دشمن را هم رهگیری می‌کند.",
  "cannon:1": "شلیک تک‌ضرب الکترومغناطیسی با اصابت آنی و آسیب سنگین ۳۴۰؛ هر ~۱٫۸ ثانیه یک شلیک نافذ علیه سخت‌ترین بدنه‌ها.",
  "heavy:0": "سالووی ۱۲ راکتی پشت سر هم؛ هر راکت ۶۰ آسیب — یک دستهٔ کامل دشمن را هم‌زمان زیر آتش می‌گیرد.",
  "heavy:1": "گلولهٔ گرمافشاری با انفجار عظیم؛ ۴۲۰ آسیب در هر شلیک، با ریتم آهسته و شعاع تخریب بزرگ.",
  "missile:0": "موشک هایپرسونیک با ۱۴۵۰ آسیب و ضربهٔ بحرانی دائمی (×۲)؛ سلاح باس‌کش سیلو با سریع‌ترین زمان پرواز.",
  "missile:1": "پرتاب هم‌زمان چند موشک با قفل روی چند هدف جدا؛ هر شلیک ۳۸۰ آسیب و پرهزینه در مهمات (۱۰ واحد).",
  "air:0": "پدافند دوربرد با برد ۶۵؛ شلیک‌های ۵۲۰ آسیب علیه اهداف هوایی و قفل هم‌زمان روی چند گروه پروازی.",
  "air:1": "پرتو پیوستهٔ حرارتی: ۹۰ آسیب بر ثانیه در شروع تمرکز و تا ۵ برابر با ماندن روی یک هدف؛ بدون مصرف مهمات، با برق سنگین ۸۰ MW.",
  "ew:0": "پالس دوره‌ای هر ۲ ثانیه: ۴۰ آسیب، ۶۰٪ کندی و ۴ ثانیه خاموشی سلاح و رادار دشمن در شعاع اثر — بدون هیچ پرتابه‌ای.",
  "ew:1": "هک پهپادهای دشمن هر ۱۲ ثانیه و چرخاندنشان علیه خودشان؛ آشکارسازی زیردریایی‌ها در سراسر نقشه، نه فقط اطراف برجک.",
  "boat:0": "۵ قایق اژدرانداز؛ هر اژدر ۱۲۰ آسیب و ناوهای سنگین را کامل میخکوب می‌کند تا بقیهٔ خط دفاع کارشان را تمام کنند.",
  "boat:1": "میدان مین خودکار در مسیر دشمن؛ هر مین ۳۰۰ آسیب انفجاری، و زیردریایی غدیر برای شکار زیرسطحی‌ها.",
};

export default function TowerSheet(props: Props) {
  const { game, slot, kind, dispatch, close, notify } = props;
  const ref = useDialog<HTMLElement>(close);
  const [advanced, setAdvanced] = useState(false);
  const [confirmSell, setConfirmSell] = useState(false);
  const tower = game.towers.find(t => t.slot === slot), def = TOWERS[tower?.kind ?? kind];
  const cost = tower ? towerUpgradeCost(tower) : { cash: def.cost, steel: def.steel };
  const affordable = game.cash >= cost.cash && game.steel >= cost.steel;
  const preview = tower ?? { slot, kind, tier: 1, branch: null, priority: "first" as const };
  const stats = getStats(game);
  const spec = weaponSpec(preview.kind, preview.tier, preview.branch);
  const tech = damageTech(game, preview as Tower);
  const perShot = spec.damage * tech * stats.grid;
  const interval = specInterval(spec);
  const dpsNow = towerDps(game, preview);
  const dpsNext = tower && tower.tier < 4 ? towerDps(game, { ...tower, tier: tower.tier + 1 }) : null;
  const dpsGain = dpsNext ? Math.round((dpsNext / Math.max(1, dpsNow) - 1) * 100) : 0;
  const rangeNow = getRange(game, preview);
  const rangeNext = tower && tower.tier < 4 ? getRange(game, { ...tower, tier: tower.tier + 1 }) : null;
  const card = game.cards[preview.kind];
  const refund = tower ? sellRefund(game, tower) : null;
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
          const itemSpec = weaponSpec(item, 1, null);
          const itemPreview = { slot, kind: item, tier: 1, branch: null, priority: "first" as const };
          const itemShot = itemSpec.damage * damageTech(game, itemPreview as Tower) * stats.grid;
          const itemInterval = specInterval(itemSpec);
          return <button key={item} className={`tower-choice ${selected ? "chosen" : ""} ${canAfford ? "" : "unaffordable"}`} onClick={() => props.onKindChange(item)} aria-pressed={selected} aria-label={`انتخاب ${definition.short}`}>
            <span className={`choice-icon tower-color-${item}`}><TowerModel kind={item} tier={1} preview /></span><span className="choice-copy"><strong>{definition.short}</strong><small>{roles[item]}</small><small className="choice-dps">آسیب {fa(itemShot)} · شلیک هر {fa(itemInterval, 2)}ث · برد {fa(getRange(game, itemPreview as Tower), 1)}</small></span>
            <span className="choice-bottom"><TargetTypes targets={definition.targets} /><span>${compact(definition.cost)} + {fa(definition.steel)}⚙</span></span>{selected && <span className="choice-check"><Check size={11} /></span>}
          </button>;
        })}</div> : <div className="selected-tower-card"><span className={`selected-tower-art tower-color-${tower.kind}`}><TowerModel kind={tower.kind} tier={tower.tier} branch={tower.branch} preview /></span><div><span className="tier-label">سطح {fa(tower.tier)} از ۴{tower.tier === 4 ? " · ویژه" : ""}</span><p>{tower.tier === 4 && tower.branch !== null ? BRANCH_INFO[`${tower.kind}:${tower.branch}`] : def.description}</p><TargetTypes targets={def.targets} /></div><div className="level-pips">{[1, 2, 3, 4].map(level => <i className={level <= tower.tier ? "filled" : ""} key={level} />)}</div></div>}
        <div className="tower-specs-grid" aria-label="مشخصات واقعی برجک">
          <div className="spec-cell"><span>آسیب هر شلیک</span><strong>{spec.mode === "beam" ? "پرتو پیوسته" : fa(perShot)}</strong>{spec.mode === "beam" && <small>بدون شلیک مجزا</small>}</div>
          <div className="spec-cell"><span>فاصلهٔ شلیک</span><strong>{spec.mode === "beam" ? "پیوسته" : `هر ${fa(interval, 2)} ث`}</strong>{spec.units > 1 && <small>{fa(spec.units)} واحد شلیک هم‌زمان</small>}</div>
          <div className="spec-cell"><span>آسیب بر ثانیه</span><strong>{fa(dpsNow)}</strong>{dpsNext && <small className="dps-gain">سطح بعد {fa(dpsNext)} (+{fa(dpsGain)}٪)</small>}</div>
          <div className="spec-cell"><span>برد</span><strong>{fa(rangeNow, 1)}</strong>{rangeNext && <small>سطح بعد {fa(rangeNext, 1)}</small>}</div>
          <div className="spec-cell"><span>مهمات هر شلیک</span><strong>{spec.ammoPerShot === 0 ? "مصرف ندارد" : fa(spec.ammoPerShot)}</strong></div>
          <div className="spec-cell"><span>برق مصرفی</span><strong>{fa(towerPowerMw(game, preview as Tower), 1)} MW</strong></div>
          <div className="spec-cell"><span>ضربهٔ بحرانی</span><strong>{fa(spec.critChance * 100)}٪</strong><small>آسیب ×۲</small></div>
          <div className="spec-cell"><span>کارت خانواده</span><strong>سطح {fa(card.level)}</strong><small>{card.level > 1 ? `+${fa((card.level - 1) * 10)}٪ آسیب پایه` : "هنوز اثری ندارد"}</small></div>
        </div>
        {tower?.tier === 3 && game.research.includes("special") && <div className="special-branches"><p><Sparkles size={14} /> مسیر ویژه را انتخاب کنید — هر شاخه سبک نبرد را عوض می‌کند</p>{def.branches.map((branch, index) => { const bSpec = weaponSpec(tower.kind, 4, index); const bInterval = specInterval(bSpec); const bTower = { ...tower, tier: 4, branch: index }; const bShot = bSpec.damage * damageTech(game, bTower) * stats.grid; const bPower = towerPowerMw(game, bTower); return <button key={branch} disabled={!affordable} onClick={() => upgrade(index)}><span><span className="branch-model"><TowerModel kind={tower.kind} tier={4} branch={index} preview /></span><span className="branch-copy"><strong>{branch}</strong><small>{BRANCH_INFO[`${tower.kind}:${index}`]}</small><small className="branch-spec">{bSpec.mode === "beam" ? `پرتو پیوسته · ${fa(bShot)} آسیب/ث` : `آسیب ${fa(bShot)} · شلیک هر ${fa(bInterval, 2)}ث`} · برق {fa(bPower, 1)} MW</small></span></span><span className="branch-cost">${compact(cost.cash)} + {fa(cost.steel)}⚙ <ArrowLeft size={15} /></span></button>; })}</div>}
        {tower && <div className="tower-advanced"><button className="advanced-toggle" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced}>تنظیمات بیشتر <ChevronDown size={14} className={advanced ? "rotated" : ""} /></button>{advanced && <div className="advanced-content"><button className="priority-toggle" onClick={() => dispatch({ type: "priority", slot })}><Crosshair size={15} /><span>هدف‌گیری</span><strong>{PRIORITY_LABELS[tower.priority]}</strong></button><div className="priority-hint">اولین: نزدیک‌ترین به بندر · قوی‌ترین: باس‌کش · هوایی: ضد پهپاد</div>{!confirmSell ? <button className="sell-tower" onClick={() => setConfirmSell(true)}><Trash2 size={14} /> فروش برجک · بازگشت ${compact(refund!.cash)} + {fa(refund!.steel, refund!.steel % 1 ? 1 : 0)} فولاد</button> : <div className="sell-confirm"><span>فقط {fa(refund!.rate * 100)}٪ هزینهٔ ساخت پایه برمی‌گردد (${compact(refund!.cash)} + {fa(refund!.steel, refund!.steel % 1 ? 1 : 0)} فولاد)؛ سرمایهٔ ارتقا و شاخه بازگردانده نمی‌شود. برجک فروخته شود؟</span><button onClick={() => { dispatch({ type: "sell-tower", slot }); close(); notify("برجک فروخته شد و هزینهٔ ساخت پایه بازگشت."); }}>بله، فروش</button><button onClick={() => setConfirmSell(false)}>انصراف</button></div>}</div>}</div>}
      </div>
      {(!tower || tower.tier < 3) && <footer className="tower-sheet-footer"><div className="build-cost"><span><Coins size={14} /> ${compact(cost.cash)}</span><span><Blocks size={14} /> {fa(cost.steel)} فولاد</span>{!affordable && <small>منابع کافی نیست — درآمد جمع کن یا فولاد بساز</small>}</div><button className="primary-action build-confirm" data-autofocus disabled={!affordable} onClick={() => tower ? upgrade() : props.onBuild(kind)}>{tower ? <><ArrowUp size={18} /> ارتقا به سطح {fa(tower.tier + 1)} <Shield size={14} /></> : <><PlusIcon /> ساخت {def.short}</>}<ArrowLeft size={17} /></button></footer>}
      {tower?.tier === 3 && !game.research.includes("special") && <footer className="tower-sheet-footer"><p className="unlock-note">برای ادامهٔ ارتقا، فناوری برجک‌های ویژه را پژوهش کنید.</p><button className="primary-action" onClick={props.onResearch}><LockKeyhole size={16} /> رفتن به پژوهشگاه <ArrowLeft size={16} /></button></footer>}
      {tower?.tier === 4 && <div className="max-tower-note"><Sparkles size={15} /> این برجک به بالاترین سطح رسیده است — کارت‌هایش را برای قدرت دائمی ارتقا بده.</div>}
    </section>
  </div>;
}
function PlusIcon() { return <span className="build-plus">+</span>; }
