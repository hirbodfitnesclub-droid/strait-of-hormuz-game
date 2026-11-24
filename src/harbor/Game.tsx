"use client";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import {
  Anchor,
  BookOpen,
  Check,
  ChevronLeft,
  Coins,
  Compass,
  Droplet,
  Flag,
  Hammer,
  Map,
  Radio,
  RotateCw,
  Settings2,
  Zap,
} from "lucide-react";
import { buildingUpgradeQuote, getStats } from "../lib/game";
import economy from "../data/reopening/economy.json";
import { openingFocus, openingAttentionRules } from "../lib/opening-attention";
import { openingNextTollIn } from "../lib/opening-industry";
import { useOpeningHint } from "../components/useOpeningHint";
import { fa, operations, regions } from "./catalog";
import { clearedThrough, entryReason } from "./session";
import { useHarbor } from "./useHarbor";
import { Chart, Logbook, Workshop, type PageProps, type Sheet } from "./Pages";
import { Debrief, Dialog, SheetBody } from "./Sheets";
import { Field } from "./Field";
import { RadioNote, World, type PortPoint } from "./World";
import { chime } from "./audio";

const tabs = [
  { id: "port", label: "بندر", icon: Anchor },
  { id: "yard", label: "کارگاه", icon: Hammer },
  { id: "chart", label: "عملیات", icon: Compass },
  { id: "log", label: "دفتر", icon: BookOpen },
] as const;
type Tab = (typeof tabs)[number]["id"];

