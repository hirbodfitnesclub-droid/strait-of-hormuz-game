"use client";

import { useRef, useState, type Dispatch } from "react";
import Image from "next/image";
import { ArrowLeft, Check, ChevronDown, Crosshair, LockKeyhole, Pause, Sparkles, Trash2, X } from "lucide-react";
import { PRIORITY_LABELS, SLOTS, TOWERS, TOWER_KINDS, damageTech, getRange, getStats, towerDps, towerPowerMw, towerUpgradeCost, type Action, type GameState, type Tower, type TowerKind } from "@/lib/game";
import { specInterval, weaponSpec } from "@/lib/weapons-spec";
import { compact, fa, sellRefund, TargetTypes } from "./game-ui";
import { useDialog } from "./useDialog";
import TowerModel, { towerModelUrl } from "./TowerModel";

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
  const catalog = useRef<HTMLDetailsElement>(null);
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

  return <div className="tower-sheet-backdrop workshop-sheet-backdrop" onClick={close}>
    <section className="tower-sheet workshop-sheet" ref={ref} role="dialog" aria-modal="true" aria-labelledby="tower-sheet-title" tabIndex={-1} onClick={e => e.stopPropagation()}>
      <header className="tower-sheet-header workshop-sheet-header">
        <div className="workshop-heading"><Image src="/assets/workshop/instruments/shield.webp" width={38} height={38} alt="" unoptimized /><h2 id="tower-sheet-title">{tower ? "ارتقای برج دفاعی" : "ساخت برج دفاعی"}</h2></div>
        <button className="close-control" onClick={close} aria-label="بستن منوی برجک"><X size={19} /></button>
      </header>
      <div className="tower-sheet-body">
        <div className="tower-workshop-hero">
          <Image className="hero-tower-model" src={towerModelUrl(preview.kind, preview.tier, preview.branch)} alt="" width={150} height={150} unoptimized />
          <div className="tower-hero-copy">
            <small>جایگاه {SLOTS[slot].label}</small>
            <h3>{name}</h3>
            <p>{roles[preview.kind]}</p>
            <span className="tower-tier-stamp">سطح {fa(preview.tier)} <span className="tier-gauge" aria-label={`سطح ${fa(preview.tier)} از ۴`}>{[1, 2, 3, 4].map(level => <i key={level} className={level <= preview.tier ? "filled" : ""} />)}</span></span>
          </div>
        </div>
        {game.phase === "battle" && <small className="sheet-battle-paused"><Pause size={12} /> نبرد موقتاً متوقف است</small>}
        {!tower && <details className="tower-catalog" ref={catalog}>
          <summary>انتخاب و مقایسهٔ برجک‌ها <ChevronDown size={17} /></summary>
          <div className="tower-choice-grid">{TOWER_KINDS.map(item => {
            const definition = TOWERS[item], selected = item === kind;
            const canAfford = game.cash >= definition.cost && game.steel >= definition.steel;
            return <button key={item} className={`tower-choice ${selected ? "chosen" : ""} ${canAfford ? "" : "unaffordable"}`}
              onClick={() => { props.onKindChange(item); if (catalog.current) catalog.current.open = false; }}
              aria-pressed={selected} aria-label={`انتخاب ${definition.short}`}>
              <Image src={towerModelUrl(item, 1)} width={64} height={64} alt="" unoptimized />
              <strong>{definition.short}</strong>
              <span className="choice-price"><i className="workshop-icon wk-cash" aria-label="دلار" /> {compact(definition.cost)} <i className="workshop-icon wk-steel" aria-label="فولاد" /> {fa(definition.steel)}</span>
              {selected && <span className="choice-check"><Check size={11} /></span>}
            </button>;
          })}</div>
        </details>}
        <div className="tower-field-stats" aria-label="مشخصات واقعی برجک">
          <div><Image src="/assets/workshop/instruments/reticle.webp" alt="" width={39} height={39} unoptimized /><span>آسیب هر شلیک</span><strong>{spec.mode === "beam" ? "پرتو پیوسته" : fa(perShot)}</strong></div>
          <div><Image src="/assets/workshop/instruments/radar.webp" alt="" width={39} height={39} unoptimized /><span>برد</span><strong>{fa(rangeNow, 1)}</strong></div>
          <div><Image src="/assets/workshop/instruments/stopwatch.webp" alt="" width={39} height={39} unoptimized /><span>فاصلهٔ شلیک</span><strong>{spec.mode === "beam" ? "پیوسته" : `${fa(interval, 2)} ث`}</strong></div>
        </div>
        <details className="tower-blueprint">
          <summary>مشخصات کامل و مدل سه‌بعدی <ChevronDown size={17} /></summary>
          <div className="blueprint-model"><TowerModel kind={preview.kind} tier={preview.tier} branch={preview.branch} preview /><div><p>{tower?.tier === 4 && tower.branch !== null ? BRANCH_INFO[`${tower.kind}:${tower.branch}`] : def.description}</p><TargetTypes targets={def.targets} /></div></div>
          <dl className="blueprint-stats">
            <div><dt>آسیب بر ثانیه</dt><dd>{fa(dpsNow)}{dpsNext !== null && <small>سطح بعد {fa(dpsNext)} (+{fa(dpsGain)}٪)</small>}</dd></div>
            {rangeNext !== null && <div><dt>برد سطح بعد</dt><dd>{fa(rangeNext, 1)}</dd></div>}
            <div><dt>مهمات هر شلیک</dt><dd>{spec.ammoPerShot === 0 ? "مصرف ندارد" : fa(spec.ammoPerShot)}</dd></div>
            <div><dt>برق مصرفی</dt><dd>{fa(towerPowerMw(game, preview as Tower), 1)} MW</dd></div>
            <div><dt>ضربهٔ بحرانی</dt><dd>{fa(spec.critChance * 100)}٪ <small>آسیب ×۲</small></dd></div>
            <div><dt>واحد شلیک هم‌زمان</dt><dd>{fa(spec.units)}</dd></div>
            <div><dt>کارت خانواده</dt><dd>سطح {fa(card.level)}{card.level > 1 && <small>+{fa((card.level - 1) * 10)}٪ آسیب پایه</small>}</dd></div>
          </dl>
        </details>
        {tower?.tier === 3 && game.research.includes("special") && <div className="special-branches"><p><Sparkles size={14} /> مسیر ویژه را انتخاب کنید — هر شاخه سبک نبرد را عوض می‌کند</p>{def.branches.map((branch, index) => { const bSpec = weaponSpec(tower.kind, 4, index); const bInterval = specInterval(bSpec); const bTower = { ...tower, tier: 4, branch: index }; const bShot = bSpec.damage * damageTech(game, bTower) * stats.grid; const bPower = towerPowerMw(game, bTower); return <button key={branch} disabled={!affordable} onClick={() => upgrade(index)}><span><span className="branch-model"><TowerModel kind={tower.kind} tier={4} branch={index} preview /></span><span className="branch-copy"><strong>{branch}</strong><small>{BRANCH_INFO[`${tower.kind}:${index}`]}</small><small className="branch-spec">{bSpec.mode === "beam" ? `پرتو پیوسته · ${fa(bShot)} آسیب/ث` : `آسیب ${fa(bShot)} · شلیک هر ${fa(bInterval, 2)}ث`} · برق {fa(bPower, 1)} MW</small></span></span><span className="branch-cost">${compact(cost.cash)} + {fa(cost.steel)}⚙ <ArrowLeft size={15} /></span></button>; })}</div>}
        {tower && <div className="tower-advanced"><button className="advanced-toggle" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced}>تنظیمات بیشتر <ChevronDown size={14} className={advanced ? "rotated" : ""} /></button>{advanced && <div className="advanced-content"><button className="priority-toggle" onClick={() => dispatch({ type: "priority", slot })}><Crosshair size={15} /><span>هدف‌گیری</span><strong>{PRIORITY_LABELS[tower.priority]}</strong></button><div className="priority-hint">اولین: نزدیک‌ترین به بندر · قوی‌ترین: باس‌کش · هوایی: ضد پهپاد</div>{!confirmSell ? <button className="sell-tower" onClick={() => setConfirmSell(true)}><Trash2 size={14} /> فروش برجک · بازگشت ${compact(refund!.cash)} + {fa(refund!.steel, refund!.steel % 1 ? 1 : 0)} فولاد</button> : <div className="sell-confirm"><span>{fa(refund!.rate * 100)}٪ کل هزینهٔ ساخت و ارتقا برمی‌گردد (${compact(refund!.cash)} + {fa(refund!.steel, refund!.steel % 1 ? 1 : 0)} فولاد)؛ فولاد تا ظرفیت انبار اضافه می‌شود. برجک فروخته شود؟</span><button onClick={() => { dispatch({ type: "sell-tower", slot }); close(); notify("برجک فروخته شد و سهم هزینهٔ ساخت و ارتقا بازگشت."); }}>بله، فروش</button><button onClick={() => setConfirmSell(false)}>انصراف</button></div>}</div>}</div>}
      </div>
      {(!tower || tower.tier < 3) && <footer className="tower-sheet-footer">
        <div className="build-cost"><b>{tower ? `هزینهٔ سطح ${fa(tower.tier + 1)}` : "هزینهٔ ساخت"}</b><span className={game.cash < cost.cash ? "missing-cost" : ""}><i className="workshop-icon wk-cash" aria-hidden="true" /> {compact(cost.cash)} دلار</span><span className={game.steel < cost.steel ? "missing-cost" : ""}><i className="workshop-icon wk-steel" aria-hidden="true" /> {fa(cost.steel)} فولاد</span>{!affordable && <small>منابع کافی نیست</small>}</div>
        <div className="workshop-sheet-actions"><button className="primary-action build-confirm" disabled={!affordable} onClick={() => tower ? upgrade() : props.onBuild(kind)}><Image src="/assets/workshop/instruments/upgrade.webp" width={31} height={31} alt="" unoptimized /> {tower ? `ارتقا به سطح ${fa(tower.tier + 1)}` : "ساخت برجک"}</button><button className="workshop-cancel" onClick={close}>انصراف</button></div>
      </footer>}
      {tower?.tier === 3 && !game.research.includes("special") && <footer className="tower-sheet-footer"><p className="unlock-note">برای ادامهٔ ارتقا، فناوری برجک‌های ویژه را پژوهش کنید.</p><button className="primary-action" onClick={props.onResearch}><LockKeyhole size={16} /> رفتن به پژوهشگاه <ArrowLeft size={16} /></button></footer>}
      {tower?.tier === 4 && <div className="max-tower-note"><Sparkles size={15} /> این برجک به بالاترین سطح رسیده است — کارت‌هایش را برای قدرت دائمی ارتقا بده.</div>}
    </section>
  </div>;
}
