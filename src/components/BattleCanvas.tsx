"use client";

import { useEffect, useRef } from "react";
import { getSlots, TOWERS, enemyPosition, piratePosition, merchantPosition, portTankerPosition, tankerCapacityFor, type Enemy, type GameState, type Shot } from "@/lib/game";
import { isWater, isSurfaceWater, getLane, sampleLane, type MapLayout } from "@/lib/navigation";
import { CONTRACTS } from "@/lib/progression";
import type { BattleSound } from "@/lib/battle-audio";

type Point = { x: number; y: number };
type Style = "tracer" | "missile" | "shell" | "laser" | "pulse" | "torpedo" | "rail" | "ballistic";
type Particle = Point & { vx: number; vy: number; age: number; life: number; size: number; color: string; type: "spark" | "smoke" | "water" | "debris" };
type Ring = Point & { age: number; life: number; radius: number; color: string; ellipse: number; width: number };
type Flash = Point & { age: number; life: number; size: number; color: string };
type Fireball = Point & { age: number; life: number; size: number; seed: number };
type Projectile = { from: Point; to: Point; age: number; duration: number; delay: number; arc: number; style: Style; trail: Point[]; scale: number; seed: number };
type Vessel = Point & { target: Point; angle: number; hp: number; maxHp: number; kind: Enemy["kind"] | "pirate" | "merchant"; variant?: string; boss?: number; hit: number; stun: number; burn: number; seed: number };
type Wreck = Vessel & { age: number; delay: number };
type FloatingText = Point & { text: string; age: number; life: number; kind: "cash" | "damage" | "crit" | "combo" | "event" };
type Props = { game: GameState; paused: boolean; cinematic: boolean; reducedMotion: boolean; playSound: (sound: BattleSound) => void };

const GOLD = "255,194,101", CYAN = "127,236,241", WATER = "197,240,232";
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const random = (min: number, max: number) => min + Math.random() * (max - min);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

class NavalRenderer {
  width = 1; height = 1; time = 0;
  cinematic = true; reducedMotion = false; paused = false;
  units = new Map<string, Vessel>();
  layout: MapLayout = "landscape";
  sprites: Record<string, HTMLImageElement> = {};
  constructor() {
    for (const name of ["patrol", "destroyer", "cruiser", "battleship", "carrier", "submarine", "aircraft", "merchant", "freighter", "container", "tanker", "gun", "battleship-gun"]) { const image = new Image(); image.src = `/assets/ships/${name}.png`; this.sprites[name] = image; }
    for (const [name, file] of [["missile-projectile", "Missile.png"], ["shell-projectile", "Bullet_Cannon.png"]]) { const image = new Image(); image.src = `/assets/towers/${file}`; this.sprites[name] = image; }
    const hulls = ["ship_small_body", "ship_small_b_body", "ship_medium_body", "ship_medium_body_b", "ship_large_body", "ship_small_body_destroyed", "ship_medium_body_destroyed", "ship_large_body_destroyed", "ship_gun_gray", "ship_gun_dual_gray", "ship_big_gun_dual"];
    for (const kind of ["small", "medium", "big"]) for (let frame = 0; frame < 5; frame++) hulls.push(`water_ripple_${kind}_00${frame}`);
    for (const name of hulls) { const image = new Image(); image.src = `/assets/ships/chabull/${name}.png`; this.sprites[name] = image; }
  }
  projectiles: Projectile[] = []; particles: Particle[] = []; rings: Ring[] = [];
  flashes: Flash[] = []; fireballs: Fireball[] = []; wrecks: Wreck[] = []; texts: FloatingText[] = [];
  previous: GameState | null = null;
  seenPopups = new Set<number>(); lastFire = new Map<string, number>();
  shake = 0; globalFlash = 0; recentStrike = -10; overdriveGlow = 0; bossWarned = new Set<number>();
  onSound: (sound: BattleSound) => void = () => {};
  private textures = new Map<string, HTMLCanvasElement>();

  /** Glow is baked once, never recomputed with shadowBlur on the live canvas. */
  texture(color: string, kind: "glow" | "fire" | "smoke" = "glow") {
    const key = `${kind}:${color}`;
    const cached = this.textures.get(key);
    if (cached) return cached;
    const canvas = document.createElement("canvas"); canvas.width = 128; canvas.height = 128;
    const context = canvas.getContext("2d");
    if (context) {
      const gradient = context.createRadialGradient(64, 64, 1, 64, 64, 63);
      if (kind === "fire") {
        gradient.addColorStop(0, "#fff9d5"); gradient.addColorStop(0.16, "#ffe99a");
        gradient.addColorStop(0.4, "#ffb44b"); gradient.addColorStop(0.62, "rgba(239,101,30,.95)");
        gradient.addColorStop(0.84, "rgba(145,62,27,.38)"); gradient.addColorStop(1, "rgba(90,64,40,0)");
      } else if (kind === "smoke") {
        gradient.addColorStop(0, `rgba(${color},.7)`); gradient.addColorStop(.55, `rgba(${color},.45)`); gradient.addColorStop(1, `rgba(${color},0)`);
      } else {
        gradient.addColorStop(0, "rgba(255,249,222,.95)"); gradient.addColorStop(.2, `rgba(${color},.8)`);
        gradient.addColorStop(.5, `rgba(${color},.2)`); gradient.addColorStop(1, `rgba(${color},0)`);
      }
      context.fillStyle = gradient; context.fillRect(0, 0, 128, 128);
    }
    this.textures.set(key, canvas);
    return canvas;
  }

