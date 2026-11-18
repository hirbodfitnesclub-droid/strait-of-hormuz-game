'use client';
import { useEffect, useRef, useState } from 'react';

// Mounts the owner's code-built 3D Hormuz map (src/three-map/hormuz-map.js)
// as a self-contained layer inside the main game (Astra v5).
// Ships/models attach only after the map signals onReady (its async build done).
export default function ThreeMap({ demo = false, onMapReady, onReadyChange }: { demo?: boolean; onReadyChange?: (ready: boolean) => void; onMapReady?: (map: unknown) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onMapReady);
  useEffect(() => { callbackRef.current = onMapReady; }, [onMapReady]);
  const [error, setError] = useState(false);
  const readyRef = useRef(onReadyChange);
  useEffect(() => { readyRef.current = onReadyChange; }, [onReadyChange]);
  useEffect(() => {
    let map: { dispose(): void } | null = null;
    let detach: (() => void) | null = null;
    let cancelled = false;
    const host = hostRef.current;
    let contextLost = false;
    let initialized = false;
    let failed = false;
    const updateAvailability = () => {
      if (cancelled) return;
      readyRef.current?.(initialized && !contextLost && !failed);
      setError(contextLost || failed);
    };
    const lost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      updateAvailability();
    };
    const restored = () => {
      contextLost = false;
      updateAvailability();
    };
    host?.addEventListener('webglcontextlost', lost, true);
    host?.addEventListener('webglcontextrestored', restored, true);
    const W = window as unknown as { __m3d?: string; __map3d?: unknown };
    (async () => {
      W.__m3d = 'importing';
      const mod = await import('../three-map/hormuz-map.js');
      if (cancelled || !hostRef.current) return;
      W.__m3d = 'imported';
      map = new mod.HormuzMap(hostRef.current, {
        onReady: async () => {
          if (cancelled) return;
          try { await callbackRef.current?.(map); } catch { failed = true; updateAvailability(); return; }
          if (cancelled) return;
          W.__m3d = 'ready';
          initialized = true;
          updateAvailability();
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
      await (map as unknown as { init(): Promise<void> }).init();
      if (!cancelled) W.__m3d = 'ready';
    })().catch(() => { failed = true; updateAvailability(); });
    return () => {
      cancelled = true;
      host?.removeEventListener('webglcontextlost', lost, true);
      host?.removeEventListener('webglcontextrestored', restored, true);
      try { detach?.(); } catch { /* noop */ }
      try { map?.dispose(); } catch { /* noop */ }
      if (W.__map3d === map) delete W.__map3d;
    };
  }, [demo]);
  return <><div ref={hostRef} style={{ position: 'absolute', inset: 0 }} aria-label="نقشه سه‌بعدی تنگه هرمز" />{error && <div className="world-error" role="alert"><strong>نمای تنگه آماده نشد</strong><p>برای بازیابی تصویر دوباره تلاش کنید. ذخیرهٔ دستگاه حفظ می‌شود.</p><button onClick={() => location.reload()}>بارگذاری دوباره</button></div>}</>;
}
