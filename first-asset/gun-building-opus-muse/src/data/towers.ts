export type TargetType = "sea" | "air" | "sub";

export interface TowerTier {
  level: number;
  label: string;
  damage: number;
  fireRate: number;
  range: number;
  dps: number;
  costDollar: number;
  costSteel: number;
  powerMW: number;
  ammoPerShot: number;
  polyBudget: string;
  scaleBoost: number;
  glowIntensity: number;
  visualChanges: string[];
  armorNote: string;
}

export type ModelKind =
  | "autocannon" | "ciws" | "railgun"
  | "howitzer" | "mlrs" | "thermobaric"
  | "silo" | "hypersonic" | "swarm"
  | "aadefense" | "bavar" | "laser"
  | "ew" | "emp" | "sonar"
  | "garrison" | "torpedo" | "mine";

export interface TowerSpec {
  id: string;
  family: number;
  familyName: string;
  isSpecial: boolean;
  branch?: "A" | "B";
  branchTitle?: string;
  name: string;
  nameEn: string;
  tagline: string;
  description: string;
  role: string;
  targets: TargetType[];
  priority: string;
  modelKind: ModelKind;
  baseColor: string;
  accentColor: string;
  glowColor: string;
  tiers: TowerTier[];
  ability?: string;
  abilityDesc?: string;
  counters: string;
  synergy: string;
  unlockReq: string;
}

export const TARGET_META: Record<TargetType, { fa: string; en: string; emoji: string }> = {
  sea: { fa: "دریایی", en: "ANTI-SEA", emoji: "🚢" },
  air: { fa: "هوایی", en: "ANTI-AIR", emoji: "✈️" },
  sub: { fa: "زیرسطحی", en: "ANTI-SUB", emoji: "⚓" },
};

