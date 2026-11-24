import { Anchor, Coins, Droplet, Radio, Wrench, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { GameState } from "@/lib/game";
import { openingCapacity, openingNextTollIn } from "@/lib/opening-industry";
import {
  canOfferOpeningWave,
  type OpeningFocus,
} from "@/lib/opening-attention";
import { fa } from "./game-ui";
import type { GameSync3D, OpeningLandmark } from "@/three-map/gamesync";
import styles from "./first-shift.module.css";

export function FirstShift({
  game,
  focus,
  highlight,
  onTank,
  onCollect,
  onBattle,
  onHelp,
  onSkip,
  onDismissHint,
}: {
  game: GameState;
  focus: OpeningFocus | null;
  highlight: OpeningFocus | null;
  onTank(): void;
  onCollect(): void;
  onBattle(): void;
  onHelp(): void;
  onSkip?: () => void;
  onDismissHint?: () => void;
}) {
  const o = game.opening!,
    capacity = openingCapacity(game),
    bank = Math.floor(game.idle.bank);
  const wave = canOfferOpeningWave(o);
  const showTreasury =
    o.firstTollAt !== null &&
    (!o.collectedFirstToll ||
      focus === "treasury_to_tank" ||
      focus === "treasury");
  const needTank = o.stalled;
  const help =
    needTank &&
    !onSkip &&
    !o.mastery &&
    o.stallStartedAt !== null &&
    o.activeSeconds - o.stallStartedAt >= 12;
  const message = needTank
    ? "مخزن جا ندارد. پمپ منتظر است."
    : wave
      ? "مجوز اولین عبور رسید."
      : o.firstTollAt === null
        ? "کشتی عبوری نزدیک است."
        : !o.collectedFirstToll
          ? "عوارض کشتی در خزانه است."
          : "بارگیری نفت‌کش ادامه دارد.";
  return (
    <section className={styles.instruments} aria-label="شیفت اول بندر">
      <div className={styles.log}>
        <Radio size={17} aria-hidden="true" />
        <span>{message}</span>
        {onSkip && (
          <button
            className={styles.skip + " opening-skip"}
            onClick={onSkip}
            aria-label="رد کردن آموزش"
          >
            رد آموزش
          </button>
        )}
        {onDismissHint && (
          <button
            className={styles.dismiss + " opening-dismiss"}
            onClick={onDismissHint}
            aria-label="بستن نشانه"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className={styles.deck}>
        <button
          className={styles.gauge + " opening-tank-status"}
          onClick={onTank}
          data-opening-highlight={highlight === "tank" ? "tank" : undefined}
          aria-label={
            needTank ? "بررسی مخزن پُر و توقف تولید" : "بررسی مخزن نفت"
          }
        >
          <span>
            <Droplet size={16} />
            مخزن نفت{needTank && <Wrench size={15} />}
          </span>
          <bdi dir="ltr">
            {fa(Math.floor(game.oil))} / {fa(capacity)}
          </bdi>
          <i>
            <i
              style={{
                width: Math.min(100, (100 * game.oil) / capacity) + "%",
              }}
            />
          </i>
        </button>
        {showTreasury && (
          <button
            className={styles.order + " collect-income"}
            onClick={onCollect}
            data-opening-highlight={
              highlight?.startsWith("treasury") ? highlight : undefined
            }
            aria-label="برداشت از خزانه"
          >
            <Coins />
            <strong>برداشت خزانه</strong>
            <small>{fa(bank)} اعتبار</small>
          </button>
        )}
        {wave && (
          <button
            className={styles.sail + " idle-battle-start"}
            onClick={onBattle}
            data-opening-highlight={highlight === "wave" ? "wave" : undefined}
            aria-label="شروع دفاع"
          >
            <Anchor />
            <strong>شروع دفاع</strong>
          </button>
        )}
        {!showTreasury && !wave && (
          <div className={styles.cargo}>
            <Anchor size={18} />
            <span>
              {game.idle.port.tanker?.stage === "loading"
                ? "بار نفت‌کش"
                : "عوارض بعدی"}
            </span>
            <b>
              {game.idle.port.tanker?.stage === "loading"
                ? fa(Math.floor(game.idle.port.tanker.load)) + " بشکه"
                : fa(openingNextTollIn(game)) + " ثانیه"}
            </b>
          </div>
        )}
      </div>
      {help && (
        <button className={styles.help + " opening-help"} onClick={onHelp}>
          کمک برای این توقف
        </button>
      )}
    </section>
  );
}

/** A focusable projection of the live mesh for the first inspection. */
export function ShipCue({
  id,
  sync,
  map,
  inspect,
  paid,
}: {
  id: number;
  sync: GameSync3D;
  map: { onBeforeFrame(cb: () => void): () => void };
  inspect(target: OpeningLandmark): void;
  paid: boolean;
}) {
  const el = useRef<HTMLButtonElement>(null);
  const pressed = useRef<{ id: number; x: number; y: number } | null>(null);
  useEffect(() => {
    const anchor = { kind: "merchant" as const, id };
    const place = () => {
      if (!el.current) return;
      const p = sync.openingAnchor(anchor, true);
      el.current.hidden = !p || p.x < 7 || p.x > 93 || p.y < 15 || p.y > 80;
      if (p && !el.current.hidden) {
        el.current.style.left = p.x + "%";
        el.current.style.top = p.y + "%";
      }
    };
    place();
    return map.onBeforeFrame(place);
  }, [id, sync, map]);
  return (
    <button
      ref={el}
      className={styles.pin}
      aria-label="بررسی کشتی عبوری"
      onPointerDown={e => {
        if (!e.isPrimary) return;
        pressed.current={id:e.pointerId,x:e.clientX,y:e.clientY};
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerUp={e => {
        const start=pressed.current;
        pressed.current=null;
        if (start?.id===e.pointerId && Math.hypot(e.clientX-start.x,e.clientY-start.y)<9) inspect({kind:"merchant",id});
      }}
      onPointerCancel={()=>{pressed.current=null;}}
      onClick={e => { if (e.detail === 0) inspect({ kind: "merchant", id }); }}
    >
      <span>{paid ? "رسید عوارض" : "کشتی عبوری"}</span>
      <i />
    </button>
  );
}
