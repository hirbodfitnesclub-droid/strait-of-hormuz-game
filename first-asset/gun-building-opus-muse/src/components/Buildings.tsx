import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Factory, X, Search, Camera, Download, ChevronLeft, Users, BatteryCharging,
  TrendingUp, Link2, Building2, Sparkles, DollarSign, Gauge,
} from "lucide-react";
import { BUILDINGS, CATEGORY_META, outAt, costAt, fmtBig, type BuildingSpec, type BuildingCategory } from "../data/buildings";
import { viewerBus } from "../three/battle";
import TowerViewer from "./TowerViewer";

function BuildingCard({ b, onOpen, index }: { b: BuildingSpec; onOpen: () => void; index: number }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.45, delay: (index % 6) * 0.06 }}
      onClick={onOpen}
      className="panel group relative overflow-hidden rounded-2xl p-5 text-right transition-all duration-300 hover:-translate-y-1.5 hover:border-cyan-400/50 hover:shadow-[0_20px_60px_-15px_rgba(56,189,248,0.35)]"
    >
      <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full opacity-20 blur-3xl transition-opacity group-hover:opacity-40" style={{ background: b.glowColor }} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/10 text-2xl shadow-lg" style={{ background: `linear-gradient(140deg, ${b.baseColor}, #0d1528)`, boxShadow: `0 8px 24px -8px ${b.glowColor}` }}>
          {CATEGORY_META[b.category].icon}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-bold text-cyan-300">
            {CATEGORY_META[b.category].fa}
          </span>
          <span className="text-[10px] text-slate-400">۵ نقطه عطف بصری • تا سطح ۱۰۰</span>
        </div>
      </div>
      <h3 className="relative mt-4 text-lg font-extrabold leading-snug text-white">{b.name}</h3>
      <p className="relative mt-0.5 font-mono text-[10px] tracking-wider text-slate-500" dir="ltr">{b.nameEn}</p>
      <p className="relative mt-2 line-clamp-2 min-h-10 text-xs leading-6 text-slate-300">{b.tagline}</p>

      {/* مینی نوار تکامل */}
      <div className="relative mt-3 flex items-end gap-1" dir="ltr">
        {b.tiers.map((t) => (
          <div key={t.tier} className="flex-1 rounded-t" style={{ height: 6 + t.tier * 5, background: `linear-gradient(180deg, ${b.glowColor}, ${b.baseColor})`, opacity: 0.45 + t.tier * 0.11 }} title={t.label} />
        ))}
      </div>
      <div className="relative mt-1 flex justify-between text-[9px] text-slate-500" dir="ltr"><span>T1</span><span>T5 • LVL 100</span></div>

      <div className="relative mt-3 grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-center">
        <div>
          <div className="tick-label text-sm font-extrabold" style={{ color: b.accentColor }}>{fmtBig(outAt(b, 100))}</div>
          <div className="text-[10px] text-slate-500">{b.outputLabel} (۱۰۰)</div>
        </div>
        <div>
          <div className="tick-label text-sm font-extrabold text-white">${fmtBig(b.baseCost)}</div>
          <div className="text-[10px] text-slate-500">هزینه ساخت</div>
        </div>
        <div>
          <div className="tick-label text-sm font-extrabold text-white">{b.powerMW < 0 ? `+${-b.powerMW}` : b.powerMW}MW</div>
          <div className="text-[10px] text-slate-500">{b.powerMW < 0 ? "تولید برق" : "مصرف برق"}</div>
        </div>
      </div>
      <div className="relative mt-3 flex items-center justify-center gap-1 text-xs font-bold text-cyan-300 opacity-0 transition-opacity group-hover:opacity-100">
        مشاهده مدل سه‌بعدی و ۵ سطح تکامل <ChevronLeft className="h-4 w-4" />
      </div>
    </motion.button>
  );
}

