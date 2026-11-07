export declare class HormuzMap {
  constructor(container: HTMLElement, cb?: Record<string, unknown>);
  scene: unknown; camera: unknown; controls: unknown; renderer: unknown;
  dispose(): void;
}
export declare function project(lat: number, lon: number): [number, number];
export declare const App: unknown;
