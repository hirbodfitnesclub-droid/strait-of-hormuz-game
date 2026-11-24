import { useEffect, useRef, useState } from "react";
import {
  Anchor,
  ArrowLeft,
  ChevronLeft,
  Clock3,
  Coins,
  Flag,
  Hammer,
  Heart,
  Lightbulb,
  LockKeyhole,
  MapPin,
  Radio,
  Settings2,
  Ticket,
  Trophy,
  Waves,
  X,
  Zap,
} from "lucide-react";
import {
  BUILDINGS,
  buildingUpgradeQuote,
  getStats,
  type BuildingId,
} from "../lib/game";
import { facilityCondition, openingCapacity } from "../lib/opening-industry";
import { MANAGERS, managerCost, type ManagerId } from "../lib/progression";
import economy from "../data/reopening/economy.json";
import {
  duration,
  fa,
  goalNames,
  operations,
  regionArt,
  regions,
  roles,
  works,
  type Role,
} from "./catalog";
import {
  clearedThrough,
  entryReason,
  nextPrestige,
  repairQuote,
  weekKey,
  type Report,
} from "./session";
import { Modes, Orders, Stars, type PageProps, type Sheet } from "./Pages";
import { RadioNote } from "./World";
import { exportJson } from "../lib/export-file";
import { LIVE, readPortable } from "./storage";

export function Dialog({
  close,
  title,
  children,
}: {
  close: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const previous = document.activeElement as HTMLElement | null;
    el.showModal();
    return () => {
      el.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="harbor-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientY < r.top ||
            e.clientY > r.bottom ||
            e.clientX < r.left ||
            e.clientX > r.right
          )
            close();
        }
      }}
    >
      <button className="dialog-close square" onClick={close} aria-label="بستن">
        <X size={19} />
      </button>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
