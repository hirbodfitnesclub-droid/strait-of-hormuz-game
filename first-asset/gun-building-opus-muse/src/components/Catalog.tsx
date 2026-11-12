import { useEffect, useMemo, useRef, useState } from "react";
import { viewerBus } from "../three/battle";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crosshair, Bomb, Rocket, Radar, Radio, Ship, X, Search, Zap, Flame,
  DollarSign, Boxes, BatteryCharging, Package, Download, Camera, ChevronLeft,
  Shield, Swords, Link2, Lock, Sparkles, Gauge, Ruler, Star,
} from "lucide-react";
import { TOWERS, TARGET_META, formatNum, type TowerSpec, type TargetType } from "../data/towers";
import TowerViewer from "./TowerViewer";

const FAMILY_ICONS = [Crosshair, Bomb, Rocket, Radar, Radio, Ship];
const MAX_DPS = 900;

/* ---------- کارت برج ---------- */
function TowerCard({ tower, onOpen, index }: { tower: TowerSpec; onOpen: () => void; index: number }) {
  const Icon = FAMILY_ICONS[tower.family - 1];
  const topTier = tower.tiers[tower.tiers.length - 1];
  return (
    <motion.button
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: (index % 6) * 0.06 }}
      onClick={onOpen}
      className="panel group relative overflow-hidden rounded-2xl p-5 text-right transition-all duration-300 hover:-translate-y-1.5 hover:border-amber-400/50 hover:shadow-[0_20px_60px_-15px_rgba(245,185,66,0.35)]"
    >
      <div
        className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full opacity-20 blur-3xl transition-opacity group-hover:opacity-40"
        style={{ background: tower.glowColor }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/10 shadow-lg"
          style={{ background: `linear-gradient(140deg, ${tower.baseColor}, #0d1528)`, boxShadow: `0 8px 24px -8px ${tower.glowColor}` }}
        >
          <Icon className="h-7 w-7" style={{ color: tower.accentColor }} />
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {tower.isSpecial ? (
            <span className="flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold text-amber-300">
              <Star className="h-3 w-3" /> ویژه سطح ۴ • {tower.branch === "A" ? "الف" : "ب"}
            </span>
          ) : (
            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-bold text-cyan-300">
              پایه • سطح ۱ تا ۳
            </span>
          )}
          <span className="text-[10px] text-slate-400">خانواده {tower.family} • {tower.familyName}</span>
        </div>
      </div>

      <h3 className="relative mt-4 text-lg font-800 font-extrabold leading-snug text-white">{tower.name}</h3>
      <p className="relative mt-0.5 font-mono text-[10px] tracking-wider text-slate-500" dir="ltr">{tower.nameEn}</p>
      <p className="relative mt-2 line-clamp-2 min-h-10 text-xs leading-6 text-slate-300">{tower.tagline}</p>

      <div className="relative mt-3 flex items-center gap-1.5">
        {tower.targets.map((t) => (
          <span key={t} className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-200">
            <span>{TARGET_META[t].emoji}</span> {TARGET_META[t].fa}
          </span>
        ))}
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-center">
        <div>
          <div className="tick-label text-sm font-extrabold" style={{ color: tower.accentColor }}>{formatNum(topTier.dps)}</div>
          <div className="text-[10px] text-slate-500">DPS نهایی</div>
        </div>
        <div>
          <div className="tick-label text-sm font-extrabold text-white">{formatNum(topTier.range)}</div>
          <div className="text-[10px] text-slate-500">برد</div>
        </div>
        <div>
          <div className="tick-label text-sm font-extrabold text-white">${formatNum(topTier.costDollar)}</div>
          <div className="text-[10px] text-slate-500">هزینه</div>
        </div>
      </div>

      <div className="relative mt-3 flex items-center justify-center gap-1 text-xs font-bold text-amber-300 opacity-0 transition-opacity group-hover:opacity-100">
        مشاهده مدل سه‌بعدی و ارتقاها <ChevronLeft className="h-4 w-4" />
      </div>
    </motion.button>
  );
}

