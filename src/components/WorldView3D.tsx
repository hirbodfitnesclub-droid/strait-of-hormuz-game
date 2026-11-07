'use client';
import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { GameState, TowerKind, BuildingId } from '@/lib/game';

const ThreeMap = dynamic(() => import('./ThreeMap'), { ssr: false });

type Props = {
  game: GameState;
  selectedSlot: number | null;
  targeting: 'strike' | 'hero' | 'hero2' | null;
  targetPreview: { x: number; y: number };
  isNight: boolean;
  onSlot: (id: number) => void;
  onBuilding: (id: BuildingId) => void;
  onPlatform: (id: number) => void;
  onHero: () => void;
  onHero2: () => void;
  onInspect: (id: number) => void;
  onGroundAction: (point: { x: number; y: number }) => void;
  onGroundHover: (point: { x: number; y: number }) => void;
};

// The 3D world layer for the main game screen: owner's 3D map + live game-state sync.
// All HUD/panels stay DOM (Game.tsx); this component owns only the world.
export default function WorldView3D(props: Props) {
  const syncRef = useRef<import('../three-map/gamesync').GameSync3D | null>(null);
  const mapRef = useRef<unknown>(null);
  const fpsRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  // small FPS meter (owner's 60fps acceptance check) — counts rAF over 500ms windows
  useEffect(() => {
    let frames = 0; let last = performance.now(); let raf = 0; let dead = false;
    const loop = (now: number) => {
      if (dead) return;
      raf = requestAnimationFrame(loop);
      frames++;
      if (now - last >= 500) {
        const fps = Math.round((frames * 1000) / (now - last));
        if (fpsRef.current) {
          fpsRef.current.textContent = `${fps} FPS`;
          fpsRef.current.style.color = fps >= 55 ? '#53d769' : fps >= 30 ? '#ffb340' : '#ff5040';
        }
        frames = 0; last = now;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => { dead = true; cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => {
    const m = mapRef.current as { setTime?: (h: number) => void } | null;
    try { m?.setTime?.(props.isNight ? 21.5 : 10); } catch { /* noop */ }
  }, [props.isNight]);

  useEffect(() => {
    const sync = syncRef.current;
    if (sync) sync.setState(props.game, { selectedSlot: props.selectedSlot, targeting: props.targeting, targetPreview: props.targetPreview });
  });

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={fpsRef} style={{ position: 'absolute', left: 8, top: '47%', zIndex: 40, padding: '3px 8px', borderRadius: 8, background: 'rgba(6,24,38,0.72)', fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', pointerEvents: 'none' }}>— FPS</div>
      <ThreeMap
        onMapReady={async map => {
          mapRef.current = map;
          const { GameSync3D } = await import('../three-map/gamesync');
          if (syncRef.current) return;
          const sync = new GameSync3D(map as never, {
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
          const p = propsRef.current;
          sync.setState(p.game, { selectedSlot: p.selectedSlot, targeting: p.targeting, targetPreview: p.targetPreview });
          const mm = map as unknown as { flyTo(x: number, z: number, d: number, dur?: number): void; setTime?: (h: number) => void };
          mm.flyTo(85, -20, 120, 1.4);
          try { mm.setTime?.(p.isNight ? 21.5 : 10); } catch { /* noop */ }
        }}
      />
    </div>
  );
}