  glow(ctx: CanvasRenderingContext2D, point: Point, radius: number, color: string, opacity = 1) {
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * opacity;
    ctx.drawImage(this.texture(color), point.x - radius, point.y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = alpha;
  }

  point(point: Point): Point { return { x: point.x / 100 * this.width, y: point.y / 100 * this.height }; }
  normalized(point: Point): Point { return { x: point.x / this.width * 100, y: point.y / this.height * 100 }; }

  ring(point: Point, radius: number, color: string, life = 0.8, delay = 0, ellipse = 0.5, width = 1.5) {
    this.rings.push({ ...point, radius, color, age: -delay, life, ellipse, width });
  }

  burst(point: Point, scale: number, style: "fire" | "water" | "energy" | "build" = "fire", delay = 0) {
    const color = style === "energy" ? CYAN : style === "water" ? WATER : GOLD;
    const intensity = this.cinematic && !this.reducedMotion ? 1 : 0.42;
    const radius = (style === "build" ? 52 : 34) * scale;
    this.flashes.push({ ...point, age: -delay, life: 0.32, size: radius, color });
    this.ring(point, radius * 1.6, style === "fire" ? WATER : color, 1.2, delay + 0.05, 0.43);
    this.ring(point, radius, color, 0.6, delay, style === "build" ? 0.62 : 0.53, 2);
    const count = Math.round((style === "build" ? 22 : 28) * scale * intensity);
    for (let i = 0; i < count; i++) {
      const angle = random(0, Math.PI * 2), speed = random(24, 115) * scale;
      const water = i % 3 === 0 && style !== "energy" && style !== "build";
      this.particles.push({ ...point, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * 0.65 - (style === "build" ? 35 : 15), age: -delay, life: random(0.3, 0.95), size: random(0.8, water ? 2.8 : 2.2) * scale, color: water ? WATER : color, type: water ? "water" : "spark" });
    }
    if (style === "fire" && scale > 0.65) {
      this.fireballs.push({ ...point, age: -delay, life: 0.68, size: 24 * scale, seed: random(0, 10) });
      for (let i = 0; i < Math.round(7 * scale * intensity); i++) {
        this.particles.push({ ...point, vx: random(-48, 48) * scale, vy: random(-125, -55) * scale, age: -delay, life: random(0.45, 0.95), size: random(1.1, 2.3) * scale, color: WATER, type: "water" });
        if (i % 2 === 0) this.particles.push({ ...point, vx: random(-80, 80) * scale, vy: random(-100, -35) * scale, age: -delay, life: random(0.55, 1.1), size: random(1.3, 3.2) * scale, color: "77,79,62", type: "debris" });
      }
    }
    if (style === "fire" && this.cinematic) for (let i = 0; i < Math.ceil(5 * scale); i++) {
      this.particles.push({ ...point, vx: random(-14, 14) * scale, vy: random(-24, -9) * scale, age: -delay - random(0, 0.14), life: random(0.9, 2), size: random(7, 14) * scale, color: "35,46,43", type: "smoke" });
    }
    if (scale >= 1.6 && !this.reducedMotion && this.cinematic) { this.shake = Math.max(this.shake, scale * 1.8); this.globalFlash = 0.09; }
  }

  projectile(shot: Shot, style: Style, scale = 1, delay = 0) {
    const from = { x: shot.x1, y: shot.y1 }, to = { x: shot.x2, y: shot.y2 };
    const duration = style === "tracer" ? 0.15 : style === "laser" || style === "rail" ? 0.25 : style === "pulse" ? 0.5 : style === "torpedo" ? 0.65 : style === "ballistic" ? 0.8 : style === "shell" ? 0.63 : 0.56;
    this.projectiles.push({ from, to, style, scale, age: 0, delay, duration, arc: style === "shell" ? 54 : style === "missile" ? 24 : style === "ballistic" ? 12 : 0, trail: [], seed: Math.random() * 30 });
    if (style !== "laser" && style !== "pulse") this.flashes.push({ ...from, age: -delay, life: 0.1, size: 15 * scale, color: style === "torpedo" || style === "rail" ? CYAN : GOLD });
  }

  ingest(game: GameState) {
    if (this.previous && (game.elapsed < this.previous.elapsed || game.nextId < this.previous.nextId || game.layout !== this.previous.layout)) {
      this.units.clear(); this.projectiles = []; this.particles = []; this.rings = [];
      this.flashes = []; this.fireballs = []; this.wrecks = []; this.texts = []; this.seenPopups.clear(); this.lastFire.clear();
      this.previous = null; this.recentStrike = -10; this.shake = 0; this.globalFlash = 0;
    }
    const old = this.previous;
    const newStrike = game.popups.some(p => p.text === "💥" && !this.seenPopups.has(p.id));
    const present = new Set<string>();
    const addUnit = (id: string, position: Point, unitData: { hp: number; maxHp: number; kind: Vessel["kind"]; stun: number; burn?: number; boss?: number; variant?: string; hitFlash?: number }) => {
      present.add(id);
      const unit = this.units.get(id);
      if (unit) {
        if (unitData.hp < unit.hp) unit.hit = Math.max(unit.hit, 0.22);
        if ((unitData.hitFlash ?? 0) > 0) unit.hit = Math.max(unit.hit, 0.3);
        unit.target = position; unit.hp = unitData.hp; unit.maxHp = unitData.maxHp;
        unit.stun = unitData.stun; unit.burn = unitData.burn ?? 0; unit.boss = unitData.boss; unit.variant = unitData.variant;
      } else {
        this.units.set(id, { ...position, target: position, hp: unitData.hp, maxHp: unitData.maxHp, kind: unitData.kind, angle: -Math.PI + 0.3, hit: 0, stun: unitData.stun, burn: unitData.burn ?? 0, boss: unitData.boss, variant: unitData.variant, seed: (Number(id.replace(/\D/g, "")) || 13) * 2.17 });
        if (unitData.kind === "boss") {
          const bossId = Number(id.replace(/\D/g, "")) || 0;
          if (!this.bossWarned.has(bossId)) {
            this.bossWarned.add(bossId);
            if (this.bossWarned.size > 40) this.bossWarned.clear();
            this.ring(position, 90, "255,110,90", 1.4, 0, 0.55, 2.5);
            this.ring(position, 60, GOLD, 1.0, 0.15, 0.55, 2);
            this.shake = Math.max(this.shake, 3.2);
            this.onSound("boss");
          }
        }
      }
    };
    for (const enemy of game.enemies) addUnit(`enemy-${enemy.id}`, enemyPosition(enemy, game.layout), enemy);
    for (const pirate of game.pirates) addUnit(`pirate-${pirate.id}`, piratePosition(pirate, game.layout), { kind: "pirate", hp: pirate.hp, maxHp: 100, stun: 0 });
    for (const merchant of game.merchants) addUnit(`merchant-${merchant.id}`, merchantPosition(merchant, game.layout), { kind: "merchant", variant: merchant.kind, hp: 100, maxHp: 100, stun: 0 });
    if (game.idle.port?.tanker) { const tanker = game.idle.port.tanker, cap = tankerCapacityFor(game.buildings.dock); addUnit("port-tanker", portTankerPosition(tanker.progress, game.layout), { kind: "merchant", variant: "tanker", hp: tanker.stage === "loading" ? tanker.load : cap, maxHp: cap, stun: 0 }); }
    if(game.idle.contract){const contract=game.idle.contract,definition=CONTRACTS[contract.id];addUnit("contract-main",sampleLane(getLane(game.layout,"trade"),Math.min(.97,contract.elapsed/definition.duration)),{kind:"merchant",variant:"contract",hp:100,maxHp:100,stun:0});}
    for (const [id, unit] of this.units) if (!present.has(id)) {
      const killed = game.popups.some(p => p.text.startsWith("+") && Math.hypot(p.x - unit.x, p.y - unit.y) < 8);
      if (old && killed && unit.kind !== "merchant") {
        const delay = newStrike || this.time - this.recentStrike < 1 ? 0.8 : game.shots.some(shot => Math.hypot(shot.x2 - unit.x, shot.y2 - unit.y) < 5) ? 0.2 : 0;
        const isBoss = unit.kind === "boss";
        this.burst(unit.target, isBoss ? 3.1 : unit.kind === "speed" || unit.kind === "air" ? 0.9 : 1.35, "fire", delay);
        if (isBoss) {
          this.ring(unit.target, 130, GOLD, 1.5, delay, 0.5, 3);
          this.ring(unit.target, 90, "255,110,90", 1.2, delay + 0.1, 0.5, 2.5);
          this.shake = Math.max(this.shake, 5);
          this.globalFlash = Math.max(this.globalFlash, 0.16);
        }
        this.wrecks.push({ ...unit, age: 0, delay });
        if (unit.kind !== "speed" && unit.kind !== "air") this.onSound("explosion");
      }
      this.units.delete(id);
    }
    this.overdriveGlow = game.overdrive > 0 ? 1 : Math.max(0, this.overdriveGlow - 0.05);
    if (old) {
      if (game.cooldowns.emp > old.cooldowns.emp + 1) {
        const center = { x: 60, y: 61 };
        for (let i = 0; i < 3; i++) this.ring(center, Math.max(this.width, this.height) * 0.75, CYAN, 1.35, i * 0.12, 0.7, 3 - i * 0.6);
        for (const enemy of game.enemies) this.burst(enemyPosition(enemy, game.layout), 0.65, "energy", 0.12);
        this.onSound("emp");
      }
      if (game.overdrive > old.overdrive + 1) {
        for (const tower of game.towers) this.burst(getSlots(game.layout)[tower.slot], 1, "build");
        this.onSound("overdrive");
      }
      for (const tower of game.towers) {
        const previous = old.towers.find(t => t.slot === tower.slot);
        if (!previous || previous.tier !== tower.tier) { this.burst(getSlots(game.layout)[tower.slot], 1.25, "build"); this.onSound("upgrade"); }
      }
      if (game.hearts < old.hearts) { this.burst({ x: 24, y: 36 }, 1.7); this.onSound("explosion"); }
    }
    for (const popup of game.popups) if (!this.seenPopups.has(popup.id)) {
      this.seenPopups.add(popup.id);
      if (popup.text === "💥") {
        this.recentStrike = this.time;
        const count = this.reducedMotion ? 4 : 8;
        for (let i = 0; i < count; i++) {
          const to = { x: popup.x + Math.sin(i * 2.4) * 7, y: popup.y + Math.cos(i * 2.4) * 6 };
          this.projectile({ x1: to.x + 18 - i * 2, y1: -10 - i * 3, x2: to.x, y2: to.y, kind: "missile", slot: -1, modelKind: "silo", targetId: -1, flightDur: 1.6, damage: 0, crit: false, interval: 0 }, "ballistic", 1.6, i * 0.1);
        }
        this.ring(popup, 95, GOLD, 1.2, 0, 0.65, 1);
        this.onSound("launch");
      } else if (popup.text.startsWith("🔥")) {
        this.texts.push({ ...popup, text: popup.text, age: 0, life: 1.6, kind: "combo" });
        this.onSound("combo");
      } else if (popup.text.startsWith("★")) {
        this.texts.push({ ...popup, text: popup.text, age: 0, life: 2.2, kind: "event" });
        this.onSound("victory");
      } else if (popup.text.startsWith("✸")) {
        this.texts.push({ ...popup, text: popup.text.replace("✸", "✸ ").replace(/\d/g, digit => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]), age: 0, life: 1.2, kind: "crit" });
        this.onSound("crit");
      } else if (popup.text.startsWith("−") || popup.text.startsWith("-")) {
        this.texts.push({ ...popup, text: popup.text.replace(/\d/g, digit => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]), age: 0, life: 0.9, kind: "damage" });
      } else if (popup.text.startsWith("+")) this.texts.push({ ...popup, text: popup.text.replace(/\d/g, digit => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]), age: 0, life: 1.3, kind: "cash" });
    }
    if (this.seenPopups.size > 500) this.seenPopups = new Set(game.popups.map(p => p.id));
    if (!this.paused) for (const shot of game.shots) {
      const key = `${shot.x1.toFixed(1)}:${shot.y1.toFixed(1)}:${shot.kind}`;
      const tower = game.towers.find(t => getSlots(game.layout)[t.slot].x === shot.x1 && getSlots(game.layout)[t.slot].y === shot.y1);
      const rate = TOWERS[shot.kind].rate * game.speed * (game.overdrive > 0 ? 2 : 1);
      const interval = shot.kind === "air" ? 0.23 : shot.kind === "ew" ? 0.75 : 1 / Math.max(0.5, rate);
      if (this.time - (this.lastFire.get(key) ?? -100) < interval) continue;
      this.lastFire.set(key, this.time);
      let style: Style = shot.kind === "cannon" ? "tracer" : shot.kind === "heavy" ? "shell" : shot.kind === "missile" ? "missile" : shot.kind === "air" ? "laser" : shot.kind === "ew" ? "pulse" : "torpedo";
      if (tower?.kind === "cannon" && tower.tier === 4 && tower.branch === 1) style = "rail";
      const scale = tower?.tier === 4 ? 1.35 : 1;
      const count = style === "tracer" ? (this.cinematic ? 3 : 2) : 1;
      for (let i = 0; i < count; i++) this.projectile(shot, style, scale, i * 0.055);
      if (style === "missile" && tower?.tier === 4 && tower.branch === 1) {
        this.projectile({ ...shot, x2: shot.x2 + 1.3, y2: shot.y2 - 0.8 }, style, scale, 0.1);
        this.projectile({ ...shot, x2: shot.x2 - 1.3, y2: shot.y2 + 0.8 }, style, scale, 0.2);
      }
      if (style === "missile" || style === "shell") this.onSound("launch");
      if (style === "pulse") this.ring({ x: shot.x1, y: shot.y1 }, Math.min(120, this.width * 0.12), CYAN, 0.9, 0, 0.65);
    }
    this.previous = game;
  }

  vessel(ctx: CanvasRenderingContext2D, unit: Vessel, opacity = 1, scale = 1, health = true) {
    const point = this.point(unit), boss = unit.kind === "boss", air = unit.kind === "air", neutral = unit.kind === "merchant";
    let spriteName = air ? "aircraft" : unit.kind === "speed" ? "ship_small_body" : unit.kind === "pirate" ? "ship_small_b_body" : unit.kind === "corvette" ? "ship_medium_body" : unit.kind === "destroyer" ? "ship_medium_body_b" : unit.kind === "sub" || (boss && unit.boss === 2) ? "submarine" : boss ? unit.boss === 4 ? "carrier" : "ship_large_body" : unit.variant === "container" ? "container" : (unit.variant === "tanker" || unit.variant === "contract") ? "tanker" : unit.variant === "barge" ? "merchant" : "freighter";
    const detailed = spriteName.startsWith("ship_");
    if (opacity < .99 && detailed) spriteName = unit.kind === "speed" || unit.kind === "pirate" ? "ship_small_body_destroyed" : boss ? "ship_large_body_destroyed" : "ship_medium_body_destroyed";
    const sprite = this.sprites[spriteName];
    const mobile = this.width < 700 ? .78 : 1;
    let length = (boss ? 100 : air ? 43 : neutral ? unit.variant === "tanker" ? 79 : 65 : unit.kind === "destroyer" ? 70 : unit.kind === "corvette" ? 62 : unit.kind === "sub" ? 60 : 42) * scale * mobile;
    const baseBeam = boss && spriteName === "carrier" ? .29 : air ? .72 : spriteName === "submarine" ? .24 : neutral ? .22 : .2;
    const beamRatio = sprite?.naturalHeight ? Math.max(baseBeam, Math.min(.53, sprite.naturalWidth / sprite.naturalHeight)) : baseBeam;
    // Keep the full visible hull on water even while turning through tight channels.
    if (!air) {
      const forward = { x: Math.cos(unit.angle), y: Math.sin(unit.angle) }, side = { x: -forward.y, y: forward.x };
      const fits = (candidate: number) => {
        for (const [along, across] of [[-.45,0],[.45,0],[-.25,-.48],[-.25,.48],[.25,-.48],[.25,.48],[0,-.5],[0,.5]]) {
          const px = point.x + forward.x * candidate * along + side.x * candidate * beamRatio * across;
          const py = point.y + forward.y * candidate * along + side.y * candidate * beamRatio * across;
          if (px >= 0 && py >= 0 && px <= this.width && py <= this.height && !isSurfaceWater({ x: px / this.width * 100, y: py / this.height * 100 }, this.layout)) return false;
        }
        return true;
      };
      while (length > 9 && !fits(length)) length *= .83;
    }
    const beam = length * beamRatio;
    if (boss && opacity >= 0.99 && this.cinematic && !this.reducedMotion) {
      const pulse = 0.5 + Math.sin(this.time * 4 + unit.seed) * 0.18;
      ctx.save(); ctx.globalAlpha = opacity * 0.55 * pulse;
      ctx.strokeStyle = unit.boss === 2 ? "#7ce7f4" : "#ff7a5c"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(point.x, point.y, length * 0.62, length * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = opacity * 0.22 * pulse;
      ctx.fillStyle = unit.boss === 2 ? "#7ce7f4" : "#ff7a5c";
      ctx.beginPath(); ctx.ellipse(point.x, point.y, length * 0.62, length * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.save(); ctx.globalAlpha = opacity; ctx.translate(point.x, point.y); ctx.rotate(unit.angle + Math.PI / 2);
    if (!air) {
      const wakeKind = boss ? "big" : unit.kind === "speed" || unit.kind === "pirate" ? "small" : "medium";
      const frame = Math.floor(this.time * 7 + unit.seed) % 5;
      const wake = this.sprites[`water_ripple_${wakeKind}_00${frame}`];
      if (wake?.complete && wake.naturalWidth) {
        const wakeLength = length * 1.48, wakeWidth = wakeLength * wake.naturalWidth / wake.naturalHeight;
        ctx.globalAlpha = opacity * .8; ctx.drawImage(wake, -wakeWidth / 2, -length * .55, wakeWidth, wakeLength); ctx.globalAlpha = opacity;
      }
      ctx.fillStyle = "rgba(3,25,29,.30)"; ctx.beginPath(); ctx.ellipse(2, 4, beam * .58, length * .49, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (sprite?.complete && sprite.naturalWidth) {
      ctx.imageSmoothingEnabled = true;
      const ratio = sprite.naturalWidth / sprite.naturalHeight;
      const width = air ? length * ratio : Math.max(beam, length * ratio);
      ctx.drawImage(sprite, -width / 2, -length / 2, width, length);
      if (!neutral && !air && opacity >= .99 && detailed) {
        const gun = this.sprites[boss ? "ship_big_gun_dual" : unit.kind === "speed" || unit.kind === "pirate" ? "ship_gun_gray" : "ship_gun_dual_gray"];
        if (gun?.complete && gun.naturalWidth) {
          const gunLength = length * (boss ? .23 : .2), gunWidth = gunLength * gun.naturalWidth / gun.naturalHeight;
          ctx.drawImage(gun, -gunWidth / 2, -length * .35, gunWidth, gunLength);
          if (boss || unit.kind === "destroyer") ctx.drawImage(gun, -gunWidth / 2, length * .05, gunWidth, gunLength);
        }
      }
    } else { ctx.fillStyle = neutral ? "#b5d4bf" : "#9baaa2"; ctx.beginPath(); ctx.moveTo(0,-length*.5);ctx.lineTo(beam*.5,length*.35);ctx.lineTo(-beam*.5,length*.35);ctx.closePath();ctx.fill(); }
    if (unit.hit > 0) {
      ctx.strokeStyle = `rgba(255,200,129,${Math.min(1, unit.hit * 4)})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(0,0,beam*.7,length*.36,0,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle = `rgba(255,220,150,${Math.min(0.4, unit.hit * 1.8)})`;
      ctx.beginPath(); ctx.ellipse(0,0,beam*.6,length*.3,0,0,Math.PI*2); ctx.fill();
    }
    if (unit.burn > 0 && this.cinematic) {
      ctx.fillStyle = `rgba(255,140,60,${0.35 + Math.sin(this.time * 18 + unit.seed) * 0.15})`;
      ctx.beginPath(); ctx.ellipse(0,-length*0.1,beam*0.5,length*0.22,0,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
    if (unit.variant === "contract") { ctx.save(); ctx.fillStyle="#f9d88a"; ctx.strokeStyle="rgba(241,207,131,.55)"; ctx.lineWidth=1; ctx.beginPath();ctx.ellipse(point.x,point.y,length*.42,length*.18,0,0,Math.PI*2);ctx.stroke();ctx.font="14px serif";ctx.textAlign="center";ctx.fillText("✦",point.x,point.y-23);ctx.restore(); }
    if (unit.stun > 0) { ctx.save(); ctx.strokeStyle = `rgba(${CYAN},.8)`; ctx.lineWidth = 1.3; ctx.setLineDash([3,4]); ctx.beginPath(); ctx.ellipse(point.x,point.y,length*.35,length*.18,0,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
    if (health && !neutral && (unit.hp < unit.maxHp*.99 || boss)) {
      const width = boss ? 48 : 28, x=point.x-width/2, y=point.y-(boss ? 26 : 19);
      ctx.fillStyle="rgba(9,29,34,.84)";ctx.fillRect(x-1,y-1,width+2,5);
      ctx.fillStyle=unit.stun>0?"#9cf0ee":boss?"#efbb72":"#f08b6d";ctx.fillRect(x,y,width*clamp(unit.hp/unit.maxHp),3);
    }
  }

  drawProjectile(ctx: CanvasRenderingContext2D, projectile: Projectile, dt: number) {
    projectile.age += dt;
    const age = projectile.age - projectile.delay;
    if (age < 0) return true;
    const t = clamp(age / projectile.duration), from = this.point(projectile.from), to = this.point(projectile.to);
    const energy = ["laser", "pulse", "rail", "torpedo"].includes(projectile.style), color = energy ? CYAN : GOLD;
    if (["laser", "rail", "pulse"].includes(projectile.style)) {
      const alpha = (1 - t) * (projectile.style === "pulse" ? 0.55 : 0.9);
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
      ctx.strokeStyle = `rgba(${color},${alpha * 0.3})`; ctx.lineWidth = projectile.style === "pulse" ? 2 : 7 * projectile.scale;
      ctx.beginPath(); ctx.moveTo(from.x, from.y);
      if (projectile.style === "pulse") for (let i = 1; i < 9; i++) { const n = i / 9; ctx.lineTo(from.x + (to.x - from.x) * n + Math.sin(i * 7 + projectile.seed + Math.floor(age * 15)) * 6, from.y + (to.y - from.y) * n + Math.cos(i * 6 + projectile.seed) * 5); }
      ctx.lineTo(to.x, to.y); ctx.stroke();
      if (this.cinematic && projectile.style !== "pulse") { ctx.lineWidth = 17 * projectile.scale; ctx.strokeStyle = `rgba(${color},${alpha * .06})`; ctx.stroke(); }
      ctx.lineWidth = projectile.style === "pulse" ? 1 : 1.5; ctx.strokeStyle = `rgba(236,255,247,${alpha})`; ctx.stroke();
      this.glow(ctx, to, 17 * projectile.scale, color, alpha); ctx.restore();
      if (t >= 1) { if (projectile.style === "rail") this.burst(projectile.to, 0.8, "energy"); return false; }
      return true;
    }
    const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * projectile.arc };
    const last = projectile.trail[projectile.trail.length - 1] ?? from;
    projectile.trail.push(point); if (projectile.trail.length > (projectile.style === "ballistic" ? 19 : 11)) projectile.trail.shift();
    ctx.save();
    if (projectile.style === "missile" || projectile.style === "shell" || projectile.style === "ballistic") {
      ctx.strokeStyle = "rgba(215,223,209,.24)"; ctx.lineWidth = projectile.style === "ballistic" ? 4 : 2;
      ctx.beginPath(); projectile.trail.forEach((p, i) => i ? ctx.lineTo(p.x, p.y + 1) : ctx.moveTo(p.x, p.y + 1)); ctx.stroke();
    }
    ctx.globalCompositeOperation = "lighter";
    if (this.cinematic) this.glow(ctx, point, projectile.style === "ballistic" ? 15 : 8, color, .7);
    const gradient = ctx.createLinearGradient(last.x - (point.x - last.x) * 5, last.y - (point.y - last.y) * 5, point.x, point.y);
    gradient.addColorStop(0, `rgba(${color},0)`); gradient.addColorStop(0.6, `rgba(${color},.65)`); gradient.addColorStop(1, "#fff6db");
    ctx.strokeStyle = gradient; ctx.lineWidth = projectile.style === "ballistic" ? 4 : projectile.style === "tracer" ? 1.7 : 2.5;
    ctx.beginPath(); projectile.trail.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    if (projectile.style === "tracer") { const dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy); ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.lineTo(point.x - dx / Math.max(1, d) * 13, point.y - dy / Math.max(1, d) * 13); ctx.stroke(); }
    ctx.translate(point.x, point.y); ctx.rotate(Math.atan2(point.y - last.y, point.x - last.x));
    if (projectile.style !== "tracer") {
      const sprite = this.sprites[projectile.style === "shell" ? "shell-projectile" : "missile-projectile"];
      const size = projectile.style === "ballistic" ? 20 : 15;
      if (sprite?.complete && sprite.naturalWidth) { ctx.save(); ctx.rotate(Math.PI / 2); ctx.drawImage(sprite, -size * .22, -size * .5, size * .44, size); ctx.restore(); }
      else { ctx.fillStyle = "#fff5dc"; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-3, -2.1); ctx.lineTo(-5, 0); ctx.lineTo(-3, 2.1); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = `rgba(${color},.8)`; ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(-12 - Math.sin(this.time * 70) * 3, 0); ctx.lineTo(-4, 2); ctx.fill();
    }
    ctx.restore();
    if (t >= 1) {
      const scale = projectile.style === "ballistic" ? 1.7 : projectile.style === "missile" ? 1.05 : projectile.style === "shell" ? 0.9 : projectile.style === "torpedo" ? 0.7 : 0.28;
      this.burst(projectile.to, scale * projectile.scale, projectile.style === "torpedo" ? "water" : "fire");
      if (scale > 1.3) this.onSound("explosion"); else if (scale > 0.7) this.onSound("impact");
      return false;
    }
    return true;
  }

  render(ctx: CanvasRenderingContext2D, dt: number) {
    this.time += dt;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    const shake = this.reducedMotion ? 0 : this.shake;
    ctx.translate(Math.sin(this.time * 83) * shake, Math.cos(this.time * 67) * shake * 0.6);
    this.shake *= Math.exp(-dt * 7);
    for (const unit of this.units.values()) {
      const from = this.point(unit), to = this.point(unit.target), dx = to.x - from.x, dy = to.y - from.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.3) {
        const targetAngle = Math.atan2(dy, dx), difference = Math.atan2(Math.sin(targetAngle - unit.angle), Math.cos(targetAngle - unit.angle));
        unit.angle += difference * Math.min(1, dt * 10);
      }
      const lerp = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 16);
      const next = { x: unit.x + (unit.target.x - unit.x) * lerp, y: unit.y + (unit.target.y - unit.y) * lerp };
      if (unit.kind !== "air" && !isWater(next, this.layout)) { unit.x = unit.target.x; unit.y = unit.target.y; }
      else { unit.x = next.x; unit.y = next.y; }
      unit.hit = Math.max(0, unit.hit - dt);
      this.vessel(ctx, unit);
      if (unit.burn > 0 && Math.random() < dt * 9 && this.cinematic) this.particles.push({ x: unit.x, y: unit.y, vx: random(-5, 5), vy: -15, age: 0, life: 0.8, size: 5, color: "52,49,39", type: "smoke" });
    }
    this.wrecks = this.wrecks.filter(wreck => {
      wreck.age += dt; const age = wreck.age - wreck.delay;
      if (age < 0) { this.vessel(ctx, wreck, 1, 1, false); return true; }
      if (age > 1.4) return false;
      wreck.angle += dt * 0.12; this.vessel(ctx, wreck, 0.65 * (1 - age / 1.4), 1 - age * 0.3, false); return true;
    });
    this.projectiles = this.projectiles.filter(projectile => this.drawProjectile(ctx, projectile, dt));
    this.fireballs = this.fireballs.filter(fireball => {
      fireball.age += dt; if (fireball.age < 0) return true;
      const t = fireball.age / fireball.life; if (t >= 1) return false;
      const point = this.point(fireball), size = fireball.size * (0.25 + easeOut(Math.min(1, t * 2)) * 0.85);
      ctx.save(); ctx.translate(point.x, point.y - t * fireball.size * 0.25);
      ctx.globalAlpha = Math.pow(1 - t, 0.75);
      const texture = this.texture(GOLD, "fire");
      ctx.drawImage(texture, -size, -size, size * 2, size * 2);
      for (let i = 0; i < (this.cinematic ? 4 : 2); i++) {
        const angle = fireball.seed + i * 1.6;
        ctx.globalAlpha = Math.pow(1 - t, 0.8) * 0.7;
        const radius = size * (0.55 + Math.sin(i + t * 4) * .06);
        ctx.drawImage(texture, Math.cos(angle) * size * .35 - radius, Math.sin(angle) * size * .3 - t * 12 - radius, radius * 2, radius * 2);
      }
      ctx.restore(); return true;
    });
    this.rings = this.rings.filter(ring => {
      ring.age += dt; if (ring.age < 0) return true; const t = ring.age / ring.life; if (t >= 1) return false;
      const p = this.point(ring), radius = ring.radius * easeOut(t);
      ctx.save(); ctx.strokeStyle = `rgba(${ring.color},${(1 - t) * 0.65})`; ctx.lineWidth = ring.width * (1 - t * 0.6);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(0.1, radius), Math.max(0.1, radius * ring.ellipse), 0, 0, Math.PI * 2); ctx.stroke();
      if (ring.color === CYAN && this.cinematic) { ctx.lineWidth = ring.width + 4; ctx.strokeStyle = `rgba(${CYAN},${(1-t)*.06})`; ctx.stroke(); }
      ctx.restore(); return true;
    });
    const particleLimit = this.cinematic ? (this.width < 700 ? 320 : 480) : 140;
    if (this.particles.length > particleLimit) this.particles.splice(0, this.particles.length - particleLimit);
    this.particles = this.particles.filter(particle => {
      particle.age += dt; if (particle.age < 0) return true; if (particle.age >= particle.life) return false;
      particle.x += particle.vx * dt / this.width * 100; particle.y += particle.vy * dt / this.height * 100;
      particle.vx *= Math.exp(-dt * (particle.type === "smoke" ? 0.7 : 2));
      if (particle.type !== "smoke") particle.vy += (particle.type === "debris" ? 140 : 70) * dt;
      const p = this.point(particle), t = particle.age / particle.life;
      ctx.save(); ctx.globalAlpha = (1 - t) * (particle.type === "smoke" ? 0.4 : 0.9);
      if (particle.type === "smoke") {
        const radius = particle.size * (.5 + t);
        ctx.drawImage(this.texture(particle.color, "smoke"), p.x-radius, p.y-radius, radius*2, radius*2);
      } else if (particle.type === "debris") {
        ctx.translate(p.x, p.y); ctx.rotate(particle.age * 8 + particle.vx);
        ctx.fillStyle = `rgb(${particle.color})`; ctx.strokeStyle = "#c6ae7f"; ctx.lineWidth = 0.5;
        ctx.fillRect(-particle.size, -particle.size * 0.5, particle.size * 2, particle.size); ctx.strokeRect(-particle.size, -particle.size * 0.5, particle.size * 2, particle.size);
      } else {
        ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = `rgb(${particle.color})`;
        if (this.cinematic && particle.type === "spark") this.glow(ctx, p, particle.size * 3.5, particle.color, .5);
        if (particle.type === "water") { ctx.beginPath(); ctx.ellipse(p.x, p.y, particle.size * 0.6, particle.size * 1.8, 0, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(particle.vy, particle.vx)); ctx.fillRect(-particle.size * 2, -particle.size * 0.4, particle.size * 3, particle.size * 0.8); }
      }
      ctx.restore(); return true;
    });
    this.flashes = this.flashes.filter(flash => {
      flash.age += dt; if (flash.age < 0) return true; const t = flash.age / flash.life; if (t >= 1) return false;
      const p = this.point(flash), radius = Math.max(1, flash.size * (0.5 + t));
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      this.glow(ctx, p, radius, flash.color, 1 - t); ctx.restore(); return true;
    });
    this.texts = this.texts.filter(text => {
      text.age += dt; if (text.age > text.life) return false; const p = this.point(text);
      const pop = text.age < 0.18 ? 1 + (0.18 - text.age) * 2.2 : 1;
      const style = text.kind === "crit"
        ? { font: `800 ${Math.round(16 * pop)}px "Vazirmatn", sans-serif`, fill: "#ffd76a", stroke: "#5b2c12", rise: 30 }
        : text.kind === "combo"
        ? { font: `800 ${Math.round(15 * pop)}px "Vazirmatn", sans-serif`, fill: "#ff9d5c", stroke: "#3d1c0c", rise: 34 }
        : text.kind === "event"
        ? { font: '800 13px "Vazirmatn", sans-serif', fill: "#aef3ff", stroke: "#0d2b33", rise: 22 }
        : text.kind === "damage"
        ? { font: '700 11px "Vazirmatn", sans-serif', fill: "#ffd9d0", stroke: "#3d1a12", rise: 26 }
        : { font: '700 12px "Vazirmatn", sans-serif', fill: "#ffe3a5", stroke: "#173c35", rise: 23 };
      ctx.save(); ctx.globalAlpha = clamp((text.life - text.age) * 2); ctx.textAlign = "center"; ctx.direction = "ltr"; ctx.font = style.font;
      ctx.strokeStyle = style.stroke; ctx.lineWidth = text.kind === "crit" || text.kind === "combo" ? 4 : 3; ctx.lineJoin = "round";
      const y = p.y - 15 - text.age * style.rise;
      ctx.strokeText(text.text, p.x, y); ctx.fillStyle = style.fill;
      ctx.fillText(text.text, p.x, y); ctx.restore(); return true;
    });
    ctx.restore();
    if (this.overdriveGlow > 0.02 && !this.reducedMotion) {
      const g = ctx.createLinearGradient(0, 0, 0, this.height);
      g.addColorStop(0, `rgba(255,150,60,${0.1 * this.overdriveGlow})`);
      g.addColorStop(1, `rgba(255,80,40,${0.16 * this.overdriveGlow})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.width, this.height);
    }
    if (this.globalFlash > 0 && !this.reducedMotion) { ctx.fillStyle = `rgba(255,199,123,${this.globalFlash})`; ctx.fillRect(0, 0, this.width, this.height); this.globalFlash = Math.max(0, this.globalFlash - dt * 0.5); }
  }
}

export default function BattleCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const renderer = new NavalRenderer();
    let frame = 0, previousTime = performance.now(), previousGame: GameState | null = null;
    let cameraMoving = false;
    const world = canvas.parentElement;
    let ratio = Math.min(window.devicePixelRatio || 1, 1.75);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      renderer.width = Math.max(1, rect.width); renderer.height = Math.max(1, rect.height);
      ratio = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    const render = (now: number) => {
      const dt = Math.min(0.045, Math.max(0.001, (now - previousTime) / 1000)); previousTime = now;
      const current = propsRef.current;
      renderer.cinematic = current.cinematic; renderer.reducedMotion = current.reducedMotion;
      renderer.paused = current.paused; renderer.onSound = current.playSound; renderer.layout = current.game.layout;
      if (previousGame !== current.game) { renderer.ingest(current.game); previousGame = current.game; }
      if (!document.hidden) renderer.render(ctx, dt);
      if (world && renderer.shake > 0.05 && current.cinematic && !current.reducedMotion) {
        const amount = Math.min(3.5, renderer.shake);
        world.style.setProperty("--camera-x", `${Math.sin(now * 0.083) * amount}px`);
        world.style.setProperty("--camera-y", `${Math.cos(now * 0.067) * amount * 0.6}px`);
        cameraMoving = true;
      } else if (world && cameraMoving) {
        world.style.setProperty("--camera-x", "0px"); world.style.setProperty("--camera-y", "0px"); cameraMoving = false;
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); world?.style.removeProperty("--camera-x"); world?.style.removeProperty("--camera-y"); };
  }, []);

  return <canvas ref={canvasRef} className="battle-canvas" data-enemies={props.game.enemies.length} data-overdrive={props.game.overdrive > 0} role="img" aria-label={`نمای زنده نبرد؛ ${props.game.enemies.length} دشمن در آبراه`} />;
}
