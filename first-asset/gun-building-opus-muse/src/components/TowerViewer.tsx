import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2, Pause, Play, RotateCw, Skull, Sparkles } from "lucide-react";
import StageCanvas, { type Mood } from "../three/Stage";
import { createBattle, viewerBus } from "../three/battle";
import type { ModelKind } from "../data/towers";
import type { BuildingKind } from "../data/buildings";

interface Props {
  modelKind: ModelKind;
  tier: number;
  baseColor: string;
  accentColor: string;
  glowColor: string;
  glowIntensity: number;
  scaleBoost?: number;
  autoRotate?: boolean;
  compact?: boolean;
  pauseOnModal?: boolean;
  scene?: "tower" | "building";
  buildingKind?: BuildingKind;
}

export default function TowerViewer({
  modelKind, tier, baseColor, accentColor, glowColor, glowIntensity,
  scaleBoost = 1, autoRotate = true, compact = false, pauseOnModal = false,
  scene = "tower", buildingKind,
}: Props) {
  const isBuilding = scene === "building";
  const wrap = useRef<HTMLDivElement>(null);
  const battle = useMemo(() => createBattle(), []);
  const [mood, setMood] = useState<Mood>("dusk");
  const [speed, setSpeed] = useState(1);
  const [firing, setFiring] = useState(true);
  const [rotate, setRotate] = useState(autoRotate);
  const [quality, setQuality] = useState<"high" | "low">("high");
  const [visible, setVisible] = useState(true);
  const [modal, setModal] = useState(viewerBus.modal);
  const [kills, setKills] = useState(0);
  const [full, setFull] = useState(false);

  useEffect(() => { battle.speed = speed; }, [speed, battle]);
  useEffect(() => { battle.firing = firing; }, [firing, battle]);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    const f = () => setModal(viewerBus.modal);
    viewerBus.subs.add(f);
    const iv = setInterval(() => setKills(battle.kills), 400);
    const fs = () => setFull(document.fullscreenElement === el);
    document.addEventListener("fullscreenchange", fs);
    return () => { io.disconnect(); viewerBus.subs.delete(f); clearInterval(iv); document.removeEventListener("fullscreenchange", fs); };
  }, [battle]);

  const active = visible && !(pauseOnModal && modal);
  const scale = 0.82 + (scaleBoost - 1) * 0.45;

  const toggleFull = () => {
    if (!wrap.current) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else wrap.current.requestFullscreen?.();
  };

  const btn = (on: boolean) => `rounded-md px-2 py-1 text-[11px] font-bold transition ${on ? "bg-amber-400 text-black" : "text-slate-300 hover:bg-white/10"}`;

  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden rounded-2xl bg-[#070d1e]" dir="ltr">
      <StageCanvas
        modelKind={modelKind} tier={tier} colors={{ base: baseColor, accent: accentColor, glow: glowColor }}
        gi={glowIntensity} scale={scale} mood={mood} battle={battle} active={active} autoRotate={rotate} quality={quality}
        scene={scene} buildingKind={buildingKind}
      />
      {!compact && (
        <>
          <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/55 px-2.5 py-1.5 text-[10px] text-cyan-200 backdrop-blur">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <span className="tick-label font-mono tracking-widest">{isBuilding ? "LIVE SITE" : "LIVE COMBAT"} • TIER {tier}</span>
            </div>
            {!isBuilding && (
              <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/55 px-2.5 py-1.5 text-[11px] font-bold text-red-300 backdrop-blur">
                <Skull className="h-3.5 w-3.5" /> <span className="tick-label">{kills}</span> <span className="text-slate-400" dir="rtl">منهدم‌شده</span>
              </div>
            )}
          </div>
          <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-1 rounded-xl border border-white/15 bg-black/65 p-1 backdrop-blur">
            {(["day", "dusk", "night"] as Mood[]).map((m) => (
              <button key={m} onClick={() => setMood(m)} className={btn(mood === m)} title={m}>{m === "day" ? "☀️" : m === "dusk" ? "🌅" : "🌙"}</button>
            ))}
            <span className="mx-0.5 h-4 w-px bg-white/15" />
            {[1, 2, 3].map((s) => <button key={s} onClick={() => setSpeed(s)} className={btn(speed === s)}>{s}x</button>)}
            <span className="mx-0.5 h-4 w-px bg-white/15" />
            <button onClick={() => setFiring(!firing)} className={btn(!firing)} title="آتش / آتش‌بس">{firing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
            <button onClick={() => setRotate(!rotate)} className={btn(rotate)} title="چرخش خودکار"><RotateCw className="h-3.5 w-3.5" /></button>
            <button onClick={() => setQuality(quality === "high" ? "low" : "high")} className={btn(quality === "high")} title="کیفیت"><Sparkles className="h-3.5 w-3.5" /></button>
            <button onClick={toggleFull} className={btn(full)} title="تمام صفحه">{full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}</button>
          </div>
        </>
      )}
      {!active && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-500">⏸</div>}
    </div>
  );
}
