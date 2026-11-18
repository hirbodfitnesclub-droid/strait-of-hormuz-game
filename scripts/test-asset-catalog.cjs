const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
let files=0;for(const kind of ['platform','tankfarm','dock','refinery','steel','ammo','power','desal','town','welfare','customs']){
 const hashes=new Set();for(let tier=1;tier<=5;tier++){
  const b=fs.readFileSync(`public/models/buildings/${kind}-T${tier}.glb`);assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(8),b.length);
  const gltf=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());assert.ok(gltf.meshes.length>0);assert.ok(gltf.nodes.length>0);
  // These five low-tier models have no authored moving parts; tanks and
  // houses must stay static. Every other tier has a rotor, crane, flame,
  // traffic, scan or beacon that must survive GLB export.
  const staticOnly=['tankfarm-T1','tankfarm-T2','town-T1','town-T2','welfare-T1'].includes(`${kind}-T${tier}`);
  if(!staticOnly)assert.ok(gltf.nodes.some(n=>n.name?.startsWith('anim:')),`${kind}-T${tier} lost its authored animation pivots during export`);
  hashes.add(crypto.createHash('sha256').update(b).digest('hex'));files++;
 }assert.equal(hashes.size,5,kind+' must have five distinct authored tiers');
}console.log(`PASS ${files} valid GLBs; 11 buildings each have five distinct tiers`);
