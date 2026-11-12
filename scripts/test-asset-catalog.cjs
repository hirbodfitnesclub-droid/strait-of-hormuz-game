const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
let files=0;for(const kind of ['platform','tankfarm','dock','refinery','steel','ammo','power','desal','town','welfare','customs']){
 const hashes=new Set();for(let tier=1;tier<=5;tier++){
  const b=fs.readFileSync(`public/models/buildings/${kind}-T${tier}.glb`);assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(8),b.length);
  const gltf=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());assert.ok(gltf.meshes.length>0);assert.ok(gltf.nodes.length>0);hashes.add(crypto.createHash('sha256').update(b).digest('hex'));files++;
 }assert.equal(hashes.size,5,kind+' must have five distinct authored tiers');
}console.log(`PASS ${files} valid GLBs; 11 buildings each have five distinct tiers`);
