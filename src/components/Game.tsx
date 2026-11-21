"use client";

import Image from "next/image";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  ArrowLeft, Award, Bell, Check, ChevronLeft, CircleHelp,
  Coins, Crosshair, Eye, EyeOff, Flame, FlaskConical, Home, Layers3,
  Map as MapIcon, Minus, Moon, Navigation, Pause, Play, Plane, Plus,
  Shield, ShieldCheck, Ship, Sparkles, Sun, SunMoon, Swords, Volume2,
  X, Zap, Star, UsersRound, ClipboardList, Gift, Save, LogOut, ChevronsRight, ChevronDown,
} from "lucide-react";
import { SLOTS, BUILDINGS, TOWERS, gameReducer, getStats, buildingUpgradeQuote, hydrateGame, freshPortGame, enemyPosition, waveComposition, bossEnemy, antiAirWarning, interceptWarning, type BuildingId, type GameState, type Spell, type TowerKind, platformCost, INTERCEPT_LINE } from "@/lib/game";
import { BattleAudio, type BattleSound } from "@/lib/battle-audio";
import { isWater, nearestWater } from "@/lib/navigation";
import { compact, fa } from "./game-ui";
import WorldView3D, { HOME_VIEW, type WorldCamera } from "./WorldView3D";
import TowerSheet from "./TowerSheet";
import SlotRadial from "./SlotRadial";
import BuildingSheet from "./BuildingSheet";
import Panels, { type PanelName } from "./Panels";
import { useDialog } from "./useDialog";
import IdleHud from "./IdleHud";
import HarborGlyph from "./HarborGlyph";
import ProgressionPanels, { type ProgressPanel } from "./ProgressionPanels";
import { RewardView, BattleResultView, OfflineView } from "./RewardViews";
import { currentMission, missionProgress, operationInfo, defeatReasonText, type MissionTarget } from "@/lib/progression";
import { scenarioForWave, loadDiary, appendDiary, type DiaryEntry, type Scenario } from "@/lib/news";
import { scenarioContextFor } from "@/lib/scenario-mechanics";
import type { DailyStatus } from "@/lib/daily";
import { App } from "@capacitor/app";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { nativeVisibilityEvent, setNativeBackgrounded } from '@/lib/native-visibility';
import { canOfferOpeningWave, ForegroundSeconds, openingFocus } from "@/lib/opening-attention";
import { operationForOpening, openingMarkedQuota } from "@/lib/opening-operations";
import { useOpeningHint } from "./useOpeningHint";
import { SimulationClock } from "@/lib/simulation-clock";
import { localDailyStatus, readDailyReceipt } from "@/lib/local-daily";
import { isNativeRuntime, serverApiEnabled } from "@/lib/runtime";
import { exportJson } from "@/lib/export-file";
import { recordGameEvent } from "@/lib/analytics";
import { SaveFormatError, localSaveArchive, resetSaveSlots, saveCandidates, writeSnapshot } from "@/lib/save-storage";

