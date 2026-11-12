import { useState } from "react";
import { motion } from "framer-motion";
import {
  Anchor, Crosshair, Rocket, Cpu, Globe, Package, ChevronDown,
  Zap, Heart, Waves, DollarSign, Flame, Star, ArrowLeft, Menu, X,
  Shield, Swords, Radar, Factory,
} from "lucide-react";
import Catalog from "./components/Catalog";
import Buildings from "./components/Buildings";
import TowerViewer from "./components/TowerViewer";
import { WeaponsSection, PipelineSection, SourcesSection, PackageSection } from "./components/Sections";
import { FAMILIES, TOWERS } from "./data/towers";

const HERO_FEATURED = ["railgun", "laser", "hypersonic", "emp"];
const HERO_LABELS: Record<string, string> = {
  railgun: "توپ ریلی الکترومغناطیسی",
  laser: "برجک لیزر حرارتی",
  hypersonic: "سیلوی فتاح هایپرسونیک",
  emp: "دکل پالس EMP",
};

/* ---------- نوار هاد بالای صفحه (شبیه‌سازی UI بازی) ---------- */
function HudBar() {
  const items = [
    { icon: <DollarSign className="h-3.5 w-3.5 text-emerald-300" />, v: "14.5M", k: "دلار نفتی" },
    { icon: <span className="text-xs">🛢️</span>, v: "4.2K", k: "نفت" },
    { icon: <span className="text-xs">🚀</span>, v: "3.2K", k: "مهمات" },
    { icon: <Zap className="h-3.5 w-3.5 text-amber-300" />, v: "+45MW", k: "برق" },
    { icon: <Heart className="h-3.5 w-3.5 text-red-400" />, v: "20/20", k: "سلامت تنگه" },
    { icon: <Waves className="h-3.5 w-3.5 text-cyan-300" />, v: "14/25", k: "موج" },
  ];
  return (
    <div className="border-b border-white/10 bg-[#04070f]/95">
      <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 py-1.5 sm:px-6">
        <span className="blink-red flex shrink-0 items-center gap-1 rounded bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-300">● LIVE TD</span>
        {items.map((it, i) => (
          <div key={i} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1">
            {it.icon}
            <span className="tick-label text-[11px] font-extrabold text-white">{it.v}</span>
            <span className="text-[10px] text-slate-500">{it.k}</span>
          </div>
        ))}
        <div className="mr-auto hidden shrink-0 items-center gap-1 text-[10px] text-slate-500 md:flex">
          <Radar className="h-3.5 w-3.5 radar-sweep text-emerald-400" /> اتاق جنگ • کمپین ۲۵ عملیاتی
        </div>
      </div>
    </div>
  );
}

