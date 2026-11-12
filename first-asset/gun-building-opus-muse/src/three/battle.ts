import * as THREE from "three";
import { createContext, useContext } from "react";

export type ShootKind = "tracer" | "shell" | "missile" | "rocket" | "hyper" | "plasma" | "torpedo";

export interface ShootOpts {
  from: THREE.Vector3;
  to: THREE.Vector3;
  kind: ShootKind;
  color: string;
  dur?: number;
  arc?: number;
  dmg?: number;
  air?: boolean;
  size?: number;
  jitter?: number;
}

export interface FxApi {
  shoot: (o: ShootOpts) => void;
  explode: (p: THREE.Vector3, color: string, size: number, water?: boolean) => void;
  rail: (a: THREE.Vector3, b: THREE.Vector3, color: string) => void;
  smoke: (p: THREE.Vector3, size: number, dark?: boolean) => void;
  spark: (p: THREE.Vector3, color: string, count: number) => void;
}

export function createBattle() {
  return {
    sea: new THREE.Vector3(9, 0.7, 0),
    air: new THREE.Vector3(-5, 5, 0),
    seaValid: true,
    airValid: true,
    speed: 1,
    firing: true,
    shake: 0,
    slow: 0,
    stun: 0,
    kills: 0,
    hitSea: (_d: number) => {},
    hitAir: (_d: number) => {},
    fx: {
      shoot: () => {},
      explode: () => {},
      rail: () => {},
      smoke: () => {},
      spark: () => {},
    } as FxApi,
  };
}

export type Battle = ReturnType<typeof createBattle>;
export const BattleCtx = createContext<Battle>(null as unknown as Battle);
export const useBattle = () => useContext(BattleCtx);

/* bus برای توقف رندر بوم‌های پشت مودال */
export const viewerBus = {
  modal: false,
  subs: new Set<() => void>(),
  set(v: boolean) {
    this.modal = v;
    this.subs.forEach((f) => f());
  },
};