const PLAYER_KEY = "hormuz-player-id", PREFERENCES_KEY = "hormuz-preferences-v2", DIARY_KEY = "hormuz-war-diary-v1";
// On a save conflict (409) the server's current state is backed up here
// (with a timestamp); automatic cloud writes stop instead of overwriting either save.
const SERVER_BACKUP_KEY = "hormuz-server-backup-v1";
type Bulletin = { kind: "briefing" | "victory" | "defeat" | "final"; scenario: Scenario; wave: number };
const spells: { id: Spell; name: string; short: string; cooldown: number; key: string }[] = [
  { id: "strike", name: "باران بالستیک", short: "موشکی", cooldown: 60, key: "1" },
  { id: "emp", name: "پالس الکترومغناطیسی", short: "پالس EMP", cooldown: 90, key: "2" },
  { id: "overdrive", name: "اورکلاک دفاع", short: "اورکلاک", cooldown: 120, key: "3" },
];
export default function Game() {
  const [game, rawDispatch] = useReducer(gameReducer, undefined, freshPortGame);
  const gameRef = useRef(game);
  const [loaded, setLoaded] = useState(false);
  const [saveIssue, setSaveIssue] = useState<"newer" | "corrupt" | null>(null);
  const [panel, setPanel] = useState<PanelName | null>(null);
  const [progressPanel, setProgressPanel] = useState<ProgressPanel | null>(null);
  const [daily, setDaily] = useState<DailyStatus | null>(null);
  const [dailyBusy, setDailyBusy] = useState(false);
  const [dailyError, setDailyError] = useState(false);
  const [dailyEpoch, setDailyEpoch] = useState(0);
  const dailyWebOnly = false;
  const [incomeBurst, setIncomeBurst] = useState<{id:number;cash:number}|null>(null);
  const incomeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeHidden = useRef(false);
  const [exitOpen, setExitOpen] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  const [selectedSlot, setSelectedSlotState] = useState<number | null>(null);
  const [sheetSlot, setSheetSlot] = useState<number | null>(null);
  const setSelectedSlot = useCallback((slot: number | null) => { setSelectedSlotState(slot); setSheetSlot(null); }, []);
  /* Focus mode (D-023): the main screen shows ONLY the phase's essential
     set; the toggle's state is remembered per phase (war/peace separately)
     and focus is the default view state on load for both phases. The
     day/night tri-state (D-021) lives in the same preferences record —
     see the isNight resolution contract below. */
  const [focusPeace, setFocusPeace] = useState(true);
  const [focusWar, setFocusWar] = useState(true);
  const [timeMode, setTimeMode] = useState<"auto" | "day" | "night">("auto");
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingId | null>(null);
  const [tankGuidance, setTankGuidance] = useState(false);
  const [previewKind, setPreviewKind] = useState<TowerKind>("cannon");
  const [targeting, setTargeting] = useState<"strike" | "hero" | "hero2" | null>(null);
  const [targetPreview, setTargetPreview] = useState({ x: 68, y: 66 });
  const [paused, setPaused] = useState(false);
  const [worldReady, setWorldReady] = useState(false);
  const [foreground, setForeground] = useState(true);
  const openingClock = useRef(new ForegroundSeconds());
  const worldHasBeenReady = useRef(false);
  const worldAvailable = useRef(false);
  const onWorldReady = useCallback((ready: boolean) => {
    worldAvailable.current = ready;
    setWorldReady(ready);
    if (!ready && worldHasBeenReady.current && gameRef.current.phase === "battle") setPaused(true);
    if (ready) worldHasBeenReady.current = true;
  }, []);
  const [moreOpen, setMoreOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mapInspecting, setMapInspecting] = useState(false);
  const [hintProfile, setHintProfile] = useState("");
  const [coachDismissed, setCoachDismissed] = useState(false);
  const [showMapTools, setShowMapTools] = useState(false);
  const [toast, setToast] = useState("");
  const [announcement, setAnnouncement] = useState<{ title: string; subtitle: string; type: "battle" | "success" | "power" } | null>(null);
  const [bulletin, setBulletin] = useState<Bulletin | null>(null);
  const [diary, setDiary] = useState<DiaryEntry[]>([]);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [camera, setCamera] = useState<WorldCamera | null>(null);
  const zoomLabel = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!camera || !showMapTools) return;
    const update = () => {
      if (zoomLabel.current) zoomLabel.current.textContent = fa(Math.round(100 * HOME_VIEW.distance / camera.distance())) + "٪";
    };
    update();
    camera.controls.addEventListener("change", update);
    return () => camera.controls.removeEventListener("change", update);
  }, [camera, showMapTools]);
  const [sound, setSoundState] = useState(true); // battle sound defaults ON (studio ruling); the user's saved OFF is respected below
  const [vibration, setVibration] = useState(true);
  const [cinematic, setCinematic] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const soundRef = useRef(sound), vibrationRef = useRef(vibration);
  const playerRef = useRef("");
  const serverVersionRef = useRef(0);
  const audioRef = useRef<BattleAudio | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announcementTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousPhase = useRef(game.phase);
  const previousWave = useRef(game.wave);
  const activeBattle = game.phase === "battle";
  const focus = activeBattle ? focusWar : focusPeace;
  const toggleFocus = () => { feedback(); if (activeBattle) setFocusWar(!focusWar); else setFocusPeace(!focusPeace); };
  const cycleTimeMode = () => { feedback(); setTimeMode(m => (m === "auto" ? "day" : m === "day" ? "night" : "auto")); };
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
  const battlePaused = !worldReady || exitOpen || paused || interfacePaused || bulletin !== null || diaryOpen;
  const pauseRef = useRef(battlePaused);
  const shortcutsBlocked = interfacePaused || !!bulletin || exitOpen || diaryOpen || !!targeting || showMapTools || mapInspecting || !loaded || !worldReady || !foreground;
  const interfaceRef = useRef(shortcutsBlocked);
  useEffect(() => { interfaceRef.current = shortcutsBlocked; }, [shortcutsBlocked]);
  useEffect(() => { gameRef.current = game; soundRef.current = sound; vibrationRef.current = vibration; pauseRef.current = battlePaused; }, [game, sound, vibration, battlePaused]);

  // A full reset must also wipe everything that lives outside the game
  // state, or the pre-reset run resurrects: the war diary, the player
  // identity and the server-side save record all belong to the old run.
  const dispatch = useCallback((action: Parameters<typeof rawDispatch>[0]) => {
    if (gameRef.current.opening && (action.type === "start" || action.type === "collect-income" || action.type === "upgrade-building" || action.type === "opening-inspect-tank" || action.type === "opening-help")) {
      // A tap between simulation ticks belongs to its actual foreground time.
      const elapsed = openingClock.current.take(performance.now());
      if (elapsed > 0) rawDispatch({type:"advance", steps:0, openingElapsed:elapsed, battlePaused:pauseRef.current});
    }
    if (action.type === "claim-mission") { const mission = currentMission(gameRef.current); if (mission?.id === action.id && missionProgress(gameRef.current, mission).complete) recordGameEvent("mission", {reason:action.id}); }
    if (action.type === "prestige" && gameRef.current.cash >= 100000 && gameRef.current.highestWave >= 10 && gameRef.current.phase !== "battle" && (!gameRef.current.idle.lastBattle || gameRef.current.idle.lastBattle.claimed)) recordGameEvent("prestige");
    if (action.type === "reset") {
      const oldId = playerRef.current;
      try {
        resetSaveSlots(localStorage);
        localStorage.removeItem(DIARY_KEY);
        localStorage.removeItem(PLAYER_KEY);
        localStorage.removeItem(SERVER_BACKUP_KEY);
      } catch { /* Storage unavailable; the in-memory reset still applies. */ }
      const freshId = crypto.randomUUID();
      try { localStorage.setItem(PLAYER_KEY, freshId); } catch { /* A later load mints an id instead. */ }
      playerRef.current = freshId;
      setHintProfile(freshId); setCoachDismissed(false);
      serverVersionRef.current = 0;
      setDiary([]);
      setDaily(null); setDailyError(false); setDailyEpoch(value=>value+1);
      if (oldId && serverApiEnabled()) {
        void fetch(`/api/save?id=${encodeURIComponent(oldId)}`, { method: "DELETE", keepalive: true }).catch(() => {});
      }
    }
    if (action.type === "hydrate") setPaused(action.game.phase === "battle");
    rawDispatch(action);
  }, []);
  const backAction = useRef(() => {});
  useEffect(() => { backAction.current = () => {
    if (exitOpen) { setExitOpen(false); return; }
    if (targeting) { setTargeting(null); return; }
    if (showMapTools) { setShowMapTools(false); return; }
    if (sheetSlot !== null) { setSheetSlot(null); return; }
    if (selectedSlot !== null) { setSelectedSlot(null); return; }
    if (selectedBuilding !== null) { setSelectedBuilding(null); return; }
    if (panel || progressPanel || moreOpen || helpOpen || diaryOpen) {
      setPanel(null); setProgressPanel(null); setMoreOpen(false); setHelpOpen(false); setDiaryOpen(false); return;
    }
    if (!window.dispatchEvent(new Event("hormuz:close-map-inspection", {cancelable:true}))) return;
    setExitOpen(true);
  }; }, [exitOpen, targeting, showMapTools, sheetSlot, selectedSlot, selectedBuilding, panel, progressPanel, moreOpen, helpOpen, diaryOpen, setSelectedSlot]);
  useEffect(() => {
    if (!isNativeRuntime()) return;
    const listener = App.addListener("backButton", () => backAction.current());
    void listener.catch(() => {});
    return () => { void listener.then(h => h.remove()).catch(() => {}); };
  }, []);
  const stats = getStats(game);
  // A scenario night is FORCED for the whole battle (checklist ۴٫۰) — the
  // manual mode and the ambient cycle resume once the battle ends.
  const scenarioNight = game.phase === "battle" && game.battle?.condition === "شب";
  /* Day/night contract (UI2 ↔ VIS2, D-021): `timeMode` ('auto'|'day'|'night')
     is persisted in the preferences record (hormuz-preferences-v2) and owned
     by this component. Resolution order: scenario-forced night > explicit
     day/night mode > ambient cycle (the legacy manualNight XOR over the
     elapsed parity). Game.tsx resolves the boolean and passes ONLY `isNight`
     to WorldView3D, exactly as before — VIS2 owns the 900s phase length and
     the gradual ~20s transition behind this boolean in the map layer. */
  const ambientNight = game.manualNight !== (Math.floor(game.elapsed / 900) % 2 === 1);
  const isNight = scenarioNight || timeMode === "night" || (timeMode === "auto" && ambientNight);

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
      // Browser preferences are loaded once after SSR; this cannot form a render loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSoundState(saved.sound !== false); setVibration(saved.vibration !== false); setCinematic(saved.cinematic !== false);
      setCoachDismissed(saved.coachDismissed === true);
      setFocusPeace(saved.focusPeace !== false); setFocusWar(saved.focusWar !== false);
      setTimeMode(saved.timeMode === "day" || saved.timeMode === "night" ? saved.timeMode : "auto");
    } catch { /* Defaults are safe when storage is unavailable. */ }
    setPreferencesLoaded(true);
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setReducedMotion(query.matches);
    onMotion(); query.addEventListener("change", onMotion);
    return () => { audioRef.current?.dispose(); query.removeEventListener("change", onMotion); if (toastTimer.current) clearTimeout(toastTimer.current); if (announcementTimer.current) clearTimeout(announcementTimer.current); if (incomeTimer.current) clearTimeout(incomeTimer.current); };
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ sound, vibration, cinematic, coachDismissed, focusPeace, focusWar, timeMode })); } catch { /* Preferences are optional. */ }
    if (audioRef.current) audioRef.current.enabled = sound;
  }, [sound, vibration, cinematic, coachDismissed, focusPeace, focusWar, timeMode, preferencesLoaded]);

  const setSound = useCallback((value: boolean) => {
    setSoundState(value); soundRef.current = value;
    if (audioRef.current) { audioRef.current.enabled = value; audioRef.current.unlock(); if (value) audioRef.current.play("click"); }
  }, []);

  const playSound = useCallback((kind: BattleSound) => {
    if (audioRef.current) { audioRef.current.enabled = soundRef.current; audioRef.current.play(kind); }
  }, []);

  const feedback = useCallback(() => {
    if (vibrationRef.current) { if (isNativeRuntime()) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}); else if ("vibrate" in navigator) navigator.vibrate(12); }
    if (audioRef.current) { audioRef.current.enabled = soundRef.current; audioRef.current.unlock(); audioRef.current.play("click"); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const restore = (raw: unknown) => {
      let saved: ReturnType<typeof hydrateGame>;
      try { saved = hydrateGame(raw); } catch { return false; }
      if (!saved) return false;
      dispatch({ type: "hydrate", game: saved.game });
      previousPhase.current = saved.game.phase; previousWave.current = saved.game.wave;
      if (saved.game.phase === "battle") setPaused(true);
      try { writeSnapshot(localStorage, saved.game); } catch { notify("ذخیرهٔ دستگاه در دسترس نیست؛ پیشرفت فعلاً فقط در حافظه است."); }
      return true;
    };
    let id = "";
    try {
      id = localStorage.getItem(PLAYER_KEY) ?? crypto.randomUUID();
      localStorage.setItem(PLAYER_KEY, id); playerRef.current = id;
      // The saved player identity is available only after browser hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHintProfile(id);
      serverVersionRef.current = Number(localStorage.getItem(`hormuz-save-version-${id}`)) || 0;
      const candidates = saveCandidates(localStorage);
      for (const local of candidates) if (restore(local.state)) {
        if (local.recovered) notify("پیشرفت از نسخهٔ پشتیبان بازیابی شد.");
        // One-time local save hydration after SSR.
        setLoaded(true); return;
      }
      if (candidates.length) throw new SaveFormatError("corrupt");
    } catch (error) {
      if (error instanceof SaveFormatError) { setSaveIssue(error.reason); return; }
      id = crypto.randomUUID(); playerRef.current = id; setHintProfile(id);
    }
    // Fresh native startup has no server round-trip.
    if (!serverApiEnabled()) { setLoaded(true); return; }
    fetch(`/api/save?id=${encodeURIComponent(id)}`).then(r => r.ok ? r.json() : null).then(data => {
      if (cancelled || !data) return;
      if (typeof data.version === "number") serverVersionRef.current = data.version;
      if (data.state) restore(data.state);
    }).catch(() => {}).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [notify, dispatch]);

  useEffect(() => {
    if (!loaded) return;
    const presence = () => { if (!document.hidden) recordGameEvent("session"); };
    presence();
    document.addEventListener("visibilitychange", presence);
    const timer = setInterval(presence, 60000);
    return () => { document.removeEventListener("visibilitychange", presence); clearInterval(timer); };
  }, [loaded, dispatch]);

  const reloadDaily = useCallback(async () => {
    if(!playerRef.current)return;
    if (!serverApiEnabled()) {
      try {
        const status = localDailyStatus(readDailyReceipt(localStorage.getItem("hormuz-daily-v1")), Date.now());
        setDaily(status); setDailyError(false);
        if (status.reward && !gameRef.current.idle.appliedDailyIds.includes(status.reward.id)) dispatch({type:"apply-daily", reward:status.reward});
      } catch { setDailyError(true); }
      return;
    }
    setDailyBusy(true);setDailyError(false);
    try { const response=await fetch(`/api/rewards?id=${encodeURIComponent(playerRef.current)}`);if(!response.ok)throw new Error("unavailable");const status=await response.json() as DailyStatus;setDaily(status);if(status.reward&&!gameRef.current.idle.appliedDailyIds.includes(status.reward.id))dispatch({type:"apply-daily",reward:status.reward}); }
    catch { setDailyError(true); }
    finally { setDailyBusy(false); }
  }, [dispatch]);
  const claimDaily = async () => {
    if(dailyBusy||!daily?.available)return;
    if (!serverApiEnabled()) {
      try {
        const now = Date.now();
        const status = localDailyStatus(readDailyReceipt(localStorage.getItem("hormuz-daily-v1")), now);
        if (!status.available) return;
        const receipt = {day:Number(status.serverDay), step:status.step, id:`local-daily-${status.serverDay}`};
        localStorage.setItem("hormuz-daily-v1", JSON.stringify(receipt));
        const claimed = localDailyStatus(receipt, now);
        if(claimed.reward) dispatch({type:"apply-daily",reward:claimed.reward});
        setDaily(claimed);setProgressPanel(null);feedback();
      } catch { setDailyError(true); }
      return;
    }
    setDailyBusy(true);setDailyError(false);feedback();
    try { const response=await fetch("/api/rewards",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:playerRef.current})});if(!response.ok)throw new Error("unavailable");const status=await response.json() as DailyStatus;setDaily(status);if(status.reward&&!gameRef.current.idle.appliedDailyIds.includes(status.reward.id))dispatch({type:"apply-daily",reward:status.reward});setProgressPanel(null); }
    catch { setDailyError(true); }
    finally { setDailyBusy(false); }
  };
  // Synchronizes an external daily receipt when loading completes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{if(loaded)void reloadDaily();},[loaded,dailyEpoch,reloadDaily]);
  useEffect(()=>{
    if(!loaded)return;
    // Persist external storage; notify only on a storage failure.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { writeSnapshot(localStorage,{...gameRef.current,shots:[],popups:[],lastSavedAt:hiddenAt.current ?? Date.now()}); } catch { notify("ذخیره انجام نشد؛ فضای خالی دستگاه را بررسی کنید."); }
  },[loaded,game.idle.revision,notify]);

  useEffect(() => {
    if (!loaded) return;
    const query = window.matchMedia("(max-width: 700px)");
    const update = () => dispatch({ type: "layout", layout: query.matches ? "portrait" : "landscape" });
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [loaded, dispatch]);



  // Foreground decision time continues while reading a sheet. Sample visibility
  // at the event as Android can suspend WebView timers before the next tick.
  const openingRunning = loaded && worldReady && !exitOpen && !(activeBattle && paused);
  useEffect(() => {
    const clock = openingClock.current;
    const sync = () => {
      const visible = !document.hidden && !nativeHidden.current;
      setForeground(visible);
      clock.setActive(openingRunning && visible, performance.now());
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener(nativeVisibilityEvent, sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener(nativeVisibilityEvent, sync);
      clock.setActive(false, performance.now());
    };
  }, [openingRunning]);

  useEffect(() => {
    if (!loaded) return;
    const clock = new SimulationClock();
    clock.reset(performance.now());
    const timer = setInterval(() => {
      const now = performance.now();
      const hidden = document.hidden || nativeHidden.current;
      const steps = clock.advance(now, hidden).length;
      const openingElapsed = gameRef.current.opening ? openingClock.current.take(now) : 0;
      if (steps || openingElapsed > 0) dispatch({ type: "advance", steps, openingElapsed, battlePaused: !worldAvailable.current || pauseRef.current });
    }, 125);
    return () => clearInterval(timer);
  }, [loaded, dispatch]);

  useEffect(() => {
    if (!loaded) return;
    const snapshot = () => ({ ...gameRef.current, shots: [], popups: [], lastSavedAt: hiddenAt.current ?? Date.now() });
    const saveLocal = () => { try { writeSnapshot(localStorage, snapshot()); } catch { notify("ذخیره انجام نشد؛ فضای خالی دستگاه را بررسی کنید."); } };
    let saving = false, conflicted = false;
    function saveAll() {
      const state = snapshot();
      try { writeSnapshot(localStorage, state); } catch { notify("ذخیره انجام نشد؛ فضای خالی دستگاه را بررسی کنید."); }
      if (!playerRef.current || !serverApiEnabled() || saving || conflicted) return;
      saving = true;
      const playerId = playerRef.current;
      void fetch("/api/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: playerId, baseVersion: serverVersionRef.current, state }), keepalive: true }).then(async response => {
        if (playerRef.current !== playerId) return;
        const data = await response.json().catch(() => null) as { version?: number; serverVersion?: number } | null;
        if (!data) return;
        if (response.ok && typeof data.version === "number") { serverVersionRef.current = data.version; try { localStorage.setItem(`hormuz-save-version-${playerId}`, String(data.version)); } catch {} return; }
        if (response.status !== 409 || typeof data.serverVersion !== "number") return;
        conflicted = true;
        // Preserve both versions. A conflict must never silently replace progress.
        try {
          const current = await fetch(`/api/save?id=${encodeURIComponent(playerRef.current)}`).then(r => (r.ok ? r.json() : null)).catch(() => null) as { state?: unknown; version?: number } | null;
          if (current?.state) {
            try {
              localStorage.setItem(SERVER_BACKUP_KEY, JSON.stringify({
                at: new Date().toISOString(),
                serverVersion: typeof current.version === "number" ? current.version : data.serverVersion,
                state: current.state,
              }));
            } catch { /* Local play continues; cloud writes remain stopped. */ }
          }
        } catch { /* Cloud writes remain stopped. */ }
        notify("دو پیشرفت متفاوت پیدا شد؛ بازی این دستگاه ذخیره است و نسخهٔ ابری بازنویسی نشد.");
      }).catch(() => {}).finally(() => { saving = false; });
    }
    const timer = setInterval(() => { if (!document.hidden && !nativeHidden.current) saveAll(); }, 8000);
    const onVisibility = () => {
      if (document.hidden || nativeHidden.current) {
        if (hiddenAt.current !== null) return;
        hiddenAt.current = Date.now();
        audioRef.current?.suspend();
        saveAll();
        if (gameRef.current.phase === "battle") setPaused(true);
      } else if (hiddenAt.current !== null) {
        const now = Date.now();
        const seconds = (now - hiddenAt.current) / 1000;
        hiddenAt.current = null;
        audioRef.current?.resume();
        if (seconds > 30) dispatch({type:"offline-elapsed", seconds, now});
        void reloadDaily();
      }
    };
    const nativeListener = isNativeRuntime() ? App.addListener("appStateChange", ({ isActive }) => { nativeHidden.current = !isActive; setNativeBackgrounded(!isActive); onVisibility(); }) : null;
    void nativeListener?.catch(() => {});
    window.addEventListener("pagehide", saveLocal); window.addEventListener("beforeunload", saveLocal); document.addEventListener("visibilitychange", onVisibility);
    return () => { void nativeListener?.then(handle => handle.remove()).catch(() => {}); clearInterval(timer); window.removeEventListener("pagehide", saveLocal); window.removeEventListener("beforeunload", saveLocal); document.removeEventListener("visibilitychange", onVisibility); };
  }, [loaded,reloadDaily,dispatch,notify]);

  useEffect(() => {
    if (!loaded) return;
    const scenCtx = scenarioContextFor(gameRef.current);
    if (previousPhase.current !== "battle" && game.phase === "battle") {
      recordGameEvent("battle_start", {wave:game.wave,mode:game.mode});
      const isBoss = game.wave % 5 === 0;
      announce(isBoss ? "یک ناو سنگین در راه است" : `موج ${fa(game.wave)} آغاز شد`, isBoss ? "برای غول‌آخر آماده شوید" : "برجک‌ها به‌صورت خودکار دفاع می‌کنند", "battle");
      const sc = scenarioForWave(game.wave, game.mode, scenCtx);
      const op = operationForOpening(gameRef.current);
      if (!op) setBulletin({ kind: "briefing", scenario: sc, wave: game.wave });
      setDiary(appendDiary({ at: Date.now(), wave: game.wave, kind: "before", headline: op?.title_fa ?? sc.newsBefore.headline, body: op?.briefing_fa ?? sc.newsBefore.body, zone: sc.zone }));
      playSound(isBoss ? "boss" : "wave"); setCoachDismissed(true);
      if (vibrationRef.current && typeof navigator !== "undefined" && "vibrate" in navigator && isBoss) navigator.vibrate([40, 40, 60]);
    } else if (previousPhase.current === "battle" && game.phase === "intermission") {
      setAnnouncement(null); playSound("victory");
      recordGameEvent("battle_win", {wave:game.wave-1,mode:game.mode});
      const completedWave = game.wave - 1; // reducer increments wave when a wave is cleared
      const sc = scenarioForWave(completedWave, game.mode, scenCtx);
      const op = operationForOpening(gameRef.current, completedWave);
      if (!op) setBulletin({ kind: "victory", scenario: sc, wave: completedWave });
      const news = gameRef.current.idle.lastBattle?.openingReceipt?.firstClear ? op?.first_clear_news_fa : undefined;
      setDiary(appendDiary({ at: Date.now(), wave: completedWave, kind: "victory", headline: op?.title_fa ?? sc.newsVictory.headline, body: news ?? (op ? "بازپخش عملیات به پایان رسید." : sc.newsVictory.body), zone: sc.zone }));
    } else if (game.phase === "defeat" && previousPhase.current !== "defeat") {
      recordGameEvent("battle_loss", {wave:game.wave,mode:game.mode,reason:game.idle.lastBattle?.reason});
      announce("خط دفاع شکسته شد", game.idle.lastBattle?.reason ? defeatReasonText(game.idle.lastBattle.reason) : "برجک‌ها را تقویت کنید و دوباره تلاش کنید", "battle");
      const sc = scenarioForWave(game.wave, game.mode, scenCtx);
      const op = operationForOpening(gameRef.current);
      if (!op) setBulletin({ kind: "defeat", scenario: sc, wave: game.wave });
      setDiary(appendDiary({ at: Date.now(), wave: game.wave, kind: "defeat", headline: op?.title_fa ?? sc.newsDefeat.headline, body: op?.failure_news_fa ?? sc.newsDefeat.body, zone: sc.zone }));
      playSound("defeat");
    } else if (game.phase === "victory" && previousPhase.current !== "victory") {
      recordGameEvent("battle_win", {wave:game.wave,mode:game.mode});
      const sc = scenarioForWave(game.wave, game.mode, scenCtx);
      setBulletin({ kind: "final", scenario: sc, wave: game.wave });
      setDiary(appendDiary({ at: Date.now(), wave: game.wave, kind: "victory", headline: sc.newsVictory.headline, body: sc.newsVictory.body, zone: sc.zone }));
    }
    previousPhase.current = game.phase; previousWave.current = game.wave;
  }, [loaded, game.phase, game.wave, game.mode, game.idle.lastBattle?.reason, announce, playSound]);

  // One-time browser storage hydration, independent of rendered state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDiary(loadDiary()); }, []);

  const openPanel = (name: PanelName) => { setProgressPanel(null); setSelectedSlot(null); setSelectedBuilding(null); setTargeting(null); setMoreOpen(false); setShowMapTools(false); setPanel(name); feedback(); };
  const openProgress = (name:ProgressPanel) => {setPanel(null);setMoreOpen(false);setSelectedSlot(null);setSelectedBuilding(null);setTargeting(null);setShowMapTools(false);setProgressPanel(name);feedback();};
  const chooseSlot = (id: number) => {
    if (targeting) return;
    const slot = SLOTS[id];
    if (!game.islands.includes(slot.island)) { openPanel("city"); notify(`ابتدا جزیرهٔ ${slot.label} را آزاد کنید.`); return; }
    setProgressPanel(null); setSelectedBuilding(null); setSelectedSlot(id); setPreviewKind("cannon"); setShowMapTools(false); setPanel(null); feedback();
  };
  const chooseBuilding = (id: BuildingId) => { if (targeting) return;
    if (id === "tank" && game.opening?.stalled) dispatch({type:"opening-inspect-tank"});
    setTankGuidance(id === "tank" && !!game.opening?.stalled && hint.highlight === "tank"); setProgressPanel(null); setSelectedSlot(null); setPanel(null); setSelectedBuilding(id); setShowMapTools(false); feedback(); };
  const quickBuild = () => {
    const empty = [4, 3, 5, 6, 7, 0, 1, 2].find(id => game.islands.includes(SLOTS[id].island) && !game.towers.some(t => t.slot === id));
    if (empty !== undefined) chooseSlot(empty); else openPanel("defense");
  };
  const buildTower = (kind: TowerKind) => {
    if (selectedSlot === null) return;
    const definition = TOWERS[kind];
    if (game.cash < definition.cost || game.steel < definition.steel) { playSound("alarm"); notify(game.steel < definition.steel ? `فولاد کافی نیست؛ این برجک ${fa(definition.steel)} فولاد می‌خواهد — فولاد فقط از مجتمع فولاد به دست می‌آید.` : "اعتبار کافی نیست؛ درآمد بندر را جمع‌آوری کنید."); return; }
    dispatch({ type: "build-tower", slot: selectedSlot, kind }); setSelectedSlot(null); feedback(); playSound("build"); notify(`${definition.short} آمادهٔ دفاع است.`);
  };
  const coachStep = game.opening || !preferencesLoaded || coachDismissed || game.prestige > 0 || game.highestWave > 0 ? 0
    : game.phase === "battle" ? 3
    : game.towers.length === 0 ? 1 : 2;
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
    if (!canOfferOpeningWave(game.opening)) return;
    if (game.idle.lastBattle && !game.idle.lastBattle.claimed) dispatch({type:"claim-battle"});
    setPaused(false); dispatch({ type: "start", early: game.phase === "intermission", source:"player" });
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
    else if(target.kind==="battle") { if (game.opening) openPanel("war"); else mainAction(); }
    else if(target.kind==="research")openPanel("research");
    else if(target.kind==="journal")openProgress("missions");
    else if(target.kind==="island")openPanel("city");
    else if(target.kind==="chest"){if(game.chests>0)dispatch({type:"open-chest"});else openPanel("defense");}
    else if(target.kind==="tower"){if(currentMission(game)?.metric==="towerTier"&&game.towers.length)chooseSlot([...game.towers].sort((a,b)=>b.tier-a.tier)[0].slot);else quickBuild();}
  };
  const claimMission = (id:string) => {dispatch({type:"claim-mission",id});setProgressPanel(null);feedback();playSound("upgrade");};
  const activateProduction = () => {if(game.idle.boostRemaining>0)return;if(!game.idle.boostCharges){notify("شارژ تقویت تولید به‌مرور دوباره پر می‌شود.");return;}dispatch({type:"activate-production-boost"});feedback();playSound("overdrive");notify("تولید برای ۶۰ ثانیه دو برابر شد.");};
  const latestActions = useRef({ mainAction, activateSpell, quickBuild });
  useEffect(() => { latestActions.current = { mainAction, activateSpell, quickBuild }; });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || (event.target as HTMLElement).matches("input, textarea, select, [contenteditable]")) return;
      if (event.key === "Escape") { setTargeting(null); setShowMapTools(false); return; }
      if (interfaceRef.current || event.repeat) return;
      if (event.code === "Space" && !(event.target as HTMLElement).closest("button")) { event.preventDefault(); latestActions.current.mainAction(); }
      if (event.code === "KeyB") { event.preventDefault(); latestActions.current.quickBuild(); return; }
      const spell = spells.find(item => item.key === event.key || event.code === `Digit${item.key}`);
      if (spell) latestActions.current.activateSpell(spell.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused]);

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

  const showCoach = coachStep > 0;
  const boss = activeBattle ? bossEnemy(game) : null;
  const showCombo = activeBattle && (game.combo ?? 0) >= 3;
  const previewUnits = !activeBattle ? waveComposition(game.wave, scenarioForWave(game.wave, game.mode, scenarioContextFor(game))) : [];
  const airWarn = bulletin?.kind === "briefing" ? antiAirWarning(game) : null; // D-024: briefing air warning
  const interceptWarn = bulletin?.kind === "briefing" ? interceptWarning(game) : null; // D-026: briefing intercept warning — teaches the wave-4 combo
  /* D-026 extension (QA-WAVE2 playability note): the briefing bulletin is
     created only after the reducer enters battle, but hero swap is locked
     in battle (R9) — so the same teaching must also reach the player at
     INTERMISSION, while the swap can still precede the first attempt.
     interceptWarning's pre-start path (rolled battle of THIS wave, else
     the scenario derivation) is exactly the intermission read; in battle
     the briefing chip above covers it, so this stays null there. */
  const interceptPreviewWarn = !activeBattle ? interceptWarning(game) : null;
  /* War essential set (D-023): the scenario objective gets its OWN HP bar
     (structure / escort / rescue) instead of text glued to a caption, and
     the air-defense objective gets an explicit leak counter (team 5, I4):
     defeat lands when airLeaked exceeds max(2, floor(airTotal × 0.2)) —
     the same threshold the reducer enforces (game.ts objectiveDefeat). */
  const battleObj = game.battle;
  const objectiveBar = !activeBattle || !battleObj ? null
    : battleObj.objective === "structure" && battleObj.structureMaxHp > 0 ? { label: "سازهٔ راهبردی", hp: battleObj.structureHp, max: battleObj.structureMaxHp }
    : battleObj.objective === "escort" && battleObj.escort ? { label: "کاروان اسکورت", hp: battleObj.escort.hp, max: battleObj.escort.maxHp }
    : battleObj.objective === "rescue" && battleObj.stranded ? { label: "کشتی گرفتار", hp: battleObj.stranded.hp, max: battleObj.stranded.maxHp }
    : null;
  const airAllowed = battleObj && battleObj.objective === "airdef" && battleObj.airTotal > 0 ? Math.max(2, Math.floor(battleObj.airTotal * 0.2)) : null;
  const mission = currentMission(game);
  const coachTarget = game.opening || !mission ? "" : mission.id === "first-profit" ? "collect" : mission.id === "first-defense" || mission.id === "third-wave" || mission.id === "first-boss" || mission.id === "tenth-wave" ? "battle" : mission.metric === "building" ? "building" : mission.metric === "towers" || mission.metric === "towerTier" ? "tower" : mission.metric === "managers" ? "manager" : "";
  const goMap = () => { setPanel(null); setProgressPanel(null); setMoreOpen(false); setTargeting(null); setSelectedSlot(null); setSelectedBuilding(null); feedback(); };

  const saveCommand = () => {
    try {
      writeSnapshot(localStorage, { ...gameRef.current, shots: [], popups: [], lastSavedAt: hiddenAt.current ?? Date.now() });
      notify("پیشرفت بازی روی دستگاه ذخیره شد.");
      return true;
    } catch {
      notify("ذخیره انجام نشد. فضای خالی دستگاه را بررسی کنید.");
      return false;
    }
  };

  const modalOpen = interfacePaused || exitOpen || diaryOpen || !!bulletin;
  const headerLocked = modalOpen || !!targeting;
  const opening = game.opening;
  const openingOp = operationForOpening(game);
  const markedQuota = openingMarkedQuota(game);
  const openingSkill = spells.find(spell => game.cooldowns[spell.id] <= 0);
  const attentionCovered = !foreground || !worldReady || modalOpen || !!targeting || (activeBattle && paused) || showMapTools || mapInspecting;
  const tankPrice = opening && game.buildings.tank < 100 ? buildingUpgradeQuote(game, "tank", 1).cost : null;
  const candidate = opening && !attentionCovered ? openingFocus({
    ...opening, cash:game.cash, bank:game.idle.bank, bankCapacity:stats.bankCapacity,
    upgradeCost:tankPrice, battle:activeBattle, abilityReady:!!openingSkill,
  }) : null;
  const episode = activeBattle ? `battle-${game.mode}-${game.wave}` : opening?.stalled ? `tank-${opening.stallEpisode}` : "harbor";
  const hint = useOpeningHint(loaded && opening && hintProfile ? `hormuz-attention-v5:${hintProfile}:${opening.seed}` : null,
    episode, candidate, opening ? opening.activeSeconds + opening.remainder : 0, attentionCovered);
  if (saveIssue) return <main dir="rtl" className="save-recovery" aria-labelledby="save-recovery-title">
    <h1 id="save-recovery-title">{saveIssue === "newer" ? "ذخیره از نسخهٔ جدیدتر بازی است" : "خواندن ذخیرهٔ بندر ممکن نشد"}</h1>
    <p>{saveIssue === "newer" ? "بازی را به‌روز کنید تا از همین بندر ادامه دهید." : "برای بررسی و بازیابی، یک نسخه از داده‌های موجود بردارید."}</p>
    <button onClick={() => { void exportJson("hormuz-original-saves.json", localSaveArchive(localStorage)).catch(() => setToast("خروجی ذخیره نشد.")); }}>دریافت فایل اصلی</button>
    <button onClick={() => window.location.reload()}>تلاش دوباره</button>
    {toast && <p role="status">{toast}</p>}
  </main>;
  return <div data-opening-active-s={opening?.activeSeconds} data-opening-target={opening ? candidate ?? "none" : undefined} className={`game-shell workshop ${modalOpen ? "workshop-modal-open" : ""} ${activeBattle ? "in-battle" : ""} ${focus ? "focus-on" : "focus-off"} ${cinematic ? "cinematic" : "effects-light"} ${reducedMotion ? "reduce-motion" : ""} ${coachTarget ? `coach-${coachTarget}` : ""} ${coachStep === 3 ? "coach-spell" : ""} ${game.hearts <= 5 && activeBattle ? "danger-low" : ""}`} dir="rtl">
    {exitOpen && <ExitDialog close={() => setExitOpen(false)} save={saveCommand} exit={() => {
      if (saveCommand()) void App.exitApp().catch(() => notify("بازی ذخیره شد. برای خروج از دکمهٔ دستگاه استفاده کنید."));
    }} />}
    <header className="app-header">
      <div className="essential-resources" role="group" aria-label="منابع اصلی">
        <button className="resource-pill resource-port" disabled={headerLocked} onClick={() => { setShowMapTools(false); setMoreOpen(true); feedback(); }} aria-label="فرماندهی بندر" aria-haspopup="dialog" aria-expanded={moreOpen}>
          <span className="workshop-icon wk-anchor" aria-hidden="true" /><strong>بندر</strong><span className="port-caret" aria-hidden="true"/>
        </button>
        <button className={`resource-pill ${game.oil >= stats.oilCapacity - 1 ? "low-resource" : ""}`} disabled={headerLocked} onClick={() => openPanel("economy")} aria-label={`نفت خام ${fa(game.oil)} از ${fa(stats.oilCapacity)} بشکه`} title="نفت خام">
          <span className="workshop-icon wk-oil" aria-hidden="true" /><strong>{compact(game.oil)}</strong>
        </button>
        <button className={`resource-pill ${game.fuel < 100 ? "low-resource" : ""}`} disabled={headerLocked} onClick={() => openPanel("economy")} aria-label={`سوخت ${fa(game.fuel)}`} title="سوخت">
          <span className="workshop-icon wk-fuel" aria-hidden="true" /><strong>{compact(game.fuel)}</strong>
        </button>
        <button className="resource-pill" disabled={headerLocked} onClick={() => openPanel("economy")} aria-label={`فولاد ${fa(game.steel)}`} title={stats.steelRate > 0 ? `تولید فولاد ${fa(stats.steelRate, 1)} در ثانیه` : "فولاد"}>
          <span className="workshop-icon wk-steel" aria-hidden="true" /><strong>{compact(game.steel)}</strong>
        </button>
      </div>
    </header>

    <main className={`game-map ${targeting ? "aiming" : ""} ${selectedSlot !== null || selectedBuilding !== null ? "choosing-tower" : ""}`}>
      <WorldView3D onOpeningInspectionChange={setMapInspecting} onStartOpeningWave={mainAction} onCameraReady={setCamera} onReadyChange={onWorldReady} paused={battlePaused} game={game} selectedSlot={selectedSlot} targeting={targeting} targetPreview={targetPreview} isNight={isNight} timeMode={timeMode} onSlot={chooseSlot} onBuilding={chooseBuilding} onPlatform={id => { const built = game.idle.platforms ?? []; if (built.includes(id)) return; if (game.cash < platformCost(built.length)) { notify("اعتبار بندر برای ساخت سکوی نفتی کافی نیست."); return; } dispatch({ type: "build-platform", id }); notify("سکوی نفتی ساخته شد؛ +۸ بشکه بر ثانیه"); feedback(); }} onHero={() => { setTargeting("hero"); setTargetPreview(game.hero); setSelectedSlot(null); feedback(); }} onHero2={() => { if (game.hero2) { setTargeting("hero2"); setTargetPreview(game.hero2); setSelectedSlot(null); feedback(); } }} onInspect={id => { dispatch({ type: "inspect", id }); notify("محموله کشف شد؛ ۵۰ فولاد دریافت کردید."); feedback(); }} onGroundAction={handleGroundAction} onGroundHover={handleGroundHover} playSound={playSound} />

      {!modalOpen && !targeting && <div className="quay-ledge" aria-hidden="true"/>}
      <IdleHud game={game} candidate={candidate} highlight={hint.highlight} onTank={() => chooseBuilding("tank")}
        onDismissHint={hint.canDismiss ? hint.dismiss : undefined} onSkip={loaded && preferencesLoaded && worldReady && !coachDismissed ? () => setCoachDismissed(true) : undefined} onHelp={() => { dispatch({type:"opening-help"}); chooseBuilding("tank"); }}
        hidden={interfacePaused||targeting!==null} focus={focus} showGift={!!daily?.available} onGift={() => openProgress("daily")} onCollect={collectIncome} onBoost={activateProduction} onBattle={mainAction} onJournal={()=>openProgress("missions")} />
      {/* D-026 extension: intermission intercept warning, riding the wave
          preview (same visibility as .peace-preview itself: expanded view,
          HUD not hidden, not in battle) so the hero swap can precede the
          player's FIRST intercept attempt — in battle the briefing chip
          carries the same teaching. Pointer-events are off (see CSS), so
          it never blocks the map beneath it. */}
      {!activeBattle && !focus && !interfacePaused && !targeting && interceptPreviewWarn && <div className="intercept-preview-warning" role="alert"><strong>⚠ موج بعدی «رهگیری ناوگان» است</strong><span>ناوگان را پیش از نشان نارنجیِ انتهای آبراه متوقف کن. برجک‌های قشم و هرمز، پشتیبانی جنگ الکترونیک و زمان‌بندی مهارت‌ها را ترکیب کن؛ هیچ ترکیب اجباری وجود ندارد.</span></div>}
      {/* War essential strip (D-023): hearts · wave progress + remaining
          objectives · explicit air-leak counter · VIP chip — plus the
          scenario objective's own HP bar. Replaces the wave-hud card in
          BOTH view states (the card itself is gone for good). */}
      {activeBattle && !interfacePaused && !targeting && <div className="war-essentials">
        <div className="war-strip">
          <span className="war-hearts" aria-label={`سلامت بندر ${fa(game.hearts)} از ۲۰`}><HarborGlyph symbol="heart"/><strong>{fa(game.hearts)}</strong></span>
          <span className="war-wave"><HarborGlyph symbol="ship"/> موج {fa(game.wave)}</span>
          <button className={`main-battle-action battle-running ${paused ? "is-paused" : ""}`} onClick={mainAction} aria-label={actionLabel} title={actionLabel}><HarborGlyph symbol={paused ? "play" : "pause"}/></button>
          <button className="battle-speed" onClick={() => { dispatch({ type: "speed" }); feedback(); }} aria-label={`تغییر سرعت نبرد؛ ${game.speed} برابر`} title="سرعت نبرد"><HarborGlyph symbol="speed"/><strong>{fa(game.speed)}×</strong></button>
        </div>
        <div className="war-status">
          <div className="war-progress"><i style={{ width: `${progress * 100}%` }} /></div>
          <span className="war-remaining">{battlePaused ? <><Pause size={11} /> متوقف</> : `${fa(remaining)} هدف باقی‌مانده`}</span>
          {markedQuota && <span className="war-airleak">رهگیری {fa(markedQuota.intercepted)} / {fa(markedQuota.total)} · هدف {fa(markedQuota.requiredPercent)}٪</span>}
          {!openingOp && airAllowed !== null && battleObj && <span className={`war-airleak ${battleObj.airLeaked >= airAllowed ? "danger" : ""}`}><Plane size={13} />نشت هوایی {fa(battleObj.airLeaked)}/{fa(airAllowed)}</span>}
          {game.vipShip && <span className="war-vip"><Ship size={13} />ناو ویژه <b>{fa(Math.max(0, Math.round(game.vipShip.hp)))}</b></span>}
        </div>
        {objectiveBar && <div className="objective-bar" role="status" aria-label={`${objectiveBar.label}: ${fa(Math.max(0, Math.round(objectiveBar.hp)))} از ${fa(objectiveBar.max)}`}><span>{objectiveBar.label}</span><div className="objective-track"><i style={{ width: `${Math.max(0, Math.min(100, (objectiveBar.hp / objectiveBar.max) * 100))}%` }} /></div><b>{fa(Math.max(0, Math.round(objectiveBar.hp)))}/{fa(objectiveBar.max)}</b></div>}
      </div>}
      {boss && !interfacePaused && !targeting && <div className="boss-bar" role="status" aria-label={`غول‌آخر موج ${fa(game.wave)}`}><span className="boss-skull">☠</span><div className="boss-track"><div className="boss-fill" style={{ width: `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%` }} /><span className="boss-label">غول‌آخر موج {fa(game.wave)} · {fa(Math.max(0, Math.ceil(boss.hp)))} / {fa(boss.maxHp)}</span></div></div>}
      {showCombo && !interfacePaused && !targeting && <div className="combo-badge" aria-hidden="true"><Flame size={16} fill="currentColor" /><strong>×{fa(game.combo)}</strong><span>کمبو!</span><i style={{ width: `${Math.min(100, (game.comboTimer / 3.5) * 100)}%` }} /></div>}

      {!modalOpen && !targeting && <div className="view-controls">
        <button className={`map-view-toggle ${showMapTools ? "active" : ""}`} disabled={!worldReady || !camera}
          onClick={() => setShowMapTools(!showMapTools)} aria-label="کنترل نمای نقشه" aria-expanded={showMapTools} aria-controls="port-view-tools" />
        {showMapTools && <div className="view-options" id="port-view-tools" role="group" aria-label="ابزارهای نقشه">
          <div className="camera-row">
            <button onClick={() => camera?.zoomBy(1 / 1.5)} aria-label="بزرگ‌نمایی"><Plus size={20}/></button>
            <span ref={zoomLabel} aria-label="بزرگ‌نمایی فعلی"/>
            <button onClick={() => camera?.zoomBy(1.5)} aria-label="کوچک‌نمایی"><Minus size={20}/></button>
            <button onClick={() => { camera?.resetNorth(); camera?.flyTo(HOME_VIEW.x, HOME_VIEW.z, HOME_VIEW.distance); }} aria-label="بازنشانی نما"><Navigation size={19}/></button>
          </div>
          <button className="focus-toggle-btn" onClick={toggleFocus} aria-pressed={focus}>
            {focus ? <EyeOff size={17}/> : <Eye size={17}/>} {focus ? "نمایش جزئیات" : "حالت تمرکز"}
          </button>
          <button className="time-mode-btn" onClick={cycleTimeMode}>
            {timeMode === "night" ? <Moon size={17}/> : timeMode === "day" ? <Sun size={17}/> : <SunMoon size={17}/>}
            نور {timeMode === "auto" ? "خودکار" : timeMode === "day" ? "روز" : "شب"}
          </button>
        </div>}
      </div>}
      {!showCoach && !interfacePaused && !targeting && <button className="quick-build-button" onClick={quickBuild} title="ساخت برجک · B" aria-label="ساخت برجک">
        <HarborGlyph symbol="tools"/><span>ساخت</span>
      </button>}
      {showCoach && !interfacePaused && !targeting && <div className="quick-coach" role="status"><span className="coach-symbol">{coachStep === 1 ? <Shield size={16} /> : coachStep === 2 ? <Play size={16} /> : <Sparkles size={16} />}</span><p><span className="coach-step-label">قدم {fa(coachStep)} از ۳ · </span><b>{coachStep === 1 ? "اولین برجک دفاعی‌ات را بساز" : coachStep === 2 ? "موج اول دشمن را فراخوانی کن" : "با یک مهارت به برجک‌ها کمک کن"}</b><span className="coach-detail"><br />{coachStep === 1 ? "روی یک جایگاه ساحلی برجک بساز تا راه نفت‌کش‌ها امن شود." : coachStep === 2 ? "دشمن در راه است؛ نبرد را شروع کن تا برجک‌ها دفاع کنند." : "از نوار مهارت‌های پایین صفحه یک اسپل بزن؛ مثلاً پالس یا اورکلاک."}</span></p>{coachStep === 1 && <button className="coach-build" onClick={quickBuild}>ساخت برجک</button>}{coachStep === 2 && <button className="coach-build" onClick={mainAction}>شروع موج</button>}<button className="coach-dismiss" onClick={() => setCoachDismissed(true)} aria-label="رد کردن راهنما"><X size={14} /></button></div>}
      {!opening && (game.event || game.warnings?.fuel || game.warnings?.power || game.ammo < 100 || stats.grid < 0.9 || game.oil >= stats.oilCapacity - 1) && <button className="context-alert" onClick={() => openPanel(game.event ? "events" : game.warnings?.power ? "city" : stats.grid < 0.9 ? "city" : "economy")}><span /><strong>{game.event ? `رویداد فعال در تنگه؛ پایان تا ${fa(Math.max(0, Math.ceil(60 - game.eventClock)))} ثانیه` : game.warnings?.fuel ? "سوخت رو به اتمام است؛ پیش از خفگی شبکه، پالایشگاه و نیروگاه را تقویت کنید" : game.warnings?.power ? "شبکهٔ برق زیر فشار پایدار است؛ نیروگاه را تقویت کنید" : game.ammo < 100 ? "مهمات رو به اتمام است" : stats.grid < 0.9 ? "برق شبکه را تقویت کنید" : "مخزن نفت پر شده است"}</strong><ChevronLeft size={15} /></button>}

      {announcement && !targeting && !interfacePaused && <div className={`battle-announcement ${announcement.type}`} key={`${announcement.title}-${announcement.subtitle}`} role="status"><span>{announcement.type === "success" ? <ShieldCheck size={24} /> : announcement.type === "power" ? <Sparkles size={24} /> : <Swords size={24} />}</span><div><strong>{announcement.title}</strong><p>{announcement.subtitle}</p></div></div>}
      {bulletin && !otherInterface && !rewardInterface && !diaryOpen && !exitOpen &&
        <BattleBulletin bulletin={bulletin} airWarn={airWarn} interceptWarn={!!interceptWarn} diaryCount={diary.length} close={() => setBulletin(null)} openDiary={() => setDiaryOpen(true)} />}
      {diaryOpen && !otherInterface && !exitOpen && <WarDiary entries={diary} close={() => setDiaryOpen(false)} />}
      {paused && activeBattle && !interfacePaused && !targeting && !announcement && !exitOpen && !bulletin && !diaryOpen &&
        <section className="pause-indicator command-pause" aria-label="توقف موقت">
          <h2><Pause size={20} aria-hidden="true" />توقف موقت</h2>
          <button className="command-resume" onClick={mainAction}><Play size={17} fill="currentColor" />ادامهٔ نبرد</button>
          <button className="command-save" onClick={saveCommand}><Save size={17} />ذخیرهٔ بازی</button>
          {isNativeRuntime() && <button className="command-exit" onClick={() => setExitOpen(true)}><LogOut size={17} />خروج</button>}
        </section>}

      {!modalOpen && !targeting && !paused && activeBattle && <div className="command-bar" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
        <div className="support-actions" aria-label="مهارت‌های پشتیبانی">{spells.map(spell => {
          const cooldown = game.cooldowns[spell.id], ready = activeBattle && cooldown <= 0;
          return <button key={spell.id} data-opening-highlight={hint.highlight === "battle_ability" && openingSkill?.id === spell.id ? "battle_ability" : undefined} className={`support-button spell-${spell.id} ${ready ? "ready" : ""} ${cooldown > 0 ? "cooling" : ""}`} onClick={() => activateSpell(spell.id)} aria-label={`${spell.name}${cooldown > 0 ? `، شارژ ${fa(Math.ceil(cooldown))} ثانیه` : ""}`} aria-disabled={cooldown > 0} title={`${spell.name} · ${spell.key}`}>
            <span className="support-icon">
              <Image className="spell-art" src={`/assets/workshop/hud/${spell.id}.webp`} width={96} height={96} loading="eager" alt="" draggable={false} unoptimized />
              {cooldown > 0 && <>
                <svg viewBox="0 0 44 44" className="cooldown-ring" aria-hidden="true"><circle cx="22" cy="22" r="20" style={{ strokeDashoffset: 126 * (1 - cooldown / spell.cooldown) }} /></svg>
                <b className="cooldown-count">{fa(Math.ceil(cooldown))}</b>
              </>}
            </span>
            <span>{spell.short}</span>
          </button>;
        })}{!focus && <button className={`support-button boost-button ${game.idle.boostRemaining > 0 ? "ready" : ""}`} onClick={activateProduction} disabled={game.idle.boostCharges <= 0 && game.idle.boostRemaining <= 0} aria-label="تقویت تولید؛ ۶۰ ثانیه تولید دوبرابر" title="تقویت تولید · ۶۰ ثانیه ×۲"><span className="support-icon"><Zap size={21} /></span><span>{game.idle.boostRemaining > 0 ? `تولید ×۲ · ${fa(Math.ceil(game.idle.boostRemaining))}ث` : `تقویت تولید · ${fa(game.idle.boostCharges)} شارژ`}</span></button>}</div>
      </div>}
      {targeting && <div className="targeting-prompt" role="status"><span className={targeting}><Crosshair size={22} /></span><div><strong>{targeting === "strike" ? "کجا را هدف بگیریم؟" : "ناو به کجا برود؟"}</strong><p>{targeting === "strike" ? "روی محدودهٔ دلخواه در آبراه بزنید." : "یک نقطه روی آب انتخاب کنید."}</p></div><button onClick={() => setTargeting(null)} aria-label="لغو هدف‌گیری"><X size={19} /></button></div>}
    </main>

    {selectedBuilding !== null && <BuildingSheet key={selectedBuilding} id={selectedBuilding} game={game} dispatch={dispatch} guided={tankGuidance} close={() => setSelectedBuilding(null)} notify={notify} feedback={feedback} onEconomy={() => openPanel(BUILDINGS[selectedBuilding].category === "city" ? "city" : "economy")} onManagers={()=>openProgress("managers")} onPower={()=>chooseBuilding("power")} />}
    {selectedSlot !== null && sheetSlot === null && <SlotRadial key={`radial-${selectedSlot}`} game={game} slot={selectedSlot} dispatch={dispatch} close={() => setSelectedSlot(null)} openSheet={() => setSheetSlot(selectedSlot)} onBuild={buildTower} feedback={feedback} notify={notify} />}
    {sheetSlot !== null && <TowerSheet key={sheetSlot} game={game} slot={sheetSlot} kind={previewKind} onKindChange={setPreviewKind} dispatch={dispatch} close={() => setSheetSlot(null)} onResearch={() => openPanel("research")} onBuild={buildTower} feedback={feedback} notify={notify} />}
    {panel && <Panels panel={panel} game={game} dispatch={dispatch} close={() => setPanel(null)} notify={notify} sound={sound} setSound={setSound} vibration={vibration} setVibration={setVibration} cinematic={cinematic} setCinematic={setCinematic} onCollect={collectIncome} onSelectTower={chooseSlot} onSelectBuilding={chooseBuilding} />}
    {progressPanel && <ProgressionPanels panel={progressPanel} game={game} dispatch={dispatch} close={()=>setProgressPanel(null)} navigate={navigateMission} feedback={feedback} notify={notify} daily={daily} dailyBusy={dailyBusy} dailyError={dailyError} claimDaily={claimDaily} reloadDaily={()=>void reloadDaily()} dailyWebOnly={dailyWebOnly} />}
    {moreOpen && <MoreMenu game={game} close={() => setMoreOpen(false)} open={openPanel} openProgress={openProgress} goMap={goMap} openGuide={() => { if (opening) dispatch({type:"opening-help"}); setMoreOpen(false); setHelpOpen(true); }} />}
    {!otherInterface && (game.idle.offline ? <OfflineView game={game} dispatch={dispatch} feedback={feedback}/> : game.idle.rewards[0] ? <RewardView key={game.idle.rewards[0].id} reward={game.idle.rewards[0]} dispatch={dispatch} feedback={feedback}/> : pendingReport ? <BattleResultView game={game} report={pendingReport} dispatch={dispatch} autoBattle={game.idle.autoBattle} feedback={feedback} onDevelop={()=>openPanel("defense")}/> : null)}
    {incomeBurst && !interfacePaused && <div className="income-burst" key={incomeBurst.id} aria-hidden="true"><strong>+{opening ? `${compact(incomeBurst.cash)} اعتبار` : `$${compact(incomeBurst.cash)}`}</strong>{Array.from({length:9},(_,i)=><span key={i} style={{"--coin-i":i} as React.CSSProperties}><Coins size={19}/></span>)}</div>}
    {helpOpen && <QuickGuide close={() => setHelpOpen(false)} />}
    {toast && <div className="toast" role="status"><span><Check size={15} /></span>{toast}<button onClick={() => setToast("")} aria-label="بستن پیام"><X size={14} /></button></div>}
  </div>;
}

