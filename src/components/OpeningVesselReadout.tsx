'use client';
import { useEffect, useRef } from 'react';
import type { GameState } from '@/lib/game';
import { canOfferOpeningWave } from '@/lib/opening-attention';
import type { GameSync3D, OpeningLandmark } from '@/three-map/gamesync';
import styles from './opening-vessel.module.css';

const fa = new Intl.NumberFormat('fa-IR', {maximumFractionDigits: 2});
const ships = {barge: 'بارج', bulk: 'فله‌بر', container: 'کانتینربر', tanker: 'نفت‌کش عبوری'};

type Props = {
  target: OpeningLandmark;
  game: GameState;
  sync: GameSync3D;
  map: {onBeforeFrame(callback: () => void): () => void};
  onClose(): void;
  onStart?(): void;
  onVisibilityChange?(visible: boolean): void;
};

export default function OpeningVesselReadout({target, game, sync, map, onClose, onStart, onVisibilityChange}: Props) {
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    let visible = false;
    const place = () => {
      const anchor = card.current && sync.openingAnchor(target);
      if (visible !== !!anchor) { visible = !!anchor; onVisibilityChange?.(visible); }
      if (!card.current) return;
      card.current.style.visibility = anchor ? 'visible' : 'hidden';
      if (anchor) {
        card.current.style.setProperty('--ship-x', anchor.x + '%');
        card.current.style.setProperty('--ship-y', anchor.y + '%');
      }
    };
    place();
    const detach = map.onBeforeFrame(place);
    return () => { detach(); if (visible) onVisibilityChange?.(false); };
  }, [target, sync, map, onVisibilityChange]);
  useEffect(() => {
    const close = (event: Event) => {
      if (!card.current || card.current.style.visibility === 'hidden') return;
      event.preventDefault();
      onClose();
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close(event); };
    window.addEventListener('hormuz:close-map-inspection', close);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('hormuz:close-map-inspection', close);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);

  const opening = game.opening;
  if (!opening) return null;
  let title: string;
  let detail: string;
  let offer = false;
  if (target.kind === 'merchant') {
    const ship = game.merchants.find(item => item.id === target.id);
    if (!ship) return null;
    title = `عوارض عبور · ${ships[ship.kind]} ${fa.format(ship.id)}`;
    const toll = opening.lastToll;
    detail = toll?.shipId === ship.id ? `${fa.format(toll.amount)} اعتبار بندر به خزانه رسید.`
      : ship.paid ? 'عوارض این عبور ثبت شد.' : `تعرفهٔ این عبور ${fa.format(ship.reward)} اعتبار بندر است.`;
    detail += ship.inbound ? ' · از دریای عمان به خلیج فارس' : ' · از خلیج فارس به دریای عمان';
  } else if (target.kind === 'tanker') {
    const port = game.idle.port;
    const tanker = port.tanker;
    if (!tanker || target.id !== port.cycles) return null;
    title = 'فروش نفت · نفت‌کش بندر';
    detail = `محموله ${fa.format(tanker.load)} بشکه`;
    if (opening.lastExportedOil > 0) detail += ` · فروش این ثانیه ${fa.format(opening.lastExportIncome)} اعتبار بندر`;
  } else {
    title = 'رادار بندر';
    offer = game.mode === 'campaign' && game.phase === 'peace' && game.wave === 1 &&
      opening.manualWaveAt === null && canOfferOpeningWave(opening);
    detail = offer ? 'موج اول آماده است.' : 'مسیر عبور کشتی‌ها زیر نظر است.';
  }
  return <aside ref={card} className={styles.readout} aria-label={title} dir="rtl">
    <div><strong>{title}</strong><span>{detail}</span></div>
    <button className={styles.close} onClick={onClose} aria-label="بستن اطلاعات نقشه">×</button>
    {offer && onStart && <button className={styles.start} onClick={() => { onClose(); onStart(); }}>شروع دفاع</button>}
  </aside>;
}
