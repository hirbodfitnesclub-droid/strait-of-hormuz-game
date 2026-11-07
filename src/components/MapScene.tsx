"use client";

import type { CSSProperties, RefObject } from "react";
import { Anchor, LockKeyhole, Plus } from "lucide-react";
import { getSlots, TOWERS, getRange, contrabandPosition, type GameState, type TowerKind, type BuildingId, PLATFORM_SLOTS, platformCost } from "@/lib/game";
import { getLane, isWater } from "@/lib/navigation";
import type { BattleSound } from "@/lib/battle-audio";
import BattleCanvas from "./BattleCanvas";
import { fa } from "./game-ui";
import TowerModel from "./TowerModel";
import BuildingMarkers from "./BuildingMarkers";

type Props = {
  game: GameState; selectedSlot: number | null; previewKind: TowerKind;
  targeting: "strike" | "hero" | "hero2" | null; targetPreview: { x: number; y: number }; zoom?: number;
  isNight: boolean; paused: boolean; cinematic: boolean; reducedMotion: boolean;
  dragging: boolean; style: CSSProperties; worldRef: RefObject<HTMLDivElement | null>;
  onSlot: (id: number) => void; onHero: () => void; onHero2: () => void; onInspect: (id: number) => void; onBuilding: (id: BuildingId) => void; onPlatform: (id: number) => void;
  playSound: (sound: BattleSound) => void;
};

