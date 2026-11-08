"use client";

import { useCallback, useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  Anchor, ArrowLeft, Award, Bell, Blocks, Check, ChevronDown, ChevronLeft, CircleHelp,
  Coins, Crosshair, Factory, FastForward, Flame, FlaskConical, Fuel, Gauge, Heart, Home, Layers3,
  Map as MapIcon, Minus, Moon, MoreHorizontal, Navigation, Pause, Play, Plus,
  Droplets, Rocket, Settings2, Shield, ShieldCheck, Sparkles, Sun, Swords, Target, Volume2,
  VolumeX, Waves, X, Zap, Star, UsersRound, ClipboardList, Gift,
} from "lucide-react";
import { SLOTS, BUILDINGS, TOWERS, gameReducer, getStats, hydrateGame, initialGame, enemyPosition, waveComposition, bossEnemy, type BuildingId, type Spell, type TowerKind, platformCost } from "@/lib/game";
import { BattleAudio, type BattleSound } from "@/lib/battle-audio";
import { isWater, nearestWater } from "@/lib/navigation";
import { compact, fa, stabilityBreakdown } from "./game-ui";
import WorldView3D from "./WorldView3D";
import TowerSheet from "./TowerSheet";
import SlotRadial from "./SlotRadial";
import BuildingSheet from "./BuildingSheet";
import Panels, { type PanelName } from "./Panels";
import { useDialog } from "./useDialog";
import IdleHud from "./IdleHud";
import ProgressionPanels, { type ProgressPanel } from "./ProgressionPanels";
import { RewardView, BattleResultView, OfflineView } from "./RewardViews";
import { currentMission, operationInfo, type MissionTarget } from "@/lib/progression";
import { scenarioForWave, loadDiary, appendDiary, type DiaryEntry, type Scenario } from "@/lib/news";
import { scenarioContextFor } from "@/lib/scenario-mechanics";
import type { DailyStatus } from "@/lib/daily";
import { serverApiEnabled } from "@/lib/runtime";

const SAVE_KEY = "hormuz-game-v1", PLAYER_KEY = "hormuz-player-id", PREFERENCES_KEY = "hormuz-preferences-v2", DIARY_KEY = "hormuz-war-diary-v1";
// On a save conflict (409) the server's current state is backed up here
// (with a timestamp) before this device overwrites it — see saveAll below.
const SERVER_BACKUP_KEY = "hormuz-server-backup-v1";
const spells: { id: Spell; name: string; short: string; icon: typeof Rocket; cooldown: number; key: string }[] = [
  { id: "strike", name: "باران بالستیک", short: "موشکی", icon: Rocket, cooldown: 60, key: "1" },
  { id: "emp", name: "پالس الکترومغناطیسی", short: "پالس EMP", icon: Zap, cooldown: 90, key: "2" },
  { id: "overdrive", name: "اورکلاک دفاع", short: "اورکلاک", icon: Flame, cooldown: 120, key: "3" },
];
/* Bottom bar per checklist §۱۴: اقتصاد / برجک‌ها / شهر / فناوری / اتاق جنگ —
   the four panels the audit found buried inside "بیشتر" (متوسط-۳۹) are
   first-class nav items now; missions/managers/heroes/events/settings live
   in the More menu. */
const navigation: { id: PanelName | "more"; label: string; icon: typeof MapIcon }[] = [
  { id:"economy",label:"اقتصاد",icon:Factory }, { id:"defense",label:"برجک‌ها",icon:Shield },
  { id:"city",label:"شهر",icon:Home }, { id:"research",label:"فناوری",icon:FlaskConical },
  { id:"war",label:"اتاق جنگ",icon:Swords }, { id:"more",label:"بیشتر",icon:MoreHorizontal },
];

