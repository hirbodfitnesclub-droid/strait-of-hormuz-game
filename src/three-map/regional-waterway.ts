import * as THREE from "three";
import { planFor, type Signal, type Voyage } from "../harbor/signals";
import { pathPoint } from "../harbor/routes";
import type { Operation } from "../harbor/catalog";
import { worldLane } from "./world-lane";
import { makeShip } from "./ships3d";

export interface PortScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: {
    target: THREE.Vector3;
    addEventListener(event: "start", cb: () => void): void;
    removeEventListener(event: "start", cb: () => void): void;
  };
  renderer: { domElement: HTMLCanvasElement };
  cancelFly(): void;
  distance(): number;
  flyTo(x: number, z: number, distance: number, duration?: number): void;
}

const lanes = { A: worldLane("outbound"), B: worldLane("inbound") };
const reaches = [
  [0.602, 0.682],
  [0.553, 0.623],
  [0.44, 0.518],
];
const colors = { a: 0x5be2df, b: 0xffc34f, c: 0xca93ff };
function position(op: Operation, lane: "A" | "B", progress: number) {
  const [a, b] = reaches[op.region - 1] ?? reaches[0];
  const chart = pathPoint(
    op.board,
    lane,
    THREE.MathUtils.clamp(progress, 0, 1),
  );
  // Keep every boat on one of the original water splines. Board geometry
  // changes the progress along that reach and which end receives the convoy.
  const phase = THREE.MathUtils.clamp((chart.y - 13) / 72, 0, 1);
  const offset = (chart.x - 50) * 0.00018;
  const u = THREE.MathUtils.lerp(a, b, phase) + offset;
  return lanes[lane].getPointAt(lane === "A" ? u : 1 - u);
}