export default function MapScene(props: Props) {
  const { game, selectedSlot, previewKind, targeting, targetPreview, worldRef } = props;
  const slots = getSlots(game.layout);
  const selectedPosition = selectedSlot === null ? null : slots[selectedSlot];
  const selectedTower = game.towers.find(t => t.slot === selectedSlot);
  const currentRange = selectedTower ? getRange(game, selectedTower) : TOWERS[previewKind].range;
  const nextRange = selectedTower ? getRange(game, { ...selectedTower, tier: Math.min(4, selectedTower.tier + 1) }) : currentRange;
  const battle = game.phase === "battle";
  const zTier = (props.zoom ?? 1) < 1.8 ? "tz-strategic" : (props.zoom ?? 1) < 3.6 ? "tz-ops" : "tz-local";
  return <div data-layout={game.layout} className={`world-transform ${zTier} ${props.dragging ? "dragging" : ""} ${targeting ? "targeting" : ""} ${game.overdrive > 0 ? "overdrive-active" : ""}`} style={{ ...props.style, ["--mz" as string]: String(1 / (props.zoom ?? 1)) }} ref={worldRef}>
    <div className="map-image" />
    <div className="ocean-light" />
    <div className="sea-sparkles" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div>
    <div className="cloud-layer" aria-hidden="true"><i className="cloud-a" /><i className="cloud-b" /><i className="cloud-c" /></div>
    {!props.isNight && <div className="bird-layer" aria-hidden="true"><i /><i /><i /></div>}
    {props.isNight && <><div className="night-overlay" /><div className="night-lights"><i /><i /><i /><i /><i /></div><div className="beacon-sweep" aria-hidden="true" /></>}
    <div className="map-shading" />
    <svg className="map-vectors" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
      <polyline className="trade-route" points={getLane(game.layout, "trade").map(p => `${p.x * 10},${p.y * 10}`).join(" ")} />
      <polyline className={`enemy-route ${battle ? "active" : ""} ${props.paused ? "route-paused" : ""}`} points={getLane(game.layout, "enemy").map(p => `${p.x * 10},${p.y * 10}`).join(" ")} />
      {selectedPosition && <><ellipse className="range-next" cx={selectedPosition.x * 10} cy={selectedPosition.y * 10} rx={nextRange * 10} ry={nextRange / 0.72 * 10} /><ellipse className="range-current" cx={selectedPosition.x * 10} cy={selectedPosition.y * 10} rx={currentRange * 10} ry={currentRange / 0.72 * 10} /></>}
      {targeting === "strike" && <g className="target-area"><ellipse cx={targetPreview.x * 10} cy={targetPreview.y * 10} rx="170" ry="236" /><ellipse cx={targetPreview.x * 10} cy={targetPreview.y * 10} rx="155" ry="215" /></g>}
    </svg>
    <div className="map-place place-port"><i /><strong>بندرعباس</strong></div>
    <div className="map-place place-qeshm"><i /><strong>قشم</strong></div>
    <div className="map-place place-hormuz"><i /><strong>هرمز</strong></div>
    <div className="map-place place-larak"><i /><strong>لارک</strong></div>
    <div className="water-label">خلیج فارس</div>
    <BattleCanvas game={game} paused={props.paused} cinematic={props.cinematic} reducedMotion={props.reducedMotion} playSound={props.playSound} />
    <BuildingMarkers game={game} onSelect={props.onBuilding} />
    {PLATFORM_SLOTS.map(slot => {
      const built = (game.idle.platforms ?? []).includes(slot.id);
      return <button key={slot.id} className={`platform-marker ${built ? "built" : "unbuilt"}`} style={{ left: `${slot.x}%`, top: `${slot.y}%` }} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); props.onPlatform(slot.id); }} aria-label={built ? `${slot.name}؛ فعال` : `ساخت ${slot.name}`} title={built ? slot.name : `${slot.name} · ساخت $${platformCost((game.idle.platforms ?? []).length)}`}>
        {built ? <img src="/assets/buildings/oil.png" alt="" draggable={false} /> : <span className="platform-anchor"><Plus size={16} /></span>}
        <span className="platform-name">{built ? "سکو فعال" : "سکوی نفتی"}</span>
      </button>;
    })}
    {slots.map(slot => {
      const tower = game.towers.find(t => t.slot === slot.id), locked = !game.islands.includes(slot.island);
      const shot = game.shots.find(s => s.x1 === slot.x && s.y1 === slot.y);
      const width = worldRef.current?.clientWidth ?? 1200, height = worldRef.current?.clientHeight ?? 720;
      const angle = shot ? Math.atan2((shot.y2 - shot.y1) * height, (shot.x2 - shot.x1) * width) * 180 / Math.PI : -35;
      return <button className={`tower-pad ${tower ? "built" : "empty"} ${selectedSlot === slot.id ? "selected" : ""} ${locked ? "locked" : ""} ${shot && !props.paused ? "is-firing" : ""}`} key={slot.id} style={{ left: `${slot.x}%`, top: `${slot.y}%` }} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); props.onSlot(slot.id); }} aria-label={tower ? `${TOWERS[tower.kind].short}، سطح ${fa(tower.tier)}` : locked ? `آزادسازی ${slot.label}` : `ساخت برجک در ${slot.label}`} title={tower ? TOWERS[tower.kind].short : `ساخت در ${slot.label}`}>
        {tower ? <><TowerModel kind={tower.kind} tier={tower.tier} branch={tower.branch} angle={angle} firing={!!shot && !props.paused} /><span className="tower-tier">{Array.from({ length: tower.tier }, (_, i) => <i key={i} />)}</span><span className="tower-caption">{TOWERS[tower.kind].short}</span></> : <span className="empty-pad">{locked ? <LockKeyhole size={15} /> : <Plus size={21} />}<span>{locked ? "قفل" : "ساخت"}</span></span>}
      </button>;
    })}
    <button className={`hero-marker ${targeting === "hero" ? "chosen" : ""}`} style={{ left: `${game.hero.x}%`, top: `${game.hero.y}%` }} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); props.onHero(); }} aria-label="جابه‌جایی ناو فرمانده" title="جابجایی فرمانده">
      <img className="hero-ship-sprite" src="/assets/ships/cruiser.png" alt="" draggable={false} style={{ transform: `rotate(${game.hero.route?.[game.hero.routeIndex ?? 1] ? Math.atan2((game.hero.route[game.hero.routeIndex ?? 1].y-game.hero.y)*(worldRef.current?.clientHeight ?? 700), (game.hero.route[game.hero.routeIndex ?? 1].x-game.hero.x)*(worldRef.current?.clientWidth ?? 1200))*180/Math.PI+90 : -40}deg)` }} /><span className="hero-star">✦</span><small>فرمانده</small>
    </button>
    {game.hero2 && <button className={`hero-marker hero2 ${targeting === "hero2" ? "chosen" : ""}`} style={{ left: `${game.hero2.x}%`, top: `${game.hero2.y}%` }} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); props.onHero2(); }} aria-label="جابه‌جایی ناو فرمانده دوم" title="جابجایی فرمانده دوم">
      <img className="hero-ship-sprite" src="/assets/ships/destroyer.png" alt="" draggable={false} style={{ transform: "rotate(-40deg)" }} /><span className="hero-star">✦</span><small>فرمانده ۲</small>
    </button>}
    {game.contraband.map(ship => { const point = contrabandPosition(ship, game.layout); return <button key={ship.id} className="contraband-marker" style={{ left: `${point.x}%`, top: `${point.y}%` }} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); props.onInspect(ship.id); }} aria-label="بازرسی کشتی مشکوک"><Anchor size={17} /><span>بازرسی</span></button>; })}
    {targeting && <div className={`target-reticle ${targeting} ${targeting === "hero" && !isWater(targetPreview, game.layout) ? "on-land" : ""}`} style={{ left: `${targetPreview.x}%`, top: `${targetPreview.y}%` }}><i /><i /><span>{targeting === "strike" ? "محدوده حمله" : isWater(targetPreview, game.layout) ? "آبراه امن" : "نزدیک‌ترین آب امن انتخاب می‌شود"}</span></div>}
  </div>;
}