export default function Game() {
  const [game, rawDispatch] = useReducer(gameReducer, undefined, initialGame);
  const [loaded, setLoaded] = useState(false);
  const [panel, setPanel] = useState<PanelName | null>(null);
  const [progressPanel, setProgressPanel] = useState<ProgressPanel | null>(null);
  const [daily, setDaily] = useState<DailyStatus | null>(null);
  const [dailyBusy, setDailyBusy] = useState(false);
  const [dailyError, setDailyError] = useState(false);
  // In the native (Capacitor) build there is no server, so the daily gift
  // can never load: the panel and its shortcut show an honest "web only"
  // status instead of a claim button stuck on "connecting…" (S-2).
  const [dailyWebOnly, setDailyWebOnly] = useState(false);
  useEffect(() => { setDailyWebOnly(!serverApiEnabled()); }, []);
  const [incomeBurst, setIncomeBurst] = useState<{id:number;cash:number}|null>(null);
  const incomeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenAt = useRef<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [sheetSlot, setSheetSlot] = useState<number | null>(null);
  const [valveOpen, setValveOpen] = useState(false);
  const [stabOpen, setStabOpen] = useState(false);
  useEffect(() => { if (selectedSlot === null) setSheetSlot(null); }, [selectedSlot]);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingId | null>(null);
  const [previewKind, setPreviewKind] = useState<TowerKind>("cannon");
  const [targeting, setTargeting] = useState<"strike" | "hero" | "hero2" | null>(null);
  const [targetPreview, setTargetPreview] = useState({ x: 68, y: 66 });
  const [paused, setPaused] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [coachDismissed, setCoachDismissed] = useState(false);
  const [showMapTools, setShowMapTools] = useState(false);
  const [toast, setToast] = useState("");
  const [announcement, setAnnouncement] = useState<{ title: string; subtitle: string; type: "battle" | "success" | "power" } | null>(null);
  const [bulletin, setBulletin] = useState<{ kind: "briefing" | "victory" | "defeat" | "final"; scenario: Scenario; wave: number } | null>(null);
  const [diary, setDiary] = useState<DiaryEntry[]>([]);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [sound, setSoundState] = useState(true); // battle sound defaults ON (studio ruling); the user's saved OFF is respected below
  const [vibration, setVibration] = useState(true);
  const [cinematic, setCinematic] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const gameRef = useRef(game), soundRef = useRef(sound), vibrationRef = useRef(vibration);
  const playerRef = useRef("");
  const serverVersionRef = useRef(0);
  const audioRef = useRef<BattleAudio | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announcementTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapRef = useRef<HTMLElement>(null), worldRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragOrigin = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const moved = useRef(false);
  const previousPhase = useRef(game.phase);
  const previousWave = useRef(game.wave);
  const activeBattle = game.phase === "battle";
  const otherInterface = selectedSlot !== null || selectedBuilding !== null || panel !== null || moreOpen || helpOpen || progressPanel !== null;
  // PERF (§16.8): while any panel/sheet is open, the 3D map may cap its render
  // loop at 30fps whenever the camera is still (see hormuz-map loop).
  useEffect(() => { (window as unknown as { __hormuzCalmUi?: boolean }).__hormuzCalmUi = otherInterface; }, [otherInterface]);
  const pendingReport = game.idle.lastBattle && !game.idle.lastBattle.claimed ? game.idle.lastBattle : null;
  const rewardInterface = !otherInterface && (!!game.idle.offline || game.idle.rewards.length>0 || !!pendingReport);
  const interfacePaused = otherInterface || rewardInterface;
  // Bulletin gate (SCEN, audit finding): an open war bulletin — briefing
  // included — FREEZES the battle, and the bulletin queue never overlaps
  // the battle-result view (the render gate below shows the result first;
  // the bulletin waits in state until the report is claimed).
  const battlePaused = paused || interfacePaused || bulletin !== null || diaryOpen;
  const pauseRef = useRef(battlePaused);
  const interfaceRef = useRef(interfacePaused);
  interfaceRef.current = interfacePaused;
  gameRef.current = game; soundRef.current = sound; vibrationRef.current = vibration; pauseRef.current = battlePaused;

  // A full reset must also wipe everything that lives outside the game
  // state, or the pre-reset run resurrects: the war diary, the player
  // identity and the server-side save record all belong to the old run.
  const dispatch = useCallback((action: Parameters<typeof rawDispatch>[0]) => {
    if (action.type === "reset") {
      const oldId = playerRef.current;
      try {
        localStorage.removeItem(SAVE_KEY);
        localStorage.removeItem(DIARY_KEY);
        localStorage.removeItem(PLAYER_KEY);
        localStorage.removeItem(SERVER_BACKUP_KEY);
      } catch { /* Storage unavailable; the in-memory reset still applies. */ }
      const freshId = crypto.randomUUID();
      try { localStorage.setItem(PLAYER_KEY, freshId); } catch { /* A later load mints an id instead. */ }
      playerRef.current = freshId;
      serverVersionRef.current = 0;
      setDiary([]);
      setDaily(null); setDailyError(false);
      if (oldId && serverApiEnabled()) {
        void fetch(`/api/save?id=${encodeURIComponent(oldId)}`, { method: "DELETE", keepalive: true }).catch(() => {});
      }
    }
    rawDispatch(action);
  }, []);
  const stats = getStats(game);
  /* Real export $/s from the ECO team's stat (R11). Consumed defensively:
     until getStats provides it, every "real rate" display stays hidden
     instead of presenting the theoretical dollarRate as real income. */
  const realExportRate = (stats as { realExportRate?: number }).realExportRate;
  // A scenario night is FORCED for the whole battle (checklist ۴٫۰) — the
  // manual toggle and the ambient cycle resume once the battle ends.
  const scenarioNight = game.phase === "battle" && game.battle?.condition === "شب";
  const isNight = scenarioNight || (game.manualNight !== (Math.floor(game.elapsed / 180) % 2 === 1));

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  }, []);

  const announce = useCallback((title: string, subtitle: string, type: "battle" | "success" | "power" = "battle") => {
    setAnnouncement({ title, subtitle, type });
    if (announcementTimer.current) clearTimeout(announcementTimer.current);
    announcementTimer.current = setTimeout(() => setAnnouncement(null), 2400);
  }, []);

  useEffect(() => {
    audioRef.current = new BattleAudio();
    try {
      const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "{}");
      setSoundState(saved.sound !== false); setVibration(saved.vibration !== false); setCinematic(saved.cinematic !== false);
      setCoachDismissed(saved.coachDismissed === true);
    } catch { /* Defaults are safe when storage is unavailable. */ }
    setPreferencesLoaded(true);
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setReducedMotion(query.matches);
    onMotion(); query.addEventListener("change", onMotion);
    return () => { audioRef.current?.dispose(); query.removeEventListener("change", onMotion); if (toastTimer.current) clearTimeout(toastTimer.current); if (announcementTimer.current) clearTimeout(announcementTimer.current); if (incomeTimer.current) clearTimeout(incomeTimer.current); };
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ sound, vibration, cinematic, coachDismissed })); } catch { /* Preferences are optional. */ }
    if (audioRef.current) audioRef.current.enabled = sound;
  }, [sound, vibration, cinematic, coachDismissed, preferencesLoaded]);

  const setSound = useCallback((value: boolean) => {
    setSoundState(value); soundRef.current = value;
    if (audioRef.current) { audioRef.current.enabled = value; audioRef.current.unlock(); if (value) audioRef.current.play("click"); }
  }, []);

  const playSound = useCallback((kind: BattleSound) => {
    if (audioRef.current) { audioRef.current.enabled = soundRef.current; audioRef.current.play(kind); }
  }, []);

  const feedback = useCallback(() => {
    if (vibrationRef.current && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(12);
    if (audioRef.current) { audioRef.current.enabled = soundRef.current; audioRef.current.unlock(); audioRef.current.play("click"); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const restore = (raw: unknown) => {
      const saved = hydrateGame(raw);
      if (!saved) return false;
      dispatch({ type: "hydrate", game: saved.game });
      previousPhase.current = saved.game.phase; previousWave.current = saved.game.wave;
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved.game)); } catch { /* Offline receipt is kept in memory. */ }
      return true;
    };
    let id = "";
    try {
      id = localStorage.getItem(PLAYER_KEY) ?? crypto.randomUUID();
      localStorage.setItem(PLAYER_KEY, id); playerRef.current = id;
      const local = localStorage.getItem(SAVE_KEY);
      if (local && restore(JSON.parse(local))) { setLoaded(true); return; }
    } catch { id = crypto.randomUUID(); playerRef.current = id; }
    if (!serverApiEnabled()) { setLoaded(true); return; }
    fetch(`/api/save?id=${encodeURIComponent(id)}`).then(r => r.ok ? r.json() : null).then(data => {
      if (cancelled || !data) return;
      if (typeof data.version === "number") serverVersionRef.current = data.version;
      if (data.state) restore(data.state);
    }).catch(() => {}).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [notify]);

  const reloadDaily = useCallback(async () => {
    if(!playerRef.current||!serverApiEnabled())return;
    setDailyBusy(true);setDailyError(false);
    try { const response=await fetch(`/api/rewards?id=${encodeURIComponent(playerRef.current)}`);if(!response.ok)throw new Error("unavailable");const status=await response.json() as DailyStatus;setDaily(status);if(status.reward&&!gameRef.current.idle.appliedDailyIds.includes(status.reward.id))dispatch({type:"apply-daily",reward:status.reward}); }
    catch { setDailyError(true); }
    finally { setDailyBusy(false); }
  }, []);
  const claimDaily = async () => {
    if(dailyBusy||!daily?.available||!serverApiEnabled())return;
    setDailyBusy(true);setDailyError(false);feedback();
    try { const response=await fetch("/api/rewards",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:playerRef.current})});if(!response.ok)throw new Error("unavailable");const status=await response.json() as DailyStatus;setDaily(status);if(status.reward&&!gameRef.current.idle.appliedDailyIds.includes(status.reward.id))dispatch({type:"apply-daily",reward:status.reward});setProgressPanel(null); }
    catch { setDailyError(true); }
    finally { setDailyBusy(false); }
  };
  useEffect(()=>{if(loaded)void reloadDaily();},[loaded,reloadDaily]);
  useEffect(()=>{
    if(!loaded)return;
    try { localStorage.setItem(SAVE_KEY,JSON.stringify({...gameRef.current,shots:[],popups:[],lastSavedAt:Date.now()})); } catch { /* Automatic server save remains active. */ }
  },[loaded,game.idle.revision]);

  useEffect(() => {
    if (!loaded) return;
    const query = window.matchMedia("(max-width: 700px)");
    const update = () => dispatch({ type: "layout", layout: query.matches ? "portrait" : "landscape" });
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [loaded]);

  const cameraInit = useRef(false);
  useEffect(() => {
    if (!loaded || cameraInit.current) return;
    cameraInit.current = true;
    if (window.innerWidth <= 700) {
      const w = mapRef.current?.clientWidth ?? window.innerWidth, h = mapRef.current?.clientHeight ?? window.innerHeight, z = 4.2;
      setZoom(z);
      setPan({ x: -z * 0.1 * w, y: z * 0.12 * h }); // open on the strait core (60%, 38%) — the theater is one zoom-out away
    }
  }, [loaded]);

  useEffect(() => {
    if (!loaded) return;
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(), dt = (now - previous) / 1000; previous = now;
      if (!document.hidden) dispatch({ type: "tick", dt: Math.min(dt, 0.25), battlePaused: pauseRef.current });
    }, 125);
    return () => clearInterval(timer);
  }, [loaded]);

  useEffect(() => {
    if (!loaded) return;
    const snapshot = () => ({ ...gameRef.current, shots: [], popups: [], lastSavedAt: Date.now() });
    const saveLocal = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot())); } catch { /* Server save remains available. */ } };
    function saveAll(recovered = false) {
      const state = snapshot();
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* Local snapshot is best-effort. */ }
      if (!playerRef.current || !serverApiEnabled()) return;
      void fetch("/api/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: playerRef.current, baseVersion: serverVersionRef.current, state }), keepalive: true }).then(async response => {
        const data = await response.json().catch(() => null) as { version?: number; serverVersion?: number } | null;
        if (!data) return;
        if (response.ok && typeof data.version === "number") { serverVersionRef.current = data.version; return; }
        if (response.status !== 409 || typeof data.serverVersion !== "number" || recovered) return;
        // Conflict policy: LAST-WRITER-WINS, guarded (official policy — see
        // src/app/api/save/route.ts and fix-program.md, team SAVE). This
        // device is about to overwrite a newer server record (e.g. progress
        // made on a second device). Before rebasing, fetch the server's
        // current state and keep a timestamped local backup of exactly what
        // is being overwritten, so the loss is never silent; only then
        // adopt the server version as the new base and save on top of it.
        // `recovered` bounds this to a single recovery attempt per cycle.
        try {
          const current = await fetch(`/api/save?id=${encodeURIComponent(playerRef.current)}`).then(r => (r.ok ? r.json() : null)).catch(() => null) as { state?: unknown; version?: number } | null;
          if (current?.state) {
            try {
              localStorage.setItem(SERVER_BACKUP_KEY, JSON.stringify({
                at: new Date().toISOString(),
                serverVersion: typeof current.version === "number" ? current.version : data.serverVersion,
                state: current.state,
              }));
            } catch { /* The backup is best-effort; the rebase still applies. */ }
          }
        } catch { /* The rebase below still applies. */ }
        serverVersionRef.current = data.serverVersion;
        saveAll(true);
      }).catch(() => {});
    }
    const timer = setInterval(() => { if (!document.hidden) saveAll(); }, 8000);
    const onVisibility = () => {
      if (document.hidden) { hiddenAt.current=Date.now();saveAll(); }
      else if(hiddenAt.current){const now=Date.now(),seconds=(now-hiddenAt.current)/1000;hiddenAt.current=null;if(seconds>30)dispatch({type:"offline-elapsed",seconds,now});void reloadDaily();}
    };
    window.addEventListener("beforeunload", saveLocal); document.addEventListener("visibilitychange", onVisibility);
    return () => { clearInterval(timer); window.removeEventListener("beforeunload", saveLocal); document.removeEventListener("visibilitychange", onVisibility); };
  }, [loaded,reloadDaily]);

  useEffect(() => {
    const scenCtx = scenarioContextFor(gameRef.current);
    if (previousPhase.current !== "battle" && game.phase === "battle") {
      const isBoss = game.wave % 5 === 0;
      announce(isBoss ? "یک ناو سنگین در راه است" : `موج ${fa(game.wave)} آغاز شد`, isBoss ? "برای غول‌آخر آماده شوید" : "برجک‌ها به‌صورت خودکار دفاع می‌کنند", "battle");
      const sc = scenarioForWave(game.wave, game.mode, scenCtx);
      setBulletin({ kind: "briefing", scenario: sc, wave: game.wave });
      setDiary(appendDiary({ at: Date.now(), wave: game.wave, kind: "before", headline: sc.newsBefore.headline, body: sc.newsBefore.body, zone: sc.zone }));
      playSound(isBoss ? "boss" : "wave"); setCoachDismissed(true);
      if (vibrationRef.current && typeof navigator !== "undefined" && "vibrate" in navigator && isBoss) navigator.vibrate([40, 40, 60]);
    } else if (previousPhase.current === "battle" && game.phase === "intermission") {
      setAnnouncement(null); playSound("victory");
      const completedWave = game.wave - 1; // reducer increments wave when a wave is cleared
      const sc = scenarioForWave(completedWave, game.mode, scenCtx);
      setBulletin({ kind: "victory", scenario: sc, wave: completedWave });
      setDiary(appendDiary({ at: Date.now(), wave: completedWave, kind: "victory", headline: sc.newsVictory.headline, body: sc.newsVictory.body, zone: sc.zone }));
    } else if (game.phase === "defeat" && previousPhase.current !== "defeat") {
      announce("خط دفاع شکسته شد", "برجک‌ها را تقویت کنید و دوباره تلاش کنید", "battle");
      const sc = scenarioForWave(game.wave, game.mode, scenCtx);
      setBulletin({ kind: "defeat", scenario: sc, wave: game.wave });
      setDiary(appendDiary({ at: Date.now(), wave: game.wave, kind: "defeat", headline: sc.newsDefeat.headline, body: sc.newsDefeat.body, zone: sc.zone }));
      playSound("defeat");
    } else if (game.phase === "victory" && previousPhase.current !== "victory") {
      const sc = scenarioForWave(game.wave, game.mode, scenCtx);
      setBulletin({ kind: "final", scenario: sc, wave: game.wave });
      setDiary(appendDiary({ at: Date.now(), wave: game.wave, kind: "victory", headline: sc.newsVictory.headline, body: sc.newsVictory.body, zone: sc.zone }));
    }
    previousPhase.current = game.phase; previousWave.current = game.wave;
  }, [game.phase, game.wave, game.mode, announce, playSound]);

  useEffect(() => { setDiary(loadDiary()); }, []);

  const openPanel = (name: PanelName) => { setProgressPanel(null); setSelectedSlot(null); setSelectedBuilding(null); setTargeting(null); setMoreOpen(false); setShowMapTools(false); setPanel(name); feedback(); };
  const openProgress = (name:ProgressPanel) => {setPanel(null);setMoreOpen(false);setSelectedSlot(null);setSelectedBuilding(null);setTargeting(null);setShowMapTools(false);setProgressPanel(name);feedback();};
  const chooseSlot = (id: number) => {
    if (targeting) return;
    const slot = SLOTS[id];
    if (!game.islands.includes(slot.island)) { openPanel("city"); notify(`ابتدا جزیرهٔ ${slot.label} را آزاد کنید.`); return; }
    setProgressPanel(null); setSelectedBuilding(null); setSelectedSlot(id); setPreviewKind("cannon"); setShowMapTools(false); setPanel(null); feedback();
  };
  const chooseBuilding = (id: BuildingId) => { if (targeting) return; setProgressPanel(null); setSelectedSlot(null); setPanel(null); setSelectedBuilding(id); setShowMapTools(false); feedback(); };
  const quickBuild = () => {
    const empty = [4, 3, 5, 6, 7, 0, 1, 2].find(id => game.islands.includes(SLOTS[id].island) && !game.towers.some(t => t.slot === id));
    if (empty !== undefined) chooseSlot(empty); else openPanel("defense");
  };
  const buildTower = (kind: TowerKind) => {
    if (selectedSlot === null) return;
    const definition = TOWERS[kind];
    if (game.cash < definition.cost || game.steel < definition.steel) { playSound("alarm"); return; }
    dispatch({ type: "build-tower", slot: selectedSlot, kind }); setSelectedSlot(null); feedback(); playSound("build"); notify(`${definition.short} آمادهٔ دفاع است.`);
  };
  const activateSpell = (spell: Spell) => {
    if (!activeBattle) { notify("ابتدا موج را شروع کنید؛ سپس از مهارت‌ها کمک بگیرید."); return; }
    if (game.cooldowns[spell] > 0) return;
    if (coachStep === 3) setCoachDismissed(true); // coach step 3 done: a spell was used
    feedback(); setShowMapTools(false);
    if (spell === "strike") {
      const strongest = [...game.enemies].sort((a, b) => b.hp - a.hp)[0];
      setTargetPreview(strongest ? enemyPosition(strongest, game.layout) : { x: 76, y: 68 });
      setTargeting("strike"); setSelectedSlot(null); setAnnouncement(null);
    } else {
      dispatch({ type: "spell", spell });
      announce(spell === "emp" ? "پالس الکترومغناطیسی" : "قدرت دوبرابر", spell === "emp" ? "دشمنان ۶ ثانیه متوقف می‌شوند" : "۱۰ ثانیه شلیک بدون مصرف مهمات", "power");
    }
  };
  const mainAction = () => {
    feedback(); setTargeting(null);
    if (activeBattle) { setPaused(!paused); return; }
    if (game.idle.lastBattle && !game.idle.lastBattle.claimed) dispatch({type:"claim-battle"});
    setPaused(false); dispatch({ type: "start", early: game.phase === "intermission" });
  };
  const collectIncome = () => {
    const amount=Math.floor(gameRef.current.idle.bank);if(amount<=0)return;
    dispatch({type:"collect-income"});feedback();playSound("collect");playSound("coin");setIncomeBurst({id:Date.now(),cash:amount});
    if(incomeTimer.current)clearTimeout(incomeTimer.current);incomeTimer.current=setTimeout(()=>setIncomeBurst(null),1300);
  };
  const navigateMission = (target:MissionTarget) => {
    setProgressPanel(null);setPanel(null);setMoreOpen(false);
    if(target.kind==="collect")collectIncome();
    else if(target.kind==="building")chooseBuilding(target.id as BuildingId);
    else if(target.kind==="manager")openProgress("managers");
    else if(target.kind==="contract")openProgress("contracts");
    else if(target.kind==="battle")mainAction();
    else if(target.kind==="research")openPanel("research");
    else if(target.kind==="journal")openProgress("missions");
    else if(target.kind==="island")openPanel("city");
    else if(target.kind==="chest"){if(game.chests>0)dispatch({type:"open-chest"});else openPanel("defense");}
    else if(target.kind==="tower"){if(currentMission(game)?.metric==="towerTier"&&game.towers.length)chooseSlot([...game.towers].sort((a,b)=>b.tier-a.tier)[0].slot);else quickBuild();}
  };
  const claimMission = (id:string) => {dispatch({type:"claim-mission",id});setProgressPanel(null);feedback();playSound("upgrade");};
  const activateProduction = () => {if(game.idle.boostRemaining>0)return;if(!game.idle.boostCharges){notify("شارژ تقویت تولید به‌مرور دوباره پر می‌شود.");return;}dispatch({type:"activate-production-boost"});feedback();playSound("overdrive");notify("تولید برای ۶۰ ثانیه دو برابر شد.");};
  const latestActions = useRef({ mainAction, activateSpell, quickBuild });
  latestActions.current = { mainAction, activateSpell, quickBuild };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || (event.target as HTMLElement).matches("input, textarea, select, [contenteditable]")) return;
      if (event.key === "Escape") { setTargeting(null); setShowMapTools(false); return; }
      if (interfaceRef.current) return;
      if (event.code === "Space" && !(event.target as HTMLElement).closest("button")) { event.preventDefault(); latestActions.current.mainAction(); }
      if (event.code === "KeyB") { event.preventDefault(); latestActions.current.quickBuild(); return; }
      const spell = spells.find(item => item.key === event.key || event.code === `Digit${item.key}`);
      if (spell) latestActions.current.activateSpell(spell.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused]);

  const clampPan = (x: number, y: number, currentZoom: number) => {
    const width = mapRef.current?.clientWidth ?? 0, height = mapRef.current?.clientHeight ?? 0;
    return { x: Math.max(-width * (currentZoom - 1) / 2, Math.min(width * (currentZoom - 1) / 2, x)), y: Math.max(-height * (currentZoom - 1) / 2, Math.min(height * (currentZoom - 1) / 2, y)) };
  };
  const updateZoom = (value: number) => { const next = Math.max(1, Math.min(8, value)); setZoom(next); setPan(p => clampPan(p.x, p.y, next)); };
  const mapPoint = (clientX: number, clientY: number) => {
    const rect = worldRef.current?.getBoundingClientRect();
    return rect ? { x: Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100)), y: Math.max(0, Math.min(100, (clientY - rect.top) / rect.height * 100)) } : null;
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (targeting || !worldRef.current?.contains(event.target as Node) || (event.target as HTMLElement).closest("button")) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); event.currentTarget.setPointerCapture(event.pointerId); moved.current = false;
    if (pointers.current.size === 1) dragOrigin.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    if (pointers.current.size === 2) { const p = [...pointers.current.values()]; pinch.current = { distance: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), zoom }; }
    setDragging(true);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (targeting && event.pointerType !== "touch") { const point = mapPoint(event.clientX, event.clientY); if (point) setTargetPreview(point); }
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2 && pinch.current) { const p = [...pointers.current.values()]; updateZoom(pinch.current.zoom * Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / Math.max(1, pinch.current.distance)); moved.current = true; }
    else if (dragOrigin.current && zoom > 1) { const dx = event.clientX - dragOrigin.current.x, dy = event.clientY - dragOrigin.current.y; if (Math.abs(dx) + Math.abs(dy) > 5) moved.current = true; setPan(clampPan(dragOrigin.current.panX + dx, dragOrigin.current.panY + dy, zoom)); }
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2 && pinch.current) { updateZoom([1, 2, 3.5, 5, 8].reduce((a, b) => Math.abs(b / zoom - 1) < Math.abs(a / zoom - 1) ? b : a)); pinch.current = null; }
    if (!pointers.current.size) { dragOrigin.current = null; setDragging(false); }
  };
  const onMapClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!targeting || !worldRef.current?.contains(event.target as Node)) return;
    const point = mapPoint(event.clientX, event.clientY); if (!point) return;
    if (targeting === "strike") { dispatch({ type: "spell", spell: "strike", ...point }); announce("باران بالستیک", "۸ موشک در مسیر منطقهٔ هدف", "power"); }
    else if (targeting === "hero2") { const water = nearestWater(point, game.layout); dispatch({ type: "hero2", ...water }); notify("ناو فرمانده دوم در مسیر است."); }
    else { const water = nearestWater(point, game.layout); dispatch({ type: "hero", ...water }); notify(isWater(point, game.layout) ? "ناو از مسیر امن دریایی حرکت می‌کند." : "نزدیک‌ترین مقصد امن روی آب انتخاب شد."); }
    setTargeting(null); feedback();
  };

  const handleGroundAction = (point: { x: number; y: number }) => {
    if (!targeting) return;
    if (targeting === "strike") { dispatch({ type: "spell", spell: "strike", ...point }); announce("باران بالستیک", "۸ موشک در مسیر منطقهٔ هدف", "power"); }
    else if (targeting === "hero2") { const water = nearestWater(point, game.layout); dispatch({ type: "hero2", ...water }); notify("ناو فرمانده دوم در مسیر است."); }
    else { const water = nearestWater(point, game.layout); dispatch({ type: "hero", ...water }); notify(isWater(point, game.layout) ? "ناو از مسیر امن دریایی حرکت می‌کند." : "نزدیک‌ترین مقصد امن روی آب انتخاب شد."); }
    setTargeting(null); feedback();
  };
  const handleGroundHover = (point: { x: number; y: number }) => { if (targeting) setTargetPreview(point); };
  const remaining = game.spawnRemaining + game.enemies.length;
  const total = 5 + Math.min(game.wave, 15) + (game.wave % 5 === 0 ? 1 : 0);
  const progress = activeBattle ? Math.max(0, Math.min(1, 1 - remaining / total)) : game.phase === "intermission" ? 1 : 0;
  const actionLabel = activeBattle ? paused ? "ادامه نبرد" : "مکث نبرد" : game.phase === "intermission" ? "موج بعدی" : game.phase === "defeat" ? "دوباره تلاش کن" : "شروع دفاع";
  /* Three-step first-run coach (checklist §۱۴): build a defense line →
     start the wave → help with a spell. New players only (no completed
     wave, no prestige), dismissible, and once dismissed or finished it
     never returns — the flag persists in preferences, and highestWave
     advancing past 0 retires it for good. */
  const coachStep = !preferencesLoaded || coachDismissed || game.prestige > 0 || game.highestWave > 0 ? 0
    : game.phase === "battle" ? 3
    : game.towers.length === 0 ? 1 : 2;
  const showCoach = coachStep > 0;
  const boss = activeBattle ? bossEnemy(game) : null;
  const showCombo = activeBattle && (game.combo ?? 0) >= 3;
  const previewUnits = !activeBattle ? waveComposition(game.wave, scenarioForWave(game.wave, game.mode, scenarioContextFor(game))) : [];
  const mission = currentMission(game);
  const coachTarget = !mission ? "" : mission.id === "first-profit" ? "collect" : mission.id === "first-defense" || mission.id === "third-wave" || mission.id === "first-boss" || mission.id === "tenth-wave" ? "battle" : mission.metric === "building" ? "building" : mission.metric === "towers" || mission.metric === "towerTier" ? "tower" : mission.metric === "managers" ? "manager" : "";
  const moreIsActive = moreOpen || panel === "hero" || panel === "events" || panel === "settings" || progressPanel !== null;
  const goMap = () => { setPanel(null); setProgressPanel(null); setMoreOpen(false); setTargeting(null); setSelectedSlot(null); setSelectedBuilding(null); feedback(); };

  return <div className={`game-shell ${activeBattle ? "in-battle" : ""} ${cinematic ? "cinematic" : "effects-light"} ${reducedMotion ? "reduce-motion" : ""} ${coachTarget ? `coach-${coachTarget}` : ""} ${coachStep === 3 ? "coach-spell" : ""} ${game.hearts <= 5 && activeBattle ? "danger-low" : ""}`} dir="rtl">
    <header className="app-header">
      <div className="app-brand"><span className="brand-symbol"><Anchor size={22} /></span><div><strong>هرمز</strong><span>فرماندهی آب‌های آزاد</span></div></div>
      <div className="essential-resources" aria-label="منابع اصلی">
        <button className="resource-pill money" onClick={() => openPanel("economy")} aria-label={`دلار نفتی ${fa(game.cash)}`}><Coins size={18} /><span><small>دلار نفتی</small><strong>{compact(game.cash)}</strong></span>{typeof realExportRate === "number" && <em>+{fa(realExportRate, 1)}/ث</em>}</button>
        <button className={`resource-pill ${game.oil >= stats.oilCapacity - 1 ? "low-resource" : ""}`} onClick={() => openPanel("economy")} aria-label={`نفت خام ${fa(game.oil)} از ${fa(stats.oilCapacity)} بشکه`}><Droplets size={17} /><span><small>نفت خام</small><strong>{compact(game.oil)}</strong></span></button>
        <button className={`resource-pill ${game.fuel < 100 ? "low-resource" : ""}`} onClick={() => openPanel("economy")} aria-label={`سوخت ${fa(game.fuel)}`}><Fuel size={17} /><span><small>سوخت</small><strong>{compact(game.fuel)}</strong></span></button>
        <button className="resource-pill" onClick={() => openPanel("economy")} aria-label={`فولاد ${fa(game.steel)}`}><Blocks size={17} /><span><small>فولاد</small><strong>{compact(game.steel)}</strong></span></button>
        <button className={`resource-pill ${game.ammo < 100 ? "low-resource" : ""}`} onClick={() => openPanel("economy")} aria-label={`مهمات ${fa(game.ammo)}`}><Target size={18} /><span><small>مهمات</small><strong>{compact(game.ammo)}</strong></span></button>
      </div>
      <div className="header-utilities"><button className={`utility-button ${sound ? "sound-on" : ""}`} onClick={() => setSound(!sound)} title={sound ? "بی‌صدا کردن" : "روشن کردن صدا"} aria-label={sound ? "خاموش کردن صدا" : "روشن کردن صدا"}>{sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</button><button className="utility-button help-button" onClick={() => { setHelpOpen(true); feedback(); }} title="راهنمای سریع" aria-label="راهنمای سریع"><CircleHelp size={19} /></button><button className="utility-button notification-button" onClick={() => openPanel("events")} aria-label="رویدادها"><Bell size={18} />{game.event && <i />}</button><button className="commander-button" onClick={() => openPanel("hero")} title="فرماندهان" aria-label="فرماندهان"><Anchor size={18} /><i /></button></div>
    </header>

    <main className={`game-map ${targeting ? "aiming" : ""} ${selectedSlot !== null || selectedBuilding !== null ? "choosing-tower" : ""}`} ref={mapRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onClick={onMapClick}>
<WorldView3D game={game} selectedSlot={selectedSlot} targeting={targeting} targetPreview={targetPreview} isNight={isNight} onSlot={chooseSlot} onBuilding={chooseBuilding} onPlatform={id => { const built = game.idle.platforms ?? []; if (built.includes(id)) return; if (game.cash < platformCost(built.length)) { notify("دلار کافی برای ساخت سکوی نفتی ندارید."); return; } dispatch({ type: "build-platform", id }); notify("سکوی نفتی ساخته شد؛ +۸ بشکه بر ثانیه"); feedback(); }} onHero={() => { setTargeting("hero"); setTargetPreview(game.hero); setSelectedSlot(null); feedback(); }} onHero2={() => { if (game.hero2) { setTargeting("hero2"); setTargetPreview(game.hero2); setSelectedSlot(null); feedback(); } }} onInspect={id => { dispatch({ type: "inspect", id }); notify("محموله کشف شد؛ ۵۰ فولاد دریافت کردید."); feedback(); }} onGroundAction={handleGroundAction} onGroundHover={handleGroundHover} playSound={playSound} />

      <IdleHud game={game} hidden={interfacePaused||targeting!==null} onCollect={collectIncome} onBoost={activateProduction} onBattle={mainAction} onMission={navigateMission} onClaimMission={claimMission} onJournal={()=>openProgress("missions")} onManagers={()=>openProgress("managers")} onDaily={()=>openProgress("daily")} onContracts={()=>openProgress("contracts")} dailyAvailable={daily?.available??false} dailyWebOnly={dailyWebOnly} />
      <div className="wave-hud-wrap"><div className="wave-hud"><div className="wave-hud-main"><button onClick={() => openPanel("war")} aria-label="انتخاب حالت نبرد"><Waves size={19} /><span>موج <strong>{fa(game.wave)}</strong><small>{game.mode === "campaign" ? "/ ۲۵" : game.mode === "endless" ? " / ∞" : " / چالش"}</small></span><ChevronDown size={12} /></button><span className="hud-divider" /><span className="base-health"><Heart size={16} fill="currentColor" /><strong>{fa(game.hearts)}</strong><small>/۲۰</small></span></div><div className="wave-progress"><i style={{ width: `${progress * 100}%` }} /></div><div className="wave-status-row"><button className="wave-status-item" onClick={() => openPanel("city")} aria-label="شبکهٔ برق؛ جزئیات مصرف و تولید در پنل شهر"><Zap size={11} />برق <b>{fa(stats.grid * 100)}٪</b></button><button className="wave-status-item" onClick={() => { setStabOpen(!stabOpen); feedback(); }} aria-expanded={stabOpen} aria-label="پایداری ملی و اجزای آن"><Gauge size={11} />پایداری <b>{fa(Math.round(stats.stability))}٪</b></button></div>{!activeBattle && previewUnits.length > 0 && <div className="wave-preview" aria-label="ترکیب موج بعدی">{previewUnits.map(u => <span key={u.kind === "boss" ? `boss-${u.boss}` : u.kind} className={`preview-unit unit-${u.kind}${u.kind === "boss" ? ` boss-${u.boss}` : ""}`} title={u.kind === "boss" ? "غول‌آخر" : u.kind === "speed" ? "تندرو" : u.kind === "corvette" ? "ناوچه" : u.kind === "air" ? "هوایی" : u.kind === "sub" ? "زیردریایی" : "ناوشکن"}>{u.kind === "boss" ? "☠" : u.kind === "air" ? "✈" : u.kind === "sub" ? "⚓" : u.kind === "destroyer" ? "⬢" : u.kind === "corvette" ? "⬣" : "▲"}<b>{fa(u.count)}</b></span>)}</div>}{activeBattle && <div className="wave-caption">{battlePaused ? <><Pause size={10} /> نبرد متوقف است</> : <><i /> {fa(remaining)} هدف باقی‌مانده</>}</div>}</div>{stabOpen && <div className="valve-pop stab-pop" role="dialog" aria-label="اجزای پایداری ملی"><strong>پایداری ملی · {fa(Math.round(stats.stability))} از ۱۰۰</strong>{stabilityBreakdown(game, stats).map(row => <div className={`stab-row${row.value < 0 ? " stab-cap" : ""}`} key={row.label}><span>{row.label}</span><div className="stab-bar"><i style={{ width: `${Math.max(0, Math.min(100, (row.value / row.max) * 100))}%` }} /></div><b>{row.value < 0 ? `−${fa(-row.value, 1)}` : `+${fa(row.value, 1)}`}</b></div>)}<small>پایداری روی راندمان همهٔ تولید اثر می‌گذارد؛ ضعیف‌ترین جزء را تقویت کنید.</small><button className="valve-done" onClick={() => setStabOpen(false)}>بستن</button></div>}</div>
      {boss && !interfacePaused && !targeting && <div className="boss-bar" role="status" aria-label={`غول‌آخر موج ${fa(game.wave)}`}><span className="boss-skull">☠</span><div className="boss-track"><div className="boss-fill" style={{ width: `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%` }} /><span className="boss-label">غول‌آخر موج {fa(game.wave)} · {fa(Math.max(0, Math.ceil(boss.hp)))} / {fa(boss.maxHp)}</span></div></div>}
      {showCombo && !interfacePaused && !targeting && <div className="combo-badge" aria-hidden="true"><Flame size={16} fill="currentColor" /><strong>×{fa(game.combo)}</strong><span>کمبو!</span><i style={{ width: `${Math.min(100, (game.comboTimer / 3.5) * 100)}%` }} /></div>}

      <div className="world-status"><button className="status-pill" onClick={() => openPanel("events")}><ShieldCheck size={14} /><span>امنیت {fa(game.security)}٪</span><i /></button><button className="weather-toggle" onClick={() => { dispatch({ type: "night" }); feedback(); }} aria-label="تغییر روز و شب">{isNight ? <Moon size={16} /> : <Sun size={16} />}<span>{isNight ? "شب" : "روز"}</span></button><div className="valve-wrap"><button className={`status-pill valve-pill ${valveOpen ? "open" : ""}`} onClick={() => { setValveOpen(!valveOpen); feedback(); }} aria-expanded={valveOpen} aria-label="شیر نفت؛ درصد صادرات نفت خام"><Droplets size={14} /><span>صادرات {fa(game.oilSplit)}٪</span></button>{valveOpen && <div className="valve-pop" role="dialog" aria-label="تنظیم شیر نفت"><strong>شیر نفت α · مسیر نفت خام</strong><div className="valve-presets">{[{ value: 70, label: "درآمد بیشتر" }, { value: 40, label: "متعادل" }, { value: 20, label: "تولید دفاعی" }].map(p => <button key={p.value} className={game.oilSplit === p.value ? "selected" : ""} onClick={() => dispatch({ type: "split", value: p.value })}>{p.label}<span>صادرات {fa(p.value)}٪</span></button>)}</div><div className="allocation-labels"><span>صادرات <b>{fa(game.oilSplit)}٪</b></span><span>پالایش <b>{fa(100 - game.oilSplit)}٪</b></span></div><input type="range" dir="ltr" min="0" max="100" value={game.oilSplit} onChange={e => dispatch({ type: "split", value: Number(e.target.value) })} aria-label="درصد صادرات نفت" style={{ background: `linear-gradient(to right,#eac788 ${game.oilSplit}%,#3a5655 ${game.oilSplit}%)` }} /><small>پالایش بیشتر یعنی سوخت و فولاد دفاعی بیشتر؛ صادرات بیشتر یعنی دلار بیشتر.</small><button className="valve-done" onClick={() => setValveOpen(false)}>بستن</button></div>}</div></div>
      <div className="view-controls"><button className={`map-view-toggle ${showMapTools ? "active" : ""}`} onClick={() => setShowMapTools(!showMapTools)} aria-label="کنترل نمای نقشه" aria-expanded={showMapTools}><Layers3 size={18} /></button>{showMapTools && <div className="view-options"><button onClick={() => updateZoom(zoom * 1.5)} aria-label="بزرگ‌نمایی"><Plus size={18} /></button><span>{fa(zoom * 100)}٪</span><button onClick={() => updateZoom(zoom / 1.5)} aria-label="کوچک‌نمایی"><Minus size={18} /></button><button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} aria-label="بازنشانی نما"><Navigation size={17} /></button></div>}</div>
      {!showCoach && !interfacePaused && !targeting && <button className="quick-build-button" onClick={quickBuild} title="ساخت برجک · B"><Plus size={18}/><span>ساخت برجک</span><kbd>B</kbd></button>}
      {showCoach && !interfacePaused && !targeting && <div className="quick-coach" role="status"><span className="coach-symbol">{coachStep === 1 ? <Shield size={16} /> : coachStep === 2 ? <Play size={16} /> : <Sparkles size={16} />}</span><p>قدم {fa(coachStep)} از ۳ · <b>{coachStep === 1 ? "اولین برجک دفاعی‌ات را بساز" : coachStep === 2 ? "موج اول دشمن را فراخوانی کن" : "با یک مهارت به برجک‌ها کمک کن"}</b><br />{coachStep === 1 ? "روی یک جایگاه ساحلی برجک بساز تا راه نفت‌کش‌ها امن شود." : coachStep === 2 ? "دشمن در راه است؛ نبرد را شروع کن تا برجک‌ها دفاع کنند." : "از نوار مهارت‌های پایین صفحه یک اسپل بزن؛ مثلاً پالس یا اورکلاک."}</p>{coachStep === 1 && <button className="coach-build" onClick={quickBuild}>ساخت برجک</button>}{coachStep === 2 && <button className="coach-build" onClick={mainAction}>شروع موج</button>}<button className="coach-dismiss" onClick={() => setCoachDismissed(true)} aria-label="رد کردن راهنما"><X size={14} /></button></div>}
      {(game.event || game.ammo < 100 || stats.grid < 0.9 || game.oil >= stats.oilCapacity - 1) && <button className="context-alert" onClick={() => openPanel(game.event ? "events" : stats.grid < 0.9 ? "city" : "economy")}><span /><strong>{game.event ? `رویداد فعال در تنگه؛ پایان تا ${fa(Math.max(0, Math.ceil(60 - game.eventClock)))} ثانیه` : game.ammo < 100 ? "مهمات رو به اتمام است" : stats.grid < 0.9 ? "برق شبکه را تقویت کنید" : "مخزن نفت پر شده است"}</strong><ChevronLeft size={15} /></button>}

      {announcement && !targeting && !interfacePaused && <div className={`battle-announcement ${announcement.type}`} key={`${announcement.title}-${announcement.subtitle}`} role="status"><span>{announcement.type === "success" ? <ShieldCheck size={24} /> : announcement.type === "power" ? <Sparkles size={24} /> : <Swords size={24} />}</span><div><strong>{announcement.title}</strong><p>{announcement.subtitle}</p></div></div>}
      {bulletin && !otherInterface && !rewardInterface && <div className={`news-bulletin ${bulletin.kind}`} role="alertdialog" aria-label="بولتن خبری جنگ"><div className="news-head"><span className="news-live"><Bell size={13} /> خبرگزاری تنگه</span><span className="news-op">عملیات «{bulletin.scenario.operationName}» · {bulletin.scenario.zone}</span><button className="news-x" onClick={() => setBulletin(null)} aria-label="بستن بولتن"><X size={15} /></button></div><strong>{bulletin.kind === "briefing" ? bulletin.scenario.newsBefore.headline : bulletin.kind === "defeat" ? bulletin.scenario.newsDefeat.headline : bulletin.scenario.newsVictory.headline}</strong><p>{bulletin.kind === "briefing" ? bulletin.scenario.newsBefore.body : bulletin.kind === "defeat" ? bulletin.scenario.newsDefeat.body : bulletin.scenario.newsVictory.body}</p>{bulletin.kind === "briefing" && <><p className="news-brief">{bulletin.scenario.briefing}</p><div className="news-chips"><span>هدف: {bulletin.scenario.objective}</span><span>دشمن: {bulletin.scenario.enemyFlavor}</span>{bulletin.scenario.specialCondition && <span>شرایط: {bulletin.scenario.specialCondition}</span>}</div></>}<div className="news-actions"><button onClick={() => setBulletin(null)}>{bulletin.kind === "briefing" ? "آغاز نبرد" : "بستن"}</button><button className="news-diary-btn" onClick={() => setDiaryOpen(true)}><ClipboardList size={14} /> دفترچه جنگ ({fa(diary.length)})</button></div></div>}
      {diaryOpen && !otherInterface && <div className="diary-overlay" role="dialog" aria-label="دفترچه جنگ"><div className="diary-card"><div className="news-head"><span className="news-live"><ClipboardList size={13} /> دفترچه جنگ</span><button className="news-x" onClick={() => setDiaryOpen(false)} aria-label="بستن دفترچه"><X size={15} /></button></div><div className="diary-list">{diary.length === 0 ? <p className="diary-empty">هنوز خبری ثبت نشده است؛ نخستین نبرد، اولین صفحهٔ دفترچه را می‌نویسد.</p> : [...diary].reverse().map((e, i) => <article key={i} className={`diary-item ${e.kind}`}><small>موج {fa(e.wave)} · {e.kind === "before" ? "پیش از نبرد" : e.kind === "victory" ? "پیروزی" : "شکست"}</small><strong>{e.headline}</strong><p>{e.body}</p></article>)}</div></div></div>}
      {paused && activeBattle && !interfacePaused && !targeting && !announcement && <div className="pause-indicator"><Pause size={20} /><strong>نبرد در مکث است</strong><span>برای ادامه، دکمهٔ پخش را بزنید.</span></div>}

      {!targeting && activeBattle && <div className="command-bar" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
        <div className="support-actions" aria-label="مهارت‌های پشتیبانی">{spells.map(spell => {
          const cooldown = game.cooldowns[spell.id], ready = activeBattle && cooldown <= 0;
          return <button key={spell.id} className={`support-button spell-${spell.id} ${ready ? "ready" : ""} ${cooldown > 0 ? "cooling" : ""}`} onClick={() => activateSpell(spell.id)} aria-label={`${spell.name}${cooldown > 0 ? `، شارژ ${fa(Math.ceil(cooldown))} ثانیه` : ""}`} aria-disabled={cooldown > 0} title={`${spell.name} · ${spell.key}`}><span className="support-icon"><spell.icon size={21} />{cooldown > 0 && <svg viewBox="0 0 44 44" className="cooldown-ring"><circle cx="22" cy="22" r="20" style={{ strokeDashoffset: `${126 * (1 - cooldown / spell.cooldown)}` }} /></svg>}{cooldown > 0 && <b className="cooldown-count">{fa(Math.ceil(cooldown))}</b>}</span><span>{spell.short}</span></button>;
        })}<button className={`support-button boost-button ${game.idle.boostRemaining > 0 ? "ready" : ""}`} onClick={activateProduction} disabled={game.idle.boostCharges <= 0 && game.idle.boostRemaining <= 0} aria-label="تقویت تولید؛ ۶۰ ثانیه تولید دوبرابر" title="تقویت تولید · ۶۰ ثانیه ×۲"><span className="support-icon"><Zap size={21} /></span><span>{game.idle.boostRemaining > 0 ? `تولید ×۲ · ${fa(Math.ceil(game.idle.boostRemaining))}ث` : `تقویت تولید · ${fa(game.idle.boostCharges)} شارژ`}</span></button></div><div className="command-separator" /><button className={`main-battle-action ${activeBattle ? "battle-running" : ""} ${paused ? "is-paused" : ""}`} onClick={mainAction}>{activeBattle && !paused ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}<span><strong>{actionLabel}</strong><small>{game.phase === "intermission" ? `+۲۵٪ پاداش · ${fa(Math.ceil(game.countdown))} ثانیه` : activeBattle ? paused ? "آمادهٔ ادامه" : "برجک‌ها خودکار شلیک می‌کنند" : "موج اول را فراخوانی کنید"}</small></span>{!activeBattle && <ArrowLeft size={18} />}</button><button className="battle-speed" onClick={() => { dispatch({ type: "speed" }); feedback(); }} aria-label={`تغییر سرعت نبرد؛ ${game.speed} برابر`} title="سرعت نبرد"><FastForward size={17} /><strong>{fa(game.speed)}×</strong></button>
      </div>}
      {targeting && <div className="targeting-prompt" role="status"><span className={targeting}><Crosshair size={22} /></span><div><strong>{targeting === "strike" ? "کجا را هدف بگیریم؟" : "ناو به کجا برود؟"}</strong><p>{targeting === "strike" ? "روی محدودهٔ دلخواه در آبراه بزنید." : "یک نقطه روی آب انتخاب کنید."}</p></div><button onClick={() => setTargeting(null)} aria-label="لغو هدف‌گیری"><X size={19} /></button></div>}
      <nav className="bottom-navigation" aria-label="ناوبری اصلی">{navigation.map(item => <button key={item.id} className={`nav-item ${panel === item.id || (item.id === "more" && moreIsActive) ? "active" : ""}`} onClick={() => { if (item.id === "more") { setPanel(null); setProgressPanel(null); setSelectedSlot(null); setSelectedBuilding(null); setMoreOpen(true); feedback(); } else if (panel === item.id) { setPanel(null); feedback(); } else openPanel(item.id); }}><item.icon size={20} strokeWidth={1.7} /><span>{item.label}</span>{item.id === "more" && (game.chests > 0 || game.event) && <i className="nav-notification" />}</button>)}</nav>
    </main>

    {selectedBuilding !== null && <BuildingSheet key={selectedBuilding} id={selectedBuilding} game={game} dispatch={dispatch} close={() => setSelectedBuilding(null)} notify={notify} feedback={feedback} onEconomy={() => openPanel(BUILDINGS[selectedBuilding].category === "city" ? "city" : "economy")} onManagers={()=>openProgress("managers")} />}
    {selectedSlot !== null && sheetSlot === null && <SlotRadial key={`radial-${selectedSlot}`} game={game} slot={selectedSlot} dispatch={dispatch} close={() => setSelectedSlot(null)} openSheet={() => setSheetSlot(selectedSlot)} onBuild={buildTower} feedback={feedback} notify={notify} />}
    {sheetSlot !== null && <TowerSheet key={sheetSlot} game={game} slot={sheetSlot} kind={previewKind} onKindChange={setPreviewKind} dispatch={dispatch} close={() => setSheetSlot(null)} onResearch={() => openPanel("research")} onBuild={buildTower} feedback={feedback} notify={notify} />}
    {panel && <Panels panel={panel} game={game} dispatch={dispatch} close={() => setPanel(null)} notify={notify} sound={sound} setSound={setSound} vibration={vibration} setVibration={setVibration} cinematic={cinematic} setCinematic={setCinematic} onSelectTower={chooseSlot} onSelectBuilding={chooseBuilding} />}
    {progressPanel && <ProgressionPanels panel={progressPanel} game={game} dispatch={dispatch} close={()=>setProgressPanel(null)} navigate={navigateMission} feedback={feedback} notify={notify} daily={daily} dailyBusy={dailyBusy} dailyError={dailyError} claimDaily={claimDaily} reloadDaily={()=>void reloadDaily()} dailyWebOnly={dailyWebOnly} />}
    {moreOpen && <MoreMenu game={game} close={() => setMoreOpen(false)} open={openPanel} openProgress={openProgress} goMap={goMap} />}
    {!otherInterface && (game.idle.offline ? <OfflineView game={game} dispatch={dispatch} feedback={feedback}/> : game.idle.rewards[0] ? <RewardView key={game.idle.rewards[0].id} reward={game.idle.rewards[0]} dispatch={dispatch} feedback={feedback}/> : pendingReport ? <BattleResultView report={pendingReport} dispatch={dispatch} autoBattle={game.idle.autoBattle} feedback={feedback} onDevelop={()=>openPanel("defense")}/> : null)}
    {incomeBurst && !interfacePaused && <div className="income-burst" key={incomeBurst.id} aria-hidden="true"><strong>+${compact(incomeBurst.cash)}</strong>{Array.from({length:9},(_,i)=><span key={i} style={{"--coin-i":i} as React.CSSProperties}><Coins size={19}/></span>)}</div>}
    {helpOpen && <QuickGuide close={() => setHelpOpen(false)} />}
    {toast && <div className="toast" role="status"><span><Check size={15} /></span>{toast}<button onClick={() => setToast("")} aria-label="بستن پیام"><X size={14} /></button></div>}
  </div>;
}

