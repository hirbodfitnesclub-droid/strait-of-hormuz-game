import { useState } from "react";
import { motion } from "framer-motion";
import {
  Rocket, Zap, Layers, Box, Palette, Cpu, FileDown, Copy, Check,
  ExternalLink, ShieldCheck, Timer, Crosshair, Flame, Factory, CircleDot, Sparkles,
} from "lucide-react";
import { WEAPONS, KIND_META, type WeaponSpec } from "../data/weapons";
import { TOWERS } from "../data/towers";
import { BUILDINGS, outAt } from "../data/buildings";

function towerName(id: string) {
  return TOWERS.find((t) => t.id === id)?.name ?? id;
}

/* ================= زرادخانه ================= */
export function WeaponsSection() {
  const [kind, setKind] = useState<string>("all");
  const kinds = ["all", ...Array.from(new Set(WEAPONS.map((w) => w.kind)))];
  const list = kind === "all" ? WEAPONS : WEAPONS.filter((w) => w.kind === kind);

  return (
    <section id="weapons" className="relative border-t border-white/10 bg-black/30 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-400/30 bg-red-400/10 px-4 py-1.5 text-xs font-bold text-red-300">
            <Rocket className="h-4 w-4" /> زرادخانه • ۱۲ سیستم سلاح و پرتابه
          </div>
          <h2 className="text-3xl font-black text-white sm:text-4xl">مدل‌سازی <span className="gold-text">سلاح‌ها و مهمات</span></h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-400">
            هر برج چه شلیک می‌کند؟ از گلوله رسام تا موشک هایپرسونیک فتاح — با مشخصات VFX، صدا و بودجه پلی‌گان هر پرتابه.
          </p>
        </div>

        <div className="mb-6 flex flex-wrap justify-center gap-2">
          {kinds.map((k) => (
            <button key={k} onClick={() => setKind(k)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${kind === k ? "bg-red-400 text-black" : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}>
              {k === "all" ? "💥 همه" : `${KIND_META[k as WeaponSpec["kind"]].icon} ${KIND_META[k as WeaponSpec["kind"]].fa}`}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((w, i) => (
            <motion.div
              key={w.id}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.4, delay: (i % 3) * 0.07 }}
              className="panel group relative overflow-hidden rounded-2xl p-5"
            >
              <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full opacity-15 blur-3xl transition group-hover:opacity-30" style={{ background: w.glow }} />
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl" style={{ background: `${w.color}1f`, border: `1px solid ${w.color}55`, boxShadow: `0 0 24px -6px ${w.glow}` }}>
                  {KIND_META[w.kind].icon}
                </div>
                <div>
                  <h3 className="font-extrabold text-white">{w.name}</h3>
                  <p className="font-mono text-[10px] text-slate-500" dir="ltr">{w.nameEn}</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-6 text-slate-300">{w.desc}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]">
                <div className="rounded-lg border border-white/10 bg-black/40 p-2"><div className="mb-0.5 text-slate-500">آسیب</div><div className="tick-label font-bold text-white">{w.damage}</div></div>
                <div className="rounded-lg border border-white/10 bg-black/40 p-2"><div className="mb-0.5 text-slate-500">سرعت</div><div className="tick-label font-bold text-white">{w.speed}</div></div>
                <div className="rounded-lg border border-white/10 bg-black/40 p-2"><div className="mb-0.5 text-slate-500">اثر</div><div className="tick-label font-bold text-white">{w.aoe}</div></div>
              </div>
              <div className="mt-2 space-y-1 text-[11px] leading-5 text-slate-400">
                <div>✨ VFX: {w.vfx}</div>
                <div>🔊 صدا: {w.sound} • 🔺 {w.poly}</div>
                <div className="flex flex-wrap gap-1 pt-1">
                  {w.usedBy.map((u) => (
                    <span key={u} className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-cyan-300">{towerName(u)}</span>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ================= پایپ‌لاین مدل‌سازی ================= */
const PIPELINE = [
  { icon: <Palette className="h-5 w-5" />, t: "کانسپت و سیلوئت", d: "هر خانواده یک سیلوئت منحصربه‌فرد: گاتلینگ گرد، ریل کشیده، سیلوی عمودی، دیش‌ها، تسلا، اسکله. خوانایی از فاصله دور.", c: "#f5b942" },
  { icon: <Box className="h-5 w-5" />, t: "بلاک‌اوت سه‌بعدی", d: "همین مدل‌های همین صفحه! ساخته‌شده با هندسه رویه‌ای — قابل اکسپورت مستقیم به GLB/FBX برای یونیتی.", c: "#38e1c6" },
  { icon: <Layers className="h-5 w-5" />, t: "سطوح ارتقا (۴ Tier)", d: "قانون طلایی: هر سطح +لوله، +زره، +رادار، +نور. سطح ۴ ویژه = تغییر کامل فرم + هاله انرژی.", c: "#a78bfa" },
  { icon: <Zap className="h-5 w-5" />, t: "ریگ و انیمیشن", d: "نقاط چرخش برجک، دهانه لوله (Muzzle)، جای انفجار، چرخش رادار و شناوری شناورها — همه ریگ شدند.", c: "#ff4d5e" },
  { icon: <Cpu className="h-5 w-5" />, t: "بهینه‌سازی موبایل", d: "LOD سه‌سطحی + تکسچر اطلس 1024 + متریال PBR کم‌هزینه. هدف: ۶۰ فریم روی گوشی میان‌رده.", c: "#4ade80" },
  { icon: <Crosshair className="h-5 w-5" />, t: "تست خوانایی TD", d: "از فاصله زوم نقشه: رنگ درخشش = خانواده، اندازه = سطح، آیکون شناور = نوع هدف (🚢✈️⚓).", c: "#7dd3fc" },
];

export function PipelineSection() {
  return (
    <section id="pipeline" className="relative border-t border-white/10 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-purple-400/30 bg-purple-400/10 px-4 py-1.5 text-xs font-bold text-purple-300">
            <Cpu className="h-4 w-4" /> استاندارد تولید • موبایل-فرست
          </div>
          <h2 className="text-3xl font-black text-white sm:text-4xl">پایپ‌لاین <span className="gold-text">مدل‌سازی و بهینه‌سازی</span></h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PIPELINE.map((p, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: (i % 3) * 0.07 }}
              className="panel rounded-2xl p-5">
              <div className="mb-3 flex items-center gap-3">
                <span className="tick-label font-mono text-2xl font-black text-white/15">0{i + 1}</span>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10" style={{ color: p.c, background: `${p.c}14` }}>{p.icon}</span>
              </div>
              <h3 className="font-extrabold text-white">{p.t}</h3>
              <p className="mt-1.5 text-xs leading-6 text-slate-400">{p.d}</p>
            </motion.div>
          ))}
        </div>

        {/* جدول بودجه فنی */}
        <div className="panel mt-6 overflow-hidden rounded-2xl">
          <div className="border-b border-white/10 bg-white/5 px-5 py-3 text-sm font-extrabold text-white">📐 جدول بودجه فنی مدل‌ها (Technical Budget)</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="text-slate-400">
                  <th className="px-4 py-3 text-right font-bold">سطح</th>
                  <th className="px-4 py-3 text-right font-bold">بودجه پلی‌گان</th>
                  <th className="px-4 py-3 text-right font-bold">تکسچر</th>
                  <th className="px-4 py-3 text-right font-bold">متریال</th>
                  <th className="px-4 py-3 text-right font-bold">LOD</th>
                  <th className="px-4 py-3 text-right font-bold">قانون بصری</th>
                </tr>
              </thead>
              <tbody className="tick-label">
                {[
                  ["سطح ۱ — پایه", "1K – 1.8K tris", "512 اطلس مشترک", "PBR مات، ۱ emissive", "LOD0/1", "فرم ساده + تک‌چراغ"],
                  ["سطح ۲ — صنعتی", "2.4K – 3.4K tris", "1024 اطلس", "PBR + زره فلزی", "LOD0/1/2", "+رادار +لول دوم +نوار هشدار"],
                  ["سطح ۳ — پیشرفته", "4K – 5.4K tris", "1024 + نرمال", "فلز/شیشه + نئون", "LOD0/1/2", "گنبد + چندلول + پروژکتور"],
                  ["سطح ۴ ★ ویژه", "6.5K – 9.8K tris", "2048 اختصاصی", "شیشه/پلاسما + ۳ emissive", "LOD0/1/2", "تغییر فرم کامل + هاله انرژی"],
                  ["پرتابه‌ها/VFX", "40 – 500 tris", "اسپرایت/شیدر", "unlit + additive", "—", "رد نور + انفجار + حلقه موج"],
                ].map((r, i) => (
                  <tr key={i} className="border-t border-white/5 text-slate-300 hover:bg-white/5">
                    <td className="px-4 py-2.5 font-bold text-amber-300">{r[0]}</td>
                    <td className="px-4 py-2.5">{r[1]}</td>
                    <td className="px-4 py-2.5">{r[2]}</td>
                    <td className="px-4 py-2.5">{r[3]}</td>
                    <td className="px-4 py-2.5">{r[4]}</td>
                    <td className="px-4 py-2.5">{r[5]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================= منابع رایگان وب ================= */
const SOURCES = [
  { name: "Kenney.nl", lic: "CC0 — تجاری آزاد", use: "قایق، اسکله، ساختمان ساحلی، جرثقیل و پروپ‌های محیطی", url: "https://kenney.nl/assets?q=ship", c: "#4ade80" },
  { name: "Quaternius", lic: "CC0 — تجاری آزاد", use: "پروپ‌های لوپولی محیطی، درخت نخل، صخره و ساختمان‌های کارتونی", url: "https://quaternius.com", c: "#4ade80" },
  { name: "Poly.pizza", lic: "CC-BY — با ذکر منبع", use: "کشتی جنگی، زیردریایی، هواپیما و تانک‌های لوپولی آماده", url: "https://poly.pizza/search/warship", c: "#f5b942" },
  { name: "Sketchfab", lic: "بررسی هر مدل (CC-BY/Commercial)", use: "مدل‌های hero باکیفیت: رادار، موشک، گنبد و سلاح‌های دقیق", url: "https://sketchfab.com/search?q=military+tower+lowpoly", c: "#7dd3fc" },
  { name: "OpenGameArt", lic: "متنوع (GPL/CC-BY/CC0)", use: "اسپرایت انفجار، تکسچر آب/آسمان و افکت‌های صوتی جنگی", url: "https://opengameart.org", c: "#7dd3fc" },
  { name: "itch.io Game Assets", lic: "بررسی لایسنس هر پک", use: "پک‌های کامل Tower Defense و VFX انفجار/لیزر آماده یونیتی", url: "https://itch.io/game-assets/free/tag-tower-defense", c: "#a78bfa" },
];

export function SourcesSection() {
  return (
    <section id="sources" className="relative border-t border-white/10 bg-black/30 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1.5 text-xs font-bold text-emerald-300">
            <ShieldCheck className="h-4 w-4" /> دارایی‌های رایگان وب • بررسی لایسنس‌شده
          </div>
          <h2 className="text-3xl font-black text-white sm:text-4xl">منابع <span className="gold-text">رایگان پیشنهادی</span> از وب</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-400">
            مدل‌های پایه این صفحه از صفر ساخته شدند؛ اما برای سرعت تولید، این منابع رایگان برای پروپ‌های محیطی،
            کشتی‌های دشمن و VFX پیشنهاد می‌شوند. فقط موارد CC0/CC-BY تجاری را دانلود کنید.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SOURCES.map((s, i) => (
            <motion.a key={i} href={s.url} target="_blank" rel="noreferrer"
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: (i % 3) * 0.07 }}
              className="panel group rounded-2xl p-5 transition hover:-translate-y-1 hover:border-emerald-400/40">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-white" dir="ltr">{s.name}</h3>
                <ExternalLink className="h-4 w-4 text-slate-500 transition group-hover:text-emerald-300" />
              </div>
              <div className="mt-2 inline-block rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ color: s.c, background: `${s.c}14`, border: `1px solid ${s.c}44` }}>{s.lic}</div>
              <p className="mt-2 text-xs leading-6 text-slate-400">🎯 کاربرد در پروژه: {s.use}</p>
            </motion.a>
          ))}
        </div>
        <div className="panel mt-4 rounded-2xl border-amber-400/20 p-4 text-xs leading-7 text-slate-300">
          ⚠️ <b className="text-amber-300">پروتکل حقوقی:</b> قبل از ایمپورت هر مدل خارجی، لایسنس را در فایل <span className="font-mono text-cyan-300" dir="ltr">ASSET_CREDITS.md</span> ثبت کنید.
          مدل‌های CC0 نیازی به ذکر منبع ندارند ولی ذکر آن حرفه‌ای است؛ مدل‌های CC-BY حتماً در Credits بازی ذکر شوند؛ از مدل‌های NC (غیرتجاری) استفاده نکنید.
        </div>
      </div>
    </section>
  );
}

/* ================= مرکز دانلود پکیج ================= */
export function PackageSection() {
  const [copied, setCopied] = useState(false);

  const dl = (name: string, content: string, type = "application/json") => {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const fullPackage = () => {
    dl("hormuz-full-modeling-package.json", JSON.stringify({
      project: "Strait of Hormuz — Towers, Weapons & Buildings Modeling Package v2.0",
      exportedAt: new Date().toISOString(),
      counts: { towers: TOWERS.length, basic: 6, special: 12, weapons: WEAPONS.length, buildings: BUILDINGS.length },
      formulas: {
        towerDPS: "BaseDamage * 1.8^(Tier-1) * FireRate * M_Tech * M_Grid",
        enemyHP: "BaseHP * 1.22^W",
        bounty: "BaseDollar * 1.10^W",
        buildingCost: "BaseCost * 1.15^(L-1)",
        buildingOutput: "(BaseOutput * L) * 2^floor(L/10) * M_Grid * M_Stability * M_Commander",
      },
      towers: TOWERS, weapons: WEAPONS,
      buildings: BUILDINGS.map((b) => ({ ...b, outputAt100: outAt(b, 100) })),
    }, null, 2));
  };

  const techGuide = () => {
    dl("HORMUZ_MODELING_GUIDE.md", `# راهنمای فنی مدل‌سازی برج‌ها و سلاح‌ها — تنگه هرمز\n\n## ساختار فایل‌ها\n...\n(این فایل از آزمایشگاه مدل‌سازی اکسپورت شده)\n\n## قوانین ارتقا\n- سطح ۱: فرم ساده + تک‌چراغ + 1K tris\n- سطح ۲: +رادار +لول دوم + 2.5K tris\n- سطح ۳: گنبد + چندلول + پروژکتور + 5K tris\n- سطح ۴ ویژه: تغییر فرم کامل + هاله انرژی + 8K tris\n\n## نام‌گذاری\n- Prefab: TWR_F{1-6}_{Base|A|B}_L{1-4}\n- Muzzle: Muzzle_01..04 | Pivot: TurretPivot | Radar: RadarSpin\n\n## ایمپورت یونیتی\n1. مدل GLB را در Assets/Models/Towers بیندازید\n2. Scale Factor = 1 ، Generate Colliders خاموش\n3. متریال‌ها: URP Lit + Emission برای نئون‌ها\n4. اسکریپت TowerStats.cs را با JSON همین پکیج مقداردهی کنید\n`, "text/markdown");
  };

  const sprintCheck = () => {
    dl("SPRINT2_TD_CHECKLIST.md", `# چک‌لیست اسپرینت ۲ — موتور TD و ۶ برجک\n\n- [ ] منوی دایره‌ای کاشت/ارتقا/فروش روی Tower Slot\n- [ ] ۶ برجک پایه با ۳ سطح + تغییر فرم\n- [ ] حرکت موج در مسیر آبی + کسر قلب (۲۰❤️)\n- [ ] تفکیک هدف 🚢/✈️/⚓ + سونار\n- [ ] مصرف مهمات از زرادخانه + افت شلیک در کمبود\n- [ ] دکمه 1x/2x/3x + فراخوانی زودهنگام (+۲۵٪)\n- [ ] قایق‌های سدکننده (Block) خانواده ۶\n- [ ] اعداد آسیب شناور + سکه غنائم\n`, "text/markdown");
  };

  const unitySnippet = `// TowerStats.cs — مقداردهی از پکیج JSON\n[CreateAssetMenu] public class TowerStats : ScriptableObject {\n  public string id; public int family; public bool isSpecial;\n  public float baseDamage, fireRate, range;\n  public float DPS(int tier) => baseDamage * Mathf.Pow(1.8f, tier-1) * fireRate;\n}`;

  const stats = [
    { icon: <Crosshair className="h-5 w-5" />, v: "۱۸", k: "مدل برج", c: "#f5b942" },
    { icon: <Factory className="h-5 w-5" />, v: "۱۵", k: "ساختمان کشور", c: "#38bdf8" },
    { icon: <Flame className="h-5 w-5" />, v: "۱۲", k: "سیستم سلاح", c: "#ff4d5e" },
    { icon: <Layers className="h-5 w-5" />, v: "۵+۴", k: "سطح تکامل", c: "#a78bfa" },
    { icon: <Timer className="h-5 w-5" />, v: "۶۰fps", k: "هدف موبایل", c: "#4ade80" },
    { icon: <CircleDot className="h-5 w-5" />, v: "PBR", k: "متریال + LOD", c: "#7dd3fc" },
  ];

  return (
    <section id="package" className="relative overflow-hidden border-t border-white/10 py-16">
      <div className="pointer-events-none absolute inset-0 sonar-bg opacity-60" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs font-bold text-amber-300">
            <FileDown className="h-4 w-4" /> تحویل نهایی • پکیج کامل
          </div>
          <h2 className="text-3xl font-black text-white sm:text-4xl">مرکز دانلود <span className="gold-text">پکیج مدل‌سازی</span></h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-400">
            همه مشخصات، آمار نبرد، بودجه فنی و چک‌لیست‌ها را یکجا دانلود کنید و مستقیم به تیم فنی/موتور بازی بدهید.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((s, i) => (
            <div key={i} className="panel rounded-2xl p-4 text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10" style={{ color: s.c, background: `${s.c}14` }}>{s.icon}</div>
              <div className="tick-label text-xl font-black text-white">{s.v}</div>
              <div className="text-[11px] text-slate-400">{s.k}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="panel corner-brackets rounded-2xl p-6">
            <h3 className="flex items-center gap-2 font-extrabold text-white"><Sparkles className="h-5 w-5 text-amber-300" /> دانلود مستقیم</h3>
            <div className="mt-4 space-y-2.5">
              <button onClick={fullPackage} className="flex w-full items-center justify-between rounded-xl bg-amber-400 px-4 py-3 text-sm font-extrabold text-black transition hover:bg-amber-300">
                <span>📦 پکیج کامل JSON (برج‌ها + سلاح‌ها + فرمول‌ها)</span><FileDown className="h-5 w-5" />
              </button>
              <button onClick={techGuide} className="flex w-full items-center justify-between rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-3 text-sm font-extrabold text-cyan-300 transition hover:bg-cyan-400/20">
                <span>📘 راهنمای فنی مدل‌سازی (Markdown)</span><FileDown className="h-5 w-5" />
              </button>
              <button onClick={sprintCheck} className="flex w-full items-center justify-between rounded-xl border border-purple-400/40 bg-purple-400/10 px-4 py-3 text-sm font-extrabold text-purple-300 transition hover:bg-purple-400/20">
                <span>✅ چک‌لیست اسپرینت ۲ موتور TD</span><FileDown className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-6 text-slate-500">💡 برای خروجی GLB سه‌بعدی هر مدل: وارد صفحه جزئیات برج شوید ← رندر PNG بگیرید یا صحنه را با افزونه GLTF Exporter یونیتی/بلندر اکسپورت کنید. هندسه‌ها ۱۰۰٪ استاندارد و آماده ریتوپو هستند.</p>
          </div>
          <div className="panel rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-white">🧩 اسنیپت یونیتی (C#)</h3>
              <button
                onClick={() => { navigator.clipboard.writeText(unitySnippet); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
                className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-slate-300 transition hover:bg-white/10"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "کپی شد!" : "کپی کد"}
              </button>
            </div>
            <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-black/60 p-4 font-mono text-[11px] leading-6 text-emerald-300" dir="ltr">{unitySnippet}</pre>
            <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] leading-6 text-slate-400">
              🗂️ <b className="text-white">ساختار پیشنهادی پروژه:</b>
              <span className="font-mono text-cyan-300" dir="ltr"> Assets/Models/Towers/F1_Autocannon/ | .../Weapons/ | .../VFX/ | .../Data/towers.json</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
