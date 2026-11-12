// ============================================================
// rtsCamera.ts — دوربین استراتژیک موبایل‌محور
// • پن با «چنگ زدن» دقیق زمین + اینرسی
// • پینچ‌زوم به سمت نقطه میانی + چرخش دو انگشتی
// • شیب خودکار وابسته به زوم (از بالا در دور، سینمایی در نزدیک)
// ============================================================
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './world';

interface Ptr { x: number; y: number; }
interface Tween { t: number; dur: number; fx: number; fz: number; fd: number; fy: number; tx: number; tz: number; td: number; ty: number; }

export class RTSCamera {
  target = new THREE.Vector3(0, 0, 6);
  dist = 420;
  yaw = 0;
  minDist = 16;
  maxDist = 1300;
  bounds = { x0: -440, x1: 170, z0: -215, z1: 200 };
  farBox = { x0: -220, x1: 60, z0: -70, z1: 90 };
  onTap: ((x: number, y: number) => void) | null = null;
  onDoubleTap: ((x: number, y: number) => void) | null = null;
  onInteract: (() => void) | null = null;

  private cam: THREE.PerspectiveCamera;
  private el: HTMLElement;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ndc = new THREE.Vector2();
  private pointers = new Map<number, Ptr>();
  private grab: THREE.Vector3 | null = null;
  private pinch: { d: number; a: number; grab: THREE.Vector3 | null } | null = null;
  private vel = new THREE.Vector2();
  private lastMove = 0;
  private goalDist: number | null = null;
  private zoomAnchor: Ptr | null = null;
  private tween: Tween | null = null;
  private down: { x: number; y: number; t: number; multi: boolean } | null = null;
  private lastTap = { x: 0, y: 0, t: 0 };
  private rotating: Ptr | null = null;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private handlers: [string, EventListener][] = [];

  constructor(cam: THREE.PerspectiveCamera, el: HTMLElement) {
    this.cam = cam; this.el = el;
    el.style.touchAction = 'none';
    const on = (n: string, f: EventListener, o?: AddEventListenerOptions) => { el.addEventListener(n, f, o); this.handlers.push([n, f]); };
    on('pointerdown', (e) => this.pDown(e as PointerEvent));
    on('pointermove', (e) => this.pMove(e as PointerEvent));
    on('pointerup', (e) => this.pUp(e as PointerEvent));
    on('pointercancel', (e) => this.pUp(e as PointerEvent));
    on('wheel', (e) => this.wheel(e as WheelEvent), { passive: false });
    on('contextmenu', (e) => e.preventDefault());
    this.apply();
  }

  dispose() { this.handlers.forEach(([n, f]) => this.el.removeEventListener(n, f)); }

  // زاویه ارتفاع دوربین بر اساس زوم (رادیان)
  elevation(d = this.dist): number {
    const f = smoothstep(Math.log(this.minDist), Math.log(this.maxDist), Math.log(d));
    return lerp(0.58, 1.2, Math.pow(f, 0.8));
  }

  apply() {
    const el = this.elevation();
    const c = Math.cos(el) * this.dist;
    this.cam.position.set(this.target.x + Math.sin(this.yaw) * c, this.target.y + Math.sin(el) * this.dist, this.target.z + Math.cos(this.yaw) * c);
    this.cam.lookAt(this.target);
    this.cam.updateMatrixWorld();
  }

