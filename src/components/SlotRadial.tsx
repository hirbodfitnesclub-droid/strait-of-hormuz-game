"use client";

import { useEffect, useRef, useState, type Dispatch } from "react";
import { ArrowUp, Blocks, Coins, Crosshair, Info, LockKeyhole, Trash2, X } from "lucide-react";
import { PRIORITY_LABELS, SLOTS, TOWERS, TOWER_KINDS, towerUpgradeCost, type Action, type GameState, type TowerKind } from "@/lib/game";
import { compact, fa, sellRefund, TargetEmojis } from "./game-ui";
import TowerModel from "./TowerModel";

/* Radial slot menu (PRD §10.2): opens ON the tapped slot — upgrade top, priority
   left, sell bottom, details right; empty slots offer direct build in an arc. */
type Props = {
  game: GameState; slot: number; dispatch: Dispatch<Action>;
  close: () => void; openSheet: () => void;
  onBuild: (kind: TowerKind) => void;
  feedback: () => void; notify: (text: string) => void;
};

type Projector = { projectSlot: (id: number) => { x: number; y: number } | null };

export default function SlotRadial({ game, slot, dispatch, close, openSheet, onBuild, feedback, notify }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [confirmSell, setConfirmSell] = useState(false);
  const posRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const sync = (window as unknown as { __gamesync3d?: Projector }).__gamesync3d;
      const p = sync?.projectSlot(slot) ?? null;
      const cur = posRef.current;
      if (p && (!cur || Math.abs(p.x - cur.x) > 1 || Math.abs(p.y - cur.y) > 1)) { posRef.current = p; setPos(p); }
      else if (!p && cur) { posRef.current = null; setPos(null); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [slot]);

  const slotDef = SLOTS[slot];
  const tower = game.towers.find(t => t.slot === slot);
  const locked = !game.islands.includes(slotDef.island);
  const style = pos ? { left: pos.x, top: pos.y } : { left: "50%", top: "46%" };

  const upgradeCost = tower ? towerUpgradeCost(tower) : null;
  const canAffordUpgrade = !!upgradeCost && game.cash >= upgradeCost.cash && game.steel >= upgradeCost.steel;
  const doUpgrade = () => {
    if (!tower) return;
    if (tower.tier === 3) { openSheet(); return; } // branch choice lives in the sheet
    if (!canAffordUpgrade) { notify("منابع کافی نیست — درآمد جمع کن یا فولاد بساز."); return; }
    dispatch({ type: "upgrade-tower", slot });
    feedback();
    notify("برجک ارتقا یافت؛ دفاع شما قدرتمندتر شد.");
  };
  const refund = tower ? sellRefund(game, tower) : null;
  const doSell = () => {
    if (!confirmSell) { setConfirmSell(true); return; }
    dispatch({ type: "sell-tower", slot });
    feedback();
    notify("برجک فروخته شد و سهم بازپرداختِ ساخت و ارتقا برگشت.");
    close();
  };

  const arc: [number, number][] = [[-92, -44], [0, -96], [92, -44], [-92, 44], [0, 96], [92, 44]];

  return <>
    <div className="radial-backdrop" onPointerDown={close} />
    <div className="slot-radial" style={style} role="dialog" aria-label={`منوی جایگاه ${slotDef.label}`} onPointerDown={e => e.stopPropagation()}>
      {locked ? <>
        <div className="radial-center locked"><LockKeyhole size={20} /><strong>{slotDef.label}</strong><small>این جزیره هنوز آزاد نشده است</small></div>
        <button className="radial-btn radial-close" onClick={close} aria-label="بستن"><X size={16} /></button>
      </> : tower ? <>
        <button className="radial-btn radial-top" onClick={doUpgrade} disabled={tower.tier >= 4} aria-label="ارتقای برجک">
          {tower.tier >= 4 ? <><LockKeyhole size={17} /><span>کامل</span></> : tower.tier === 3 ? <><ArrowUp size={17} /><span>{game.research.includes("special") ? "شاخه ویژه" : "ارتقا"}</span></> : <><ArrowUp size={17} /><span>ارتقا</span><small>${compact(upgradeCost!.cash)} · {fa(upgradeCost!.steel)}⚙</small></>}
        </button>
        <button className="radial-btn radial-left" onClick={() => { dispatch({ type: "priority", slot }); feedback(); }} aria-label="تغییر هدف‌گیری">
          <Crosshair size={17} /><span>هدف‌گیری</span><small>{PRIORITY_LABELS[tower.priority]}</small>
        </button>
        <button className={`radial-btn radial-bottom ${confirmSell ? "confirm" : ""}`} onClick={doSell} aria-label={`فروش برجک؛ بازگشت ${refund ? compact(refund.cash) : ""} دلار و ${refund ? fa(refund.steel, refund.steel % 1 ? 1 : 0) : ""} فولاد`}>
          <Trash2 size={17} /><span>{confirmSell ? "مطمئنی؟ بفروش" : "فروش"}</span>{refund && <small>بازگشت ${compact(refund.cash)} + {fa(refund.steel, refund.steel % 1 ? 1 : 0)}⚙</small>}
        </button>
        <button className="radial-btn radial-right" onClick={openSheet} aria-label="جزئیات برجک">
          <Info size={17} /><span>جزئیات</span>
        </button>
        <div className="radial-center">
          <span className={`radial-model tower-color-${tower.kind}`}><TowerModel kind={tower.kind} tier={tower.tier} branch={tower.branch} preview /></span>
          <strong>{tower.tier === 4 && tower.branch !== null ? TOWERS[tower.kind].branches[tower.branch] : TOWERS[tower.kind].short}</strong>
          <span className="radial-pips">{[1, 2, 3, 4].map(l => <i key={l} className={l <= tower.tier ? "filled" : ""} />)}</span>
          <small>{slotDef.label}</small>
        </div>
        <button className="radial-btn radial-close" onClick={close} aria-label="بستن"><X size={16} /></button>
      </> : <>
        {TOWER_KINDS.map((kind, i) => {
          const def = TOWERS[kind];
          const afford = game.cash >= def.cost && game.steel >= def.steel;
          return <button key={kind} className={`radial-kind ${afford ? "" : "unaffordable"}`} style={{ transform: `translate(calc(-50% + ${arc[i][0]}px), calc(-50% + ${arc[i][1]}px))` }}
            onClick={() => { if (afford) { onBuild(kind); } else { notify("منابع کافی نیست — درآمد جمع کن یا فولاد بساز."); openSheet(); } }} aria-label={`ساخت ${def.short}`}>
            <span className={`radial-kind-model tower-color-${kind}`}><TowerModel kind={kind} tier={1} preview /></span>
            <strong>{def.short}</strong><TargetEmojis targets={def.targets} /><small><Coins size={10} /> {compact(def.cost)} · <Blocks size={10} /> {fa(def.steel)}</small>
          </button>;
        })}
        <div className="radial-center empty">
          <strong>{slotDef.label}</strong><small>جایگاه خالی — برجک انتخاب کنید</small>
          <button className="radial-details" onClick={openSheet}><Info size={13} /> مقایسه و جزئیات</button>
        </div>
        <button className="radial-btn radial-close" onClick={close} aria-label="بستن"><X size={16} /></button>
      </>}
    </div>
  </>;
}
