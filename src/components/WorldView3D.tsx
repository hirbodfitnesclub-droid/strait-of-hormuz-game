'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { GameState, TowerKind, BuildingId } from '@/lib/game';
import OpeningVesselReadout from './OpeningVesselReadout';
import type { GameSync3D, OpeningLandmark } from '../three-map/gamesync';
import type { BattleSound } from '@/lib/battle-audio';
import { DayNightDriver, hourForNightness, type TimeMode } from '../lib/daynight';

const ThreeMap = dynamic(() => import('./ThreeMap'), { ssr: false });

export const HOME_VIEW = { x: 85, z: -20, distance: 120 };
export type WorldCamera = {
  distance(): number;
  zoomBy(factor: number): void;
  resetNorth(): void;
  flyTo(x: number, z: number, distance: number, duration?: number): void;
  controls: {
    addEventListener(event: 'change', callback: () => void): void;
    removeEventListener(event: 'change', callback: () => void): void;
  };
};
type Props = {
  onCameraReady: (camera: WorldCamera) => void;
  game: GameState;
  paused?: boolean;
  onReadyChange?: (ready: boolean) => void;
  selectedSlot: number | null;
  targeting: 'strike' | 'hero' | 'hero2' | null;
  targetPreview: { x: number; y: number };
  /** Legacy phase flag from Game.tsx — no longer drives the map's clock
   *  (see the VIS2 time driver below); kept in the props until UI2's
   *  tri-state wiring replaces the caller side. */
  isNight: boolean;
  /** VIS2 / D-021 contract for UI2's tri-state day/night control:
   *  'auto' (default) = 900 s day + 900 s night ambient cycle with ~20 s
   *  dusk/dawn blends; 'day' / 'night' = held phase, reached through the
   *  same ~20 s blend. Scenario-forced night (battle condition «شب»)
   *  overrides the mode for the battle and blends in/out the same way.
   *  The math lives in src/lib/daynight.ts (DayNightDriver). */
  timeMode?: TimeMode;
  onSlot: (id: number) => void;
  onBuilding: (id: BuildingId) => void;
  onPlatform: (id: number) => void;
  onStartOpeningWave?: () => void;
  onOpeningInspectionChange?: (visible: boolean) => void;
  onHero: () => void;
  onHero2: () => void;
  onInspect: (id: number) => void;
  onGroundAction: (point: { x: number; y: number }) => void;
  onGroundHover: (point: { x: number; y: number }) => void;
  playSound: (kind: BattleSound) => void;
};