function MoreMenu({ game, close, open, openProgress, goMap }: { game: ReturnType<typeof initialGame>; close: () => void; open: (panel: PanelName) => void; openProgress:(panel:ProgressPanel)=>void; goMap:()=>void }) {
  const ref = useDialog<HTMLElement>(close);
  const items: { key: string; icon: typeof Shield; title: string; sub: string; badge?: string; act: () => void }[] = [
    { key: "map", icon: MapIcon, title: "نقشهٔ تنگه", sub: "بازگشت به نمای زنده", act: goMap },
    { key: "missions", icon: ClipboardList, title: "مأموریت‌ها", sub: "هدف‌ها و پاداش فصل", act: () => openProgress("missions") },
    { key: "managers", icon: UsersRound, title: "مدیران", sub: "خودکارسازی بندر و تولید", act: () => openProgress("managers") },
    { key: "hero", icon: Award, title: "فرماندهان", sub: "انتخاب یگان ویژه", act: () => open("hero") },
    { key: "events", icon: Bell, title: "گزارش‌های تنگه", sub: "رویدادها و امنیت", badge: game.event ? "جدید" : undefined, act: () => open("events") },
    { key: "settings", icon: Settings2, title: "تنظیمات", sub: "صدا، جلوه‌ها و ذخیره", act: () => open("settings") },
  ];
  return <div className="compact-dialog-backdrop" onClick={close}><section className="more-menu" ref={ref} role="dialog" aria-modal="true" aria-labelledby="more-title" tabIndex={-1} onClick={e => e.stopPropagation()}><div className="sheet-handle" /><header><div><span className="sheet-eyebrow">مرکز فرماندهی</span><h2 id="more-title">همه‌چیز، همین‌جاست.</h2></div><button className="close-control" onClick={close} aria-label="بستن منو"><X size={19} /></button></header><div className="more-grid">{items.map(item => <button key={item.key} onClick={item.act}><span className="more-icon"><item.icon size={22} /></span><strong>{item.title}</strong><small>{item.sub}</small>{item.badge && <span className="more-badge">{item.badge}</span>}<ArrowLeft size={14} className="more-arrow" /></button>)}</div><div className="more-business-links"><button onClick={()=>openProgress("contracts")}><ShipIcon/> قراردادهای تجاری <ArrowLeft size={14}/></button><button onClick={()=>openProgress("daily")}><Gift size={18}/> هدیهٔ روزانه <ArrowLeft size={14}/></button></div><p className="menu-save-note"><Check size={12} /> پیشرفت شما خودکار ذخیره می‌شود.</p></section></div>;
}

