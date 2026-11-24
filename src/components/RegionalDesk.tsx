"use client";

import { useState } from "react";
import {
  Anchor,
  ArrowRight,
  Check,
  Clock3,
  Compass,
  Lightbulb,
  Package,
  Pause,
  Play,
  X,
} from "lucide-react";
import type { GameState } from "@/lib/game";
import {
  contracts,
  duration,
  fa,
  goalNames,
  goodsKeys,
  goodsNames,
  operations,
  regions,
  roles,
  works,
  type Role,
} from "@/harbor/catalog";
import {
  clearedThrough,
  contractQuote,
  entryReason,
  nextPrestige,
  repairQuote,
  stationPrice,
  weekKey,
  type Harbor,
  type Intent,
} from "@/harbor/session";
import { harborFor } from "@/harbor/restored";
import { planFor, score } from "@/harbor/signals";
import { useDialog } from "./useDialog";
import styles from "./regional-desk.module.css";

type Command = (action: Intent) => void;
const facilityNames: Record<string, string> = {
  dock: "اسکله",
  tank: "مخزن",
  power: "نیروگاه",
  oil: "سکو",
  steel: "فولاد",
  refinery: "پالایشگاه",
  arms: "تدارکات",
  water: "آب",
  city: "شهر",
  welfare: "رفاه",
  optical: "گمرک",
};

