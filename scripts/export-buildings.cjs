// Start the asset pack Vite server on 3400 before running this exporter.
const {chromium}=require('playwright');const fs=require('node:fs');const path=require('node:path');
(async()=>{const browser=await chromium.launch({executablePath:process.env.AUDIT_CHROMIUM||'/usr/lib/chromium/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});try{const page=await browser.newPage();page.on('pageerror',e=>console.error(e.message));await page.goto('http://127.0.0.1:3400/export.html');await page.waitForFunction(()=>window.__exportAsset);
for(const kind of ['platform','tankfarm','dock','refinery','steel','ammo','power','desal','town','welfare','customs'])for(let tier=1;tier<=5;tier++){
 const bytes=await page.evaluate(async({kind,tier})=>window.__exportAsset(kind,tier),{kind,tier});
 const target=path.join('public/models/buildings',`${kind}-T${tier}.glb`);fs.writeFileSync(target,Buffer.from(bytes,'base64'));console.log(target,fs.statSync(target).size);
}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