function MoreMenu({ game, close, open, openProgress, goMap, openGuide }: {
  game: GameState;
  close: () => void;
  open: (panel: PanelName) => void;
  openProgress: (panel: ProgressPanel) => void;
  goMap: () => void;
  openGuide: () => void;
}) {
  const ref = useDialog<HTMLElement>(close);
  const mainItems = [
    { key: "defense", title: "برجک‌ها", sub: "شبکهٔ دفاعی", act: () => open("defense") },
    { key: "missions", title: "مأموریت‌ها", sub: "هدف‌ها و پاداش فصل", act: () => openProgress("missions") },
    { key: "settings", title: "تنظیمات", sub: "صدا، جلوه‌ها و ذخیره", act: () => open("settings") },
  ];
  const stations = [
    { title: "شهر و زیرساخت", icon: Home, act: () => open("city") },
    { title: "پژوهشگاه", icon: FlaskConical, act: () => open("research") },
    { title: "مدیران", icon: UsersRound, act: () => openProgress("managers") },
    { title: "فرماندهان", icon: Award, act: () => open("hero") },
    { title: "گزارش‌های تنگه", icon: Bell, act: () => open("events"), badge: !!game.event },
    { title: "قراردادهای تجاری", icon: Ship, act: () => openProgress("contracts") },
  ];
  return <div className="compact-dialog-backdrop command-backdrop" onClick={close}>
    <section className="more-menu" ref={ref} role="dialog" aria-modal="true" aria-labelledby="more-title" tabIndex={-1} onClick={e => e.stopPropagation()}>
      <header className="more-grid command-cap">
        <div className="command-heading">
          <h2 id="more-title"><span className="command-anchor" aria-hidden="true" />فرماندهی بندر</h2>
          <button className="command-help" onClick={openGuide} aria-label="راهنمای سریع" title="راهنمای سریع"><CircleHelp size={19} /></button>
        </div>
        <button className="command-return" onClick={goMap} aria-label="بستن منو و بازگشت به نقشهٔ تنگه" title="بازگشت به نقشهٔ تنگه"><X size={19} /></button>
      </header>
      <div className="more-grid workshop-menu-grid">
        {mainItems.map(({ key, title, sub, act }) => <button className={`command-plaque ${key}`} key={key} onClick={act}>
          <span className="plaque-chevron" aria-hidden="true"><ChevronsRight size={26} strokeWidth={3.5} /></span>
          <strong>{title}</strong><small className="plaque-description">{sub}</small>
          <span className="more-icon" aria-hidden="true" />
        </button>)}
      </div>
      <div className="more-business-links more-grid command-fast-links">
        <button onClick={() => open("economy")} aria-label="اقتصاد"><span className="command-shortcut-art shortcut-cash" aria-hidden="true" />اقتصاد</button>
        <button onClick={() => open("war")} aria-label="عملیات"><span className="command-shortcut-art shortcut-war" aria-hidden="true" />عملیات</button>
        <button onClick={() => openProgress("daily")}><span className="command-shortcut-art shortcut-gift" aria-hidden="true" />هدیهٔ روزانه</button>
      </div>
      <details className="command-other">
        <summary>دیگر بخش‌های بندر<ChevronDown size={17} aria-hidden="true" /></summary>
        <div className="command-stations">{stations.map(({ title, icon: Icon, act, badge }) =>
          <button key={title} onClick={act}><Icon size={18} />{title}{badge && <span className="command-event-badge">جدید</span>}</button>)}
        </div>
      </details>
    </section>
  </div>;
}

