/** Reproducible game-asset export from the authored building pack. */
import { Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import * as THREE from 'three';
import BuildingModel from './three/buildings';
import { BUILDINGS, type BuildingKind } from './data/buildings';
import { BattleCtx, createBattle } from './three/battle';
const battle = createBattle();
function Asset({kind,tier,onReady}:{kind:BuildingKind;tier:number;onReady:(g:THREE.Group)=>void}) {
 const root=useRef<THREE.Group>(null);
 const spec=BUILDINGS.find(b=>b.kind===kind)!;
 useEffect(()=>{if(root.current)onReady(root.current);},[kind,tier]);
 return <group ref={root}><BuildingModel kind={kind} tier={tier} colors={{base:spec.baseColor,accent:spec.accentColor,glow:spec.glowColor}} gi={spec.tiers[tier-1].glowIntensity} terrainBase={false}/></group>;
}
function ExportApp(){
 const [asset,setAsset]=useState<{kind:BuildingKind;tier:number}|null>(null);
 const resolve=useRef<((g:THREE.Group)=>void)|null>(null);
 useEffect(()=>{(window as any).__exportAsset=async(kind:BuildingKind,tier:number)=>{
  const model=await new Promise<THREE.Group>(done=>{resolve.current=done;setAsset({kind,tier});});
  model.updateMatrixWorld(true);
  const bytes=await new GLTFExporter().parseAsync(model,{binary:true,onlyVisible:true}) as ArrayBuffer;
  let binary='';const array=new Uint8Array(bytes);for(let i=0;i<array.length;i+=8192)binary+=String.fromCharCode(...array.subarray(i,i+8192));
  return btoa(binary);
 };},[]);
 return <Canvas frameloop="demand" onCreated={({clock})=>{clock.stop();clock.elapsedTime=0;}} camera={{position:[9,7,9],fov:42}}><ambientLight intensity={1.2}/><directionalLight position={[5,10,5]} intensity={3}/><BattleCtx.Provider value={battle}><Suspense fallback={null}>{asset&&<Asset key={`${asset.kind}-${asset.tier}`} {...asset} onReady={g=>resolve.current?.(g)}/>}</Suspense></BattleCtx.Provider></Canvas>;
}
createRoot(document.getElementById('root')!).render(<ExportApp/>);
