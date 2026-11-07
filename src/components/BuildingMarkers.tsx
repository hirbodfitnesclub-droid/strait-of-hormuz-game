"use client";

import { BUILDINGS, type BuildingId, type GameState } from "@/lib/game";
import BuildingModel from "./BuildingModel";
import { fa } from "./game-ui";

const positions: Record<GameState["layout"], Record<BuildingId, { x: number; y: number }>> = {
  landscape: { oil:{x:66.7,y:45.4}, tank:{x:57.4,y:31.9}, dock:{x:61.9,y:34.6}, refinery:{x:55.7,y:30.8}, steel:{x:64.8,y:31.5}, arms:{x:66.5,y:32.7}, power:{x:59.3,y:32.7}, water:{x:63.4,y:33.8}, city:{x:60.7,y:28.8}, welfare:{x:59.9,y:27.7}, optical:{x:64.1,y:35.5} },
  portrait: { oil:{x:66.7,y:45.4}, tank:{x:57.4,y:31.9}, dock:{x:61.9,y:34.6}, refinery:{x:55.7,y:30.8}, steel:{x:64.8,y:31.5}, arms:{x:66.5,y:32.7}, power:{x:59.3,y:32.7}, water:{x:63.4,y:33.8}, city:{x:60.7,y:28.8}, welfare:{x:59.9,y:27.7}, optical:{x:64.1,y:35.5} },
};
export default function BuildingMarkers({ game, onSelect }: { game: GameState; onSelect: (id: BuildingId) => void }) {
  return <>{(Object.keys(BUILDINGS) as BuildingId[]).map(id => {
    const pos = positions[game.layout][id], level = game.buildings[id];
    return <button className={`building-marker marker-${id}`} key={id} style={{ left: `${pos.x}%`, top: `${pos.y}%` }} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onSelect(id); }} aria-label={`${BUILDINGS[id].short}، سطح ${fa(level)}؛ مشاهده و ارتقا`} title={`${BUILDINGS[id].short} · سطح ${fa(level)}`}>
      <BuildingModel id={id} level={level} /><span className="building-marker-level">{fa(level)}</span><span className="building-marker-name">{BUILDINGS[id].short}</span>
    </button>;
  })}</>;
}