function QuickGuide({ close }: { close: () => void }) {
  const ref = useDialog<HTMLElement>(close);
  return <div className="compact-dialog-backdrop command-backdrop" onClick={close}>
    <section className="quick-guide" ref={ref} role="dialog" aria-modal="true" aria-labelledby="guide-title" tabIndex={-1} onClick={e => e.stopPropagation()}>
      <header className="command-titleplate">
        <span className="command-folio" aria-hidden="true" /><h2 id="guide-title">راهنمای سریع</h2>
        <button className="close-control" onClick={close} aria-label="بستن راهنما"><X size={18} /></button>
      </header>
      <ol>
        <li><span className="guide-art guide-tower" aria-hidden="true" /><div><strong>خط دفاعت را بساز</strong><p>روی + نقشه بزن، برجک را انتخاب کن و ساختش را تأیید کن.</p></div></li>
        <li><span className="guide-art guide-chart" aria-hidden="true" /><div><strong>موج را شروع کن</strong><p>با شروع موج، برجک‌ها خودکار شلیک می‌کنند. برای مکث، دکمهٔ توقف را بزن.</p></div></li>
        <li><span className="guide-art guide-ammo" aria-hidden="true" /><div><strong>از مهارت‌ها کمک بگیر</strong><p>موشک‌ها به دشمن ضربه می‌زنند، پالس حرکتش را متوقف می‌کند و اورکلاک شلیک برجک‌ها را تقویت می‌کند.</p></div></li>
      </ol>
      <button className="primary-action command-resume" data-autofocus onClick={close}>بازگشت به بازی<ArrowLeft size={17} /></button>
      <small className="keyboard-hint">روی صفحه‌کلید، فاصله برای مکث و ۱، ۲، ۳ برای مهارت‌هاست.</small>
    </section>
  </div>;
}