export function RegionalDesk({
  game,
  command,
  close,
}: {
  game: GameState;
  command: Command;
  close(): void;
}) {
  const [tab, setTab] = useState<"sail" | "build" | "orders">("sail");
  const h = harborFor(game),
    front = clearedThrough(h);
  const [selected, setSelected] = useState(
    Math.min(45, Math.max(26, front + 1)),
  );
  const [role, setRole] = useState<Role>("steady");
  const [spaced, setSpaced] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ref = useDialog<HTMLElement>(close);
  const op = operations[selected - 1];
  const reason = entryReason(h, selected);
  function launch(mode: "campaign" | "practice" | "weekly" | "endless") {
    command({
      type: "launch",
      mode,
      op: selected,
      role,
      spaced,
      week: weekKey(Date.now()),
    });
    close();
  }
  return (
    <div className={styles.backdrop} onClick={close}>
      <section
        className={styles.sheet}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="regional-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <small>دفتر اسکله</small>
            <h2 id="regional-title">کشتیرانی منطقه‌ای</h2>
          </div>
          <button aria-label="بازگشت به بندر" onClick={close}>
            <X />
          </button>
        </header>
        <nav aria-label="بخش‌های کشتیرانی">
          {(
            [
              ["sail", "گذرها", Compass],
              ["build", "تجهیز اسکله", Anchor],
              ["orders", "بارنامه", Package],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
        <div className={styles.body}>
          {tab === "sail" && (
            <>
              <label>
                گذر منطقه‌ای
                <select
                  value={selected}
                  onChange={(e) => setSelected(Number(e.target.value))}
                >
                  {operations.slice(25).map((o) => (
                    <option key={o.id} value={o.id}>
                      {fa(o.id)} · {regions[o.region - 1]} · {o.name}
                      {h.stars[o.id] ? " ★" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <h3>{op.name}</h3>
              <p>{op.story}</p>
              <div className={styles.row}>
                <span>هدف</span>
                <b>{goalNames[op.goal]}</b>
              </div>
              <label>
                تجهیز گذر
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  {roles
                    .filter((r) => r.id === "steady" || h.roles[r.id] > 0)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} · {fa(h.roles[r.id])}
                      </option>
                    ))}
                </select>
              </label>
              {op.spaced && (
                <label>
                  <input
                    type="checkbox"
                    checked={spaced}
                    onChange={(e) => setSpaced(e.target.checked)}
                  />
                  فاصله‌گذاری کاروان
                </label>
              )}
              <button
                className={styles.primary}
                disabled={!!reason}
                onClick={() => launch("campaign")}
              >
                <Play size={17} />
                آغاز گذر {fa(selected)}
              </button>
              {reason && (
                <p className={styles.note}>
                  {front < 25
                    ? "با پایان عملیات ۲۵ بندرعباس، مسیر قشم باز می‌شود."
                    : reason}
                </p>
              )}
              <div className={styles.actions}>
                <button onClick={() => launch("practice")}>
                  <Lightbulb size={17} />
                  تمرین داوطلبانهٔ فانوس
                </button>
                {front >= 25 && (
                  <button onClick={() => launch("weekly")}>شیفت هفتگی</button>
                )}
                {front >= 45 && (
                  <button onClick={() => launch("endless")}>
                    گذر بی‌پایان
                  </button>
                )}
              </div>
              {front >= 45 && (
                <section>
                  <h3>واگذاری بندر</h3>
                  <p>
                    توان درآمد دور بعد {fa(nextPrestige(h).percent)}٪ بالاتر از
                    پایه است. آرشیو، اوراق و نشان‌های قبلی همراهت می‌مانند.
                  </p>
                  {confirm ? (
                    <div className={styles.actions}>
                      <button
                        onClick={() => {
                          command({ type: "new-run", run: h.run });
                          close();
                        }}
                      >
                        تأیید واگذاری
                      </button>
                      <button onClick={() => setConfirm(false)}>
                        حفظ بندر فعلی
                      </button>
                    </div>
                  ) : (
                    <button
                      disabled={!!h.jobs.length}
                      onClick={() => setConfirm(true)}
                    >
                      پیش‌نمایش واگذاری
                    </button>
                  )}
                </section>
              )}
            </>
          )}
          {tab === "build" && (
            <>
              <div className={styles.row}>
                <span>اعتبار بندر</span>
                <b>{fa(game.cash)}</b>
                <span>فولاد</span>
                <b>{fa(game.steel)}</b>
              </div>
              {works.map((item) => {
                const built = game.opening?.works?.includes(item.id);
                return (
                  <article key={item.id}>
                    <h3>{item.fa}</h3>
                    <p>
                      پیش‌نیاز عملیات {fa(item.before_op)} · {fa(item.cash)}{" "}
                      اعتبار و {fa(item.steel)} فولاد
                    </p>
                    <button
                      disabled={
                        built ||
                        front < item.reveal_after ||
                        game.cash < item.cash ||
                        game.steel < item.steel
                      }
                      onClick={() => command({ type: "works", id: item.id })}
                    >
                      {built
                        ? "ساخته شد"
                        : front < item.reveal_after
                          ? "پس از عملیات " + fa(item.reveal_after)
                          : "ساخت طرح"}
                    </button>
                  </article>
                );
              })}
              {roles.map((r) => {
                const q = stationPrice(h, r.id);
                return (
                  <article key={r.id}>
                    <h3>
                      {r.name} · سطح {fa(h.roles[r.id])}
                    </h3>
                    <button
                      disabled={
                        !q.available ||
                        game.cash < q.cash ||
                        game.steel < q.steel
                      }
                      onClick={() =>
                        command({
                          type: "station",
                          role: r.id,
                          level: h.roles[r.id],
                        })
                      }
                    >
                      ارتقا · {fa(q.cash)} اعتبار و {fa(q.steel)} فولاد
                    </button>
                  </article>
                );
              })}
              {Object.entries(game.opening?.wear ?? {})
                .filter(([, n]) => n > 0)
                .map(([k, n]) => {
                  const id = k as keyof GameState["buildings"];
                  const q = repairQuote(h, id);
                  return (
                    <article key={k}>
                      <h3>تعمیر {facilityNames[k]}</h3>
                      <p>
                        {fa(q.cash)} اعتبار و {fa(q.steel)} فولاد
                      </p>
                      <button
                        disabled={!!h.repair}
                        onClick={() =>
                          command({
                            type: "repair",
                            id,
                            damage: n,
                            method: q.affordable ? "paid" : "service",
                          })
                        }
                      >
                        {h.repair
                          ? "تعمیر در جریان"
                          : q.affordable
                            ? "تعمیر"
                            : "خدمات رایگان"}
                      </button>
                    </article>
                  );
                })}
            </>
          )}
          {tab === "orders" && <Freight h={h} command={command} />}
        </div>
      </section>
    </div>
  );
}

function Freight({ h, command }: { h: Harbor; command: Command }) {
  const front = clearedThrough(h);
  const [chosen, setChosen] = useState("");
  const available = contracts.filter((c) => c.requires_op_cleared <= front);
  const c = available.find((x) => x.id === chosen) ?? available[0];
  return (
    <>
      <div className={styles.row}>
        <span>اوراق بندر</span>
        <b>{fa(h.bonds)}</b>
        <span>جای بار</span>
        <b>
          {fa(h.jobs.length)} / {fa(h.secondSlot ? 2 : 1)}
        </b>
      </div>
      {front >= 25 && !h.secondSlot && (
        <button
          disabled={h.bonds < 280}
          onClick={() => command({ type: "second-slot" })}
        >
          گشودن جای بار دوم · ۲۸۰ اوراق
        </button>
      )}
      {h.jobs.map((j) => (
        <article key={j.ticket}>
          <h3>{contracts.find((c) => c.id === j.sheet)?.title_fa}</h3>
          <p>
            <Clock3 size={14} /> {duration(Math.max(0, j.due - h.wall))} ·{" "}
            {fa(j.cash)} اعتبار
          </p>
          <div className={styles.actions}>
            <button
              disabled={h.wall < j.due}
              onClick={() =>
                command({ type: "shipment", ticket: j.ticket, how: "settle" })
              }
            >
              تحویل بار
            </button>
            {h.wall < j.due && (
              <>
                <button
                  onClick={() =>
                    command({
                      type: "shipment",
                      ticket: j.ticket,
                      how: "cancel",
                    })
                  }
                >
                  برگرداندن بار
                </button>
                <button
                  disabled={h.bonds < 25}
                  onClick={() =>
                    command({
                      type: "shipment",
                      ticket: j.ticket,
                      how: "instant",
                    })
                  }
                >
                  تحویل فوری · ۲۵ اوراق
                </button>
              </>
            )}
          </div>
        </article>
      ))}
      {!c ? (
        <p>
          با رسیدن به نخستین قرارداد منطقه‌ای، دو روش تحویل و بار لازم اینجا
          دیده می‌شوند.
        </p>
      ) : (
        <>
          <label>
            بارنامه
            <select value={c.id} onChange={(e) => setChosen(e.target.value)}>
              {available.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.title_fa}
                </option>
              ))}
            </select>
          </label>
          <p>{c.brief_fa}</p>
          {c.options.map((o) => {
            const q = contractQuote(h, c.id, o.id)!;
            return (
              <article key={o.id}>
                <h3>{o.label_fa}</h3>
                <p>
                  {goodsKeys
                    .filter((k) => q.manifest[k])
                    .map((k) => fa(q.manifest[k]!) + " " + goodsNames[k])
                    .join(" · ")}{" "}
                  · {duration(o.service_wall_s)}
                </p>
                <button
                  disabled={
                    !q.affordable || h.jobs.length >= (h.secondSlot ? 2 : 1)
                  }
                  onClick={() =>
                    command({
                      type: "dispatch",
                      sheet: c.id,
                      option: o.id,
                      serial: h.serial,
                    })
                  }
                >
                  ارسال · {fa(q.cash)} اعتبار
                </button>
              </article>
            );
          })}
        </>
      )}
    </>
  );
}

export function VoyageControls({
  h,
  paused,
  pause,
  command,
}: {
  h: Harbor;
  paused: boolean;
  pause(): void;
  command: Command;
}) {
  const v = h.voyage!;
  const op = planFor(v),
    ready = v.time >= v.chargeAt && !paused;
  const target = v.active.find((s) => s.id === v.beamId) ?? v.active[0];
  return (
    <div className={styles.voyage} data-voyage={v.mode}>
      <div className={styles.instrument}>
        <div>
          <small>
            {v.mode === "practice" ? "تمرین فانوس" : regions[op.region - 1]}
          </small>
          <strong>{op.name}</strong>
        </div>
        <div>
          <b>{fa(v.hp)} / ۲۰</b>
          {v.cargo !== null && (
            <small>
              کاروان {fa(v.cargo)} / {fa(op.escort!)}
            </small>
          )}
        </div>
        <button onClick={pause} aria-label={paused ? "ادامهٔ گذر" : "مکث گذر"}>
          {paused ? <Play /> : <Pause />}
        </button>
      </div>
      <div className={styles.voyageBottom}>
        <p>
          {paused
            ? "گذر متوقف است."
            : v.mode === "practice"
              ? "روی شناورِ چراغ‌دار بزن تا نور فانوس به آن برسد."
              : goalNames[op.goal] + " · " + fa(score(v).quota) + "٪"}
        </p>
        <div className={styles.actions}>
          {paused ? (
            <button className={styles.primary} onClick={pause}>
              <Play />
              ادامهٔ گذر
            </button>
          ) : (
            <button
              className={styles.primary}
              disabled={!ready || !target}
              onClick={() => target && command({ type: "tap", id: target.id })}
            >
              <Lightbulb />
              تاباندن نور
            </button>
          )}
          <button onClick={() => command({ type: "priority" })}>
            {v.policy === "marked" ? "اولویت نشان‌دار" : "اولویت نزدیک"}
          </button>
          {v.mode === "practice" && (
            <button
              aria-label="پایان تمرین"
              onClick={() => command({ type: "end-practice" })}
            >
              <ArrowRight />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function VoyageReport({ h, close }: { h: Harbor; close(): void }) {
  const r = h.result!;
  const ref = useDialog<HTMLElement>(close);
  return (
    <div className={styles.backdrop}>
      <section
        className={styles.sheet}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="گزارش گذر"
        tabIndex={-1}
      >
        <div className={styles.body}>
          <small>
            دفتر اسکله · {r.mode === "practice" ? "تمرین" : fa(r.op)}
          </small>
          <h2>{r.win ? "گذر کامل شد" : "گذر به پایان رسید"}</h2>
          <p>
            سلامت بندر {fa(r.hp)} · شناور از دست رفته {fa(r.lost)} · نشان‌های
            عبور {fa(r.quota)}٪
          </p>
          {r.cash > 0 && (
            <p>
              رسید درآمد {fa(r.cash)} اعتبار · {fa(r.bonds)} اوراق
            </p>
          )}
          {r.wear.length > 0 && (
            <p>
              نیاز به تعمیر · {r.wear.map((id) => facilityNames[id]).join("، ")}
            </p>
          )}
          <button className={styles.primary} onClick={close}>
            <Check />
            بازگشت به بندر
          </button>
        </div>
      </section>
    </div>
  );
}