function QuickGuide({ close }: { close: () => void }) {
  const ref = useDialog<HTMLElement>(close);
  return <div className="compact-dialog-backdrop" onClick={close}><section className="quick-guide" ref={ref} role="dialog" aria-modal="true" aria-labelledby="guide-title" tabIndex={-1} onClick={e => e.stopPropagation()}><button className="close-control guide-close" onClick={close} aria-label="بستن راهنما"><X size={19} /></button><span className="guide-emblem"><Anchor size={30} /></span><span className="sheet-eyebrow">کمتر مدیریت کن. بیشتر فرماندهی کن.</span><h2 id="guide-title">فرماندهی در سه قدم</h2><p>اقتصاد و برجک‌ها خودکار کار می‌کنند؛ تصمیم‌های مهم با شماست.</p><ol><li><span><Plus size={20} /></span><div><strong>خط دفاعت را بساز</strong><p>روی + نقشه بزن، برجک انتخاب کن و ساخت را تأیید کن.</p></div><b>۱</b></li><li><span><Play size={18} /></span><div><strong>موج را شروع کن</strong><p>برجک‌ها شلیک می‌کنند. هر زمان خواستی نبرد را مکث کن.</p></div><b>۲</b></li><li><span><Rocket size={20} /></span><div><strong>در لحظهٔ درست کمک کن</strong><p>موشک برای ضربهٔ سنگین، EMP برای توقف و اورکلاک برای آتش بیشتر.</p></div><b>۳</b></li></ol><button className="primary-action" data-autofocus onClick={close}>آماده‌ام، بریم <ArrowLeft size={18} /></button><small className="keyboard-hint">دسکتاپ: Space برای مکث · ۱، ۲، ۳ برای مهارت‌ها</small></section></div>;
}

function ShipIcon(){return <Anchor size={18}/>;}
