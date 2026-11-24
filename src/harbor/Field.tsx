import { useEffect, useRef } from "react";
import {
  Activity,
  Anchor,
  Check,
  ChevronsLeft,
  Diamond,
  Heart,
  Lightbulb,
  Pause,
  Play,
  Radio,
  Ship,
  Shield,
  SkipForward,
  Waves,
} from "lucide-react";
import { fa, goalNames } from "./catalog";
import { planFor, scheduleFor, type Voyage, type Signal } from "./signals";
import type { HarborStore } from "./useHarbor";

import { pathPoint } from "./routes";
function position(s: Signal, t: number, board: string) {
  const p = pathPoint(board, s.lane, (t - s.at) / (s.until - s.at));
  return { x: p.x + Math.sin(s.id * 1.73) * 2.2, y: p.y };
}
function ChartLines({ v }: { v: Voyage }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const op = planFor(v),
    two = op.groups.some((g) => g.channel === "B");
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    function draw() {
      if (!cv) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1),
        w = cv.clientWidth,
        h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 1.8;
      ctx.setLineDash([3, 7]);
      for (const lane of two ? ["A", "B"] : ["A"]) {
        ctx.strokeStyle =
          lane === "A" ? "rgba(187,255,234,.76)" : "rgba(255,215,152,.8)";
        ctx.beginPath();
        for (let n = 0; n <= 100; n++) {
          const p = pathPoint(op.board, lane as "A" | "B", n / 100);
          if (!n) ctx.moveTo((p.x * w) / 100, (p.y * h) / 100);
          else ctx.lineTo((p.x * w) / 100, (p.y * h) / 100);
        }
        ctx.stroke();
      }
      const target = v.active.find((item) => item.id === v.beamId);
      if (target) {
        const p = position(target, v.time, op.board);
        ctx.setLineDash([]);
        ctx.lineWidth = 3;
        const glow = ctx.createLinearGradient(
          w * 0.43,
          h * 0.87,
          (p.x * w) / 100,
          (p.y * h) / 100,
        );
        glow.addColorStop(0, "rgba(255,219,125,0)");
        glow.addColorStop(0.9, "rgba(255,227,147,.76)");
        glow.addColorStop(1, "#fff3c3");
        ctx.strokeStyle = glow;
        ctx.beginPath();
        ctx.moveTo(w * 0.43, h * 0.87);
        ctx.lineTo((p.x * w) / 100, (p.y * h) / 100);
        ctx.stroke();
      }
    }
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [v, two, op.board]);
  return <canvas ref={ref} className="sea-lines" aria-hidden="true" />;
}
export function Field({
  store,
  sound,
}: {
  store: HarborStore;
  sound: (good?: boolean) => void;
}) {
  const v = store.h!.voyage!,
    op = planFor(v),
    list = scheduleFor(v),
    two = op.groups.some((g) => g.channel === "B");
  const next = list[v.cursor],
    ready = v.time >= v.chargeAt;
  const group = Math.min(
    op.groups.length,
    Math.floor((list[Math.max(0, v.cursor - 1)]?.id ?? 100) / 100),
  );
  const hit = (id: number) => {
    if (!ready || store.paused) return;
    const before = v.manual;
    store.command({ type: "tap", id });
    if (store.h?.voyage?.manual !== before) sound(true);
  };
  const target = v.active[0],
    duration = list[list.length - 1].until;
  const convoy = pathPoint(op.board, "A", Math.min(1, v.time / duration));
  const halo = v.flashTarget
    ? position(v.flashTarget, v.flashAt, op.board)
    : null;
  return (
    <section className="field-layout">
      <header className="battle-head">
        <div>
          <small>
            {v.mode === "practice"
              ? "آبراه تمرینی"
              : v.mode === "weekly"
                ? "چالش هفتگی"
                : v.mode === "endless"
                  ? "شیفت بی‌پایان"
                  : "عملیات " + fa(v.op)}{" "}
            <b>·</b> {goalNames[op.goal]}
          </small>
          <h1>{op.name}</h1>
        </div>
        <div className="head-tools">
          <button onClick={store.pace} aria-label="سرعت بازی">
            {fa(store.speed)}×
          </button>
          <button
            onClick={() => store.pause(!store.paused)}
            aria-label={store.paused ? "ادامه بازی" : "مکث"}
          >
            {store.paused ? <Play /> : <Pause />}
          </button>
        </div>
      </header>
      <div
        className="sea-field"
        style={{ backgroundImage: "url(/harbor/sea-" + op.region + ".webp)" }}
      >
        <ChartLines v={v} />
        <div className="field-hud">
          <span>
            <Heart />
            {fa(v.hp)} / ۲۰
          </span>
          {v.cargo !== null && (
            <span>
              <Ship />
              {fa(v.cargo)} / {fa(op.escort!)}
            </span>
          )}
          <span>
            <Waves />
            {fa(group)} / {fa(op.groups.length)}
          </span>
        </div>
        {v.cargo !== null && (
          <div
            className="convoy"
            style={{
              left: convoy.x + "%",
              top:
                (op.goal === "structure" || op.goal === "hold"
                  ? 76
                  : convoy.y) + "%",
            }}
          >
            <img
              src={
                op.goal === "structure" || op.goal === "hold"
                  ? "/harbor/facilities/dock.webp"
                  : "/harbor/merchant.webp"
              }
              alt="هدف حفاظت‌شده"
            />
            <b>
              <Shield size={10} />
              {fa(v.cargo)}
            </b>
          </div>
        )}
        {two && (
          <div className="gates">
            <span style={{ left: pathPoint(op.board, "A", 0).x + "%" }}>
              الف
            </span>
            <span style={{ left: pathPoint(op.board, "B", 0).x + "%" }}>ب</span>
          </div>
        )}
        {halo && v.time - v.flashAt < 0.5 && (
          <i
            className="hit-ring"
            key={v.manual}
            style={{ left: halo.x + "%", top: halo.y + "%" }}
          />
        )}
        <div className="station">
          <img src="/harbor/lighthouse.webp" alt="فانوس بندر" />
        </div>
        {v.active.map((s) => {
          const p = position(s, v.time, op.board),
            progress = (v.time - s.at) / (s.until - s.at),
            sweet = progress >= 0.3 && progress <= 0.73;
          return (
            <button
              key={s.id}
              data-signal={s.id}
              className={
                "signal sig-" +
                s.pattern +
                (s.marked ? " marked" : "") +
                (sweet ? " sweet" : "") +
                (s.signature ? " signature" : "")
              }
              style={{ left: p.x + "%", top: p.y + "%" }}
              onClick={() => hit(s.id)}
              aria-label={"روشن کردن نشان " + fa(s.id)}
            >
              {s.pattern === "a" ? (
                <Waves />
              ) : s.pattern === "b" ? (
                <Activity />
              ) : (
                <Diamond />
              )}
              <i className="signal-health">
                <i style={{ width: (s.left / s.work) * 100 + "%" }} />
              </i>
            </button>
          );
        })}
        {!target && !store.paused && next && (
          <div className="incoming">
            <Radio />
            <span>
              موج بعدی تا {fa(Math.max(1, Math.ceil(next.at - v.time)))} ثانیه
              {store.h!.port.buildings.optical > 0 && v.mode !== "weekly"
                ? " · " + { a: "منظم", b: "فشرده", c: "سنگین" }[next.pattern]
                : ""}
            </span>
          </div>
        )}
        {v.time - v.flashAt < 0.65 && (
          <div className="flash-feedback" aria-live="off">
            {v.streak > 0 ? (
              <>
                <Check />
                {v.streak % 3 === 0 ? "نور زنجیره‌ای" : "دقیق"}{" "}
                {v.streak > 1 ? "× " + fa(v.streak) : ""}
              </>
            ) : (
              <>
                <Lightbulb />
                نور رسید
              </>
            )}
          </div>
        )}
        {store.paused && (
          <div className="pause-curtain">
            <Anchor size={34} />
            <h2>گذر متوقف است</h2>
            <button className="primary" onClick={() => store.pause(false)}>
              <Play />
              ادامهٔ گذر
            </button>
          </div>
        )}
      </div>
      <div className="battle-deck">
        <div className="wave-meter" aria-label="پیشرفت عملیات">
          <i
            style={{
              width: ((v.cleared + v.escaped) / list.length) * 100 + "%",
            }}
          />
        </div>
        <p>
          {v.mode === "practice" || v.op <= 2
            ? "وقتی حلقه طلایی شد، نشان را لمس کن."
            : op.quota
              ? "نشان‌های پرچم‌دار را تا سهمیهٔ " + fa(op.quota) + "٪ روشن کن."
              : "پیش از رسیدن موج‌ها به فانوس، مسیر را روشن کن."}
        </p>
        <div className="controls">
          <button
            className="primary"
            disabled={!target || !ready || store.paused}
            onClick={() => target && hit(target.id)}
          >
            <Lightbulb />
            {ready ? "تاباندن نور" : "شارژ فانوس"}
          </button>
          <button
            className="secondary"
            onClick={() => store.command({ type: "priority" })}
          >
            <Shield size={16} />
            {v.policy === "soon" ? "اول نزدیک‌ترین" : "اول پرچم‌دار"}
          </button>
          {v.mode === "practice" && (
            <button
              className="square"
              aria-label="پایان تمرین"
              onClick={() => store.command({ type: "end-practice" })}
            >
              <SkipForward />
            </button>
          )}
        </div>
        <small className="field-count">
          <ChevronsLeft size={13} />
          {fa(v.cleared)} از {fa(list.length)} نشان عبور کرد
        </small>
      </div>
    </section>
  );
}
