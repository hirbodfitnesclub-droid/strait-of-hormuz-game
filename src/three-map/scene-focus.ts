import * as THREE from "three";
import type { PortScene } from "./regional-waterway";

type Subject = (out: THREE.Vector3) => boolean;
type ScreenBox = { left: number; top: number; right: number; bottom: number };
const unitY = new THREE.Vector3(0, 1, 0);

function uncovered(box: ScreenBox, obstacle: ScreenBox) {
  if (
    obstacle.left >= box.right ||
    obstacle.right <= box.left ||
    obstacle.top >= box.bottom ||
    obstacle.bottom <= box.top
  )
    return box;
  const choices = [
    { ...box, bottom: Math.min(box.bottom, obstacle.top - 5) },
    { ...box, top: Math.max(box.top, obstacle.bottom + 5) },
    { ...box, right: Math.min(box.right, obstacle.left - 5) },
    { ...box, left: Math.max(box.left, obstacle.right + 5) },
  ];
  const area = (b: ScreenBox) =>
    Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
  return choices.reduce((best, current) =>
    area(current) > area(best) ? current : best,
  );
}

/** A camera bookmark belongs to the player's selection, not to the lifetime of a GLB. */
export class SceneFocus {
  key = "";
  private subject: Subject | null = null;
  private radius = 6;
  private bookmark: { point: THREE.Vector3; distance: number } | null = null;
  private center = new THREE.Vector3();
  private off = new THREE.Vector3();
  private right = new THREE.Vector3();
  private up = new THREE.Vector3();
  private ray = new THREE.Vector3();
  private aim = new THREE.Vector3();
  private available = { x: 0, y: 0, width: 1, height: 1 };
  private nextLayout = 0;
  private instant = false;
  private marker: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private down: { x: number; y: number; id: number } | null = null;

  constructor(private map: PortScene) {
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffde89,
        transparent: true,
        opacity: 0.83,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.marker.name = "selected-object-ring";
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    map.scene.add(this.marker);
    const canvas = map.renderer.domElement;
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerEnd);
    canvas.addEventListener("pointercancel", this.pointerEnd);
    canvas.addEventListener("wheel", this.release, { passive: true });
  }
  private pointerDown = (e: PointerEvent) => {
    if (this.down && this.down.id !== e.pointerId) this.release();
    this.down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  private pointerMove = (e: PointerEvent) => {
    if (
      this.down?.id === e.pointerId &&
      Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 6
    )
      this.release();
  };
  private pointerEnd = () => {
    this.down = null;
  };

  track(key: string, radius: number, subject: Subject) {
    if (!this.key)
      this.bookmark = {
        point: this.map.controls.target.clone(),
        distance: this.map.distance(),
      };
    this.key = key;
    this.subject = subject;
    this.radius = radius;
    this.nextLayout = 0;
    this.map.cancelFly();
    this.instant =
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document
        .querySelector(".game-shell")
        ?.classList.contains("reduce-motion") === true;
  }
  release = () => {
    this.key = "";
    this.subject = null;
    this.bookmark = null;
    this.marker.visible = false;
  };
  close(key = this.key) {
    if (!this.key || this.key !== key) return;
    const saved = this.bookmark;
    this.release();
    if (saved)
      this.map.flyTo(
        saved.point.x,
        saved.point.z,
        saved.distance,
        this.instant ? 0.01 : 0.45,
      );
  }
  private measure(now: number) {
    const rect = this.map.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    let box: ScreenBox = {
      left: rect.left + 8,
      right: rect.right - 8,
      top: rect.top + Math.min(66, rect.height * 0.13),
      bottom: rect.bottom - Math.min(112, rect.height * 0.16),
    };
    for (const el of document.querySelectorAll(
      ".workshop-sheet,.workshop-wheel,.world-platform-details,.war-essentials,.targeting-prompt",
    )) {
      if (el.getClientRects().length)
        box = uncovered(box, el.getBoundingClientRect());
    }
    this.available = {
      x: THREE.MathUtils.clamp(
        (((box.left + box.right) / 2 - rect.left) / rect.width) * 2 - 1,
        -0.8,
        0.8,
      ),
      y: THREE.MathUtils.clamp(
        1 - (((box.top + box.bottom) / 2 - rect.top) / rect.height) * 2,
        -0.78,
        0.78,
      ),
      width: Math.max(0.18, (box.right - box.left) / rect.width),
      height: Math.max(0.18, (box.bottom - box.top) / rect.height),
    };
    this.nextLayout = now + 150;
  }
  frame(now: number, dt: number) {
    if (!this.subject || !this.subject(this.center)) {
      this.marker.visible = false;
      return;
    }
    if (now >= this.nextLayout) this.measure(now);
    const { camera, controls } = this.map,
      box = this.available;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance = THREE.MathUtils.clamp(
      this.radius /
        (tan * Math.min(camera.aspect * box.width, box.height) * 0.48),
      25,
      160,
    );
    this.off.subVectors(camera.position, controls.target).normalize();
    this.right.crossVectors(unitY, this.off).normalize();
    this.up.crossVectors(this.off, this.right).normalize();
    // Intersect the off-centre screen ray with the horizontal plane through the subject.
    this.ray
      .copy(this.off)
      .negate()
      .addScaledVector(this.right, box.x * tan * camera.aspect)
      .addScaledVector(this.up, box.y * tan);
    const across = (-this.off.y * distance) / Math.min(-0.03, this.ray.y);
    this.aim
      .copy(this.center)
      .addScaledVector(this.off, -distance)
      .addScaledVector(this.ray, -across);
    const alpha = this.instant
      ? 1
      : 1 - Math.exp(-8 * Math.min(0.3, Math.max(0.001, dt)));
    const nextDistance = THREE.MathUtils.lerp(
      this.map.distance(),
      distance,
      alpha,
    );
    controls.target.lerp(this.aim, alpha);
    camera.position
      .copy(controls.target)
      .addScaledVector(this.off, nextDistance);
    camera.lookAt(controls.target);
    camera.updateMatrixWorld();
    this.marker.position.set(
      this.center.x,
      Math.max(0.55, this.center.y - 0.8),
      this.center.z,
    );
    this.marker.scale.setScalar(this.radius * 0.92);
    this.marker.visible = true;
  }
  dispose() {
    this.release();
    const el = this.map.renderer.domElement;
    el.removeEventListener("pointerdown", this.pointerDown);
    el.removeEventListener("pointermove", this.pointerMove);
    el.removeEventListener("pointerup", this.pointerEnd);
    el.removeEventListener("pointercancel", this.pointerEnd);
    el.removeEventListener("wheel", this.release);
    this.marker.removeFromParent();
    this.marker.geometry.dispose();
    this.marker.material.dispose();
  }
}
