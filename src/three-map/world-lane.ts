import * as THREE from 'three';
import { getLane, sampleLane } from '../lib/navigation';
import { pctTo3d } from './coords';
export function worldLane(kind: 'enemy'|'trade'|'pirate'|'port') {
  const path = getLane('portrait', kind);
  const getPointAt = (u:number) => { const p=sampleLane(path,u);const [x,z]=pctTo3d(p.x,p.y);return new THREE.Vector3(x,0.35,z); };
  return {getPointAt, getTangentAt:(u:number)=>getPointAt(Math.min(1,u+.0001)).sub(getPointAt(Math.max(0,u-.0001))).normalize()};
}