/* ---------- مودال جزئیات ---------- */
function TowerDetailModal({ tower, onClose, onSwitch }: { tower: TowerSpec; onClose: () => void; onSwitch: (t: TowerSpec) => void }) {
  const siblings = useMemo(() => TOWERS.filter((t) => t.family === tower.family), [tower.family]);
  const [tierIdx, setTierIdx] = useState(tower.tiers.length - 1);
  const tier = tower.tiers[tierIdx];
  const modalRef = useRef<HTMLDivElement>(null);
  const Icon = FAMILY_ICONS[tower.family - 1];
  useEffect(() => {
    viewerBus.set(true);
    return () => viewerBus.set(false);
  }, []);

  const switchTower = (t: TowerSpec) => {
    onSwitch(t);
    setTierIdx(t.tiers.length - 1);
  };

  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(tower, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tower-${tower.id}-spec.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadShot = () => {
    const canvas = modalRef.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `tower-${tower.id}-T${tier.level}.png`;
    a.click();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <motion.div
        ref={modalRef}
        initial={{ scale: 0.94, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
        onClick={(e) => e.stopPropagation()}
        className="panel corner-brackets relative flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl lg:flex-row"
        style={{ maxHeight: "94vh" }}
      >
        <button onClick={onClose} className="absolute left-3 top-3 z-10 rounded-full border border-white/15 bg-black/60 p-2 text-slate-300 backdrop-blur transition hover:bg-red-500/30 hover:text-white">
          <X className="h-5 w-5" />
        </button>

        {/* ویوور سه‌بعدی */}
        <div className="relative h-[340px] shrink-0 sm:h-[420px] lg:h-auto lg:min-h-[600px] lg:w-[52%]">
          <TowerViewer
            modelKind={tower.modelKind}
            tier={tier.level}
            baseColor={tower.baseColor}
            accentColor={tower.accentColor}
            glowColor={tower.glowColor}
            glowIntensity={tier.glowIntensity}
            scaleBoost={tier.scaleBoost}
          />
          {/* انتخاب سطح */}
          <div className="absolute right-3 top-14 flex flex-col items-stretch gap-1.5 rounded-xl border border-white/15 bg-black/70 p-1.5 backdrop-blur lg:top-3" dir="rtl">
            {tower.tiers.map((t, i) => (
              <button
                key={t.level}
                onClick={() => setTierIdx(i)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${i === tierIdx ? "bg-amber-400 text-black shadow-lg" : "bg-white/10 text-slate-300 hover:bg-white/20"}`}
              >
                سطح {t.level}
              </button>
            ))}
          </div>
        </div>

        {/* اطلاعات */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7" style={{ maxHeight: "94vh" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10" style={{ background: `linear-gradient(140deg, ${tower.baseColor}, #0d1528)` }}>
              <Icon className="h-6 w-6" style={{ color: tower.accentColor }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold text-white sm:text-2xl">{tower.name}</h2>
                {tower.isSpecial && <Sparkles className="h-5 w-5 text-amber-300" />}
              </div>
              <p className="font-mono text-[11px] tracking-wider text-slate-500" dir="ltr">{tower.nameEn} • F{tower.family}{tower.branch ? `-${tower.branch}` : ""}</p>
            </div>
          </div>

          {tower.branchTitle && (
            <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-300">{tower.branchTitle}</div>
          )}

          <p className="mt-3 text-[13px] leading-7 text-slate-300">{tower.description}</p>

          {/* درخت خانواده */}
          <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="mb-2 text-[11px] font-bold text-slate-400">🌳 درخت تکامل خانواده {tower.family}</div>
            <div className="flex flex-wrap items-center gap-2">
              {siblings.map((s) => (
                <button
                  key={s.id}
                  onClick={() => switchTower(s)}
                  className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold transition ${s.id === tower.id ? "border-amber-400 bg-amber-400/15 text-amber-300" : "border-white/10 bg-white/5 text-slate-400 hover:border-white/30 hover:text-white"}`}
                >
                  {s.isSpecial ? `★ ${s.branch === "A" ? "الف" : "ب"}: ${s.name}` : `⬢ پایه: ${s.name}`}
                </button>
              ))}
            </div>
          </div>

          {/* تارگت‌ها و نقش */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white">🎯 {tower.role}</span>
            {tower.targets.map((t: TargetType) => (
              <span key={t} className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200">
                {TARGET_META[t].emoji} {TARGET_META[t].fa}
              </span>
            ))}
          </div>

          {/* سطح فعلی */}
          <div className="mt-4 rounded-xl border border-white/10 bg-gradient-to-l from-white/5 to-transparent p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-extrabold" style={{ color: tower.accentColor }}>{tier.label}</span>
              <span className="tick-label rounded bg-black/40 px-2 py-0.5 font-mono text-[10px] text-slate-400">{tier.polyBudget}</span>
            </div>
            {/* نوار DPS */}
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[11px]">
                <span className="flex items-center gap-1 font-bold text-slate-300"><Flame className="h-3.5 w-3.5 text-orange-400" /> قدرت تخریب (DPS)</span>
                <span className="tick-label font-extrabold text-orange-300">{formatNum(tier.dps)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-black/50">
                <motion.div
                  initial={{ width: 0 }} animate={{ width: `${Math.min(100, (tier.dps / MAX_DPS) * 100)}%` }}
                  transition={{ duration: 0.7 }}
                  className="h-full rounded-full bg-gradient-to-l from-red-500 via-orange-400 to-amber-300"
                />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
              {[
                { icon: <Swords className="h-3.5 w-3.5" />, k: "آسیب", v: formatNum(tier.damage) },
                { icon: <Gauge className="h-3.5 w-3.5" />, k: "نرخ شلیک", v: `${tier.fireRate}/s` },
                { icon: <Ruler className="h-3.5 w-3.5" />, k: "برد", v: formatNum(tier.range) },
                { icon: <DollarSign className="h-3.5 w-3.5" />, k: "دلار", v: `$${formatNum(tier.costDollar)}` },
                { icon: <Boxes className="h-3.5 w-3.5" />, k: "فولاد", v: formatNum(tier.costSteel) },
                { icon: <BatteryCharging className="h-3.5 w-3.5" />, k: "برق", v: `${tier.powerMW}MW` },
                { icon: <Package className="h-3.5 w-3.5" />, k: "مهمات/شلیک", v: formatNum(tier.ammoPerShot) },
                { icon: <Zap className="h-3.5 w-3.5" />, k: "درخشش", v: `${Math.round(tier.glowIntensity * 100)}%` },
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5">
                  <span className="text-slate-500">{s.icon}</span>
                  <span className="text-slate-500">{s.k}:</span>
                  <span className="tick-label mr-auto font-bold text-white">{s.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* تغییرات بصری */}
          <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="mb-2 text-xs font-extrabold text-cyan-300">🎨 تغییرات بصری این سطح (Visual Morphing)</div>
            <ul className="space-y-1.5">
              {tier.visualChanges.map((v, i) => (
                <li key={i} className="flex items-start gap-2 text-xs leading-6 text-slate-300">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tower.glowColor }} />
                  {v}
                </li>
              ))}
            </ul>
            <div className="mt-2 border-t border-white/10 pt-2 text-[11px] text-slate-400">🛡️ {tier.armorNote}</div>
          </div>

          {/* توانایی و سینرژی */}
          {tower.ability && (
            <div className="mt-3 rounded-xl border border-purple-400/25 bg-purple-500/10 p-3 text-xs leading-6">
              <span className="font-extrabold text-purple-300">⚡ قابلیت ویژه «{tower.ability}»: </span>
              <span className="text-slate-300">{tower.abilityDesc}</span>
            </div>
          )}
          <div className="mt-2 grid gap-2 text-[11px] leading-6 sm:grid-cols-2">
            <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-3"><span className="font-extrabold text-red-300">☠️ ضد: </span><span className="text-slate-300">{tower.counters}</span></div>
            <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3"><span className="font-extrabold text-emerald-300">🔗 سینرژی: </span><span className="text-slate-300">{tower.synergy}</span></div>
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] text-slate-400">
            <Lock className="h-4 w-4 shrink-0 text-amber-400" /> شرط بازگشایی: {tower.unlockReq}
          </div>

          {/* دکمه‌ها */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={downloadShot} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-extrabold text-black transition hover:bg-amber-300">
              <Camera className="h-4 w-4" /> دانلود رندر PNG
            </button>
            <button onClick={downloadJSON} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-2.5 text-sm font-extrabold text-cyan-300 transition hover:bg-cyan-400/20">
              <Download className="h-4 w-4" /> دانلود مشخصات JSON
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
            <Shield className="h-3.5 w-3.5" /> اولویت هدف پیش‌فرض: {tower.priority} • فرمول DPS: BaseDamage × 1.8^(Tier-1) × FireRate
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ---------- سکشن کاتالوگ ---------- */
export default function Catalog() {
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<"all" | TargetType>("all");
  const [kind, setKind] = useState<"all" | "basic" | "special">("all");
  const [family, setFamily] = useState<number>(0);
  const [selected, setSelected] = useState<TowerSpec | null>(null);

  const filtered = useMemo(() => {
    return TOWERS.filter((t) => {
      if (query && !`${t.name} ${t.nameEn} ${t.tagline}`.includes(query)) return false;
      if (target !== "all" && !t.targets.includes(target)) return false;
      if (kind === "basic" && t.isSpecial) return false;
      if (kind === "special" && !t.isSpecial) return false;
      if (family !== 0 && t.family !== family) return false;
      return true;
    });
  }, [query, target, kind, family]);

  return (
    <section id="catalog" className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <div className="mb-8 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs font-bold text-amber-300">
          <Crosshair className="h-4 w-4" /> پکیج کامل مدل‌سازی • ۱۸ برج • ۴ سطح تکامل
        </div>
        <h2 className="text-3xl font-black text-white sm:text-4xl">کاتالوگ <span className="gold-text">برج‌های دفاعی</span></h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-400">
          هر کارت را لمس کنید تا مدل سه‌بعدی تعاملی، هر سطح ارتقا، آمار دقیق نبرد و راهنمای تغییرات بصری را ببینید.
          هر سطح واقعاً خفن‌تر می‌شود: لوله بیشتر، زره سنگین‌تر، رادار بزرگ‌تر و درخشش نئونی قوی‌تر.
        </p>
      </div>

      {/* فیلترها */}
      <div className="panel mb-6 rounded-2xl p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جستجو: لیزر، فالانکس، فتاح، مین‌ریز..."
              className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-4 pr-10 text-sm text-white placeholder:text-slate-600 focus:border-amber-400/60 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "sea", "air", "sub"] as const).map((t) => (
              <button key={t} onClick={() => setTarget(t)}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition ${target === t ? "bg-cyan-400 text-black" : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}>
                {t === "all" ? "🎯 همه اهداف" : `${TARGET_META[t].emoji} ${TARGET_META[t].fa}`}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
          {(["all", "basic", "special"] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${kind === k ? "bg-amber-400 text-black" : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}>
              {k === "all" ? "همه (۱۸)" : k === "basic" ? "⬢ پایه (۶)" : "★ ویژه (۱۲)"}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-white/10" />
          {[0, 1, 2, 3, 4, 5, 6].map((f) => (
            <button key={f} onClick={() => setFamily(f)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${family === f ? "bg-purple-400 text-black" : "border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"}`}>
              {f === 0 ? "خانواده‌ها" : `F${f}`}
            </button>
          ))}
          <span className="mr-auto text-xs text-slate-500">{filtered.length} مدل یافت شد • <Link2 className="inline h-3 w-3" /> روی کارت کلیک کنید</span>
        </div>
      </div>

      {/* گرید */}
      {filtered.length === 0 ? (
        <div className="panel rounded-2xl p-12 text-center text-slate-400">مدلی با این فیلتر پیدا نشد. فیلترها را تغییر دهید.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t, i) => <TowerCard key={t.id} tower={t} index={i} onOpen={() => setSelected(t)} />)}
        </div>
      )}

      <AnimatePresence>
        {selected && <TowerDetailModal tower={selected} onClose={() => setSelected(null)} onSwitch={setSelected} />}
      </AnimatePresence>
    </section>
  );
}