function BuildingModal({ b, onClose }: { b: BuildingSpec; onClose: () => void }) {
  const [tierIdx, setTierIdx] = useState(2);
  const tier = b.tiers[tierIdx];
  const modalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    viewerBus.set(true);
    return () => viewerBus.set(false);
  }, []);

  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(b, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `building-${b.id}-spec.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const downloadShot = () => {
    const canvas = modalRef.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `building-${b.id}-T${tier.tier}.png`;
    a.click();
  };

  const maxOut = outAt(b, 100);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <motion.div ref={modalRef} initial={{ scale: 0.94, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
        onClick={(e) => e.stopPropagation()}
        className="panel corner-brackets relative flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl lg:flex-row">
        <button onClick={onClose} className="absolute left-3 top-3 z-10 rounded-full border border-white/15 bg-black/60 p-2 text-slate-300 backdrop-blur transition hover:bg-red-500/30 hover:text-white">
          <X className="h-5 w-5" />
        </button>

        <div className="relative h-[340px] shrink-0 sm:h-[420px] lg:h-auto lg:min-h-[600px] lg:w-[52%]">
          <TowerViewer
            modelKind="autocannon" scene="building" buildingKind={b.kind}
            tier={tier.tier} baseColor={b.baseColor} accentColor={b.accentColor} glowColor={b.glowColor}
            glowIntensity={tier.glowIntensity} scaleBoost={tier.scaleBoost}
          />
          <div className="absolute right-3 top-14 flex flex-col items-stretch gap-1.5 rounded-xl border border-white/15 bg-black/70 p-1.5 backdrop-blur lg:top-3" dir="rtl">
            {b.tiers.map((t, i) => (
              <button key={t.tier} onClick={() => setTierIdx(i)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${i === tierIdx ? "bg-cyan-400 text-black shadow-lg" : "bg-white/10 text-slate-300 hover:bg-white/20"}`}>
                Tier {t.tier}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-7" style={{ maxHeight: "94vh" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 text-2xl" style={{ background: `linear-gradient(140deg, ${b.baseColor}, #0d1528)` }}>
              {CATEGORY_META[b.category].icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold text-white sm:text-2xl">{b.name}</h2>
                <Sparkles className="h-5 w-5 text-cyan-300" />
              </div>
              <p className="font-mono text-[11px] tracking-wider text-slate-500" dir="ltr">{b.nameEn} • {CATEGORY_META[b.category].fa}</p>
            </div>
          </div>

          <p className="mt-3 text-[13px] leading-7 text-slate-300">{b.description}</p>

          <div className="mt-3 flex items-start gap-2 rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] leading-6 text-slate-300">
            <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" /> زنجیره تامین: {b.chain}
          </div>

          {/* سطح فعلی */}
          <div className="mt-4 rounded-xl border border-white/10 bg-gradient-to-l from-white/5 to-transparent p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-extrabold" style={{ color: b.accentColor }}>{tier.label}</span>
              <span className="tick-label rounded bg-black/40 px-2 py-0.5 font-mono text-[10px] text-slate-400">{tier.range} • نمونه: سطح {tier.repLevel} • {tier.polyBudget}</span>
            </div>
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[11px]">
                <span className="flex items-center gap-1 font-bold text-slate-300"><TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> {b.outputLabel} در سطح {tier.repLevel}</span>
                <span className="tick-label font-extrabold text-emerald-300">{fmtBig(outAt(b, tier.repLevel))} <span className="text-[9px] text-slate-500">{b.outputUnit}</span></span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-black/50">
                <motion.div key={tier.tier} initial={{ width: 0 }} animate={{ width: `${Math.max(3, (outAt(b, tier.repLevel) / maxOut) * 100)}%` }} transition={{ duration: 0.7 }}
                  className="h-full rounded-full bg-gradient-to-l from-emerald-500 via-teal-400 to-cyan-300" />
              </div>
              <div className="mt-1 text-[10px] text-slate-500">فرمول PRD: Output(L) = پایه × L × 2^⌊L/10⌋ — هر ۱۰ سطح، تولید دو برابر می‌شود ⚡</div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
              {[
                { icon: <DollarSign className="h-3.5 w-3.5" />, k: "هزینه این سطح", v: `$${fmtBig(costAt(b, tier.repLevel))}` },
                { icon: <BatteryCharging className="h-3.5 w-3.5" />, k: b.powerMW < 0 ? "تولید برق" : "مصرف برق", v: b.powerMW < 0 ? `+${-b.powerMW}MW` : `${b.powerMW}MW` },
                { icon: <Users className="h-3.5 w-3.5" />, k: "نیروی کار", v: `${b.workers} نفر` },
                { icon: <Gauge className="h-3.5 w-3.5" />, k: "مقیاس مدل", v: `×${tier.scaleBoost.toFixed(2)}` },
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5">
                  <span className="text-slate-500">{s.icon}</span>
                  <span className="text-slate-500">{s.k}:</span>
                  <span className="tick-label mr-auto font-bold text-white">{s.v}</span>
                </div>
              ))}
            </div>
            {/* جدول رشد */}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-center text-[10px]">
                <thead><tr className="text-slate-500">{b.tiers.map((t) => <th key={t.tier} className="px-1 py-1">سطح {t.repLevel}</th>)}</tr></thead>
                <tbody>
                  <tr className="tick-label text-emerald-300">{b.tiers.map((t) => <td key={t.tier} className="px-1 py-1 font-bold">{fmtBig(outAt(b, t.repLevel))}</td>)}</tr>
                  <tr className="tick-label text-slate-400">{b.tiers.map((t) => <td key={t.tier} className="px-1 py-1">${fmtBig(costAt(b, t.repLevel))}</td>)}</tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* تغییرات بصری */}
          <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="mb-2 text-xs font-extrabold text-cyan-300">🎨 تکامل بصری این نقطه عطف (Visual Morphing)</div>
            <ul className="space-y-1.5">
              {tier.visualChanges.map((v, i) => (
                <li key={i} className="flex items-start gap-2 text-xs leading-6 text-slate-300">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: b.glowColor }} /> {v}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={downloadShot} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-extrabold text-black transition hover:bg-cyan-300">
              <Camera className="h-4 w-4" /> دانلود رندر PNG
            </button>
            <button onClick={downloadJSON} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-2.5 text-sm font-extrabold text-cyan-300 transition hover:bg-cyan-400/20">
              <Download className="h-4 w-4" /> دانلود مشخصات JSON
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
            <Building2 className="h-3.5 w-3.5" /> هزینه ارتقا: Cost(L) = {fmtBig(b.baseCost)} × 1.15^(L−1) • ضرایب M_Grid و M_Stability روی خروجی نهایی اعمال می‌شوند.
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Buildings() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<"all" | BuildingCategory>("all");
  const [selected, setSelected] = useState<BuildingSpec | null>(null);

  const filtered = useMemo(() => BUILDINGS.filter((b) => {
    if (query && !`${b.name} ${b.nameEn} ${b.tagline}`.includes(query)) return false;
    if (cat !== "all" && b.category !== cat) return false;
    return true;
  }), [query, cat]);

  return (
    <section id="buildings" className="relative border-t border-white/10 bg-black/20 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1.5 text-xs font-bold text-cyan-300">
            <Factory className="h-4 w-4" /> پکیج کامل ساختمان‌ها • ۱۵ سازه • ۵ نقطه عطف بصری تا سطح ۱۰۰
          </div>
          <h2 className="text-3xl font-black text-white sm:text-4xl">کاتالوگ <span className="gold-text">ساختمان‌های کشور</span></h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-400">
            از سکوی نفتی تا ابرشهر ساحلی و مرکز فرماندهی کیش — هر ساختمان با مدل سه‌بعدی زنده (مشعل روشن، جرثقیل در حال بارگیری، شهر با خودروهای متحرک)
            و تکامل بصری کامل در ۵ نقطه عطف PRD. روی هر کارت کلیک کنید.
          </p>
        </div>

        <div className="panel mb-6 rounded-2xl p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجو: پالایشگاه، نیروگاه، شهر، گمرک..."
                className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-4 pr-10 text-sm text-white placeholder:text-slate-600 focus:border-cyan-400/60 focus:outline-none" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setCat("all")} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${cat === "all" ? "bg-cyan-400 text-black" : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}>🏗️ همه (۱۵)</button>
              {(Object.keys(CATEGORY_META) as BuildingCategory[]).map((c) => (
                <button key={c} onClick={() => setCat(c)} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${cat === c ? "bg-cyan-400 text-black" : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}>
                  {CATEGORY_META[c].icon} {CATEGORY_META[c].fa}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="panel rounded-2xl p-12 text-center text-slate-400">ساختمانی با این فیلتر پیدا نشد.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((b, i) => <BuildingCard key={b.id} b={b} index={i} onOpen={() => setSelected(b)} />)}
          </div>
        )}
      </div>
      <AnimatePresence>
        {selected && <BuildingModal b={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </section>
  );
}
