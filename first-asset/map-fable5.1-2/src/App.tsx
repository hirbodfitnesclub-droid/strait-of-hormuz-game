import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Coins, Fuel, Flame, Package, Rocket, Zap, Smile, Heart, Waves, Layers, Sun, Moon, CloudRain, Wind,
  Grid3x3, Compass, Play, Plus, Minus, X, ShieldCheck, Factory, Building2, Cpu, Lock, Swords, Anchor,
  Ship, Plane, Info, Sparkles, Map as MapIcon, ChevronUp, Globe, Flag, Gauge, Clapperboard, Loader2,
} from 'lucide-react';
import { HormuzMap, type LayerState, type SlotInfo, type SlotCounts, type ZoomTier, type Weather, type SaveData } from './three/mapEngine';
import { ZONES, towerById, CITY_BUILDS, type TowerDef } from './three/world';
import { RadialMenu, TargetBadges, TOWER_ICONS, PRIORITIES, fa, faK, upgradeCost, SPECIAL_COST } from './ui/RadialMenu';

const SAVE_KEY = 'hormuz-map-v2';
interface Res { dollars: number; oil: number; fuel: number; steel: number; ammo: number; }
interface Toast { id: number; text: string; kind: 'ok' | 'err' | 'info' | 'gold' }
const ZONE_ICONS: Record<string, typeof Globe> = { overview: Globe, bandar: Factory, hormuz: ShieldCheck, qeshm: Waves, midsea: Fuel, tunbs: Flag, kish: Building2 };
const TIERS: { id: ZoomTier; fa: string }[] = [{ id: 'strategic', fa: 'راهبردی' }, { id: 'tactical', fa: 'تاکتیکی' }, { id: 'close', fa: 'نزدیک' }];
const TIPS = ['با دو انگشت بچرخانید و زوم کنید', 'روی حلقه‌های آبی برجک دفاعی بسازید', 'سکوهای نفتی فقط در بلوک‌های نارنجی دریا ساخته می‌شوند', 'مناطق قفل را با دلار نفتی آزاد کنید', 'در شب، نور شهرهای خلیج فارس دیدنی است'];
const LAYER_ROWS: { key: keyof LayerState; fa: string; icon: typeof Waves }[] = [
  { key: 'enemyPath', fa: 'مسیرهای تهاجم دشمن', icon: Swords }, { key: 'fleet', fa: 'ناوگان دشمن', icon: Ship },
  { key: 'tradePath', fa: 'کریدور تجاری (TSS)', icon: Anchor }, { key: 'air', fa: 'هواگردها و پرندگان', icon: Plane },
  { key: 'defense', fa: 'مواضع دفاعی', icon: ShieldCheck }, { key: 'oil', fa: 'بلوک‌های نفتی', icon: Fuel },
  { key: 'city', fa: 'زمین‌های توسعه', icon: Factory }, { key: 'labels', fa: 'برچسب‌ها', icon: Info },
];

function loadSave(): (SaveData & { res?: Res; pri?: Record<string, number> }) | null {
  try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}

