import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdirSync,writeFileSync} from "node:fs";
import path from "node:path";
import {attachWebView,until} from "./harbor-webview.mjs";

const [apk,out]=process.argv.slice(2);
assert.ok(apk && out);
mkdirSync(out,{recursive:true});
const app="ir.hormuz.sovereign.preview";
const adb=(...args)=>execFileSync("adb",args,{timeout:90000,maxBuffer:24000000}).toString().trim();
assert.equal(adb("shell","getprop","ro.kernel.qemu"),"1","Run only on a disposable emulator");
assert.ok(!adb("shell","pm","list","packages",app).includes(app),"Expected a fresh installation");
adb("install","--no-streaming",apk);
adb("shell","settings","put","secure","immersive_mode_confirmations","confirmed");
adb("shell","wm","dismiss-keyguard");
const launch=()=>adb("shell","am","start","-n",app+"/ir.hormuz.sovereign.MainActivity");
const log=[];
let page;
function sample(){
  const s=window.__gamesync3d,m=window.__map3d, o=s?.state?.opening;
  if(!o || !m?.camera?.isPerspectiveCamera || !s.perfInfo().calls || window.__m3d!=="ready")return null;
  const ring=s.focus.marker, p=ring.position.clone().project(m.camera);
  return {active:o.activeSeconds,phase:s.state.phase,wave:s.state.wave,first:o.firstTollAt,manual:o.manualWaveAt,
    events:o.events.map(e=>({kind:e.kind,at:e.at})),stalled:o.stalled,tag:s.focus.key,seed:o.seed,cash:s.state.cash,
    projected:[p.x,p.y],ring:ring.visible,distance:m.distance(),calls:s.perfInfo().calls,
    meshes:m.scene.getObjectByName("gamesync-root")?.children.length,
    renderer:m.renderer.getContext().getParameter(m.renderer.getContext().VERSION)};
}
const state=()=>page.evaluate("("+sample.toString()+")()");
async function ready(predicate,timeout=210000){
  return until(async()=>{const s=await state();return s && predicate(s) && s;},timeout);
}
function capture(name,s){
  log.push({name,...s});writeFileSync(path.join(out,"trace.json"),JSON.stringify(log,null,2));
  writeFileSync(path.join(out,name+".png"),execFileSync("adb",["exec-out","screencap","-p"],{maxBuffer:24000000}));
  console.log(name,s.active,s.tag,s.distance,s.calls);
}
async function tap(selector){
 const point=await until(()=>page.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled||!el.getClientRects().length)return null;
 const b=el.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2;if(!el.contains(document.elementFromPoint(x,y)))return null;const f=devicePixelRatio*(visualViewport?.scale||1);return [Math.round(x*f),Math.round(y*f)];})()`),60000);
 adb("shell","input","tap",...point.map(String));
}
try {
 launch();page=await attachWebView(adb,app);
 capture("01-port",await ready(s=>s.calls>0));
 capture("02-receipt",await ready(s=>s.first===12));
 await tap(".opening-tank-status");
 capture("03-selected-tank",await ready(s=>s.tag==="building:tank" && s.ring && s.distance<102 && Math.abs(s.projected[0])<.85 && Math.abs(s.projected[1])<.85));
 await tap(".building-sheet .close-control");
 capture("04-stopped",await ready(s=>s.stalled));
 const recovered=await ready(s=>s.events.some(e=>e.kind==="natural_recovery"&&e.at===138));
 assert.equal(recovered.manual,null);capture("05-recovered",recovered);
 await tap(".idle-battle-start");
 capture("06-ship",await ready(s=>s.phase==="battle" && s.manual>=120 && s.tag==="attack" && s.ring && s.distance<102 && Math.abs(s.projected[0])<.8 && Math.abs(s.projected[1])<.8));
 adb("shell","input","keyevent","KEYCODE_HOME");
 page.close();page=null;
 adb("shell","am","force-stop",app);launch();page=await attachWebView(adb,app);
 const reloaded=await ready(s=>s.first===12 && s.manual>=120);
 assert.equal(reloaded.seed,log[0].seed);capture("07-relaunch",reloaded);
 console.log("PASS signed 3D preview, Android WebView, timings, player input, camera and relaunch");
} finally {
 if(page)page.close();
 writeFileSync(path.join(out,"device.txt"),[adb("shell","getprop","ro.product.model"),adb("shell","getprop","ro.build.version.sdk"),adb("shell","dumpsys","webviewupdate")].join("\n"));
 writeFileSync(path.join(out,"logcat.txt"),adb("logcat","-d","-t","1800"));
}