export const TOWERS: TowerSpec[] = [
  // ── خانواده ۱: توپخانه سریع ──────────────────────────────
  {
    id: "autocannon",
    family: 1,
    familyName: "توپخانه سریع ساحلی",
    isSpecial: false,
    name: "برجک توپخانه سریع",
    nameEn: "Coastal Autocannon",
    tagline: "رگبار مرگ علیه ازدحام قایق‌ها و پهپادها",
    description:
      "ستون فقرات دفاع ساحلی. یک برجک چرخان پرسرعت با تغذیه نواری که قایق‌های تندروی انتحاری و اسکادران‌های پهپاد را قبل از رسیدن به تنگنا درو می‌کند. ارزان، سریع و همیشه آماده شلیک.",
    role: "ضد ازدحام (Anti-Swarm) | DPS پایدار",
    targets: ["sea", "air"],
    priority: "First / Air Priority",
    modelKind: "autocannon",
    baseColor: "#5b6b82",
    accentColor: "#f5b942",
    glowColor: "#ffb020",
    ability: "رگبار سرکوب",
    abilityDesc: "۱۰ ثانیه نرخ شلیک ۵۰٪ بیشتر با پخش گلوله رسام",
    counters: "قایق انتحاری، پهپاد، هلیکوپتر ارتفاع پست",
    synergy: "در کنار برجک EMP: دشمنان کندشده زیر رگبار ذوب می‌شوند",
    unlockReq: "از ابتدای کمپین — بدون نیاز به تحقیق",
    tiers: [
      {
        level: 1, label: "سطح ۱ — دیده‌بانی ساحلی", damage: 12, fireRate: 4.0, range: 3.2, dps: 48,
        costDollar: 150, costSteel: 20, powerMW: 5, ammoPerShot: 1,
        polyBudget: "≈ 1.2K tris", scaleBoost: 1, glowIntensity: 0.25,
        visualChanges: ["سکوی بتنی هشت‌ضلعی با جان‌پناه خاکی", "تک‌لول ۳۰ م‌م با سپر ساده", "چراغ هشدار کهربایی تک‌نقطه‌ای"],
        armorNote: "بدنه خاکستری مات، بدون زره واکنشی",
      },
      {
        level: 2, label: "سطح ۲ — دژ دولول", damage: 22, fireRate: 4.4, range: 3.5, dps: 97,
        costDollar: 320, costSteel: 45, powerMW: 8, ammoPerShot: 1,
        polyBudget: "≈ 2.4K tris", scaleBoost: 1.08, glowIntensity: 0.5,
        visualChanges: ["ارتقا به دولول موازی + خشاب نواری نمایان", "دیش رادار چرخان کوچک روی برجک", "زره جانبی پیچ‌شده + نوار رسام نارنجی"],
        armorNote: "صفحات زرهی جانبی + رنگ استتار ساحلی",
      },
      {
        level: 3, label: "سطح ۳ — دژ آتش", damage: 39, fireRate: 5.0, range: 3.8, dps: 195,
        costDollar: 700, costSteel: 110, powerMW: 14, ammoPerShot: 2,
        polyBudget: "≈ 4.1K tris", scaleBoost: 1.18, glowIntensity: 0.85,
        visualChanges: ["چهارلول چرخان + هیت‌سینک‌های مسی درخشان", "برجک زره‌پوش سنگین با گنبد فرماندهی", "پروژکتور جستجو + آنتن آرایه‌ای + نورپردازی نئونی"],
        armorNote: "زره کامپوزیتی + سپر حرارتی لوله‌ها",
      },
    ],
  },
  {
    id: "ciws",
    family: 1, familyName: "توپخانه سریع ساحلی", isSpecial: true, branch: "A",
    branchTitle: "انشعاب الف — رهگیر نقطه‌ای",
    name: "سامانه فالانکس گاتلینگ",
    nameEn: "CIWS Vulcan Phalanx",
    tagline: "۳۰۰۰ گلوله در دقیقه + رهگیری موشک در هوا",
    description:
      "تکامل نهایی ضدازدحام. گنبد سفید افسانه‌ای با خوشه گاتلینگ شش‌لول که نه‌تنها قایق‌ها و جنگنده‌ها، بلکه موشک‌های شلیک‌شده از ناوشکن‌های ایجس را هم در هوا تکه‌تکه می‌کند.",
    role: "رهگیر نقطه‌ای (Point Defense) | ضد موشک",
    targets: ["sea", "air"],
    priority: "Air Priority / Strongest",
    modelKind: "ciws",
    baseColor: "#dfe7f2",
    accentColor: "#ff4d5e",
    glowColor: "#ff6b78",
    ability: "دیوار سربی",
    abilityDesc: "رهگیری خودکار ۳ موشک ورودی در هر ۵ ثانیه + افزایش برد ۲۰٪",
    counters: "موشک کروز دشمن، جنگنده، پهپاد انتحاری",
    synergy: "پوشش هوایی سیلوهای هایپرسونیک در خط مقدم",
    unlockReq: "تحقیق «خازن‌های فوق‌رسانا» + پیروزی در عملیات ۸",
    tiers: [
      {
        level: 4, label: "سطح ۴ ★ ویژه — فالانکس", damage: 9, fireRate: 14.0, range: 3.4, dps: 612,
        costDollar: 1600, costSteel: 260, powerMW: 30, ammoPerShot: 2,
        polyBudget: "≈ 6.5K tris", scaleBoost: 1.3, glowIntensity: 1.2,
        visualChanges: ["گنبد سفید راداری R2-D2 با پنل‌های فازی", "خوشه گاتلینگ شش‌لول چرخان + افکت حرارتی", "حلقه سنسور قرمز چشمک‌زن ۳۶۰ درجه"],
        armorNote: "بدنه سرامیکی سفید + خنک‌کننده مایع",
      },
    ],
  },
  {
    id: "railgun",
    family: 1, familyName: "توپخانه سریع ساحلی", isSpecial: true, branch: "B",
    branchTitle: "انشعاب ب — شکافنده زره",
    name: "توپ ریلی الکترومغناطیسی",
    nameEn: "Railgun Turret",
    tagline: "گلوله مافوق‌صوت که از بدن ۵ کشتی رد می‌شود",
    description:
      "شلیک گلوله تنگستنی با سرعت ۷ ماخ در یک خط صاف. پرتابه از بدنه پنج کشتی پشت سر هم عبور می‌کند و زره ناوچه‌های دشمن را مثل کاغذ می‌شکافد (Armor Piercing).",
    role: "شکافنده خطی (Piercing Sniper)",
    targets: ["sea"],
    priority: "Strongest / First",
    modelKind: "railgun",
    baseColor: "#2b3550",
    accentColor: "#38e1c6",
    glowColor: "#38e1c6",
    ability: "شلیک ریلی",
    abilityDesc: "نفوذ خطی در ۵ هدف + ۱۵۰٪ آسیب به اهداف زرهی",
    counters: "ناوچه زرهی، ناوشکن، ستون‌های فشرده",
    synergy: "عالی در کانال باریک قشم–لارک پشت برجک کندکننده",
    unlockReq: "تحقیق «خازن‌های فوق‌رسانا» + پیروزی در عملیات ۸",
    tiers: [
      {
        level: 4, label: "سطح ۴ ★ ویژه — توپ ریلی", damage: 340, fireRate: 0.55, range: 5.2, dps: 612,
        costDollar: 1800, costSteel: 300, powerMW: 55, ammoPerShot: 4,
        polyBudget: "≈ 7.2K tris", scaleBoost: 1.35, glowIntensity: 1.6,
        visualChanges: ["ریل‌های موازی ۹ متری با ۵ کویل القایی", "بانک خازن آبی‌درخشان + قوس الکتریکی", "پایه گردان سنگین با پیستون‌های هیدرولیک"],
        armorNote: "شاسی تیتانیومی + عایق الکترومغناطیسی",
      },
    ],
  },

  // ── خانواده ۲: توپخانه سنگین ─────────────────────────────
  {
    id: "howitzer",
    family: 2, familyName: "توپخانه سنگین", isSpecial: false,
    name: "برجک توپخانه سنگین",
    nameEn: "Heavy Howitzer",
    tagline: "انفجار محیطی علیه دسته‌های فشرده در تنگناها",
    description:
      "هویتزر ۱۵۵ م‌م ساحلی با گلوله‌های انفجاری. هر شلیک یک دایره آتش روی آب می‌سازد؛ بهترین دوست فرمانده در پیچ تند جزیره هرمز که دشمن مجبور است فشرده عبور کند.",
    role: "آسیب محیطی (AoE Splash)",
    targets: ["sea"],
    priority: "First / Strongest",
    modelKind: "howitzer",
    baseColor: "#6b5b43",
    accentColor: "#ff9a3c",
    glowColor: "#ff9a3c",
    ability: "آتش تهیه",
    abilityDesc: "۳ گلوله پیاپی با ۴۰٪ شعاع انفجار بیشتر",
    counters: "دسته‌های فشرده قایق، ناوچه",
    synergy: "ترکیب با مین‌ریز: دشمن متوقف + زیر آتش سنگین",
    unlockReq: "از ابتدای کمپین",
    tiers: [
      {
        level: 1, label: "سطح ۱ — آتشبار خاکی", damage: 45, fireRate: 0.5, range: 4.0, dps: 23,
        costDollar: 220, costSteel: 35, powerMW: 4, ammoPerShot: 3,
        polyBudget: "≈ 1.4K tris", scaleBoost: 1, glowIntensity: 0.2,
        visualChanges: ["تک‌لول کوتاه ۱۵۵ م‌م با زاویه ثابت", "سنگر خاکی و کیسه‌شن دور سکو", "جعبه مهمات چوبی کنار برجک"],
        armorNote: "بدون زره — استتار خاکی بیابانی",
      },
      {
        level: 2, label: "سطح ۲ — دژ کالیبر", damage: 81, fireRate: 0.55, range: 4.4, dps: 45,
        costDollar: 480, costSteel: 80, powerMW: 7, ammoPerShot: 3,
        polyBudget: "≈ 2.8K tris", scaleBoost: 1.1, glowIntensity: 0.5,
        visualChanges: ["لول بلندتر با ترمز دهانه + سپر فولادی", "برجک گردان ۱۸۰ درجه + جرثقیل مهمات", "نوار هشدار زرد/مشکی دور سکو"],
        armorNote: "سپر جلویی ۲۰ م‌م + رنگ زیتونی",
      },
      {
        level: 3, label: "سطح ۳ — پتک ساحل", damage: 146, fireRate: 0.6, range: 4.8, dps: 88,
        costDollar: 950, costSteel: 170, powerMW: 12, ammoPerShot: 4,
        polyBudget: "≈ 4.6K tris", scaleBoost: 1.22, glowIntensity: 0.9,
        visualChanges: ["دولول سنگین + خشاب خودکار چرخان", "گنبد زرهی + دکل هدایت آتش", "لوله‌ها با حلقه‌های خنک‌کننده سرخ"],
        armorNote: "زره دولایه + سیستم تهویه گاز باروت",
      },
    ],
  },
  {
    id: "mlrs",
    family: 2, familyName: "توپخانه سنگین", isSpecial: true, branch: "A",
    branchTitle: "انشعاب الف — آتش خوشه‌ای",
    name: "آتشبار راکتی فجر",
    nameEn: "Fajr MLRS Cluster Battery",
    tagline: "۱۲ راکت خوشه‌ای همزمان + آتش مداوم (Burn)",
    description:
      "یک کامیون پرتابگر ۱۲ لوله که آسمان را آتش می‌کند. راکت‌های خوشه‌ای یک پهنه وسیع از آب را به جهنم تبدیل می‌کنند و کشتی‌های سوخته ثانیه‌ها بعد همچنان می‌سوزند (Damage over Time).",
    role: "آتش منطقه‌ای (Zone Denial) + سوزش مداوم",
    targets: ["sea"],
    priority: "First",
    modelKind: "mlrs",
    baseColor: "#4a5a3c",
    accentColor: "#ffd23c",
    glowColor: "#ff8a00",
    ability: "طوفان فجر",
    abilityDesc: "شلیک ۱۲ راکت + ناحیه آتش ۶ ثانیه‌ای",
    counters: "موج‌های پرتعداد، کاروان‌های دشمن",
    synergy: "با EMP: دشمن منجمد زیر باران راکت",
    unlockReq: "تحقیق «لوله‌های آلیاژ تیتانیوم» + عملیات ۱۲",
    tiers: [
      {
        level: 4, label: "سطح ۴ ★ ویژه — فجر", damage: 60, fireRate: 1.1, range: 5.6, dps: 384,
        costDollar: 2000, costSteel: 340, powerMW: 18, ammoPerShot: 12,
        polyBudget: "≈ 7.8K tris", scaleBoost: 1.38, glowIntensity: 1.1,
        visualChanges: ["پرتابگر ۱۲ لوله (۴×۳) با زاویه متغیر", "شاسی ۶ چرخ نظامی + جک‌های تثبیت", "رادوم هدایت + دودکش حرارتی + شعله‌افکن نمایشی"],
        armorNote: "کابین زرهی + پوشش ضدترکش",
      },
    ],
  },
  {
    id: "thermobaric",
    family: 2, familyName: "توپخانه سنگین", isSpecial: true, branch: "B",
    branchTitle: "انشعاب ب — گیج‌کننده",
    name: "توپ پلاسمایی ساحلی",
    nameEn: "Thermobaric Cannon",
    tagline: "انفجار گرمافشاری + گیجی ۲ ثانیه‌ای (Stun)",
    description:
      "گلوله‌های گرمافشاری غول‌پیکر که علاوه بر انفجار مهیب، موج ضربه‌ای آن کشتی‌ها را ۲ ثانیه کامل متوقف و گیج می‌کند. بهترین ابزار برای نگه داشتن باس‌ها زیر آتش متمرکز.",
    role: "کنترل جمعیت (Crowd Control) + Stun",
    targets: ["sea"],
    priority: "Strongest",
    modelKind: "thermobaric",
    baseColor: "#3d2b52",
    accentColor: "#ff5c39",
    glowColor: "#ff5c39",
    ability: "موج شوک",
    abilityDesc: "گیجی ۲ ثانیه‌ای تمام اهداف در شعاع انفجار",
    counters: "باس‌ها، ناوشکن‌ها، ستون‌های سریع",
    synergy: "ستون فقرات کمبو: استون → تمرکز آتش هایپرسونیک",
    unlockReq: "تحقیق «لوله‌های آلیاژ تیتانیوم» + عملیات ۱۲",
    tiers: [
      {
        level: 4, label: "سطح ۴ ★ ویژه — ترموباریک", damage: 420, fireRate: 0.32, range: 4.6, dps: 430,
        costDollar: 2200, costSteel: 380, powerMW: 22, ammoPerShot: 6,
        polyBudget: "≈ 7.5K tris", scaleBoost: 1.4, glowIntensity: 1.5,
        visualChanges: ["محفظه کروی فشار + لول قطور کوتاه", "حلقه‌های پلاسمای نارنجی چشمک‌زن", "مخازن گاز فشرده + شیرهای برنجی + اخطار تشعشع"],
        armorNote: "محفظه ضدفشار دولایه + سپر حرارتی",
      },
    ],
  },

  // ── خانواده ۳: سیلوی موشک ─────────────────────────────────
  {
    id: "silo",
    family: 3, familyName: "سیلوی موشک کروز", isSpecial: false,
    name: "سیلوی موشک کروز",
    nameEn: "Cruise Missile Silo",
    tagline: "تک‌تیرانداز دوربرد علیه ناوهای سنگین و باس‌ها",
    description:
      "برد بسیار بلند و قدرت تخریب ویرانگر. موشک کروز با قفل راداری از سیلوی زیرزمینی شلیک می‌شود و ناوهای سنگین را از آن سوی نقشه شکار می‌کند. کند اما مرگبار.",
    role: "تک‌تیرانداز (Sniper) | ضد باس",
    targets: ["sea"],
    priority: "Strongest",
    modelKind: "silo",
    baseColor: "#4d5666",
    accentColor: "#ff4d5e",
    glowColor: "#ff4d5e",
    ability: "قفل راداری",
    abilityDesc: "۲۰٪ شانس ضربه بحرانی ۲ برابری",
    counters: "ناوشکن، رزم‌ناو، باس‌ها",
    synergy: "با سونار: شکار زیردریایی لویاتان",
    unlockReq: "فتح عملیات ۳",
    tiers: [
      {
        level: 1, label: "سطح ۱ — چاه موشک", damage: 180, fireRate: 0.2, range: 6.0, dps: 36,
        costDollar: 400, costSteel: 60, powerMW: 10, ammoPerShot: 5,
        polyBudget: "≈ 1.6K tris", scaleBoost: 1, glowIntensity: 0.3,
        visualChanges: ["دریچه سیلوی تکی + موشک خاکستری", "حصار بتنی + چراغ قرمز هشدار", "دکل آنتن ساده"],
        armorNote: "دریچه فولادی ۳۰ م‌م",
      },
      {
        level: 2, label: "سطح ۲ — آشیانه کروز", damage: 324, fireRate: 0.22, range: 6.6, dps: 71,
        costDollar: 850, costSteel: 140, powerMW: 16, ammoPerShot: 5,
        polyBudget: "≈ 3.1K tris", scaleBoost: 1.12, glowIntensity: 0.6,
        visualChanges: ["دریچه دولنگه هیدرولیک + موشک سفید/قرمز", "رادار هدایت کوچک + اتاق کنترل", "خط‌کشی زرد محوطه پرتاب"],
        armorNote: "دیوار انفجاری بتنی + سقف ضدترکش",
      },
      {
        level: 3, label: "سطح ۳ — زرادخانه عمودپرتاب", damage: 583, fireRate: 0.25, range: 7.2, dps: 146,
        costDollar: 1700, costSteel: 280, powerMW: 26, ammoPerShot: 6,
        polyBudget: "≈ 5.2K tris", scaleBoost: 1.25, glowIntensity: 1.0,
        visualChanges: ["۳ سلول پرتاب + بازوی بارگذار خودکار", "گنبد رادار بزرگ + دکل‌های هدایت", "موشک با نوارهای طلایی + نور زیرین قرمز"],
        armorNote: "سیلوی سه‌جداره + سیستم اطفای خودکار",
      },
    ],
  },
  {
    id: "hypersonic",
    family: 3, familyName: "سیلوی موشک کروز", isSpecial: true, branch: "A",
    branchTitle: "انشعاب الف — غیرقابل رهگیری",
    name: "سیلوی موشک هایپرسونیک فتاح",
    nameEn: "Fattah Hypersonic Silo",
    tagline: "سرعت ۱۳ ماخ — غیرقابل رهگیری + کریت ۲ برابری",
    description:
      "موشک هایپرسونیک با کلاهک مانورپذیر که سامانه دفاع نقطه‌ای ناوشکن‌های ایجس قادر به رهگیری آن نیست. هر اصابت ۲ برابر آسیب بحرانی می‌زند؛ کابوس باس‌ها.",
    role: "ضد باس نهایی (Boss Killer)",
    targets: ["sea"],
    priority: "Strongest",
    modelKind: "hypersonic",
    baseColor: "#14161f",
    accentColor: "#ff2d78",
    glowColor: "#ff2d78",
    ability: "ضربه فتاح",
    abilityDesc: "۱۰۰٪ کریت ۲× + عبور از دفاع نقطه‌ای دشمن",
    counters: "ناوشکن ایجس، باس زرهی، سوپرکریر",
    synergy: "با کاهش زره فرمانده فاتح: ذوب باس در ثانیه",
    unlockReq: "تحقیق «باز کردن قفل سطح ۴» + عملیات ۱۵",
    tiers: [
      {
        level: 4, label: "سطح ۴ ★ ویژه — فتاح", damage: 1450, fireRate: 0.16, range: 9.0, dps: 742,
        costDollar: 3200, costSteel: 520, powerMW: 40, ammoPerShot: 8,
        polyBudget: "≈ 8.4K tris", scaleBoost: 1.45, glowIntensity: 1.8,
        visualChanges: ["موشک سوزنی مشکی مخفی‌کار با بالک پلاسما", "سیلوی عمیق با حلقه مغناطیسی سرخ", "برج هدایت شیشه‌ای + رد دود یونیزه نمایشی"],
        armorNote: "بدنه جاذب رادار + سپر حرارتی سرامیکی",
      },
    ],
  },
  {
    id: "swarm",
    family: 3, familyName: "سیلوی موشک کروز", isSpecial: true, branch: "B",
    branchTitle: "انشعاب ب — قفل چندگانه",
    name: "لانچر موشک‌های چندگانه",
    nameEn: "Swarm Cruise Launcher",
    tagline: "۴ موشک هوشمند با قفل جداگانه روی ۴ هدف",
    description:
      "شلیک همزمان ۴ موشک کروز هوشمند که هر کدام قفل راداری مستقل روی یک کشتی متفاوت انجام می‌دهند. پاسخ نهایی به موج‌های چندستونه و اسکورت‌های باس.",
    role: "چندهدفه (Multi-Target)",
    targets: ["sea", "air"],
    priority: "Strongest",
    modelKind: "swarm",
    baseColor: "#334155",
    accentColor: "#7dd3fc",
    glowColor: "#7dd3fc",
    ability: "رگبار هوشمند",
    abilityDesc: "۴ قفل همزمان + اولویت خودکار قوی‌ترین‌ها",
    counters: "کاروان‌های چندستونه، اسکورت باس",
    synergy: "با رادار آرایه فازی: برد کل نقشه",
    unlockReq: "تحقیق «باز کردن قفل سطح ۴» + عملیات ۱۵",
    tiers: [
      {
        level: 4, label: "سطح ۴ ★ ویژه — ازدحام", damage: 380, fireRate: 0.3, range: 7.5, dps: 729,
        costDollar: 2900, costSteel: 460, powerMW: 34, ammoPerShot: 10,
        polyBudget: "≈ 8.0K tris", scaleBoost: 1.4, glowIntensity: 1.4,
        visualChanges: ["۴ لوله پرتاب ۲×۲ با سر چرخان مستقل", "دکل رادار چندپرتو + ۴ آنتن قفل", "سکوی گردان + چراغ‌های قفل آبی"],
        armorNote: "برجک چرخان ۳۶۰ درجه + زره سبک",
      },
    ],
  },

  // ── خانواده ۴: پدافند و لیزر ──────────────────────────────
  {
    id: "aadefense",
    family: 4, familyName: "پدافند و لیزر", isSpecial: false,
    name: "برجک پدافند و لیزر",
    nameEn: "Air Defense & Laser",
    tagline: "چتر هوایی تنگه + اشعه متمرکز روی ناوها",
    description:
      "ترکیب توپ ضدهوایی و لیزر کم‌توان. اسکادران‌های پهپاد و جنگنده را در آسمان تکه‌تکه می‌کند و اشعه متمرکزش زره ناوها را ذوب می‌کند. بدون این برج، آسمان از آن دشمن است.",
    role: "ضدهوایی تخصصی (Dedicated AA)",
    targets: ["air", "sea"],
    priority: "Air Priority",
    modelKind: "aadefense",
    baseColor: "#3f5a78",
    accentColor: "#7dd3fc",
    glowColor: "#38bdf8",
    ability: "چتر آتش",
    abilityDesc: "افزایش ۳۰٪ سرعت شلیک علیه اهداف هوایی",
    counters: "پهپاد، جنگنده، هلیکوپتر",
    synergy: "پوشش هوایی دائمی بالای سیلوهای موشکی",
    unlockReq: "فتح عملیات ۲",
    tiers: [
      {
        level: 1, label: "سطح ۱ — دیده‌بان آسمان", damage: 20, fireRate: 2.0, range: 4.2, dps: 40,
        costDollar: 280, costSteel: 40, powerMW: 12, ammoPerShot: 1,
        polyBudget: "≈ 1.5K tris", scaleBoost: 1, glowIntensity: 0.35,
        visualChanges: ["تک‌توپ ۲۳ م‌م رو به آسمان + لنز لیزر کوچک", "دکل کوتاه + چراغ آبی", "سکوی بتنی سبک"],
        armorNote: "بدنه آلومینیومی سبک",
      },
      {
        level: 2, label: "سطح ۲ — برج رادار", damage: 36, fireRate: 2.4, range: 4.8, dps: 86,
        costDollar: 600, costSteel: 95, powerMW: 20, ammoPerShot: 1,
        polyBudget: "≈ 3.0K tris", scaleBoost: 1.12, glowIntensity: 0.7,
        visualChanges: ["دوتوپ موازی + امیتر لیزر بزرگ‌تر", "دیش رادار چرخان + گنبد سنسور", "کابل‌های برق ضخیم + تابلوی کنترل"],
        armorNote: "پایه تقویت‌شده + محافظ الکترومغناطیسی",
      },
      {
        level: 3, label: "سطح ۳ — نگهبان آسمان", damage: 65, fireRate: 3.0, range: 5.4, dps: 195,
        costDollar: 1250, costSteel: 200, powerMW: 34, ammoPerShot: 2,
        polyBudget: "≈ 5.0K tris", scaleBoost: 1.24, glowIntensity: 1.1,
        visualChanges: ["خوشه ۴ لول + عدسی لیزر یاقوتی", "برج راداری بلند + آنتن‌های آرایه‌ای", "حلقه نور آبی + خنک‌کننده مایع"],
        armorNote: "گنبد کامپوزیتی + سیستم خنک‌کننده فعال",
      },
    ],
  },
  {
    id: "bavar",
    family: 4, familyName: "پدافند و لیزر", isSpecial: true, branch: "A",
    branchTitle: "انشعاب الف — برد بلند",
    name: "سامانه پدافند برد بلند باور",
    nameEn: "Bavar-373 Long-Range Battery",
    tagline: "برد کل نقشه — انهدام دسته‌ای جنگنده‌ها",
    description:
      "افتخار پدافند ملی. ۴ لانچر عمودپرتاب با رادار آرایه فازی که کل آسمان تنگه را پوشش می‌دهد و دسته‌های جنگنده دشمن را یکجا در آسمان منفجر می‌کند.",
    role: "پوشش سراسری (Map-Wide AA)",
    targets: ["air"],
    priority: "Air Priority",
    modelKind: "bavar",
    baseColor: "#2f3d33",
    accentColor: "#4ade80",
    glowColor: "#4ade80",
    ability: "گنبد آسمان",
    abilityDesc: "برد سراسری + شلیک همزمان به ۳ دسته هوایی",
    counters: "اسکادران جنگنده، بمب‌افکن، پهپاد مادر",
    synergy: "قلب دفاع هوایی در عملیات سوپرکریر (باس ۴)",
    unlockReq: "تحقیق «رادارهای آرایه فازی» + عملیات ۱۸",
    tiers: [
      {
        level: 4, label: "سطح ۴ ★ ویژه — باور ۳۷۳", damage: 520, fireRate: 0.4, range: 11.0, dps: 665,
        costDollar: 3400, costSteel: 560, powerMW: 48, ammoPerShot: 6,
        polyBudget: "≈ 9.0K tris", scaleBoost: 1.5, glowIntensity: 1.5,
        visualChanges: ["۴ کنیستر عمودپرتاب + رادار آرایه‌ای غول‌پیکر", "کامیون فرماندهی + دکل ارتباطی", "پنل‌های خورشیدی پشتیبان + نور سبز راداری"],
        armorNote: "لانچرهای زرهی متحرک + استتار جنگلی",
      },
    ],
  },
  {
    id: "laser",
    family: 4, familyName: "پدافند و لیزر", isSpecial: true, branch: "B",
    branchTitle: "انشعاب ب — اشعه مرگ",
    name: "برجک لیزر حرارتی",
    nameEn: "High-Energy Laser Tower",
    tagline: "اشعه پیوسته با آسیب تصاعدی ۱۰۰٪ ← ۵۰۰٪",
    description:
      "کریستال یاقوتی غول‌پیکر که اشعه مرگ می‌تاباند. هر ثانیه که اشعه روی هدف بماند آسیبش تصاعدی بالا می‌رود؛ ناوشکن را در ۵ ثانیه به حوضچه مذاب تبدیل می‌کند. تشنه برق شهر!",
    role: "ذوب‌کننده تک‌هدف (Melter)",
    targets: ["sea", "air"],
    priority: "Strongest",
    modelKind: "laser",
    baseColor: "#4c1d95",
    accentColor: "#e879f9",
    glowColor: "#c026d3",
    ability: "کانون مرگ",
    abilityDesc: "آسیب تصاعدی تا ۵۰۰٪ + ذوب زره (Armor Melt)",
    counters: "ناوشکن زرهی، باس، جنگنده سنگین",
    synergy: "با نیروگاه اتمی: آتش بی‌وقفه بدون افت توان",
    unlockReq: "تحقیق «رادارهای آرایه فازی» + عملیات ۱۸",
    tiers: [
      {
        level: 4, label: "سطح ۴ ★ ویژه — لیزر حرارتی", damage: 90, fireRate: 2.0, range: 5.0, dps: 900,
        costDollar: 3600, costSteel: 600, powerMW: 80, ammoPerShot: 0,
        polyBudget: "≈ 8.8K tris", scaleBoost: 1.48, glowIntensity: 2.0,
        visualChanges: ["کریستال هشت‌وجهی معلق + امیتر سه‌شاخه", "آینه‌های فوکوس چرخان + ستون پلاسما", "لوله‌های خنک‌کننده + میدان انرژی بنفش"],
        armorNote: "محفظه خلأ + سپر مغناطیسی کریستال",
      },
    ],
  },

  // ── خانواده ۵: جنگ الکترونیک ───────────────────────────────
  {
    id: "ew",
    family: 5, familyName: "جنگ الکترونیک", isSpecial: false,
    name: "برجک جنگ الکترونیک",
    nameEn: "EW & Slow Tower",
    tagline: "کندکننده + آشکارساز زیردریایی (سونار)",
    description:
      "چشم و گوش شبکه دفاعی. سرعت دشمنان در شعاعش را کم می‌کند، زیردریایی‌های رادارگریز را آشکار می‌کند و به برجک‌های اطراف دقت می‌دهد. آسیب مستقیم ندارد اما بدون آن، دفاع کور است.",
    role: "پشتیبان (Support) | کندکننده + سونار",
    targets: ["sea", "air", "sub"],
    priority: "Support Aura",
    modelKind: "ew",
    baseColor: "#3b4a5e",
    accentColor: "#38e1c6",
    glowColor: "#38e1c6",
    ability: "پارازیت منطقه‌ای",
    abilityDesc: "کندی ۳۰٪ + آشکارسازی زیردریایی در شعاع",
    counters: "زیردریایی مخفی، موج‌های سریع",
    synergy: "ضرب‌کننده قدرت تمام برجک‌های همسایه",
    unlockReq: "فتح عملیات ۴",
    tiers: [
      {
        level: 1, label: "سطح ۱ — دکل شنود", damage: 4, fireRate: 1.0, range: 3.6, dps: 4,
        costDollar: 300, costSteel: 45, powerMW: 15, ammoPerShot: 0,
        polyBudget: "≈ 1.3K tris", scaleBoost: 1, glowIntensity: 0.4,
        visualChanges: ["دکل مخابراتی + ۲ دیش کوچک", "گنبد سونار ساحلی", "چراغ فیروزه‌ای چشمک‌زن"],
        armorNote: "دکل فولادی سبک",
      },
      {
        level: 2, label: "سطح ۲ — ایستگاه پارازیت", damage: 7, fireRate: 1.2, range: 4.2, dps: 8,
        costDollar: 650, costSteel: 100, powerMW: 26, ammoPerShot: 0,
        polyBudget: "≈ 2.7K tris", scaleBoost: 1.14, glowIntensity: 0.8,
        visualChanges: ["۳ دیش چرخان + آنتن یاگی", "اتاق سرور + ژنراتور پشتیبان", "حلقه پارازیت نمایشی دور دکل"],
        armorNote: "پناهگاه بتنی تجهیزات",
      },
      {
        level: 3, label: "سطح ۳ — دژ طیف", damage: 12, fireRate: 1.5, range: 4.8, dps: 18,
        costDollar: 1300, costSteel: 210, powerMW: 42, ammoPerShot: 0,
        polyBudget: "≈ 4.8K tris", scaleBoost: 1.26, glowIntensity: 1.2,
        visualChanges: ["برج دوقلو + رادوم بزرگ", "آرایه آنتن ۶ تایی + لیزر مخابراتی", "هاله انرژی + نمایشگر وضعیت"],
        armorNote: "برج دوقلوی مقاوم در برابر EMP دشمن",
      },
    ],
  },
  {
    id: "emp",
    family: 5, familyName: "جنگ الکترونیک", isSpecial: true, branch: "A",
    branchTitle: "انشعاب الف — فلج‌کننده",
    name: "دکل پالس الکترومغناطیسی",
    nameEn: "EMP Shock Tower",
    tagline: "کندی ۶۰٪ + از کار انداختن سلاح‌های دشمن",
    description:
      "برج تسلای مرگبار. هر چند ثانیه یک پالس الکترومغناطیسی عظیم شلیک می‌کند که سرعت همه دشمنان را ۶۰٪ کم می‌کند و رادار و سلاح‌های ناوها را از کار می‌اندازد.",
    role: "کنترل میدان (Field Control)",
    targets: ["sea", "air", "sub"],
    priority: "Support Aura",
    modelKind: "emp",
    baseColor: "#1e2a4a",
    accentColor: "#a78bfa",
    glowColor: "#8b5cf6",
    ability: "پالس فراگیر",
    abilityDesc: "کندی ۶۰٪ + غیرفعال‌سازی سلاح دشمن ۴ ثانیه",
    counters: "موج‌های انبوه، ناوشکن ایجس (قطع دفاع نقطه‌ای)",
    synergy: "فعال‌سازی کمبو با MLRS و لیزر: شکارگاه",
    unlockReq: "تحقیق «خازن‌های فوق‌رسانا» + عملیات ۱۶",
    tiers: [
      {
        level: 4, label: "سطح ۴ ★ ویژه — EMP", damage: 40, fireRate: 0.5, range: 4.4, dps: 64,
        costDollar: 2800, costSteel: 480, powerMW: 70, ammoPerShot: 0,
        polyBudget: "≈ 8.2K tris", scaleBoost: 1.52, glowIntensity: 2.0,
        visualChanges: ["کویل تسلای ۱۲ متری + چنبره بالایی", "قوس‌های الکتریکی نمایشی + گوی پلاسما", "۴ میله اتصال زمین + بانک خازن"],
        armorNote: "عایق سرامیکی + قفس فارادی داخلی",
      },
    ],
  },
  {
    id: "sonar",
    family: 5, familyName: "جنگ الکترونیک", isSpecial: true, branch: "B",
    branchTitle: "انشعاب ب — هکر",
    name: "مرکز جنگ سایبری و سونار",
    nameEn: "Cyber-Sonar Hub",
    tagline: "هک پهپادهای دشمن + آشکارسازی کامل زیردریایی‌ها",
    description:
      "مغز متفکر جنگ الکترونیک. تمام زیردریایی‌های نامرئی را آشکار می‌کند و پهپادهای دشمن را هک می‌کند تا برگردند و به ناوهای خودشان حمله کنند!",
    role: "ضد مخفی‌کاری (Anti-Stealth) + هک",
    targets: ["sea", "air", "sub"],
    priority: "Support Aura",
    modelKind: "sonar",
    baseColor: "#0f2e2a",
    accentColor: "#4ade80",
    glowColor: "#22ff88",
    ability: "تسخیر سایبری",
    abilityDesc: "هک ۱ پهپاد هر ۱۲ ثانیه + سونار سراسری",
    counters: "زیردریایی لویاتان، ازدحام پهپاد",
    synergy: "ضروری برای عملیات باس ۲ (زیردریایی اتمی)",
    unlockReq: "تحقیق «خازن‌های فوق‌رسانا» + عملیات ۱۶",
    tiers: [
      {
        level: 4, label: "سطح ۴ ★ ویژه — سایبرسونار", damage: 25, fireRate: 1.0, range: 6.5, dps: 80,
        costDollar: 3000, costSteel: 500, powerMW: 60, ammoPerShot: 0,
        polyBudget: "≈ 8.6K tris", scaleBoost: 1.45, glowIntensity: 1.8,
        visualChanges: ["گنبد هولوگرافیک + دیش ماهواره‌ای بزرگ", "رک‌های سرور با LED سبز + لیزر اسکن", "حلقه‌های سونار شناور + هولوگرام نقشه"],
        armorNote: "مرکز فرماندهی زیرزمینی + دکل ضدضربه",
      },
    ],
  },

  // ── خانواده ۶: آشیانه قایق ─────────────────────────────────
  {
    id: "garrison",
    family: 6, familyName: "آشیانه قایق‌های رهگیر", isSpecial: false,
    name: "آشیانه قایق‌های رهگیر",
    nameEn: "Fast Boat Garrison",
    tagline: "سد زنده وسط کانال — متوقف‌کننده ناوها (Block)",
    description:
      "پادگان شناور که ۳ قایق تندرو مسلح به وسط کانال می‌فرستد. قایق‌ها جلوی ناوهای دشمن سبز می‌شوند، حرکتشان را متوقف می‌کنند و به برجک‌های ساحلی فرصت شکار می‌دهند.",
    role: "سدکننده مسیر (Blocker / Barracks)",
    targets: ["sea", "sub"],
    priority: "Block Closest",
    modelKind: "garrison",
    baseColor: "#4a5d68",
    accentColor: "#f5b942",
    glowColor: "#fbbf24",
    ability: "اعزام رهگیر",
    abilityDesc: "۳ قایق رهگیر با مسلسل و توان سد مسیر",
    counters: "ستون‌های سریع، قایق‌های دشمن",
    synergy: "تنگناساز متحرک جلوی توپخانه سنگین",
    unlockReq: "فتح عملیات ۵",
    tiers: [
      {
        level: 1, label: "سطح ۱ — اسکله گشتی", damage: 15, fireRate: 1.5, range: 2.8, dps: 68,
        costDollar: 350, costSteel: 50, powerMW: 6, ammoPerShot: 1,
        polyBudget: "≈ 1.8K tris", scaleBoost: 1, glowIntensity: 0.25,
        visualChanges: ["اسکله چوبی + سوله کوچک", "۲ قایق بادی مسلح", "چراغ دریایی ساده"],
        armorNote: "اسکله چوبی بدون حفاظت",
      },
      {
        level: 2, label: "سطح ۲ — پایگاه ساحلی", damage: 27, fireRate: 1.8, range: 3.1, dps: 146,
        costDollar: 750, costSteel: 120, powerMW: 10, ammoPerShot: 1,
        polyBudget: "≈ 3.4K tris", scaleBoost: 1.1, glowIntensity: 0.5,
        visualChanges: ["اسکله بتنی + آشیانه فلزی", "۳ قایق تندرو خاکستری + مسلسل", "جرثقیل بارگیری + مخزن سوخت"],
        armorNote: "آشیانه فلزی + کیسه‌شن",
      },
      {
        level: 3, label: "سطح ۳ — ناوگان تندرو", damage: 48, fireRate: 2.2, range: 3.4, dps: 317,
        costDollar: 1500, costSteel: 240, powerMW: 16, ammoPerShot: 2,
        polyBudget: "≈ 5.4K tris", scaleBoost: 1.2, glowIntensity: 0.85,
        visualChanges: ["بندر بتنی دواسکله + برج مراقبت", "۳ قایق زرهی + راکت‌انداز", "رادار ساحلی + پروژکتور"],
        armorNote: "قایق‌های زرهی + برج مراقبت بتنی",
      },
    ],
  },
  {
    id: "torpedo",
    family: 6, familyName: "آشیانه قایق‌های رهگیر", isSpecial: true, branch: "A",
    branchTitle: "انشعاب الف — گرگ‌های دریا",
    name: "اسکادران قایق‌های عاشورا",
    nameEn: "Ashura Torpedo Swarm Base",
    tagline: "۵ قایق اژدرافکن که ناوها را میخکوب می‌کنند",
    description:
      "گله گرگ‌های دریا. ۵ قایق فوق‌سریع عاشورا با اژدرهای حوت که ناوهای دشمن را محاصره کرده، در همان نقطه میخکوب می‌کنند و بدنه‌شان را سوراخ‌سوراخ می‌کنند.",
    role: "شکارچی ناو (Ship Hunter)",
    targets: ["sea"],
    priority: "Block Strongest",
    modelKind: "torpedo",
    baseColor: "#333d29",
    accentColor: "#ff5c39",
    glowColor: "#ff5c39",
    ability: "حلقه محاصره",
    abilityDesc: "۵ قایق + میخکوب کامل ۱ ناو سنگین",
    counters: "ناوشکن، رزم‌ناو، باس سطحی",
    synergy: "میخکوب باس زیر آتش فتاح و لیزر",
    unlockReq: "تحقیق «پهپادهای مهندسی» + عملیات ۲۰",
    tiers: [
      {
        level: 4, label: "سطح ۴ ★ ویژه — عاشورا", damage: 120, fireRate: 0.9, range: 3.8, dps: 540,
        costDollar: 2600, costSteel: 440, powerMW: 20, ammoPerShot: 5,
        polyBudget: "≈ 9.4K tris", scaleBoost: 1.35, glowIntensity: 1.0,
        visualChanges: ["پایگاه ۵ فروندی + رمپ پرتاب", "قایق‌های استتاری با لانچر اژدر دوقلو", "برج فرماندهی + دکل پرچم + بشکه‌های سوخت"],
        armorNote: "قایق‌های کامپوزیتی رادارگریز",
      },
    ],
  },
  {
    id: "mine",
    family: 6, familyName: "آشیانه قایق‌های رهگیر", isSpecial: true, branch: "B",
    branchTitle: "انشعاب ب — شکارچی خاموش",
    name: "پایگاه زیردریایی غدیر و مین‌ریز",
    nameEn: "Ghadir Minefield & Sub Bay",
    tagline: "مین‌گذاری خودکار مسیر + زیردریایی شکارچی باس",
    description:
      "مرگ خاموش تنگه. مین‌های مغناطیسی به‌صورت خودکار روی مسیر دشمن کاشته می‌شوند و یک زیردریایی کلاس غدیر از اعماق، غول‌آخرها را با اژدر سنگین شکار می‌کند.",
    role: "تله‌گذاری (Trapper) + ضد باس زیرسطحی",
    targets: ["sea", "sub"],
    priority: "Auto-Trap + Strongest",
    modelKind: "mine",
    baseColor: "#1f2937",
    accentColor: "#38e1c6",
    glowColor: "#22d3ee",
    ability: "میدان مین هوشمند",
    abilityDesc: "۱۰ مین مغناطیسی + ۱ زیردریایی شکارچی",
    counters: "باس‌های سطحی، کاروان‌های سنگین",
    synergy: "مین + EMP: کشتارگاه کانال میانی",
    unlockReq: "تحقیق «پهپادهای مهندسی» + عملیات ۲۰",
    tiers: [
      {
        level: 4, label: "سطح ۴ ★ ویژه — غدیر", damage: 300, fireRate: 0.35, range: 4.5, dps: 525,
        costDollar: 2800, costSteel: 470, powerMW: 24, ammoPerShot: 4,
        polyBudget: "≈ 9.8K tris", scaleBoost: 1.38, glowIntensity: 1.3,
        visualChanges: ["حوضچه زیردریایی + مین‌های شناور مغناطیسی", "زیردریایی غدیر با برجک + پریسکوپ", "بویه‌های هشدار + جرثقیل مین‌گذار"],
        armorNote: "حوضچه بتنی ضدبمب + بدنه دولایه زیردریایی",
      },
    ],
  },
];

export const FAMILIES = [1, 2, 3, 4, 5, 6].map((f) => ({
  num: f,
  name: TOWERS.find((t) => t.family === f && !t.isSpecial)!.familyName,
  basic: TOWERS.find((t) => t.family === f && !t.isSpecial)!,
  specials: TOWERS.filter((t) => t.family === f && t.isSpecial),
}));

export function formatNum(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US");
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}
