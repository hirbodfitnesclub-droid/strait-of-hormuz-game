const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const { load } = require("./load-game.cjs");
const { freshPortGame, gameReducer } = load("src/lib/game.ts");
const { checksum } = require("./test-reopening-apk.cjs");
const [url, directory, apk] = process.argv.slice(2);
assert.ok(url && directory && apk, "Supply the extracted APK URL, evidence directory and original APK");
const report = { scenes: [], errors: [] };

async function assertFrame(page, key, kind, image) {
  const result = await page.waitForFunction(({key,kind}) => {
    const world=window.__gamesync3d, map=window.__map3d;
    const f=world?.focus;
    if (!f || f.key!==key || !f.marker.visible || !map.camera.isPerspectiveCamera) return false;
    const c=map.renderer.domElement.getBoundingClientRect();
    const ndc=f.marker.position.clone().project(map.camera);
    const x=c.left+(1+ndc.x)*c.width/2, y=c.top+(1-ndc.y)*c.height/2;
    const dialog=document.querySelector(".workshop-sheet,.workshop-wheel,.world-platform-details")?.getBoundingClientRect();
    const obscured=dialog && x>=dialog.left && x<=dialog.right && y>=dialog.top && y<=dialog.bottom;
    if (x<c.left+.12*c.width || x>c.right-.12*c.width || y<c.top+.12*c.height || y>c.bottom-.12*c.height || obscured || map.distance()>102) return false;
    let meshes=0;map.scene.traverse(o=>{if(o.isMesh && o.visible)meshes++;});
    return {kind, key, viewport:[innerWidth,innerHeight], x:Math.round(x), y:Math.round(y), distance:+map.distance().toFixed(2),meshes,drawCalls:world.perfInfo().calls};
  }, {key,kind},{timeout:45000});
  const value=await result.jsonValue();
  assert.ok(value.meshes>50 && value.drawCalls>0);
  report.scenes.push(value);
  await page.screenshot({path:path.join(directory,image+".png")});
  console.log("PASS",kind, value.x, value.y, value.distance);
}

async function run(browser, width, battle) {
  const viewport={width,height:width===393?852:740};
  const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  page.setDefaultTimeout(45000);
  page.on("pageerror",e=>report.errors.push(e.message));
  page.on("response",r=>{if(r.status()>=400 && /\.glb(?:[?#]|$)/.test(r.url()))report.errors.push("Model HTTP "+r.status()+" "+r.url());});
  if (battle) {
    let state=freshPortGame();
    state=gameReducer(state,{type:"advance",steps:0,openingElapsed:140,battlePaused:true});
    await page.addInitScript(s=>{
      if(sessionStorage.getItem("scene-test-port"))return;
      s.lastSavedAt=Date.now();
      localStorage.setItem("hormuz-game-v2",JSON.stringify({version:2,state:s}));
      sessionStorage.setItem("scene-test-port","1");
    },state);
  }
  try {
    await page.goto(url,{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>window.__m3d==="ready" && window.__gamesync3d?.perfInfo().calls>0 && !document.body.innerText.includes("در حال آماده‌سازی تنگه"),null,{timeout:120000});
    if (!battle) {
      const pin=page.getByRole("button",{name:"بررسی کشتی عبوری",exact:true});
      await pin.waitFor({timeout:10000});
      await page.screenshot({path:path.join(directory,"01-port.png")});
      const point=await pin.boundingBox();
      assert.ok(point);
      await page.touchscreen.tap(point.x+point.width/2,point.y+point.height/2);
      await assertFrame(page,"merchant-1","merchant","02-merchant");
      await page.waitForFunction(()=>window.__gamesync3d.state.opening.firstTollAt===12);
      const receipt=page.getByRole("complementary",{name:/عوارض عبور/});
      assert.match(await receipt.innerText(),/۱۲ اعتبار بندر به خزانه رسید/);
      await page.screenshot({path:path.join(directory,"03-receipt.png")});
      await page.getByRole("button",{name:"بستن اطلاعات نقشه"}).tap();
      await page.locator(".opening-tank-status").tap();
      await assertFrame(page,"building:tank","tank above its sheet","04-tank");
      await page.locator(".building-sheet .close-control").tap();
      await page.locator(".resource-port").tap();
      await page.locator(".shipping-access").tap();
      await page.getByRole("button",{name:/تمرین داوطلبانه/}).tap();
      await page.waitForFunction(()=>window.__map3d.scene.getObjectByName("convoy-hull")?.isObject3D && window.__gamesync3d.state.regional?.voyage?.time>1,null,{timeout:75000});
      await page.screenshot({path:path.join(directory,"05-pilotage.png")});
      await page.getByRole("button",{name:"مکث گذر"}).tap();
      const time=await page.evaluate(()=>window.__gamesync3d.state.regional.voyage.time);
      await page.waitForTimeout(1100);
      assert.equal(await page.evaluate(()=>window.__gamesync3d.state.regional.voyage.time),time);
      await page.getByRole("button",{name:"پایان تمرین"}).tap();
      await page.getByRole("button",{name:"بازگشت به بندر"}).tap();
    } else {
      await page.locator(".idle-battle-start").tap();
      await assertFrame(page,"attack","wave follows live hull","06-attack");
      const cdp=await context.newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:122,y:320}]});
      for (let x=130;x<=200;x+=10) await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:345}]});
      await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
      await page.waitForFunction(()=>window.__gamesync3d.focus.key==="");
      await page.getByRole("button",{name:"دنبال‌کردن کشتی حمله‌کننده"}).tap();
      await assertFrame(page,"attack","manually reacquire ship","07-reacquire");
    }
  } catch(e) {
    await page.screenshot({path:path.join(directory,"failure-"+width+".png")}).catch(()=>{});
    console.error(await page.locator("body").innerText().catch(()=>""),await page.evaluate(()=>({sec:window.__gamesync3d?.state.opening?.activeSeconds,focus:window.__gamesync3d?.focus?.key,camera:window.__map3d?.controls?.target?.toArray(),pin:document.querySelector('[aria-label="بررسی کشتی عبوری"]')?.outerHTML,loc:window.__gamesync3d?.openingAnchor({kind:"merchant",id:1}),v:window.__gamesync3d?.state.regional?.voyage?.time})).catch(()=>null));
    throw e;
  } finally {await context.close();}
}
(async()=>{
  await fs.mkdir(directory,{recursive:true}); report.apkSha256=await checksum(apk);
  const browser=await chromium.launch({executablePath:process.env.AUDIT_CHROMIUM || "/usr/bin/chromium",args:["--no-sandbox","--enable-unsafe-swiftshader"]});
  try {await run(browser,393,false);await run(browser,360,true);assert.deepEqual(report.errors,[]);}
  finally{await browser.close();await fs.writeFile(path.join(directory,"scene-tests.json"),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