  groundAt(cx: number, cy: number, out: THREE.Vector3): boolean {
    const r = this.el.getBoundingClientRect();
    this.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.cam);
    return this.ray.ray.intersectPlane(this.plane, out) !== null;
  }

  private clampAll() {
    this.dist = clamp(this.dist, this.minDist, this.maxDist);
    // در زوم دور محدوده تنگ‌تر تا لبه‌ها دیده نشوند
    const k = smoothstep(350, this.maxDist, this.dist);
    const bx0 = lerp(this.bounds.x0, this.farBox.x0, k), bx1 = lerp(this.bounds.x1, this.farBox.x1, k);
    const bz0 = lerp(this.bounds.z0, this.farBox.z0, k), bz1 = lerp(this.bounds.z1, this.farBox.z1, k);
    this.target.x = clamp(this.target.x, bx0, bx1);
    this.target.z = clamp(this.target.z, bz0, bz1);
  }

  private mid(): { x: number; y: number; d: number; a: number } {
    const [p1, p2] = [...this.pointers.values()];
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, d: Math.hypot(p2.x - p1.x, p2.y - p1.y), a: Math.atan2(p2.y - p1.y, p2.x - p1.x) };
  }

  private pDown(e: PointerEvent) {
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.tween = null; this.goalDist = null; this.vel.set(0, 0);
    this.onInteract?.();
    if (e.button === 2 || e.button === 1) { this.rotating = { x: e.clientX, y: e.clientY }; return; }
    if (this.pointers.size === 1) {
      this.grab = this.groundAt(e.clientX, e.clientY, new THREE.Vector3()) ? this.ray.ray.intersectPlane(this.plane, new THREE.Vector3()) : null;
      this.down = { x: e.clientX, y: e.clientY, t: performance.now(), multi: false };
    } else if (this.pointers.size === 2) {
      const m = this.mid();
      const g = new THREE.Vector3();
      this.pinch = { d: m.d, a: m.a, grab: this.groundAt(m.x, m.y, g) ? g : null };
      this.grab = null;
      if (this.down) this.down.multi = true;
    }
  }

  private pMove(e: PointerEvent) {
    if (this.rotating) {
      const dx = e.clientX - this.rotating.x;
      this.yaw -= dx * 0.006;
      this.rotating = { x: e.clientX, y: e.clientY };
      this.apply();
      return;
    }
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1 && this.grab) {
      if (!this.groundAt(e.clientX, e.clientY, this.tmpA)) return;
      const dx = this.grab.x - this.tmpA.x, dz = this.grab.z - this.tmpA.z;
      this.target.x += dx; this.target.z += dz;
      this.clampAll(); this.apply();
      const now = performance.now();
      const dt = Math.max(1, now - this.lastMove) / 1000;
      this.lastMove = now;
      this.vel.lerp(new THREE.Vector2(dx / dt, dz / dt), 0.35);
    } else if (this.pointers.size === 2 && this.pinch) {
      const m = this.mid();
      if (m.d > 10 && this.pinch.d > 10) this.dist *= this.pinch.d / m.d;
      let da = m.a - this.pinch.a;
      if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
      this.yaw += da;
      this.pinch.d = m.d; this.pinch.a = m.a;
      this.clampAll(); this.apply();
      if (this.pinch.grab && this.groundAt(m.x, m.y, this.tmpA)) {
        this.target.x += this.pinch.grab.x - this.tmpA.x;
        this.target.z += this.pinch.grab.z - this.tmpA.z;
        this.clampAll(); this.apply();
      }
    }
  }

  private pUp(e: PointerEvent) {
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
    if (this.rotating) { this.rotating = null; this.pointers.delete(e.pointerId); return; }
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 1) {
      const [p] = [...this.pointers.values()];
      const g = new THREE.Vector3();
      this.grab = this.groundAt(p.x, p.y, g) ? g : null;
      this.pinch = null; this.vel.set(0, 0);
      return;
    }
    if (this.pointers.size === 0) {
      this.grab = null; this.pinch = null;
      if (performance.now() - this.lastMove > 90) this.vel.set(0, 0);
      if (this.down && !this.down.multi) {
        const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
        const dt = performance.now() - this.down.t;
        if (moved < 9 && dt < 450) {
          this.vel.set(0, 0);
          const now = performance.now();
          if (now - this.lastTap.t < 320 && Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) < 40) {
            this.onDoubleTap?.(e.clientX, e.clientY);
            this.lastTap.t = 0;
          } else {
            this.onTap?.(e.clientX, e.clientY);
            this.lastTap = { x: e.clientX, y: e.clientY, t: now };
          }
        }
      }
      this.down = null;
    }
  }

  private wheel(e: WheelEvent) {
    e.preventDefault();
    this.tween = null; this.onInteract?.();
    const base = this.goalDist ?? this.dist;
    const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    this.goalDist = clamp(base * Math.exp(dy * 0.0016), this.minDist, this.maxDist);
    this.zoomAnchor = { x: e.clientX, y: e.clientY };
  }

  zoomAt(factor: number, cx?: number, cy?: number) {
    this.tween = null;
    const r = this.el.getBoundingClientRect();
    this.goalDist = clamp((this.goalDist ?? this.dist) * factor, this.minDist, this.maxDist);
    this.zoomAnchor = { x: cx ?? r.left + r.width / 2, y: cy ?? r.top + r.height / 2 };
  }

  flyTo(x: number, z: number, dist: number, dur = 1.5, yaw?: number) {
    this.goalDist = null; this.vel.set(0, 0);
    let ty = yaw ?? this.yaw;
    while (ty - this.yaw > Math.PI) ty -= Math.PI * 2;
    while (ty - this.yaw < -Math.PI) ty += Math.PI * 2;
    this.tween = { t: 0, dur, fx: this.target.x, fz: this.target.z, fd: this.dist, fy: this.yaw, tx: x, tz: z, td: clamp(dist, this.minDist, this.maxDist), ty };
  }

  isBusy() { return this.pointers.size > 0 || this.tween !== null; }

  update(dt: number) {
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt;
      const k = clamp(tw.t / tw.dur, 0, 1);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      // قوس زوم: کمی دور شدن در میانه پرواز طولانی
      const travel = Math.hypot(tw.tx - tw.fx, tw.tz - tw.fz);
      const hop = Math.sin(k * Math.PI) * Math.min(travel * 0.7, 420) * (travel > 60 ? 1 : 0);
      this.target.x = lerp(tw.fx, tw.tx, e);
      this.target.z = lerp(tw.fz, tw.tz, e);
      this.dist = Math.exp(lerp(Math.log(tw.fd), Math.log(tw.td), e)) + hop;
      this.yaw = lerp(tw.fy, tw.ty, e);
      if (k >= 1) this.tween = null;
      this.clampAll(); this.apply();
      return;
    }
    if (this.goalDist !== null) {
      const before = this.zoomAnchor && this.groundAt(this.zoomAnchor.x, this.zoomAnchor.y, this.tmpA) ? this.tmpA.clone() : null;
      const nd = lerp(this.dist, this.goalDist, 1 - Math.exp(-dt * 11));
      this.dist = nd;
      this.clampAll(); this.apply();
      if (before && this.zoomAnchor && this.groundAt(this.zoomAnchor.x, this.zoomAnchor.y, this.tmpB)) {
        this.target.x += before.x - this.tmpB.x;
        this.target.z += before.z - this.tmpB.z;
      }
      if (Math.abs(this.dist - this.goalDist) < 0.05) this.goalDist = null;
    }
    if (this.pointers.size === 0 && this.vel.lengthSq() > 0.01) {
      this.target.x += this.vel.x * dt; this.target.z += this.vel.y * dt;
      this.vel.multiplyScalar(Math.exp(-dt * 4.5));
    }
    this.clampAll(); this.apply();
  }
}