export default function App() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const mmRef = useRef<HTMLCanvasElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const eng = useRef<HormuzMap | null>(null);
  const tourRef = useRef<number | null>(null);
  const toastId = useRef(0);
  const initialSave = useRef(loadSave());

  const [load, setLoad] = useState({ p: 0, msg: 'آماده‌سازی…' });
  const [ready, setReady] = useState(false);
  const [intro, setIntro] = useState(true);
  const [tip, setTip] = useState(0);
  const [sel, setSel] = useState<SlotInfo | null>(null);
  const [cam, setCam] = useState<{ tier: ZoomTier; dist: number; yaw: number }>({ tier: 'strategic', dist: 400, yaw: 0 });
  const [counts, setCounts] = useState<SlotCounts>({});
  const [layers, setLayers] = useState<LayerState>({ enemyPath: true, tradePath: true, defense: true, oil: true, city: true, labels: true, fleet: true, air: true });
  const [timeH, setTimeH] = useState(9.5);
  const [auto, setAuto] = useState(false);
  const [weather, setWeather] = useState<Weather>('clear');
  const [tactical, setTactical] = useState(false);
  const [quality, setQuality] = useState<'high' | 'low'>('high');
  const [speed, setSpeed] = useState(1);
  const [sheet, setSheet] = useState<null | 'layers' | 'env'>(null);
  const [unlock, setUnlock] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [touring, setTouring] = useState(false);
  const [mmBig, setMmBig] = useState(false);
  const [activeZone, setActiveZone] = useState('overview');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [res, setRes] = useState<Res>(initialSave.current?.res ?? { dollars: 14500000, oil: 4200, fuel: 1100, steel: 850, ammo: 3200 });
  const [pri, setPri] = useState<Record<string, number>>(initialSave.current?.pri ?? {});
  const resRef = useRef(res); resRef.current = res;

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++toastId.current;
    setToasts((p) => [...p.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 2800);
  }, []);
  const haptic = (ms = 12) => { if (navigator.vibrate) navigator.vibrate(ms); };

  const stopTour = useCallback(() => {
    if (tourRef.current) { clearInterval(tourRef.current); tourRef.current = null; }
    setTouring(false);
  }, []);

  // ---------- موتور ----------
  useEffect(() => {
    if (!sceneRef.current || !overlayRef.current || !mmRef.current) return;
    const e = new HormuzMap(sceneRef.current, overlayRef.current, mmRef.current, {
      onSelect: (s) => { setSel(s); setInfoOpen(false); },
      onCamera: (tier, dist, yaw) => setCam({ tier, dist, yaw }),
      onCounts: (c) => setCounts(c),
      onLockTap: (z) => setUnlock(z),
      onInteract: () => stopTour(),
    });
    eng.current = e;
    (window as unknown as { __map: HormuzMap }).__map = e;
    e.attract = true;
    let cancelled = false;
    const t = window.setTimeout(() => {
      e.init((p, msg) => { if (!cancelled) setLoad({ p, msg }); }, initialSave.current).then(() => {
        if (cancelled) return;
        e.setAnchor(anchorRef.current);
        setReady(true);
      });
    }, 60);
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') e.select(null); };
    window.addEventListener('keydown', onKey);
    return () => { cancelled = true; clearTimeout(t); window.removeEventListener('keydown', onKey); e.dispose(); eng.current = null; };
  }, [stopTour]);

  useEffect(() => { if (ready) eng.current?.setAnchor(anchorRef.current); }, [sel, ready]);
  useEffect(() => { const iv = setInterval(() => setTip((x) => (x + 1) % TIPS.length), 2200); return () => clearInterval(iv); }, []);

  // ذخیره خودکار
  const persist = useCallback(() => {
    const e = eng.current; if (!e) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...e.getSave(), res: resRef.current, pri })); } catch { /* */ }
  }, [pri]);
  useEffect(() => { if (!ready) return; const iv = setInterval(persist, 4000); return () => clearInterval(iv); }, [ready, persist]);

  // درآمد نمایشی
  useEffect(() => {
    const iv = setInterval(() => {
      const rigs = counts['kind:oil']?.built ?? 0;
      setRes((r) => ({ ...r, dollars: r.dollars + (1500 + rigs * 400) * speed, oil: r.oil + (10 + rigs * 10) * speed, steel: r.steel + 3 * speed, fuel: r.fuel + 2 * speed, ammo: r.ammo + 4 * speed }));
    }, 1000);
    return () => clearInterval(iv);
  }, [counts, speed]);

  useEffect(() => {
    if (!auto) return;
    const iv = setInterval(() => { const t = eng.current?.getTime(); if (t !== undefined) setTimeH(t); }, 500);
    return () => clearInterval(iv);
  }, [auto]);

  // ---------- اکشن‌ها ----------
  const spend = (d: number, s = 0) => {
    const r = resRef.current;
    if (r.dollars < d || r.steel < s) { toast('منابع کافی نیست', 'err'); haptic(40); return false; }
    const n = { ...r, dollars: r.dollars - d, steel: r.steel - s };
    resRef.current = n; setRes(n); return true;
  };
  const enter = () => { setIntro(false); if (eng.current) eng.current.attract = false; haptic(); };
  const flyZone = (id: string) => {
    stopTour(); setActiveZone(id);
    if (eng.current) { eng.current.attract = false; eng.current.select(null); eng.current.flyToZone(id); }
  };
  const startTour = () => {
    enter(); stopTour();
    const order = ['bandar', 'hormuz', 'qeshm', 'tunbs', 'midsea', 'kish', 'overview'];
    let i = 0; setTouring(true);
    const step = () => { const z = order[i % order.length]; setActiveZone(z); eng.current?.flyToZone(z); i++; };
    step(); tourRef.current = window.setInterval(step, 5200);
  };
  const buildTower = (t: TowerDef) => {
    if (!sel || !spend(t.cost, t.steel)) return;
    if (eng.current?.build(sel.id, t.id)) { toast(`${t.fa} مستقر شد`, 'ok'); haptic(20); }
  };
  const buildRig = () => { if (!sel || !spend(100)) return; if (eng.current?.build(sel.id, 'rig')) { toast('سکوی نفتی آغاز به استخراج کرد', 'ok'); haptic(20); } };
  const buildCity = (id: string, name: string, cost: number) => { if (!sel || !spend(cost)) return; if (eng.current?.build(sel.id, id)) { toast(`${name} ساخته شد`, 'ok'); haptic(20); } };
  const upgrade = () => { if (!sel || !spend(upgradeCost(sel.level), 15)) return; if (eng.current?.upgrade(sel.id)) { toast(`ارتقا به سطح ${fa(sel.level + 1)}`, 'gold'); haptic(25); } };
  const special = (b: 'A' | 'B') => {
    if (!sel) return; const tw = towerById(sel.buildId ?? '');
    if (!spend(SPECIAL_COST, 60)) return;
    if (eng.current?.specialize(sel.id, b)) { toast(`برج ویژه «${b === 'A' ? tw?.specialA : tw?.specialB}» فعال شد`, 'gold'); haptic(35); }
  };
  const sell = () => {
    if (!sel) return;
    const tw = towerById(sel.buildId ?? '');
    const refund = Math.round((tw?.cost ?? 100) * 0.7);
    if (eng.current?.demolish(sel.id)) { setRes((r) => ({ ...r, dollars: r.dollars + refund })); toast(`+${faK(refund)} دلار بازگشت`, 'info'); }
  };
  const cyclePri = () => { if (!sel) return; setPri((p) => ({ ...p, [sel.id]: ((p[sel.id] ?? 0) + 1) % 4 })); haptic(8); };
  const doUnlock = () => {
    const z = ZONES.find((zz) => zz.id === unlock);
    if (!z || !z.cost) return;
    if (!spend(z.cost)) return;
    eng.current?.unlockZone(z.id); setUnlock(null); setActiveZone(z.id);
    toast(`منطقه «${z.fa}» آزاد شد!`, 'gold'); haptic(60);
    setTimeout(persist, 1200);
  };
  const toggleLayer = (k: keyof LayerState) => setLayers((p) => { const n = { ...p, [k]: !p[k] }; eng.current?.setLayers(n); return n; });
  const changeTime = (h: number) => { setTimeH(h); eng.current?.setTimeOfDay(h); };
  const isDay = timeH > 6.2 && timeH < 18.3;
  const mmClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    stopTour(); eng.current?.minimapClick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };

  const selTower = sel?.buildId ? towerById(sel.buildId) : null;
  const zoneOf = (id: string) => ZONES.find((z) => z.id === id);
  const unlockZone = unlock ? zoneOf(unlock) : null;
  const clock = `${fa(Math.floor(timeH)).padStart(2, '۰')}:${fa(Math.floor((timeH % 1) * 60)).padStart(2, '۰')}`;

  return (
    <div dir="rtl" className="app-root">
      <div ref={sceneRef} className="absolute inset-0" />
      <div ref={overlayRef} className="overlay-root" />
      <div className="vignette" />

      {/* منوی رادیال */}
      <div ref={anchorRef} className="radial-anchor">
        {sel && ready && (
          <RadialMenu key={`${sel.id}-${sel.occupied}-${sel.level}`} sel={sel} dollars={res.dollars} steel={res.steel} priority={pri[sel.id] ?? 0}
            onTower={buildTower} onRig={buildRig} onCity={buildCity} onUpgrade={upgrade} onSpecial={special}
            onSell={sell} onPriority={cyclePri} onInfo={() => setInfoOpen((v) => !v)} onClose={() => eng.current?.select(null)} />
        )}
      </div>

      {/* ============ HUD بالا ============ */}
      <header className={`hud-top ${intro ? 'hud-hidden-top' : ''}`}>
        <div className="flex items-center gap-1.5">
          <div className="commander">
            <div className="commander-ring"><Anchor size={18} /></div>
            <div className="commander-lvl">{fa(27)}</div>
          </div>
          <div className="res-row no-scrollbar">
            <ResPill icon={<Coins size={13} />} c="#fbbf24" v={faK(res.dollars)} />
            <ResPill icon={<Fuel size={13} />} c="#e5e7eb" v={faK(res.oil)} />
            <ResPill icon={<Flame size={13} />} c="#fb923c" v={faK(res.fuel)} />
            <ResPill icon={<Package size={13} />} c="#7dd3fc" v={faK(res.steel)} />
            <ResPill icon={<Rocket size={13} />} c="#fda4af" v={faK(res.ammo)} />
          </div>
        </div>
        <div className="status-row no-scrollbar">
          <div className="speed-toggle">
            {[1, 2, 3].map((s) => (
              <button key={s} className={speed === s ? 'on' : ''} onClick={() => { setSpeed(s); eng.current?.setTimeScale(s); haptic(6); }}>{fa(s)}x</button>
            ))}
          </div>
          <Chip icon={<Zap size={12} />} c="#fde047">+{fa(45)} MW</Chip>
          <Chip icon={<Smile size={12} />} c="#86efac">{fa(92)}٪</Chip>
          <Chip icon={<Heart size={12} />} c="#fb7185">{fa(20)}/{fa(20)}</Chip>
          <Chip icon={<Waves size={12} />} c="#67e8f9">موج {fa(14)}/{fa(25)}</Chip>
          <Chip icon={isDay ? <Sun size={12} /> : <Moon size={12} />} c="#fcd34d">{clock}</Chip>
        </div>
      </header>

      {/* ============ ریل راست ============ */}
      {!intro && (
        <div className="rail rail-right">
          <RailBtn active={sheet === 'layers'} onClick={() => setSheet(sheet === 'layers' ? null : 'layers')} label="لایه‌ها"><Layers size={20} /></RailBtn>
          <RailBtn active={sheet === 'env'} onClick={() => setSheet(sheet === 'env' ? null : 'env')} label="محیط">
            {weather === 'storm' ? <CloudRain size={20} /> : weather === 'dust' ? <Wind size={20} /> : isDay ? <Sun size={20} /> : <Moon size={20} />}
          </RailBtn>
          <RailBtn active={tactical} onClick={() => { setTactical(!tactical); eng.current?.setTactical(!tactical); haptic(8); }} label="تاکتیکی"><Grid3x3 size={20} /></RailBtn>
          <RailBtn onClick={() => eng.current?.resetNorth()} label="شمال">
            <Compass size={20} style={{ transform: `rotate(${(-cam.yaw * 180) / Math.PI}deg)`, transition: 'transform .2s' }} />
          </RailBtn>
          <RailBtn active={touring} onClick={() => (touring ? stopTour() : startTour())} label="سینمایی"><Clapperboard size={20} /></RailBtn>
        </div>
      )}

      {/* ============ ریل چپ: مینی‌مپ + زوم ============ */}
      {(
        <div className={`rail rail-left ${intro ? 'rail-hidden' : ''}`}>
          <div className={`minimap ${mmBig ? 'big' : ''}`}>
            <canvas ref={mmRef} width={330} height={240} onClick={mmClick} />
            <button className="mm-toggle" onClick={() => setMmBig(!mmBig)}><MapIcon size={12} /></button>
          </div>
          <div className="zoom-ctl">
            <button onClick={() => eng.current?.zoomBy(0.6)}><Plus size={18} strokeWidth={3} /></button>
            <div className="tiers">
              {[...TIERS].reverse().map((t) => (
                <button key={t.id} className={cam.tier === t.id ? 'on' : ''} onClick={() => eng.current?.flyToTier(t.id)}>
                  <span className="dot" /><span className="tl">{t.fa}</span>
                </button>
              ))}
            </div>
            <button onClick={() => eng.current?.zoomBy(1.6)}><Minus size={18} strokeWidth={3} /></button>
          </div>
        </div>
      )}

      {/* ============ پایین ============ */}
      {!intro && (
        <div className="bottom-stack">
          {sel ? (
            <SlotCard sel={sel} tower={selTower ?? null} pri={pri[sel.id] ?? 0} info={infoOpen} zoneFa={zoneOf(sel.zone)?.fa ?? ''} onClose={() => eng.current?.select(null)} />
          ) : (
            <div className="zone-dock no-scrollbar">
              {ZONES.map((z) => {
                const I = ZONE_ICONS[z.id] ?? Globe;
                const c = counts[z.id];
                const locked = !!z.locked && (eng.current?.isLocked(z.id) ?? true);
                return (
                  <button key={z.id} className={`zone-card ${activeZone === z.id ? 'on' : ''} ${locked ? 'locked' : ''}`} style={{ ['--zc' as string]: z.color }}
                    onClick={() => (locked ? (flyZone(z.id), setUnlock(z.id)) : flyZone(z.id))}>
                    <span className="zc-ico">{locked ? <Lock size={16} /> : <I size={16} />}</span>
                    <span className="zc-body">
                      <b>{z.fa}</b>
                      <small>{locked ? `🔒 ${faK(z.cost ?? 0)}` : z.id === 'overview' ? z.desc : `${z.prd} • ${fa(c?.built ?? 0)}/${fa(c?.total ?? 0)}`}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <nav className="tabbar">
            {[{ fa: 'اقتصاد نفت', i: Fuel }, { fa: 'برجک‌ها', i: ShieldCheck }, { fa: 'شهرسازی', i: Building2 }, { fa: 'فناوری', i: Cpu }].map(({ fa: f, i: I }, k) => (
              <button key={f} className={k === 1 ? 'on' : ''} onClick={() => toast(`پنل «${f}» بخشی از گیم‌پلی است — اینجا فقط نقشه است`, 'info')}>
                <I size={19} /><span>{f}</span>
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* ============ شیت‌ها ============ */}
      {sheet && (
        <div className="sheet-back" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" />
            {sheet === 'layers' ? (
              <>
                <h3><Layers size={16} /> لایه‌های نقشه</h3>
                <div className="grid grid-cols-2 gap-1.5">
                  {LAYER_ROWS.map(({ key, fa: f, icon: I }) => (
                    <button key={key} onClick={() => toggleLayer(key)} className={`layer-btn ${layers[key] ? 'on' : ''}`}><I size={16} /><span>{f}</span></button>
                  ))}
                </div>
                <div className="mt-3 rounded-xl bg-white/5 p-2.5 text-[11px] leading-6 text-slate-300">
                  <div className="flex items-center gap-2"><i className="lg lg-red" /> مسیر تهاجم شرقی — گلوگاه قشم/لارک</div>
                  <div className="flex items-center gap-2"><i className="lg lg-orange" /> مسیر تهاجم غربی — تنب‌ها و خور خوران</div>
                  <div className="flex items-center gap-2"><i className="lg lg-cyan" /> طرح جداسازی تردد (ورودی/خروجی)</div>
                </div>
              </>
            ) : (
              <>
                <h3>{isDay ? <Sun size={16} /> : <Moon size={16} />} زمان و آب‌وهوا <span className="mr-auto font-mono text-amber-200">{clock}</span></h3>
                <input type="range" min={0} max={24} step={0.1} value={timeH} onChange={(e) => changeTime(Number(e.target.value))} className="time-slider" dir="ltr" />
                <div className="mt-2 grid grid-cols-5 gap-1.5">
                  {[{ h: 6.2, f: 'طلوع' }, { h: 10, f: 'روز' }, { h: 17.6, f: 'غروب' }, { h: 22, f: 'شب' }].map((x) => (
                    <button key={x.f} className="env-btn" onClick={() => changeTime(x.h)}>{x.f}</button>
                  ))}
                  <button className={`env-btn ${auto ? 'on' : ''}`} onClick={() => { setAuto(!auto); eng.current?.setAutoCycle(!auto); }}>{auto ? 'توقف' : 'خودکار'}</button>
                </div>
                <h4>آب‌وهوا</h4>
                <div className="grid grid-cols-3 gap-1.5">
                  {([['clear', 'صاف', Sun], ['storm', 'طوفان مونسون', CloudRain], ['dust', 'طوفان شن', Wind]] as const).map(([w, f, I]) => (
                    <button key={w} className={`env-btn big ${weather === w ? 'on' : ''}`} onClick={() => { setWeather(w); eng.current?.setWeather(w); }}><I size={18} />{f}</button>
                  ))}
                </div>
                <h4>کیفیت گرافیک</h4>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['high', 'low'] as const).map((q) => (
                    <button key={q} className={`env-btn big ${quality === q ? 'on' : ''}`} onClick={() => { setQuality(q); eng.current?.setQuality(q); }}>
                      {q === 'high' ? <Sparkles size={16} /> : <Gauge size={16} />}{q === 'high' ? 'سینمایی (Bloom + سایه)' : 'باتری‌دوست'}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ============ مودال آزادسازی ============ */}
      {unlockZone && (
        <div className="modal-back" onClick={() => setUnlock(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ ['--zc' as string]: unlockZone.color }}>
            <div className="modal-ico"><Lock size={30} /></div>
            <span className="modal-tag">{unlockZone.prd}</span>
            <h2>{unlockZone.fa}</h2>
            <p>{unlockZone.desc} — با آزادسازی این منطقه، مه جنگ کنار می‌رود و {fa(counts[unlockZone.id]?.total ?? 0)} جایگاه ساخت (برجک، سکو و تاسیسات) فعال می‌شود.</p>
            <div className="modal-cost"><Coins size={18} /> {faK(unlockZone.cost ?? 0)} <small>دلار نفتی</small></div>
            <div className="flex gap-2">
              <button className="btn-gold flex-1" onClick={doUnlock}>امضای فرمان آزادسازی</button>
              <button className="btn-ghost" onClick={() => setUnlock(null)}><X size={18} /></button>
            </div>
          </div>
        </div>
      )}

      {/* ============ توست ============ */}
      <div className="toasts">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>

      {/* ============ اسپلش ============ */}
      {ready && intro && (
        <div className="splash">
          <div className="splash-top">
            <div className="splash-emblem"><Anchor size={34} /></div>
            <h1>تنگه هرمز</h1>
            <h2>فرمانروایی آب‌های آزاد</h2>
            <div className="splash-tag">STRAIT OF HORMUZ • SOVEREIGN OF THE HIGH SEAS</div>
          </div>
          <div className="splash-bottom">
            <div className="splash-feats">
              <span><ShieldCheck size={13} /> {fa(counts['kind:defense']?.total ?? 0)} موضع دفاعی</span>
              <span><Fuel size={13} /> {fa(counts['kind:oil']?.total ?? 0)} بلوک نفتی</span>
              <span><Swords size={13} /> ۲ مسیر تهاجم</span>
              <span><Lock size={13} /> ۲ منطقه قفل</span>
            </div>
            <button className="btn-gold big" onClick={enter}><Play size={20} fill="currentColor" /> ورود به اتاق جنگ</button>
            <button className="btn-ghost wide" onClick={startTour}><Clapperboard size={17} /> تور سینمایی تنگه</button>
            <p className="splash-hint"><ChevronUp size={12} /> پن با یک انگشت • پینچ و چرخش با دو انگشت • دوبار ضربه برای زوم</p>
          </div>
        </div>
      )}

      {/* ============ لودینگ ============ */}
      {!ready && (
        <div className="loading">
          <div className="loading-emblem"><Anchor size={40} /><div className="loading-orbit" /></div>
          <h1>تنگه هرمز</h1>
          <p className="loading-msg"><Loader2 size={14} className="animate-spin" /> {load.msg}</p>
          <div className="loading-bar"><div style={{ width: `${Math.round(load.p * 100)}%` }} /></div>
          <span className="loading-pct">{fa(Math.round(load.p * 100))}٪</span>
          <p className="loading-tip">💡 {TIPS[tip]}</p>
        </div>
      )}
    </div>
  );
}

// ================= اجزای کوچک =================
function ResPill({ icon, v, c, plus }: { icon: React.ReactNode; v: string; c: string; plus?: boolean }) {
  return (
    <div className="res-pill" style={{ ['--c' as string]: c }}>
      <span className="rp-ico">{icon}</span>
      <span className="rp-v">{v}</span>
      {plus && <span className="rp-plus">+</span>}
    </div>
  );
}
function Chip({ icon, c, children }: { icon: React.ReactNode; c: string; children: React.ReactNode }) {
  return <div className="chip" style={{ ['--c' as string]: c }}>{icon}<span>{children}</span></div>;
}
function RailBtn({ children, onClick, active, label }: { children: React.ReactNode; onClick: () => void; active?: boolean; label: string }) {
  return (
    <button className={`rail-btn ${active ? 'on' : ''}`} onClick={onClick} aria-label={label}>
      {children}<span>{label}</span>
    </button>
  );
}
function SlotCard({ sel, tower, pri, info, zoneFa, onClose }: { sel: SlotInfo; tower: TowerDef | null; pri: number; info: boolean; zoneFa: string; onClose: () => void }) {
  const kindFa = sel.kind === 'defense' ? 'موضع دفاعی' : sel.kind === 'oil' ? 'بلوک حفاری دریایی' : 'زمین توسعه';
  const I = tower ? TOWER_ICONS[tower.id] : sel.kind === 'defense' ? ShieldCheck : sel.kind === 'oil' ? Fuel : Factory;
  const cityName = sel.buildId ? CITY_BUILDS.find((c) => c.id === sel.buildId)?.fa : null;
  const col = tower?.color ?? (sel.kind === 'defense' ? '#2ee6ff' : sel.kind === 'oil' ? '#ffb020' : '#b99bff');
  return (
    <div className="slot-card" style={{ ['--sc' as string]: col }}>
      <div className="flex items-center gap-2.5">
        <div className="sc-ico"><I size={22} /></div>
        <div className="min-w-0 flex-1">
          <div className="sc-title">{tower ? tower.fa : sel.kind === 'oil' && sel.occupied ? 'سکوی نفتی فعال' : cityName ?? sel.name}</div>
          <div className="sc-sub">{sel.name} • {zoneFa} • {kindFa}</div>
        </div>
        <button className="sc-x" onClick={onClose}><X size={16} /></button>
      </div>
      {sel.kind === 'defense' && !sel.occupied && <div className="sc-hint">یکی از ۶ خانواده برجک را از حلقه انتخاب کنید — دایره سبز برد پایه را نشان می‌دهد</div>}
      {tower && (
        <div className="sc-stats">
          <span className="lvl">{[1, 2, 3, 4].map((l) => <i key={l} className={l <= sel.level ? (l === 4 ? 'gold' : 'on') : ''} />)}</span>
          <TargetBadges t={tower} />
          <span className="sc-chip">برد {fa(Math.round(tower.range * (1 + (sel.level - 1) * 0.12)))}</span>
          <span className="sc-chip">هدف: {PRIORITIES[pri]}</span>
          {sel.branch && <span className="sc-chip gold">{sel.branch === 'A' ? tower.specialA : tower.specialB}</span>}
        </div>
      )}
      {info && tower && (
        <div className="sc-info">
          {tower.desc} • انشعاب‌های سطح ۴: <b>{tower.specialA}</b> یا <b>{tower.specialB}</b>
          {sel.level < 3 && <> • هزینه ارتقا: {faK(upgradeCost(sel.level))} دلار + {fa(15)} فولاد</>}
        </div>
      )}
      {info && !tower && sel.occupied && (
        <div className="sc-info">{sel.kind === 'oil' ? 'تولید پایه ۱۰ بشکه در ثانیه • خط لوله زیردریایی به نزدیک‌ترین پایانه متصل شد' : sel.key ? 'تاسیسات کلیدی ملی — قابل تخریب نیست' : 'تاسیسات در حال بهره‌برداری'}</div>
      )}
    </div>
  );
}