function HarborView({
  h,
  open,
  store,
  guided,
  highlight,
  selectPoint,
  showChart,
}: PageProps & {
  guided: string | null;
  highlight: ReturnType<typeof openingFocus>;
  selectPoint: (id: PortPoint) => void;
  showChart: () => void;
}) {
  const p = h.port,
    o = p.opening!,
    front = clearedThrough(h),
    id = Math.min(45, front + 1),
    op = operations[id - 1],
    waiting = !!entryReason(h, id);
  const remaining = Math.max(0, 120 - o.activeSeconds),
    toll = openingNextTollIn(p);
  const radio =
    guided === "treasury_to_tank"
      ? "کرایه‌ها در خزانه است. اول آن را بردار تا مخزن را بزرگ کنیم."
      : o.stalled
        ? "مخزن پر است و پمپ خوابیده. جا باز کن یا منتظر نفت‌کش بعدی بمان."
        : guided === "treasury"
          ? "کشتی از گذر رد شد. رسید عوارضش در خزانه است."
          : !waiting
            ? "مجوز عبور دست توست. هر وقت آماده‌ای، کاروان را راه بینداز."
            : o.firstTollAt !== null
              ? "تا آمدن مجوز، نور فانوس را در آبراه تمرین کن."
              : "نفت‌کش پای اسکله است. اولین کشتی تا " +
                fa(Math.max(1, toll)) +
                " ثانیهٔ دیگر عوارض می‌دهد.";
  const practice = () => {
    chime(h.settings.sound, "launch");
    store.command({
      type: "launch",
      mode: "practice",
      op: 0,
      role: "steady",
      spaced: false,
      week: 0,
    });
  };
  return (
    <section className="port-layout">
      <World h={h} point={selectPoint} focus={highlight} />
      <aside className="dispatch-desk">
        <div className="desk-top">
          <span>
            <Radio size={15} /> بی‌سیم اسکله
          </span>
          <i />
          <small>شیفت {fa(Math.floor(front / 5) + 1)}</small>
        </div>
        {h.settings.hints && <RadioNote>{radio}</RadioNote>}
        <div className="mission-card">
          <div className="card-top">
            <Flag size={15} />
            <span>عملیات {fa(id)}</span>
            <i />
            <small>{regions[op.region - 1]}</small>
          </div>
          <h2>{op.name}</h2>
          <p className="next-story">{op.story}</p>
          {id === 1 && waiting ? (
            <div className="readyline">
              <i
                style={{ width: Math.min(100, o.activeSeconds / 1.2) + "%" }}
              />
              <span>
                {remaining > 0
                  ? "مجوز عبور تا " + fa(remaining) + " ثانیه"
                  : "در انتظار اولین عوارض"}
              </span>
            </div>
          ) : null}
          <button
            className={"primary full " + (highlight === "wave" ? "focus" : "")}
            onClick={() =>
              waiting && id === 1 ? practice() : open({ kind: "brief", op: id })
            }
          >
            {waiting && id === 1 ? (
              <>
                <Radio />
                تمرین فانوس
                <ChevronLeft />
              </>
            ) : (
              <>
                <Compass />
                آماده‌سازی عملیات
                <ChevronLeft />
              </>
            )}
          </button>
        </div>
        <div className="desk-facts">
          <div>
            <Droplet />
            <span>مخزن نفت</span>
            <b>{fa(p.oil)} بشکه</b>
          </div>
          <div>
            <Zap />
            <span>شبکهٔ برق</span>
            <b>{fa(getStats(p).grid * 100)}٪</b>
          </div>
        </div>
        <button className="desk-chart" onClick={showChart}>
          <Map size={16} />
          نقشهٔ هر سه بندر
          <ChevronLeft size={16} />
        </button>
      </aside>
    </section>
  );
}
export default function HarborGame() {
  const store = useHarbor(),
    h = store.h;
  const [tab, setTab] = useState<Tab>("port"),
    [sheet, setSheet] = useState<Sheet | null>(null),
    [guided, setGuided] = useState(false),
    [exit, setExit] = useState(false);
  const [message, setMessage] = useState(""),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    lastReport = useRef(-1);
  const toast = useCallback((s: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(s);
    timer.current = setTimeout(() => setMessage(""), 2500);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const p = h?.port,
    o = p?.opening,
    stats = p ? getStats(p) : null;
  const covered =
    !h ||
    !h.settings.hints ||
    tab !== "port" ||
    !!h.voyage ||
    !!h.result ||
    !!sheet ||
    exit;
  const gate = openingAttentionRules.gate_power;
  const canSuggestTank =
    h &&
    p &&
    stats &&
    p.buildings.tank < 100 &&
    (clearedThrough(h) >= gate.through_operation ||
      stats.powerProduced /
        (stats.powerUsed + economy.facilities.tank.mw_per_level) >=
        gate.min_projected_fraction);
  const candidate =
    o && p && stats
      ? openingFocus({
          ...o,
          cash: p.cash,
          bank: p.idle.bank,
          bankCapacity: stats.bankCapacity,
          upgradeCost: canSuggestTank
            ? buildingUpgradeQuote(p, "tank").cost
            : null,
          battle: false,
          abilityReady: false,
        })
      : null;
  const pulses = useOpeningHint(
    o ? "hormuz-lantern-hints-" + h?.run + "-" + o.seed : null,
    "port/" + (o?.stallEpisode ?? 0) + "/" + (o?.stalled ? "stalled" : "open"),
    candidate,
    o?.activeSeconds ?? 0,
    covered,
  );
  const close = () => setSheet(null);
  const open = (s: Sheet) => {
    if (!h) return;
    chime(h.settings.sound);
    setGuided(
      s.kind === "building" && s.id === "tank" && pulses.highlight === "tank",
    );
    if (s.kind === "building" && s.id === "tank")
      store.command({ type: "inspect" });
    setSheet(s);
  };
  const navigate = (t: Tab) => {
    chime(h?.settings.sound ?? false);
    setTab(t);
    setSheet(null);
  };
  const point = (id: PortPoint) =>
    open(
      id === "treasury" || id === "dock"
        ? { kind: id }
        : { kind: "building", id },
    );
  const closeReport = () => {
    if (h?.result) store.command({ type: "close-report", id: h.result.id });
    setTab("port");
  };
  const onBack = useEffectEvent(() => {
    if (exit) {
      setExit(false);
      return;
    }
    if (sheet) {
      close();
      return;
    }
    if (h?.result) {
      closeReport();
      return;
    }
    if (h?.voyage && !store.paused) {
      store.pause(true);
      return;
    }
    if (tab !== "port") {
      setTab("port");
      return;
    }
    setExit(true);
  });
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handle = App.addListener("backButton", () => onBack());
    return () => {
      void handle.then((l) => l.remove());
    };
  }, []);
  useEffect(() => {
    if (h?.result && lastReport.current !== h.result.id) {
      lastReport.current = h.result.id;
      chime(h.settings.sound, h.result.win ? "win" : "loss");
    }
  }, [h?.result, h?.settings.sound, h]);
  if (!h || !p || !o)
    return (
      <main className="harbor boot">
        <img src="/harbor/lighthouse.webp" alt="" />
        <h1>تنگه هرمز</h1>
        <p>{store.problem || "در حال تحویل شیفت…"}</p>
        {store.problem && (
          <button className="primary" onClick={() => location.reload()}>
            <RotateCw />
            تلاش دوباره
          </button>
        )}
      </main>
    );
  const shared = { h, store, open, toast };
  return (
    <main
      className={"harbor " + (!h.settings.motion ? "calm" : "")}
      data-testid="harbor"
      data-phase={h.voyage ? "voyage" : "port"}
    >
      <div className="shell">
        <header className="masthead">
          <div className="brand">
            <img src="/harbor/lighthouse.webp" alt="" />
            <div>
              <b>تنگه هرمز</b>
              <small>بازگشایی تنگه</small>
            </div>
          </div>
          <button
            className="wallet"
            aria-label="حساب بندر"
            onClick={() => {
              if (!h.voyage) open({ kind: "treasury" });
            }}
            disabled={!!h.voyage}
          >
            <Coins />
            <span>{fa(p.cash)}</span>
            <small>ریال</small>
          </button>
          <button
            className="gear square"
            aria-label="تنظیمات"
            onClick={() => {
              if (h.voyage) store.pause(true);
              open({ kind: "settings" });
            }}
          >
            <Settings2 />
          </button>
        </header>
        {h.voyage ? (
          <Field
            store={store}
            sound={() => chime(h.settings.sound, "signal")}
          />
        ) : (
          <div className="page-window" key={tab}>
            {tab === "port" ? (
              <HarborView
                {...shared}
                highlight={pulses.highlight}
                guided={candidate}
                selectPoint={point}
                showChart={() => navigate("chart")}
              />
            ) : tab === "yard" ? (
              <Workshop {...shared} />
            ) : tab === "chart" ? (
              <Chart {...shared} />
            ) : (
              <Logbook {...shared} />
            )}
          </div>
        )}
        {!h.voyage && (
          <nav className="harbor-nav" aria-label="بخش‌های بندر">
            {tabs.map((t) => (
              <button
                key={t.id}
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => navigate(t.id)}
              >
                <t.icon size={20} />
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
      {store.problem && (
        <div className="storage-error" role="alert">
          {store.problem}
        </div>
      )}
      {message && (
        <div className="toast" role="status">
          <Check size={16} />
          {message}
        </div>
      )}
      {sheet ? (
        <Dialog close={close} title="اطلاعات بندر">
          <SheetBody
            key={JSON.stringify(sheet)}
            s={sheet}
            {...shared}
            close={close}
            guided={guided}
          />
        </Dialog>
      ) : h.result ? (
        <Dialog title="گزارش گذر" close={closeReport}>
          <Debrief {...shared} r={h.result} close={closeReport} />
        </Dialog>
      ) : null}
      {exit && (
        <Dialog title="خروج" close={() => setExit(false)}>
          <h2>پایان شیفت؟</h2>
          <p>دفعهٔ بعد از همین‌جا ادامه می‌دهی.</p>
          <div className="controls">
            <button className="primary" onClick={() => setExit(false)}>
              ادامهٔ بازی
            </button>
            <button
              className="secondary"
              onClick={() => {
                store.save();
                void App.exitApp();
              }}
            >
              ذخیره و خروج
            </button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