/* ---------- نوبار ---------- */
function Navbar() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: "#catalog", label: "کاتالوگ برج‌ها", icon: <Crosshair className="h-4 w-4" /> },
    { href: "#buildings", label: "ساختمان‌های کشور", icon: <Factory className="h-4 w-4" /> },
    { href: "#weapons", label: "سلاح‌ها", icon: <Rocket className="h-4 w-4" /> },
    { href: "#pipeline", label: "پایپ‌لاین", icon: <Cpu className="h-4 w-4" /> },
    { href: "#sources", label: "منابع رایگان", icon: <Globe className="h-4 w-4" /> },
    { href: "#package", label: "دانلود پکیج", icon: <Package className="h-4 w-4" /> },
  ];
  return (
    <nav className="sticky top-0 z-40 border-b border-white/10 bg-[#050a16]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 shadow-lg shadow-amber-500/30">
            <Anchor className="h-5 w-5 text-black" />
          </span>
          <span>
            <span className="block text-sm font-black text-white">تنگه هرمز</span>
            <span className="block text-[10px] text-amber-300">آزمایشگاه مدل‌سازی برج و سلاح</span>
          </span>
        </a>
        <div className="mr-auto hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-bold text-slate-300 transition hover:bg-white/10 hover:text-white">
              {l.icon} {l.label}
            </a>
          ))}
          <a href="#package" className="mr-2 rounded-xl bg-amber-400 px-4 py-2 text-[13px] font-extrabold text-black transition hover:bg-amber-300">📦 دریافت پکیج</a>
        </div>
        <button onClick={() => setOpen(!open)} className="mr-auto rounded-lg border border-white/15 p-2 text-slate-300 lg:hidden">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-white/10 bg-[#050a16] px-4 py-3 lg:hidden">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold text-slate-200 hover:bg-white/10">
              {l.icon} {l.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}

/* ---------- هیرو ---------- */
function Hero() {
  const [feat, setFeat] = useState("railgun");
  const tower = TOWERS.find((t) => t.id === feat)!;
  const tier = tower.tiers[tower.tiers.length - 1];

  return (
    <header id="top" className="sonar-bg hud-grid-bg relative overflow-hidden">
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-16">
        <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs font-bold text-amber-300">
            <Shield className="h-4 w-4" /> Master GDD • اسپرینت ۲ و ۳ • تحویل مدل‌سازی
          </div>
          <h1 className="text-4xl font-black leading-[1.25] text-white sm:text-5xl">
            پکیج کامل مدل‌سازی
            <br />
            <span className="gold-text">۱۸ برج، ۱۲ سلاح، ۱۵ ساختمان</span>
            <br />
            تنگه هرمز ⚓
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-8 text-slate-300">
            هر ۶ خانواده برجک با ۳ سطح ارتقا + ۱۲ انشعاب ویژه + هر ۱۵ ساختمان کشور (اقتصادی، شهری، انرژی و بندری) با ۵ نقطه عطف بصری تا سطح ۱۰۰ —
            همه با مدل سه‌بعدی تعاملی و زنده، آمار دقیق طبق فرمول‌های PRD و بودجه فنی موبایل.
            <b className="text-white"> هر ارتقا واقعاً خفن‌تر می‌شود:</b> از کلبه ماهیگیری تا ابرشهر نئونی، از ژنراتور دیزلی تا راکتور اتمی.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#catalog" className="flex items-center gap-2 rounded-xl bg-amber-400 px-6 py-3 text-sm font-extrabold text-black shadow-lg shadow-amber-500/30 transition hover:bg-amber-300">
              <Crosshair className="h-4 w-4" /> مشاهده ۱۸ مدل سه‌بعدی
            </a>
            <a href="#package" className="flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-6 py-3 text-sm font-extrabold text-cyan-300 transition hover:bg-cyan-400/20">
              <Package className="h-4 w-4" /> دانلود پکیج فنی
            </a>
          </div>
          <div className="mt-6 grid max-w-md grid-cols-4 gap-2 text-center">
            {[
              { v: "۱۸", k: "مدل برج" },
              { v: "۱۵", k: "ساختمان" },
              { v: "۱۲", k: "سلاح" },
              { v: "۵+۴", k: "سطح تکامل" },
            ].map((s, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/5 px-2 py-2.5">
                <div className="tick-label text-lg font-black text-amber-300">{s.v}</div>
                <div className="text-[10px] text-slate-400">{s.k}</div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.15 }}>
          <div className="panel corner-brackets scanline relative h-[420px] overflow-hidden rounded-2xl sm:h-[480px]">
            <TowerViewer
              modelKind={tower.modelKind}
              tier={tier.level}
              baseColor={tower.baseColor}
              accentColor={tower.accentColor}
              glowColor={tower.glowColor}
              glowIntensity={tier.glowIntensity}
              scaleBoost={tier.scaleBoost}
              pauseOnModal
            />
            <div className="pointer-events-none absolute right-3 top-3 rounded-xl border border-white/15 bg-black/60 px-3 py-2 backdrop-blur">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-300"><Star className="h-3.5 w-3.5" /> {HERO_LABELS[feat]}</div>
              <div className="tick-label mt-0.5 flex items-center gap-2 font-mono text-[10px] text-slate-300">
                <span className="flex items-center gap-1"><Flame className="h-3 w-3 text-orange-400" /> {tier.dps} DPS</span>
                <span>•</span><span>{tier.polyBudget}</span>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {HERO_FEATURED.map((id) => (
              <button key={id} onClick={() => setFeat(id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${feat === id ? "bg-amber-400 text-black" : "border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10"}`}>
                {HERO_LABELS[id]}
              </button>
            ))}
          </div>
        </motion.div>
      </div>
      <div className="flex justify-center pb-6">
        <a href="#evolution" className="float-y flex flex-col items-center gap-1 text-[11px] text-slate-500">
          درخت تکامل خانواده‌ها <ChevronDown className="h-4 w-4" />
        </a>
      </div>
    </header>
  );
}

/* ---------- نوار تکامل خانواده‌ها ---------- */
function EvolutionStrip() {
  return (
    <section id="evolution" className="border-t border-white/10 bg-black/40 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 className="text-center text-2xl font-black text-white">🌳 درخت تکامل <span className="gold-text">۶ خانواده</span></h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-xs leading-6 text-slate-400">هر خانواده: ۳ سطح پایه ← دوراهی سطح ۴ (الف / ب). روی هر گره کلیک کنید تا به کاتالوگ بروید.</p>
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {FAMILIES.map((f, i) => (
            <motion.a
              key={f.num} href="#catalog"
              initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
              className="panel group rounded-2xl p-4 transition hover:border-amber-400/40"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-extrabold text-white">خانواده {f.num} • {f.name}</span>
                <ArrowLeft className="h-4 w-4 text-slate-600 transition group-hover:-translate-x-1 group-hover:text-amber-300" />
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold" dir="ltr">
                <span className="flex-1 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-1.5 text-center text-cyan-300">L1→L2→L3<br />{f.basic.name}</span>
                <span className="text-amber-400">◀</span>
                <span className="flex-1 rounded-lg border border-amber-400/30 bg-amber-400/10 px-1.5 py-1.5 text-center text-amber-300">★A<br />{f.specials[0]?.name}</span>
                <span className="flex-1 rounded-lg border border-purple-400/30 bg-purple-400/10 px-1.5 py-1.5 text-center text-purple-300">★B<br />{f.specials[1]?.name}</span>
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- فوتر ---------- */
function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#03060d] py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-600"><Anchor className="h-4 w-4 text-black" /></span>
              <b className="text-white">تنگه هرمز: فرمانروایی آب‌های آزاد</b>
            </div>
            <p className="mt-2 text-xs leading-6 text-slate-500">آزمایشگاه مدل‌سازی برج‌ها و سلاح‌ها — نسخه ۱.۰ • پوشش اسپرینت ۲ و ۳ سند GDD • Idle Tycoon + Real-Time Tower Defense</p>
          </div>
          <div className="font-mono text-[11px] leading-7 text-slate-500" dir="ltr">
            <div className="mb-1 font-bold text-slate-300" dir="rtl">📐 فرمول‌های مرجع:</div>
            DPS = Base × 1.8^(Tier-1) × Rate<br />
            Enemy HP = Base × 1.22^W<br />
            Bounty = Base × 1.10^W
          </div>
          <div className="text-xs leading-7 text-slate-500">
            <div className="flex items-center gap-1.5 font-bold text-slate-300"><Swords className="h-4 w-4 text-amber-400" /> تحویل به تیم فنی</div>
            ✅ ۱۸ مدل سه‌بعدی تعاملی • ✅ ۱۲ سلاح با VFX • ✅ بودجه پلی‌گان و LOD • ✅ پکیج JSON و چک‌لیست اسپرینت • ✅ منابع رایگان لایسنس‌شده
          </div>
        </div>
        <div className="mt-6 border-t border-white/10 pt-4 text-center text-[11px] text-slate-600">ساخته‌شده برای فرماندهی تنگه هرمز ⚓ — همه مدل‌ها رویه‌ای و آماده اکسپورت به یونیتی/آنریل</div>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-[#050a16] text-slate-100" dir="rtl">
      <HudBar />
      <Navbar />
      <Hero />
      <EvolutionStrip />
      <Catalog />
      <Buildings />
      <WeaponsSection />
      <PipelineSection />
      <SourcesSection />
      <PackageSection />
      <Footer />
    </div>
  );
}