const descriptions: Record<BuildingId, string> = {
  oil: "نفت خام از سکو به مخزن می‌رسد. اگر مخزن پر شود، پمپ می‌ایستد.",
  tank: "مخزن بزرگ‌تر به پمپ فرصت می‌دهد تا هنگام رفت‌وبرگشت نفت‌کش هم کار کند.",
  dock: "بارگیری سریع‌تر و اسکلهٔ بزرگ‌تر، فاصلهٔ میان تولید و فروش را کم می‌کند.",
  refinery:
    "بخشی از نفت را به سوخت تبدیل می‌کند. سوخت، شبکهٔ برق را روشن نگه می‌دارد.",
  power:
    "نیروگاه با سوخت کار می‌کند. کمبود برق، تولید صنعت و توان فانوس را پایین می‌آورد.",
  steel:
    "نفت و سوخت را به فولاد لازم برای فانوس‌ها، تعمیر و طرح‌های منطقه‌ای تبدیل می‌کند.",
  water: "آب شهرک و پالایشگاه را تأمین می‌کند.",
  city: "خدمات شهری پایدار، راندمان بندر را بالا می‌برد.",
  welfare: "با پشتیبانی از کارگران، پایداری شیفت و تولید را بیشتر می‌کند.",
  optical:
    "دیدبانی مسیر را تقویت می‌کند و وضعیت نشان‌های دریایی را زودتر آشکار می‌کند.",
  arms: "از سوخت و فولاد، تدارکات مورد نیاز بارنامه‌های بندری می‌سازد.",
};
export function Facility({
  id,
  guided,
  close,
  ...props
}: PageProps & { id: BuildingId; guided: boolean; close: () => void }) {
  const { h, store, toast } = props,
    p = h.port,
    o = p.opening!,
    level = p.buildings[id],
    quote = buildingUpgradeQuote(p, id),
    stats = getStats(p),
    wear = o.wear?.[id] ?? 0,
    repair = repairQuote(h, id);
  const cond = facilityCondition(p, id),
    receipt = () => {
      store.command({ type: "upgrade", id, level, guided });
      toast(BUILDINGS[id].short + " به سطح " + fa(level + 1) + " رسید");
      close();
    };
  return (
    <>
      <div className="building-portrait">
        <img src={"/harbor/facilities/" + id + ".webp"} alt="" />
        <span>زیرساخت بندر · {level ? "سطح " + fa(level) : "زمین آماده"}</span>
      </div>
      <h2>{id === "tank" ? "مخزن نفت" : BUILDINGS[id].short}</h2>
      <p>{descriptions[id]}</p>
      <div className="ticket-table">
        <div>
          <span>سطح</span>
          <strong>
            {fa(level)} ← {fa(quote.nextLevel)}
          </strong>
        </div>
        {id === "tank" ? (
          <div>
            <span>ظرفیت واقعی</span>
            <strong>
              {fa(openingCapacity(p))} ←{" "}
              {fa(
                500 *
                  quote.nextLevel *
                  cond *
                  (p.research.includes("tanktech") ? 1.2 : 1),
              )}{" "}
              بشکه
            </strong>
          </div>
        ) : (
          <div>
            <span>توان اسمی هر سطح</span>
            <strong>
              {fa(economy.facilities[id].base_output)}{" "}
              {id === "power" ? "مگاوات" : id === "city" ? "نفر" : "واحد"}
            </strong>
          </div>
        )}
        <div>
          <span>مصرف برق اضافه</span>
          <strong>{fa(economy.facilities[id].mw_per_level)} مگاوات</strong>
        </div>
        {wear > 0 && (
          <div>
            <span>راندمان پس از خسارت</span>
            <strong>{fa(cond * 100)}٪</strong>
          </div>
        )}
      </div>
      <button
        className="primary full"
        disabled={!quote.affordable}
        onClick={receipt}
      >
        <Hammer />
        {level >= 100
          ? "سطح نهایی"
          : (level ? "ارتقا" : "ساخت") + " · " + fa(quote.cost) + " ریال"}
      </button>
      {!quote.affordable && level < 100 && (
        <button
          className="wide-row"
          onClick={() => props.open({ kind: "treasury" })}
        >
          <Coins />
          موجودی نقد {fa(p.cash)} · خزانه {fa(p.idle.bank)}
          <ChevronLeft />
        </button>
      )}
      {wear > 0 && (
        <div className="order-choice">
          <b>برگ تعمیر · {fa(wear)} نقطه آسیب</b>
          <button
            className="secondary"
            disabled={!!h.repair}
            onClick={() => {
              store.command({
                type: "repair",
                id,
                damage: wear,
                method: repair.affordable ? "paid" : "service",
              });
              toast(
                repair.affordable
                  ? "یک نقطه تعمیر شد"
                  : "گروه تعمیر در راه است",
              );
            }}
          >
            {h.repair
              ? "گروه تعمیر · " + duration(h.repair.due - o.activeSeconds)
              : repair.affordable
                ? "تعمیر · " +
                  fa(repair.cash) +
                  " ریال و " +
                  fa(repair.steel) +
                  " فولاد" +
                  (p.cash < repair.cash ? " با برداشت از خزانه" : "")
                : "درخواست گروه تعمیر · ۳۰ ثانیه"}
          </button>
        </div>
      )}
      {(id === "dock" || id === "refinery") && (
        <label className="slider-label">
          سهم بارگیری صادرات · {fa(p.oilSplit)}٪
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={p.oilSplit}
            aria-label="سهم صادرات"
            onChange={(e) =>
              store.command({ type: "split", value: Number(e.target.value) })
            }
          />
        </label>
      )}
      {id === "power" && (
        <p className="note-inline">
          <Zap />
          {fa(stats.powerProduced)} مگاوات تولید و {fa(stats.powerUsed)} مگاوات
          مصرف
        </p>
      )}
    </>
  );
}
function Brief({
  id,
  close,
  ...props
}: PageProps & { id: number; close: () => void }) {
  const { h, store, open } = props,
    op = operations[id - 1],
    reason = entryReason(h, id);
  const [role, setRole] = useState<Role>(
      () => roles.find((r) => h.roles[r.id] > 0)?.id ?? "steady",
    ),
    [spaced, setSpaced] = useState(false);
  const project = works.find(
    (w) => op.projects.includes(w.id) && !h.port.opening!.works?.includes(w.id),
  );
  const estimate =
    Math.max(
      ...op.groups.map(
        (g) =>
          g.start_s +
          (g.count - 1) * g.spacing_s +
          (spaced ? (g.beat - 1) * 3 : 0),
      ),
    ) + 9;
  return (
    <>
      <div
        className="sheet-hero"
        style={{
          backgroundImage:
            "url(/harbor/" +
            (op.goal === "airdef" ? "watch" : regionArt[op.region - 1]) +
            ".webp)",
        }}
      >
        <small>
          <MapPin />
          {regions[op.region - 1]} · عملیات {fa(id)}
        </small>
      </div>
      <h2>{op.name}</h2>
      <p>{op.story}</p>
      <div className="chips">
        <span>
          <Flag />
          {goalNames[op.goal]}
        </span>
        <span>
          <Clock3 />
          {fa(estimate)} ثانیه
        </span>
        <span>
          <Coins />
          {fa(h.stars[id] ? op.repeatCash : op.firstCash)} ریال
        </span>
      </div>
      <div className="order-choice">
        <b>فرمان شیفت</b>
        <p>
          {op.quota
            ? "حداقل " +
              fa(op.quota) +
              "٪ " +
              (op.goal === "siege" ? "هر دو گذر را" : "نشان‌های پرچم‌دار را") +
              " حفظ کن."
            : op.escort
              ? "شناور همراه باید با چراغ روشن به اسکله برسد."
              : "تا پایان آخرین موج، چراغ بندر را روشن نگه دار."}
        </p>
        <div className="wave-preview">
          {op.groups.map((g) => (
            <span key={g.beat} className={"group-" + g.pattern}>
              {fa(g.count)} <Waves size={12} />
            </span>
          ))}
        </div>
        {op.spaced && (
          <div className="segment">
            <button aria-pressed={!spaced} onClick={() => setSpaced(false)}>
              نوبت عادی
            </button>
            <button aria-pressed={spaced} onClick={() => setSpaced(true)}>
              نوبت با فاصله
            </button>
          </div>
        )}
        <div className="role-picker">
          {roles
            .filter((r) => h.roles[r.id] > 0 || r.id === "steady")
            .map((r) => (
              <button
                key={r.id}
                className={role === r.id ? "chosen" : ""}
                onClick={() => setRole(r.id)}
              >
                {r.name}
              </button>
            ))}
        </div>
        {!h.roles[role] && (
          <small>
            {id === 1
              ? "فانوس امانی برای اولین عبور آماده است."
              : "فقط نور دستی همراه توست. فانوس ثابت در کارگاه ساخته می‌شود."}
          </small>
        )}
      </div>
      {reason && (
        <p className="note-inline">
          <LockKeyhole />
          {reason}
        </p>
      )}
      {project && clearedThrough(h) >= project.reveal_after && (
        <button
          className="secondary full"
          disabled={h.port.cash < project.cash || h.port.steel < project.steel}
          onClick={() => store.command({ type: "works", id: project.id })}
        >
          {project.fa} · {fa(project.cash)} ریال و {fa(project.steel)} فولاد
        </button>
      )}
      <button
        className="primary full"
        disabled={!!reason}
        onClick={() => {
          store.command({
            type: "launch",
            mode: "campaign",
            op: id,
            role,
            spaced,
            week: weekKey(Date.now()),
          });
          close();
        }}
      >
        آغاز عملیات {fa(id)}
        <ArrowLeft />
      </button>
      {id === 1 && reason && (
        <button
          className="wide-row"
          onClick={() => {
            store.command({
              type: "launch",
              mode: "practice",
              op: 0,
              role: "steady",
              spaced: false,
              week: 0,
            });
            close();
          }}
        >
          <Radio />
          تمرین آزاد فانوس
          <ChevronLeft />
        </button>
      )}
      {id > clearedThrough(h) + 1 && (
        <button
          className="wide-row"
          onClick={() => open({ kind: "brief", op: clearedThrough(h) + 1 })}
        >
          بازگشت به عملیات جاری
          <ChevronLeft />
        </button>
      )}
    </>
  );
}
function Preferences({
  h,
  store,
  toast,
  close,
}: PageProps & { close: () => void }) {
  const [imported, setImported] = useState<{
    text: string;
    count: number;
  } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const rows = [
    ["sound", "صدای بی‌سیم و بازخورد لمس"],
    ["motion", "حرکت آب و نور فانوس"],
    ["hints", "راهنمای ناخدا نوا"],
  ] as const;
  return (
    <>
      <div className="sheet-icon">
        <Settings2 />
      </div>
      <h2>تنظیمات بندر</h2>
      <div className="entry-list">
        {rows.map(([key, name]) => (
          <button
            key={key}
            className="switch-row"
            role="switch"
            aria-checked={h.settings[key]}
            onClick={() =>
              store.command({ type: "setting", key, on: !h.settings[key] })
            }
          >
            <span>{name}</span>
            <i className={h.settings[key] ? "on" : ""} />
          </button>
        ))}
      </div>
      <div className="order-choice">
        <b>ذخیرهٔ بازی</b>
        <p>
          پیشرفت روی همین دستگاه ذخیره می‌شود. نسخهٔ پشتیبان را می‌توان روی
          دستگاه دیگری بازیابی کرد. فایل پشتیبان نسخهٔ قدیمی هم پذیرفته می‌شود.
        </p>
        <div className="controls">
          <button
            className="secondary"
            onClick={async () => {
              try {
                store.save();
                const raw = localStorage.getItem(LIVE);
                if (!raw) throw Error();
                await exportJson("hormuz-harbor.json", JSON.parse(raw));
              } catch {
                toast("فایل ذخیره صادر نشد");
              }
            }}
          >
            خروجی ذخیره
          </button>
          <button className="outline" onClick={() => input.current?.click()}>
            خواندن فایل
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              if (file.size > 4000000) throw Error();
              const text = await file.text(),
                data = readPortable(text);
              setImported({ text, count: clearedThrough(data) });
            } catch {
              toast("این فایل، ذخیرهٔ معتبر بندر نیست");
            }
            e.target.value = "";
          }}
        />
        {imported && (
          <>
            <p>
              ذخیرهٔ این دستگاه با بندری دارای {fa(imported.count)} عملیات کامل
              جایگزین می‌شود.
            </p>
            <button
              className="primary"
              onClick={() => {
                if (store.import(imported.text)) {
                  close();
                  toast("بندر بازیابی شد");
                }
              }}
            >
              تأیید جایگزینی
            </button>
            <button className="outline" onClick={() => setImported(null)}>
              انصراف
            </button>
          </>
        )}
      </div>
      <small className="version-line">تنگه هرمز · بازگشایی · نسخهٔ ۱٫۰٫۰</small>
    </>
  );
}
export function SheetBody({
  s,
  close,
  guided,
  ...props
}: PageProps & { s: Sheet; close: () => void; guided: boolean }) {
  const { h, store, toast } = props,
    p = h.port,
    o = p.opening!;
  const [confirm, setConfirm] = useState(false);
  if (s.kind === "building")
    return <Facility {...props} id={s.id} close={close} guided={guided} />;
  if (s.kind === "brief") return <Brief {...props} id={s.op} close={close} />;
  if (s.kind === "settings") return <Preferences {...props} close={close} />;
  if (s.kind === "order") return <Orders {...props} id={s.id} close={close} />;
  if (s.kind === "modes") return <Modes {...props} close={close} />;
  if (s.kind === "crew")
    return (
      <>
        <div className="sheet-icon">
          <Radio />
        </div>
        <h2>مدیران شیفت</h2>
        {(Object.keys(MANAGERS) as ManagerId[]).map((id) => {
          const m = MANAGERS[id],
            l = p.idle.managerLevels[id],
            cost = managerCost(id, l);
          return (
            <div className="entry" key={id}>
              <img
                className="crew-face"
                src={"/harbor/crew-" + id + ".webp"}
                alt=""
              />
              <div className="entry-body">
                <b>
                  {m.name} · {m.role}
                </b>
                <small>
                  {id === "harbor"
                    ? "برداشت خودکار هر ۱۰ ثانیه"
                    : id === "energy"
                      ? "افزایش تولید نفت و پالایش"
                      : "توان بیشتر نور دستی در گذرها"}
                </small>
                <small>
                  سطح {fa(l)} · {fa(cost)} ریال
                </small>
              </div>
              <button
                className="outline"
                disabled={l >= 5 || p.cash < cost || p.idle.xp < m.unlockXp}
                onClick={() => store.command({ type: "manager", id, level: l })}
              >
                {p.idle.xp < m.unlockXp
                  ? fa(m.unlockXp) + " تجربه"
                  : l
                    ? "ارتقا"
                    : "استخدام"}
              </button>
            </div>
          );
        })}
      </>
    );
  if (s.kind === "prestige") {
    const award = nextPrestige(h);
    return (
      <>
        <div className="sheet-hero night" />
        <h2>راه‌اندازی بندر تازه</h2>
        <p>
          پس از عملیات ۴۵، می‌توانی یک نشان فرماندهی بگیری و بندری تازه با درآمد
          بیشتر بسازی.
        </p>
        <div className="ticket-table">
          <div>
            <span>درآمد شیفت بعد</span>
            <b>{fa(award.percent)}٪</b>
          </div>
          <div>
            <span>اوراق و پرچم‌ها</span>
            <b>منتقل می‌شوند</b>
          </div>
          <div>
            <span>ساختمان‌ها، نقد و عملیات</span>
            <b>شروع از ابتدا</b>
          </div>
        </div>
        <button
          className="primary full"
          disabled={!h.stars[45] || !!h.jobs.length}
          onClick={() => {
            if (!confirm) {
              setConfirm(true);
              return;
            }
            store.command({ type: "new-run", run: h.run });
            close();
            toast("شیفت تازه آغاز شد");
          }}
        >
          {confirm
            ? "تأیید شروع بندر تازه"
            : h.jobs.length
              ? "ابتدا بارنامه‌ها را ببند"
              : "بررسی شروع تازه"}
        </button>
      </>
    );
  }
  if (s.kind === "dock") {
    const t = p.idle.port.tanker;
    return (
      <>
        <div className="sheet-hero freight" />
        <h2>اسکلهٔ صادرات</h2>
        <p>
          {t?.stage === "loading"
            ? "نفت از مخزن بندر وارد نفت‌کش می‌شود. فقط بار تازه درآمد می‌سازد."
            : t?.stage === "depart"
              ? "نفت‌کش پر راه افتاد. تا رسیدن شناور بعدی، نفت در مخزن می‌ماند."
              : "اسکله منتظر ورود نفت‌کش بعدی است."}
        </p>
        <div className="ticket-table">
          <div>
            <span>بار روی نفت‌کش</span>
            <b>
              {fa(t?.load ?? 0)} / {fa(500 + 500 * p.buildings.dock)} بشکه
            </b>
          </div>
          <div>
            <span>فروش ثبت‌شده</span>
            <b>{fa(o.ledger.exportIncome)} ریال</b>
          </div>
          <div>
            <span>سفرهای کامل</span>
            <b>{fa(p.idle.port.cycles)}</b>
          </div>
        </div>
        <button
          className="primary full"
          onClick={() => props.open({ kind: "building", id: "dock" })}
        >
          مدیریت اسکله
          <ArrowLeft />
        </button>
      </>
    );
  }
  return (
    <>
      <div className="sheet-hero vault" />
      <h2>خزانهٔ بندر</h2>
      <p>فروش نفت خودت و عوارض کشتی‌های عبوری اینجا جمع می‌شود.</p>
      <div className="ticket-table">
        <div>
          <span>قابل برداشت</span>
          <strong>{fa(p.idle.bank)} ریال</strong>
        </div>
        <div>
          <span>نقد در دست</span>
          <b>{fa(p.cash)} ریال</b>
        </div>
        <div>
          <span>آخرین عوارض</span>
          <b>
            {o.lastToll
              ? fa(o.lastToll.amount) + " ریال"
              : "در انتظار اولین کشتی"}
          </b>
        </div>
      </div>
      <button
        className="primary full"
        disabled={p.idle.bank < 1}
        onClick={() => {
          const n = Math.floor(p.idle.bank);
          store.command({ type: "collect" });
          toast(fa(n) + " ریال به حساب بندر رسید");
          close();
        }}
      >
        <Coins />
        برداشت {fa(p.idle.bank)} ریال
      </button>
    </>
  );
}
export function Debrief({
  r,
  h,
  close,
  open,
}: PageProps & { r: Report; close: () => void }) {
  const op = operations[r.op - 1],
    practice = r.mode === "practice";
  const why =
    r.hp <= 0
      ? "موج‌ها از خط فانوس گذشتند."
      : r.cargo === 0
        ? "چراغ شناور همراه خاموش شد."
        : "سهمیهٔ گذر تأمین نشد.";
  return (
    <>
      <div className={"sheet-hero " + (r.win ? "win" : "night")} />
      <small className="eyebrow">
        {practice ? "گزارش تمرین" : "گزارش پایان گذر"}
      </small>
      <h2>
        {practice
          ? "پایان تمرین فانوس"
          : r.win
            ? "گذر با موفقیت باز شد"
            : "کاروان به اسکله نرسید"}
      </h2>
      <Stars value={r.stars} />
      <p>
        {practice
          ? "در شیفت واقعی هم لمس حلقهٔ طلایی نور بیشتری می‌فرستد."
          : r.win
            ? op.news
            : why + " نوبت فانوس یا اولویت نشان‌ها را عوض کن و دوباره وارد شو."}
      </p>
      <div className="ledger-nums">
        <span>
          <Heart />
          {fa(r.hp)}
          <small>سلامت بندر</small>
        </span>
        <span>
          <Lightbulb />
          {fa(r.manual)}
          <small>فرمان دستی</small>
        </span>
        <span>
          <Clock3 />
          {fa(r.seconds)}
          <small>ثانیهٔ گذر</small>
        </span>
      </div>
      <div className="chips">
        {r.cash > 0 && (
          <span>
            <Coins />+{fa(r.cash)} ریال
          </span>
        )}
        {r.bonds > 0 && (
          <span>
            <Ticket />+{fa(r.bonds)} اوراق
          </span>
        )}
        {r.mode === "weekly" && (
          <span>
            <Trophy />
            {fa(r.points)} امتیاز
          </span>
        )}
        {r.wear.length > 0 && (
          <span>
            <Hammer />
            {fa(r.wear.length)} نقطه آسیب
          </span>
        )}
      </div>
      {r.op === 45 && r.win && r.mode === "campaign" && (
        <RadioNote>
          چراغ هر سه بندر روشن است. شیفت آزاد و بندر تازه در دفتر منتظر تو
          هستند.
        </RadioNote>
      )}
      <button className="primary full" onClick={close}>
        بازگشت به بندر
        <Anchor />
      </button>
      {r.wear[0] && (
        <button
          className="wide-row"
          onClick={() => {
            close();
            open({ kind: "building", id: r.wear[0] });
          }}
        >
          <Hammer />
          دیدن برگ تعمیر
          <ChevronLeft />
        </button>
      )}
      {!practice && r.mode === "campaign" && !r.win && (
        <button
          className="wide-row"
          onClick={() => {
            close();
            open({ kind: "brief", op: r.op });
          }}
        >
          آماده‌سازی دوباره
          <ChevronLeft />
        </button>
      )}
    </>
  );
}
