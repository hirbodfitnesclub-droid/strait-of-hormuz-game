'use client';
import { useEffect, useRef } from 'react';

// Mounts the owner's code-built 3D Hormuz map (src/three-map/hormuz-map.js)
// as a self-contained layer inside the main game (Astra v5).
// Ships/models attach only after the map signals onReady (its async build done).
export default function ThreeMap({ demo = false, onMapReady }: { demo?: boolean; onMapReady?: (map: unknown) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: { dispose(): void } | null = null;
    let detach: (() => void) | null = null;
    let cancelled = false;
    const W = window as unknown as { __m3d?: string; __map3d?: unknown };
    (async () => {
      W.__m3d = 'importing';
      const mod = await import('../three-map/hormuz-map.js');
      if (cancelled || !hostRef.current) return;
      W.__m3d = 'imported';
      map = new mod.HormuzMap(hostRef.current, {
        onReady: async () => {
          onMapReady?.(map);
          W.__m3d = 'ready';
          if (!demo || cancelled) return;
          try {
            const ships = await import('../three-map/ships3d');
            detach = ships.attachShips(map as never);
            W.__m3d = 'ships-attached';
            const models = await import('../three-map/models3d');
            await models.attachDemoModels(map as never);
            const m = map as unknown as { flyTo(x: number, z: number, d: number, dur?: number): void };
            m.flyTo(85, -20, 120, 1.2);
            W.__m3d = 'attached';
          } catch (e) {
            W.__m3d = 'attach-error: ' + (e as Error).message;
            console.error('attach failed', e);
          }
        },
      });
      W.__map3d = map;
      (map as unknown as { init(): void }).init();
      W.__m3d = 'constructed';
    })();
    return () => {
      cancelled = true;
      try { detach?.(); } catch { /* noop */ }
      try { map?.dispose(); } catch { /* noop */ }
    };
  }, [demo]);
  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} aria-label="نقشه سه‌بعدی تنگه هرمز" />;
}