function ExitDialog({ close, save, exit }: { close: () => void; save: () => void; exit: () => void }) {
  const ref = useDialog<HTMLElement>(close);
  return <div className="compact-dialog-backdrop command-backdrop">
    <section className="exit-dialog command-pause" ref={ref} role="alertdialog" aria-modal="true" aria-label="خروج از بازی" tabIndex={-1} onKeyDown={e => e.stopPropagation()}>
      <h2><Pause size={21} aria-hidden="true" />توقف موقت</h2>
      <button className="command-resume" data-autofocus onClick={close}><Play size={17} fill="currentColor" />ادامهٔ بازی</button>
      <button className="command-save" onClick={save}><Save size={17} />ذخیرهٔ بازی</button>
      <button className="command-exit" onClick={exit}><LogOut size={17} />ذخیره و خروج</button>
    </section>
  </div>;
}

function BattleBulletin({ bulletin, airWarn, interceptWarn, diaryCount, close, openDiary }: {
  bulletin: Bulletin;
  airWarn: ReturnType<typeof antiAirWarning>;
  interceptWarn: boolean;
  diaryCount: number;
  close: () => void;
  openDiary: () => void;
}) {
  const ref = useDialog<HTMLElement>(close);
  const { kind, scenario } = bulletin;
  const news = kind === "briefing" ? scenario.newsBefore : kind === "defeat" ? scenario.newsDefeat : scenario.newsVictory;
  return <section className={`news-bulletin ${kind}`} ref={ref} role="alertdialog" aria-label="بولتن خبری جنگ" tabIndex={-1} onKeyDown={e => e.stopPropagation()}>
    <header className="news-head">
      <span className="news-live"><span className="command-lantern" aria-hidden="true" />خبرگزاری تنگه</span>
      <span className="news-op">موج {fa(bulletin.wave)} · {scenario.zone}</span>
      <button className="news-x" onClick={close} aria-label="بستن بولتن"><X size={17} /></button>
    </header>
    <div className="bulletin-paper">
      <small>عملیات «{scenario.operationName}»</small>
      <h2>{news.headline}</h2><p>{news.body}</p>
      {kind === "briefing" && <>
        <p className="news-brief">{scenario.briefing}</p>
        <div className="news-chips"><span>هدف: {scenario.objective}</span><span>دشمن: {scenario.enemyFlavor}</span>
          {scenario.specialCondition && <span>شرایط: {scenario.specialCondition}</span>}
          {airWarn && <span className="news-warning">هشدار پدافند هوایی: {fa(airWarn.airTotal)} پرندهٔ دشمن در راه است و {airWarn.capable ? "پدافند هوایی اختصاصی نداری" : "هیچ برجک ضدهوایی نداری"}. یک برجک پدافند هوایی بساز. عبور بیش از حد پرنده‌ها باعث شکست عملیات می‌شود.</span>}
          {interceptWarn && <span className="news-warning">هدف رهگیری: نابودی دشمن پیش از نشان نارنجی در {fa(INTERCEPT_LINE * 100)}٪ مسیر. دفاع ساحلی و کندسازی را آماده کن. پالس و موشک برای موقعیت‌های دشوارند.</span>}
        </div>
      </>}
    </div>
    <div className="news-actions"><button onClick={close}>{kind === "briefing" && <Play size={17} fill="currentColor" />}{kind === "briefing" ? "آغاز نبرد" : "بستن"}</button>
      <button className="news-diary-btn" onClick={openDiary}><ClipboardList size={16} />دفترچه جنگ ({fa(diaryCount)})</button>
    </div>
  </section>;
}

function WarDiary({ entries, close }: { entries: DiaryEntry[]; close: () => void }) {
  const ref = useDialog<HTMLElement>(close);
  return <div className="diary-overlay" onClick={close}>
    <section className="diary-card" ref={ref} role="dialog" aria-modal="true" aria-label="دفترچه جنگ" tabIndex={-1} onKeyDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      <header className="news-head"><span className="news-live"><span className="command-folio" aria-hidden="true" />دفترچه جنگ</span><button className="news-x" onClick={close} aria-label="بستن دفترچه"><X size={17} /></button></header>
      <div className="diary-list">{entries.length === 0 ? <p className="diary-empty">با شروع نخستین نبرد، گزارش عملیات اینجا ثبت می‌شود.</p> : [...entries].reverse().map((entry, i) =>
        <article key={`${entry.at}-${i}`} className={`diary-item ${entry.kind}`}>
          <small>موج {fa(entry.wave)} · {entry.kind === "before" ? "پیش از نبرد" : entry.kind === "victory" ? "پیروزی" : "شکست"}{entry.zone && ` · ${entry.zone}`}</small>
          <strong>{entry.headline}</strong><p>{entry.body}</p>
        </article>)}
      </div>
    </section>
  </div>;
}