/** Regional pilotage shares the port's camera, depth buffer and world units. */
export class RegionalWaterway {
  private root = new THREE.Group();
  private boats = new Map<number, THREE.Group>();
  private hulls = new Map<string, THREE.Group>();
  private waterline = new THREE.Group();
  private geometry: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private rings = new THREE.TorusGeometry(2.6, 0.17, 5, 32);
  private badges = [
    new THREE.SphereGeometry(0.83, 10, 8),
    new THREE.BoxGeometry(1.45, 1.45, 1.45),
    new THREE.OctahedronGeometry(1.12),
  ];
  private paint = Object.fromEntries(
    Object.entries(colors).map(([k, c]) => [
      k,
      new THREE.MeshBasicMaterial({ color: c }),
    ]),
  ) as Record<Signal["pattern"], THREE.MeshBasicMaterial>;
  private lamp = new THREE.Vector3();
  private beam: THREE.Line;
  private priorCamera: { target: THREE.Vector3; distance: number } | null =
    null;
  private voyage: Voyage | null = null;
  private sampledAt = 0;
  private alive = true;
  private screen = new THREE.Vector3();
  constructor(private map: PortScene) {
    this.root.name = "regional-pilotage";
    this.root.add(this.waterline);
    this.geometry.push(this.rings, ...this.badges);
    this.materials.push(...Object.values(this.paint));
    const beamGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const beamMat = new THREE.LineBasicMaterial({
      color: 0xffec9f,
      transparent: true,
      opacity: 0.94,
    });
    this.beam = new THREE.Line(beamGeo, beamMat);
    this.beam.frustumCulled = false;
    this.geometry.push(beamGeo);
    this.materials.push(beamMat);
    this.root.add(this.beam);
    this.map.scene.add(this.root);
    for (const [pattern, kind] of [
      ["a", "tug"],
      ["b", "container"],
      ["c", "bulk"],
    ] as const) {
      void makeShip(kind, { len: 6.1 })
        .then((hull) => {
          if (!this.alive) return;
          this.hulls.set(pattern, hull);
          for (const g of this.boats.values())
            if (
              g.userData.pattern === pattern &&
              !g.getObjectByName("convoy-hull")
            )
              this.addHull(g, hull);
        })
        .catch(() => {
          /* A navigable buoy remains visible during model recovery. */
        });
    }
  }
  private addHull(boat: THREE.Group, model: THREE.Group) {
    const hull = model.clone(true);
    hull.name = "convoy-hull";
    boat.add(hull);
  }
  private clearWaterline() {
    for (const child of [...this.waterline.children]) {
      this.waterline.remove(child);
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
  private course(op: Operation) {
    this.clearWaterline();
    const bounds = new THREE.Box3();
    const channels = op.groups.some((g) => g.channel === "B")
      ? (["A", "B"] as const)
      : (["A"] as const);
    for (const lane of channels) {
      const points = Array.from({ length: 48 }, (_, i) =>
        position(op, lane, i / 47),
      );
      for (const point of points) {
        point.y = 0.65;
        bounds.expandByPoint(point);
      }
      const mat = new THREE.LineDashedMaterial({
        color: lane === "A" ? 0x8ae5de : 0xeec26e,
        dashSize: 1.6,
        gapSize: 1.1,
        transparent: true,
        opacity: 0.85,
      });
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        mat,
      );
      line.computeLineDistances();
      this.waterline.add(line);
    }
    const center = bounds.getCenter(new THREE.Vector3()),
      size = bounds.getSize(new THREE.Vector3());
    const end = position(op, "A", 0.98);
    this.lamp.copy(end);
    this.lamp.y = 6;
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 1.35, 5, 10),
      new THREE.MeshStandardMaterial({ color: 0xf2e5c6 }),
    );
    tower.position.copy(end);
    tower.position.y = 2.6;
    this.waterline.add(tower);
    const light = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.15),
      new THREE.MeshBasicMaterial({ color: 0xffca59 }),
    );
    light.position.copy(this.lamp);
    this.waterline.add(light);
    const aspect = Math.max(0.38, this.map.camera.aspect);
    const span = Math.hypot(size.x, size.z);
    this.map.flyTo(
      center.x,
      center.z,
      Math.max(
        48,
        (span /
          (2 *
            Math.tan(THREE.MathUtils.degToRad(this.map.camera.fov / 2)) *
            Math.min(1, aspect))) *
          1.19,
      ),
      0.65,
    );
  }
  setVoyage(v: Voyage | null, now: number) {
    if (v?.id !== this.voyage?.id || v?.mode !== this.voyage?.mode) {
      for (const b of this.boats.values()) b.removeFromParent();
      this.boats.clear();
      if (v) {
        if (!this.priorCamera)
          this.priorCamera = {
            target: this.map.controls.target.clone(),
            distance: this.map.distance(),
          };
        this.course(planFor(v));
      } else if (this.priorCamera) {
        const { target, distance } = this.priorCamera;
        this.map.flyTo(target.x, target.z, distance, 0.6);
        this.priorCamera = null;
        this.clearWaterline();
      }
    }
    if (v?.time !== this.voyage?.time) this.sampledAt = now;
    this.voyage = v;
    this.root.visible = !!v;
  }
  frame(now: number, paused: boolean) {
    const v = this.voyage;
    if (!v) return;
    const op = planFor(v),
      time =
        v.time +
        (paused
          ? 0
          : Math.min(0.25, Math.max(0, (now - this.sampledAt) / 1000)));
    const ids = new Set<number>();
    for (const s of v.active) {
      ids.add(s.id);
      let boat = this.boats.get(s.id);
      if (!boat) {
        boat = new THREE.Group();
        boat.name = "signal-" + s.id;
        boat.userData.pattern = s.pattern;
        const halo = new THREE.Mesh(this.rings, this.paint[s.pattern]);
        halo.rotation.x = Math.PI / 2;
        halo.position.y = 0.65;
        boat.add(halo);
        const badge = new THREE.Mesh(
          this.badges[s.pattern === "a" ? 0 : s.pattern === "b" ? 1 : 2],
          this.paint[s.pattern],
        );
        badge.position.y = s.marked ? 4.5 : 3;
        badge.scale.setScalar(s.marked ? 1.28 : 1);
        boat.add(badge);
        const model = this.hulls.get(s.pattern);
        if (model) this.addHull(boat, model);
        this.boats.set(s.id, boat);
        this.root.add(boat);
      }
      const u = (time - s.at) / (s.until - s.at),
        pos = position(op, s.lane, u);
      const tangent = position(op, s.lane, Math.min(1, u + 0.002)).sub(
        position(op, s.lane, Math.max(0, u - 0.002)),
      );
      boat.position.copy(pos);
      boat.rotation.y = Math.atan2(-tangent.z, tangent.x);
    }
    for (const [id, b] of this.boats)
      if (!ids.has(id)) {
        b.removeFromParent();
        this.boats.delete(id);
      }
    const flash =
      v.flashTarget && v.time - v.flashAt < 0.5 ? v.flashTarget : null;
    this.beam.visible = !!flash;
    if (flash) {
      const p = position(
        op,
        flash.lane,
        (v.flashAt - flash.at) / (flash.until - flash.at),
      );
      const a = this.beam.geometry.attributes.position;
      a.setXYZ(0, this.lamp.x, this.lamp.y, this.lamp.z);
      a.setXYZ(1, p.x, 2, p.z);
      a.needsUpdate = true;
    }
  }
  hit(clientX: number, clientY: number) {
    const r = this.map.renderer.domElement.getBoundingClientRect();
    let nearest: number | null = null,
      best = 25;
    for (const [id, boat] of this.boats) {
      this.screen.copy(boat.position);
      this.screen.y += 1.3;
      this.screen.project(this.map.camera);
      if (Math.abs(this.screen.z) > 1) continue;
      const dx = r.left + ((this.screen.x + 1) * r.width) / 2 - clientX;
      const dy = r.top + ((1 - this.screen.y) * r.height) / 2 - clientY;
      const distance = Math.hypot(dx, dy);
      if (distance < best) {
        nearest = id;
        best = distance;
      }
    }
    return nearest;
  }
  dispose() {
    this.alive = false;
    this.clearWaterline();
    this.root.removeFromParent();
    this.boats.clear();
    for (const g of this.geometry) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
