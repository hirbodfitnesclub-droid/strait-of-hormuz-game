export interface WeaponSpec {
  id: string;
  name: string;
  nameEn: string;
  kind: "shell" | "rocket" | "missile" | "beam" | "pulse" | "torpedo" | "mine" | "drone";
  usedBy: string[];
  damage: string;
  speed: string;
  aoe: string;
  color: string;
  glow: string;
  desc: string;
  vfx: string;
  sound: string;
  poly: string;
}

export const WEAPONS: WeaponSpec[] = [
  {
    id: "shell-30", name: "گلوله رسام ۳۰ م‌م", nameEn: "30mm Tracer Shell",
    kind: "shell", usedBy: ["autocannon", "ciws"],
    damage: "۹ – ۳۹", speed: "۱۲۰۰ m/s", aoe: "نقطه‌ای", color: "#f5b942", glow: "#ffb020",
    desc: "گلوله رسام کهربایی با رد نورانی؛ صدای رگبار ممتد و جرقه برخورد روی بدنه کشتی.",
    vfx: "رد نور + جرقه برخورد + پوکه پرتاب‌شونده", sound: "BRRRT گاتلینگ", poly: "≈ 80 tris",
  },
  {
    id: "shell-155", name: "گلوله انفجاری ۱۵۵ م‌م", nameEn: "155mm HE Shell",
    kind: "shell", usedBy: ["howitzer"],
    damage: "۴۵ – ۱۴۶ + انفجار محیطی", speed: "۸۰۰ m/s (خمپاره‌ای)", aoe: "شعاع ۱.۲ واحد", color: "#ff9a3c", glow: "#ff6a00",
    desc: "قوس بالستیک بلند با سوت سقوط و انفجار نارنجی + ستون آب و دود.",
    vfx: "سایه سقوط + انفجار AoE + حلقه موج", sound: "سوت + بوم عمیق", poly: "≈ 120 tris",
  },
  {
    id: "rail-slug", name: "پرتابه تنگستن ریلی", nameEn: "Railgun Tungsten Slug",
    kind: "shell", usedBy: ["railgun"],
    damage: "۳۴۰ × نفوذ ۵ هدف", speed: "۲۴۰۰ m/s (۷ ماخ)", aoe: "خطی", color: "#38e1c6", glow: "#38e1c6",
    desc: "خط نور فیروزه‌ای لحظه‌ای با ترکیدن شیشه‌ای هوا و سوراخ شدن پشت سر هم بدنه‌ها.",
    vfx: "پرتو خطی + قوس الکتریکی + موج ضربه", sound: "شلیک الکتریکی + غرش صوتی", poly: "≈ 60 tris + beam",
  },
  {
    id: "rocket-fajr", name: "راکت خوشه‌ای فجر", nameEn: "Fajr Cluster Rocket",
    kind: "rocket", usedBy: ["mlrs"],
    damage: "۶۰ × ۱۲ راکت + سوزش", speed: "۶۰۰ m/s", aoe: "پهنه وسیع + Burn", color: "#ffd23c", glow: "#ff8a00",
    desc: "باران ۱۲ راکت با دود سفید مارپیچ؛ ناحیه هدف ۶ ثانیه در آتش می‌سوزد.",
    vfx: "رد دود + انفجارهای زنجیره‌ای + آتش ماندگار", sound: "صفیر دسته‌ای + انفجارهای پیاپی", poly: "≈ 200 tris",
  },
  {
    id: "cruise", name: "موشک کروز", nameEn: "Cruise Missile",
    kind: "missile", usedBy: ["silo", "swarm"],
    damage: "۱۸۰ – ۵۸۳", speed: "۲۵۰ m/s (پرواز کروز)", aoe: "متوسط", color: "#ff4d5e", glow: "#ff2d55",
    desc: "پرواز ارتفاع پست روی آب با شعله موتور و قفل راداری؛ انفجار بزرگ تک‌هدف.",
    vfx: "شعله موتور + رد دود + انفجار قارچی کوچک", sound: "غرش جت + انفجار", poly: "≈ 350 tris",
  },
  {
    id: "fattah", name: "موشک هایپرسونیک فتاح", nameEn: "Fattah Hypersonic Glide",
    kind: "missile", usedBy: ["hypersonic"],
    damage: "۱۴۵۰ × کریت ۲×", speed: "۴۴۰۰ m/s (۱۳ ماخ)", aoe: "بزرگ", color: "#ff2d78", glow: "#ff2d78",
    desc: "گلوله آتش سرخ با هاله پلاسما؛ غیرقابل رهگیری، برخورد = انفجار عظیم + لرزش دوربین.",
    vfx: "هاله پلاسما + بوم صوتی + فلش سفید + لرزش", sound: "بوم صوتی + انفجار مهیب", poly: "≈ 500 tris",
  },
  {
    id: "bavar-msl", name: "موشک رهگیر باور", nameEn: "Bavar Interceptor",
    kind: "missile", usedBy: ["bavar"],
    damage: "۵۲۰ (هوایی)", speed: "۱۰۰۰ m/s عمودی", aoe: "هوایی گروهی", color: "#4ade80", glow: "#22ff88",
    desc: "پرتاب عمودی با چرخش به سمت هدف هوایی؛ انفجار سبز در آسمان.",
    vfx: "پرتاب عمودی + چرخش + انفجار هوایی", sound: "شلیک عمودی + انفجار هوایی", poly: "≈ 300 tris",
  },
  {
    id: "laser-beam", name: "اشعه لیزر حرارتی", nameEn: "Thermal Laser Beam",
    kind: "beam", usedBy: ["aadefense", "laser"],
    damage: "۹۰/ثانیه ← ۵۰۰٪", speed: "آنی (Hitscan)", aoe: "پرتو ممتد", color: "#e879f9", glow: "#c026d3",
    desc: "پرتو بنفش پیوسته با نقطه جوش مذاب روی هدف؛ هر ثانیه قطورتر و داغ‌تر.",
    vfx: "پرتو + جرقه مذاب + دود + درخشش عدسی", sound: "وزوز الکتریکی صعودی", poly: "≈ 40 tris + shader",
  },
  {
    id: "emp-wave", name: "موج پالس EMP", nameEn: "EMP Shockwave",
    kind: "pulse", usedBy: ["emp", "ew"],
    damage: "کنترلی (کندی ۶۰٪)", speed: "انتشار کروی", aoe: "شعاع ۴.۴", color: "#a78bfa", glow: "#8b5cf6",
    desc: "حلقه بنفش گسترش‌یابنده با جرقه‌های الکتریکی؛ دشمنان آبی‌روشن و کند می‌شوند.",
    vfx: "حلقه شوک + صاعقه + هاله روی دشمن", sound: "پالس الکتریکی عمیق", poly: "shader حلقه",
  },
  {
    id: "torpedo", name: "اژدر حوت", nameEn: "Hoot Torpedo",
    kind: "torpedo", usedBy: ["torpedo", "mine"],
    damage: "۱۲۰ – ۳۰۰", speed: "۱۰۰ m/s زیرآبی", aoe: "زیرآبی + ستون آب", color: "#38e1c6", glow: "#22d3ee",
    desc: "خط حباب زیر آب به سمت هدف؛ برخورد = ستون عظیم آب و شکافتن بدنه.",
    vfx: "رد حباب + ستون آب + حلقه موج", sound: "غژ زیرآبی + انفجار خفه", poly: "≈ 180 tris",
  },
  {
    id: "naval-mine", name: "مین مغناطیسی دریایی", nameEn: "Magnetic Naval Mine",
    kind: "mine", usedBy: ["mine"],
    damage: "۳۰۰ (تله‌ای)", speed: "ثابت (شناور)", aoe: "متوسط", color: "#f5b942", glow: "#ff4d5e",
    desc: "گوی سیاه شاخک‌دار شناور با چراغ قرمز چشمک‌زن؛ نزدیک شدن دشمن = انفجار.",
    vfx: "چشمک قرمز + انفجار + ستون آب", sound: "بوق هشدار + انفجار", poly: "≈ 220 tris",
  },
  {
    id: "kamikaze", name: "پهپاد انتحاری شاهد", nameEn: "Shahed Kamikaze Drone",
    kind: "drone", usedBy: ["sonar"],
    damage: "۱۵۰ (هک‌شده علیه خودی دشمن)", speed: "۱۸۰ m/s", aoe: "کوچک", color: "#4ade80", glow: "#4ade80",
    desc: "پهپاد دلتا هک‌شده با هاله سبز سایبری که برمی‌گردد و به ناو دشمن می‌کوبد.",
    vfx: "هاله هک + رد سبز + انفجار", sound: "وزوز موتور + انفجار", poly: "≈ 400 tris",
  },
];

export const KIND_META: Record<WeaponSpec["kind"], { fa: string; icon: string }> = {
  shell: { fa: "گلوله توپ", icon: "🎯" },
  rocket: { fa: "راکت", icon: "🚀" },
  missile: { fa: "موشک", icon: "🛰️" },
  beam: { fa: "پرتو انرژی", icon: "🔆" },
  pulse: { fa: "موج کنترلی", icon: "🌀" },
  torpedo: { fa: "اژدر", icon: "🌊" },
  mine: { fa: "مین دریایی", icon: "⚫" },
  drone: { fa: "پهپاد", icon: "🛸" },
};
