import type { ReactNode } from 'react';
import {
  Crosshair, Flame, Rocket, Radar, Radio, Sailboat, ArrowUp, Coins, X, Target, Trash2, Info,
  Fuel, Zap, Droplets, Building2, Package, Sparkles, Ship, Plane, Anchor,
} from 'lucide-react';
import { TOWERS, CITY_BUILDS, RIG_INFO, towerById, type TowerDef } from '../three/world';
import type { SlotInfo } from '../three/mapEngine';

export const TOWER_ICONS: Record<string, typeof Crosshair> = {
  autocannon: Crosshair, howitzer: Flame, missile: Rocket, airdef: Radar, ew: Radio, garrison: Sailboat,
};
export const CITY_ICONS: Record<string, typeof Zap> = { power: Zap, desal: Droplets, town: Building2, depot: Package };
export const PRIORITIES = ['اولین', 'قوی‌ترین', 'ضعیف‌ترین', 'هوایی'];
export const fa = (n: number) => n.toLocaleString('fa-IR');
export const faK = (n: number) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}M` : n >= 1e3 ? `${(n / 1e3).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}K` : fa(n));
export const upgradeCost = (lvl: number) => 300 * lvl;
export const SPECIAL_COST = 1200;

interface Item { key: string; angle: number; icon: ReactNode; label: string; cost?: number; color: string; disabled?: boolean; gold?: boolean; danger?: boolean; onClick: () => void; }

interface Props {
  sel: SlotInfo; dollars: number; steel: number; priority: number;
  onTower: (t: TowerDef) => void; onRig: () => void; onCity: (id: string, fa: string, cost: number) => void;
  onUpgrade: () => void; onSpecial: (b: 'A' | 'B') => void; onSell: () => void; onPriority: () => void; onInfo: () => void; onClose: () => void;
}

export function RadialMenu(p: Props) {
  const { sel } = p;
  const items: Item[] = [];
  const can = (c: number, s = 0) => p.dollars >= c && p.steel >= s;
  if (sel.kind === 'defense' && !sel.occupied) {
    TOWERS.forEach((t, i) => {
      const I = TOWER_ICONS[t.id];
      items.push({ key: t.id, angle: -90 + i * 60, icon: <I size={24} strokeWidth={2.4} />, label: t.short, cost: t.cost, color: t.color, disabled: !can(t.cost, t.steel), onClick: () => p.onTower(t) });
    });
  } else if (sel.kind === 'defense' && sel.occupied) {
    const tw = towerById(sel.buildId ?? '');
    if (sel.level < 3) items.push({ key: 'up', angle: -90, icon: <ArrowUp size={26} strokeWidth={2.8} />, label: `سطح ${fa(sel.level + 1)}`, cost: upgradeCost(sel.level), color: '#fbbf24', disabled: !can(upgradeCost(sel.level), 15), onClick: p.onUpgrade });
    if (sel.level === 3 && tw) {
      items.push({ key: 'sa', angle: -125, icon: <Sparkles size={24} />, label: tw.specialA, cost: SPECIAL_COST, color: '#fcd34d', gold: true, disabled: !can(SPECIAL_COST, 60), onClick: () => p.onSpecial('A') });
      items.push({ key: 'sb', angle: -55, icon: <Sparkles size={24} />, label: tw.specialB, cost: SPECIAL_COST, color: '#fcd34d', gold: true, disabled: !can(SPECIAL_COST, 60), onClick: () => p.onSpecial('B') });
    }
    items.push({ key: 'pr', angle: 180, icon: <Target size={24} />, label: PRIORITIES[p.priority], color: '#38bdf8', onClick: p.onPriority });
    items.push({ key: 'in', angle: 0, icon: <Info size={24} />, label: 'مشخصات', color: '#a78bfa', onClick: p.onInfo });
    items.push({ key: 'sell', angle: 90, icon: <Trash2 size={22} />, label: 'فروش ۷۰٪', color: '#f43f5e', danger: true, onClick: p.onSell });
  } else if (sel.kind === 'oil' && !sel.occupied) {
    items.push({ key: 'rig', angle: -90, icon: <Fuel size={28} strokeWidth={2.4} />, label: RIG_INFO.fa, cost: RIG_INFO.cost, color: '#fbbf24', disabled: !can(RIG_INFO.cost), onClick: p.onRig });
  } else if (sel.kind === 'oil') {
    items.push({ key: 'in', angle: -90, icon: <Info size={24} />, label: 'تولید', color: '#fbbf24', onClick: p.onInfo });
    items.push({ key: 'sell', angle: 90, icon: <Trash2 size={22} />, label: 'برچیدن', color: '#f43f5e', danger: true, onClick: p.onSell });
  } else if (sel.kind === 'city' && !sel.occupied) {
    CITY_BUILDS.forEach((c, i) => {
      const I = CITY_ICONS[c.id];
      items.push({ key: c.id, angle: -90 + i * 90, icon: <I size={24} />, label: c.fa, cost: c.cost, color: '#c4b5fd', disabled: !can(c.cost), onClick: () => p.onCity(c.id, c.fa, c.cost) });
    });
  } else {
    items.push({ key: 'in', angle: -90, icon: <Info size={24} />, label: 'وضعیت', color: '#c4b5fd', onClick: p.onInfo });
    if (!sel.key) items.push({ key: 'sell', angle: 90, icon: <Trash2 size={22} />, label: 'تخریب', color: '#f43f5e', danger: true, onClick: p.onSell });
  }
  const R = typeof window !== 'undefined' && window.innerWidth < 640 ? 96 : 108;
  return (
    <div className="radial-root">
      <svg className="radial-ring" width={R * 2 + 40} height={R * 2 + 40} viewBox={`0 0 ${R * 2 + 40} ${R * 2 + 40}`}>
        <circle cx={R + 20} cy={R + 20} r={R} fill="none" stroke="rgba(125,243,255,0.35)" strokeWidth="2" strokeDasharray="6 8" />
        <circle cx={R + 20} cy={R + 20} r={R - 30} fill="rgba(4,10,24,0.28)" stroke="rgba(125,243,255,0.15)" strokeWidth="1" />
      </svg>
      <button className="radial-close" onClick={p.onClose} aria-label="بستن"><X size={18} strokeWidth={3} /></button>
      {items.map((it, i) => {
        const a = (it.angle * Math.PI) / 180;
        return (
          <div key={it.key} className="radial-item" style={{ transform: `translate(${Math.cos(a) * R}px, ${Math.sin(a) * R}px)`, animationDelay: `${i * 35}ms` }}>
            <button onClick={it.onClick} disabled={it.disabled}
              className={`radial-btn ${it.gold ? 'gold' : ''} ${it.danger ? 'danger' : ''}`}
              style={{ ['--rc' as string]: it.color }}>
              {it.icon}
            </button>
            <span className="radial-label">{it.label}</span>
            {it.cost !== undefined && (
              <span className={`radial-cost ${it.disabled ? 'off' : ''}`}><Coins size={10} />{faK(it.cost)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TargetBadges({ t }: { t: TowerDef }) {
  const B = ({ on, children, label }: { on: boolean; children: ReactNode; label: string }) => (
    <span title={label} className={`tb ${on ? 'on' : ''}`}>{children}</span>
  );
  return (
    <span className="flex gap-1">
      <B on={t.sea} label="دریایی"><Ship size={12} /></B>
      <B on={t.air} label="هوایی"><Plane size={12} /></B>
      <B on={t.sub} label="زیرسطحی"><Anchor size={12} /></B>
    </span>
  );
}