// The 3D world layer for the main game screen: owner's 3D map + live game-state sync.
// All HUD/panels stay DOM (Game.tsx); this component owns only the world.
export default function WorldView3D(props: Props) {
  const syncRef = useRef<import('../three-map/gamesync').GameSync3D | null>(null);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; syncRef.current?.dispose(); syncRef.current = null; }; }, []);
  const [loadPct, setLoadPct] = useState<number | null>(0);

  // Preload all placeable models behind a loading veil (Phase 3): no mid-battle decode hitches.
  useEffect(() => {
    let dead = false;
    const killer = setTimeout(() => { if (!dead) { dead = true; setLoadPct(null); } }, 30000);
    (async () => {
      try {
        const { preloadModels } = await import('../three-map/models3d');
        await preloadModels((done, total) => { if (!dead) setLoadPct(Math.round((done / total) * 100)); });
      } catch { /* lazy loading remains as fallback */ }
      if (!dead) { clearTimeout(killer); setTimeout(() => { if (!dead) setLoadPct(null); }, 400); }
    })();
    return () => { dead = true; clearTimeout(killer); };
  }, []);
  const mapRef = useRef<unknown>(null);
  const fpsRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef(props);
  useEffect(() => { propsRef.current = props; }, [props]);

  const [mapReady, setMapReady] = useState(false);
  const [inspection, setInspection] = useState<{
    target: OpeningLandmark; sync: GameSync3D; map: {onBeforeFrame(cb: () => void): () => void};
  } | null>(null);
  const closeInspection = useCallback(() => setInspection(null), []);
  if (inspection && (props.paused || props.targeting || props.game.phase !== 'peace')) setInspection(null);
  const sceneAvailable = useRef(false);
  const assetsReady = useRef(false);
  const onMapAvailability = (ready: boolean) => {
    sceneAvailable.current = ready;
    propsRef.current.onReadyChange?.(ready && assetsReady.current);
    setMapReady(ready);
  };
  useEffect(() => {
    assetsReady.current = loadPct === null;
    propsRef.current.onReadyChange?.(sceneAvailable.current && assetsReady.current);
  }, [loadPct]);
  const [showMetrics] = useState(() => typeof location !== "undefined" && new URLSearchParams(location.search).has("fpslog"));
  useEffect(() => {
    const enabled = new URLSearchParams(location.search).has('fpslog');
    if (!enabled) return;
    const timer = setInterval(() => {
      const fps = syncRef.current?.perfInfo().fps ?? 0;
      if (fpsRef.current) fpsRef.current.textContent = `${fps} FPS`;
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // VIS2 (D-021): continuous day/night driver. Replaces the old snap
  // effect (`setTime(isNight ? 21.5 : 10)` on every parity flip of a
  // 180 s cycle — instant shadow/lamp toggles, and an XOR manual flag
  // that permanently inverted later cycles). The driver is fed the
  // game's own clock (state.elapsed, game-seconds) once per frame and
  // pushes a continuous hour into the map, so sun, sky, lamps and the
  // shadow state all blend over ~20 game-seconds. Contract + math:
  // src/lib/daynight.ts. `window.__hormuzTimeState` is the evidence
  // hook the audit probes read (same pattern as __gamesync3d).
  useEffect(() => {
    const driver = new DayNightDriver();
    const state = { mode: 'auto' as string, source: 'auto' as string, target: 0, display: 0, hour: 10, pin: null as number | null };
    (window as unknown as { __hormuzTimeState?: unknown }).__hormuzTimeState = state;
    if (!mapReady) return;
    const map = mapRef.current as { onBeforeFrame(cb: () => void): () => void };
    let lastHour = Number.NaN;
    const loop = () => {
      const m = mapRef.current as { setTime?: (h: number) => void } | null;
      if (!m || typeof m.setTime !== 'function') return;
      const p = propsRef.current;
      const g = p.game;
      const out = driver.update({
        elapsed: g.elapsed,
        mode: p.timeMode ?? 'auto',
        scenarioNight: g.phase === 'battle' && g.battle?.condition === 'شب',
        manualNight: g.manualNight === true,
      });
      let display = out.nightness;
      // Evidence hook only: probes may pin the blend mid-transition to
      // capture a dusk/dawn frame. Production code never sets `pin`.
      if (typeof state.pin === 'number') display = Math.min(1, Math.max(0, state.pin));
      state.mode = p.timeMode ?? 'auto';
      state.source = out.source;
      state.target = out.target;
      state.display = display;
      state.hour = hourForNightness(display);
      if (Math.abs(state.hour - lastHour) > 0.0015 || Number.isNaN(lastHour)) {
        lastHour = state.hour;
        try { m.setTime(state.hour); } catch { /* noop */ }
      }
    };
    return map.onBeforeFrame(loop);
  }, [mapReady]);

  // PERF (§16.8): calm-render signal for the map loop — outside the battle
  // phase (or while a slot/targeting UI is open) the map may cap at 30fps
  // whenever the camera is still. Game.tsx sets the complementary panel flag.
  useEffect(() => {
    (window as unknown as { __hormuzCalmPhase?: boolean }).__hormuzCalmPhase =
      props.game.phase !== 'battle' || props.selectedSlot !== null || props.targeting !== null;
  }, [props.game.phase, props.selectedSlot, props.targeting]);

  // Phone frame-time recorder (?fpslog=1) — dynamic import keeps it at zero
  // cost for normal sessions. Evidence tool for DoD §16.1 / ticket T-001.
  useEffect(() => {
    let dead = false;
    let starting = false;
    let stop: (() => void) | null = null;
    const start = async () => {
      if (starting || (window as { __hormuzFrameHook?: unknown }).__hormuzFrameHook) return;
      starting = true;
      try {
        const { startFrameRecorder } = await import('../lib/frame-recorder');
        if (dead) return;
        stop = startFrameRecorder(() => syncRef.current?.perfInfo() ??
          { calls: -1, tris: -1, dpr: window.devicePixelRatio || 1 });
      } finally { starting = false; }
    };
    window.addEventListener('hormuz:record-frames', start);
    if (new URLSearchParams(window.location.search).has('fpslog')) void start();
    return () => {
      dead = true;
      window.removeEventListener('hormuz:record-frames', start);
      stop?.();
    };
  }, []);

  useEffect(() => {
    const sync = syncRef.current;
    if (sync) sync.setState(props.game, { selectedSlot: props.selectedSlot, targeting: props.targeting, targetPreview: props.targetPreview, paused: props.paused });
  });

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {showMetrics && <div ref={fpsRef} style={{ position: 'absolute', left: 8, top: '47%', zIndex: 40, padding: '3px 8px', borderRadius: 8, background: 'rgba(6,24,38,0.72)', fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', pointerEvents: 'none' }}>— FPS</div>}
      {loadPct !== null && <div style={{ position: 'absolute', inset: 0, zIndex: 45, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'linear-gradient(180deg, rgba(4,18,30,0.88), rgba(4,18,30,0.72))', color: '#dceefb', transition: 'opacity .4s' }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>در حال آماده‌سازی تنگه</div>
        <div style={{ width: 'min(260px, 70%)', height: 8, borderRadius: 4, background: 'rgba(147,197,253,0.18)', overflow: 'hidden' }}><div style={{ width: `${loadPct}%`, height: '100%', borderRadius: 4, background: 'linear-gradient(90deg,#53d769,#9be15d)', transition: 'width .25s' }} /></div>
        <div style={{ fontSize: 12, color: '#9fc3dd' }}>بارگذاری ناوگان و برجک‌ها · {loadPct}٪</div>
      </div>}
      {inspection && mapReady && !props.targeting && !props.paused && (
        <OpeningVesselReadout {...inspection} game={props.game}
          onClose={closeInspection} onStart={props.onStartOpeningWave} onVisibilityChange={props.onOpeningInspectionChange}/>
      )}
      <ThreeMap onReadyChange={onMapAvailability}
        onMapReady={async map => {
          mapRef.current = map;
          const { GameSync3D } = await import('../three-map/gamesync');
          if (!mounted.current || syncRef.current) return;
          const sync = new GameSync3D(map as never, {
            onOpeningInspect: target => {
              const current = propsRef.current;
              setInspection(target && !current.paused && !current.targeting && current.game.phase === 'peace'
                ? {target, sync, map: map as {onBeforeFrame(cb: () => void): () => void}} : null);
            },
            onSound: kind => propsRef.current.playSound(kind),
            onSlot: id => propsRef.current.onSlot(id),
            onBuilding: id => propsRef.current.onBuilding(id as BuildingId),
            onPlatform: id => propsRef.current.onPlatform(id),
            onHero: () => propsRef.current.onHero(),
            onHero2: () => propsRef.current.onHero2(),
            onInspect: id => propsRef.current.onInspect(id),
            onGroundPoint: (x, y) => propsRef.current.onGroundAction({ x, y }),
            onGroundHover: (x, y) => propsRef.current.onGroundHover({ x, y }),
          });
          syncRef.current = sync;
          (window as unknown as { __gamesync3d?: unknown }).__gamesync3d = sync;
          (window as unknown as { __map3d?: unknown }).__map3d = map;
          const p = propsRef.current;
          sync.setState(p.game, { selectedSlot: p.selectedSlot, targeting: p.targeting, targetPreview: p.targetPreview, paused: p.paused });
          const camera = map as WorldCamera;
          p.onCameraReady(camera);
          camera.flyTo(HOME_VIEW.x, HOME_VIEW.z, HOME_VIEW.distance, 1.4);
          // The VIS2 time driver (effect above) owns the map clock from
          // its first frame — no setTime snap here anymore.
        }}
      />
    </div>
  );
}
