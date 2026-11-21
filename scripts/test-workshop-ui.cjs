// Run against a production export. Set UI_CAPTURE_DIR to keep the real game screenshots.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.AUDIT_CHROMIUM || '/usr/bin/chromium',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    });
    page.setDefaultTimeout(45000);
    const errors = [];
    const problems = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.androidBridge = {postMessage() {}};
      localStorage.setItem('hormuz-preferences-v2', JSON.stringify({
        sound: false, vibration: false, coachDismissed: true,
      }));
    });

    const captureDir = process.env.UI_CAPTURE_DIR;
    if (captureDir) await fs.mkdir(captureDir, { recursive: true });
    async function capture(name) {
      if (captureDir) {
        const width = page.viewportSize().width;
        await page.screenshot({path: path.join(captureDir, width + '-' + name + '.png'), animations: 'disabled'});
      }
    }

    async function inspect(name, dialog) {
      if (dialog) {
        const sheet = page.locator(dialog);
        await sheet.waitFor();
        await sheet.evaluate(async el => {
          const animations = el.getAnimations().filter(a => Number.isFinite(a.effect?.getTiming().iterations));
          await Promise.allSettled(animations.map(a => a.finished));
        });
      }
      const result = await page.evaluate(selector => {
        const problems = [];
        const header = document.querySelector('.app-header');
        const bar = header.querySelector('.essential-resources');
        const modal = selector && document.querySelector(selector);
        const geometry = item => item.getBoundingClientRect();
        const visible = element => element && geometry(element).width > 0 &&
          geometry(element).height > 0 && getComputedStyle(element).visibility === 'visible';
        const outside = rect => rect.left < -1 || rect.right > innerWidth + 1 ||
          rect.top < -1 || rect.bottom > innerHeight + 1;
        const headerRect = geometry(bar);
        if (document.documentElement.scrollWidth > innerWidth + 1) problems.push('page is wider than viewport');
        if (!visible(bar) || outside(headerRect) || headerRect.top > 40) problems.push('resource strip not at top');
        if (!header.innerText.includes('بندر')) problems.push('missing port plaque');
        let last = null;
        for (const label of ['فولاد', 'سوخت', 'نفت']) {
          const button = [...bar.querySelectorAll('button')].find(el => el.getAttribute('aria-label')?.startsWith(label));
          if (!visible(button)) {
            problems.push(label + ' not visible');
            continue;
          }
          const rect = geometry(button);
          if (outside(rect) || !/[۰-۹]/.test(button.innerText)) problems.push(label + ' clipped or missing amount');
          if (last && (last.right > rect.left + 1 || Math.abs(rect.y - last.y) > 4)) {
            problems.push(label + ' overlaps or wraps on resource strip');
          }
          last = rect;
        }
        if (modal) {
          const rect = geometry(modal);
          if (bar.querySelector('button:enabled')) problems.push('background HUD actions are enabled behind modal');
          if (outside(rect)) problems.push('sheet outside viewport');
          if (rect.top < headerRect.bottom - 1 && rect.left < headerRect.right && rect.right > headerRect.left) {
            problems.push('sheet obscures the resource strip');
          }
          const bodies = [modal, ...modal.querySelectorAll('.drawer-body, .tower-sheet-body, .workshop-building-body')];
          if (bodies.some(el => el.scrollWidth > el.clientWidth + 2)) problems.push('sheet has horizontal overflow');
        }
        return problems;
      }, dialog || null);
      const label = page.viewportSize().width + 'px ' + name;
      for (const issue of result) problems.push(label + ' ' + issue);
      await capture(name);
      console.log(label + (result.length ? ' — ' + result.join(', ') : ' OK'));
    }

    const port = page.getByRole('button', {name:'فرماندهی بندر'});
    async function allArtLoaded(selector) {
      await page.waitForFunction(selector => {
        const images = [...document.querySelectorAll(selector)];
        return images.length > 0 && images.every(img => img.complete && img.naturalWidth > 0);
      }, selector);
    }
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3310', {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.__gamesync3d?.perfInfo().calls > 0 &&
      !document.body.innerText.includes('در حال آماده‌سازی تنگه'), null, {timeout: 180000});
    await page.evaluate(() => document.fonts.ready);
    const portraitSizes = [{width:390, height:844}, {width:320, height:640}];
    for (const viewport of process.argv.includes('--battle-only') ? [] : portraitSizes) {
      await page.setViewportSize(viewport);
      await inspect('harbor');
      await page.getByRole('button', {name:/^فولاد /}).click();
      await inspect('economy', '.drawer');
      const reserves = page.getByLabel('موجودی خزانه و مهمات');
      await reserves.waitFor();
      const balances = await reserves.evaluate(el => {
        const state = window.__gamesync3d.state;
        const number = new Intl.NumberFormat('fa-IR');
        return {
          labels: [...el.querySelectorAll('dt')].map(term => term.textContent.trim()),
          values: [...el.querySelectorAll('dd')].map(amount => amount.textContent.trim()),
          expected: ['$' + number.format(Math.floor(state.cash)), number.format(Math.floor(state.ammo))],
        };
      });
      assert.deepEqual(balances.labels, ['خزانه', 'مهمات']);
      assert.deepEqual(balances.values, balances.expected, 'cash and ammunition must show the current game totals');
      await page.getByRole('button', {name:/^مشاهده و ارتقای /}).first().click();
      await allArtLoaded('.building-sheet .building-main-sprite');
      await inspect('building', '.building-sheet');
      await page.keyboard.press('Escape');
      await page.locator('.building-sheet').waitFor({state:'hidden'});

      await port.click();
      await page.locator('.more-menu').getByRole('button', {name:'عملیات', exact:true}).click();
      await inspect('operations', '.drawer');
      assert.equal(await page.locator('.operation-node').count(), 25);
      await page.locator('.preparation-tips button').first().click();
      await inspect('construction-wheel', '.slot-radial');
      await page.locator('.radial-details').click();
      const towerPortrait = '.tower-sheet .tower-workshop-hero .hero-tower-model';
      await allArtLoaded(towerPortrait);
      const portrait = await page.locator(towerPortrait).boundingBox();
      assert.ok(portrait && portrait.width >= 100, 'the tower detail must show its full-sized illustration on a phone');
      await inspect('tower', '.tower-sheet');
      await page.getByRole('button', {name:'بستن منوی برجک'}).click();
      if (viewport.width === 390) {
        await page.setViewportSize({width:844, height:390});
        await inspect('construction-wheel', '.slot-radial');
        const modelsVisible = await page.locator('.radial-kind').evaluateAll(cards => cards.every(card => {
          const model = card.querySelector('.radial-kind-model').getBoundingClientRect();
          const title = card.querySelector('strong').getBoundingClientRect();
          return title.top - model.top >= model.height * 0.6;
        }));
        assert.ok(modelsVisible, 'each tower must remain visible above its nameplate in landscape');
      }
      await page.locator('.radial-close').click();
      await page.locator('.slot-radial').waitFor({state:'hidden'});
      await page.setViewportSize(viewport);

      await port.click();
      await inspect('command', '.more-menu');
      await page.locator('.more-menu button').filter({hasText:'هدیهٔ روزانه'}).click();
      await page.locator('.daily-calendar').waitFor();
      assert.equal(await page.locator('.daily-calendar .daily-day').count(), 7);
      await inspect('daily', '.progression-drawer');
      await page.keyboard.press('Escape');
      await page.locator('.progression-drawer').waitFor({state:'hidden'});
    }
    await page.setViewportSize({width:390, height:844});
    await page.locator('.idle-battle-start').click();
    await page.locator('.news-actions button').filter({hasText:'آغاز نبرد'}).click();
    const pause = page.locator('.main-battle-action:visible');
    const speed = page.locator('.battle-speed:visible');
    async function checkBattleGlyph(file) {
      const glyph = page.locator('.main-battle-action:visible img.harbor-glyph');
      await glyph.waitFor();
      await glyph.evaluate(el => el.decode());
      const source = await glyph.evaluate(el => new URL(el.currentSrc).pathname);
      assert.ok(source.endsWith('/' + file), 'battle control must show ' + file + ', found ' + source);
    }
    await checkBattleGlyph('pause.webp');
    await inspect('battle');
    await pause.click();
    await page.locator('.main-battle-action.is-paused:visible').waitFor();
    const oldSpeed = await speed.getAttribute('aria-label');
    await speed.click();
    assert.notEqual(await speed.getAttribute('aria-label'), oldSpeed, 'speed button must change the game speed');
    for (const viewport of [{width:390, height:844}, {width:320, height:640}, {width:844, height:390}]) {
      await page.setViewportSize(viewport);
      await inspect('pause');
      await checkBattleGlyph('play.webp');
      for (const control of [pause, speed]) {
        const box = await control.boundingBox();
        const bar = await page.locator('.essential-resources').boundingBox();
        if (!box || box.x < 0 || box.x + box.width > viewport.width + 1 ||
          box.y < bar.y + bar.height - 1 || box.y > viewport.height / 2) {
          problems.push(viewport.width + 'px battle control outside its upper strip');
        }
        await control.click({trial:true});
      }
      if (viewport.width > viewport.height) {
        const exit = page.locator('.command-pause .command-exit');
        await exit.waitFor();
        const target = await exit.boundingBox();
        assert.ok(target && target.x >= 0 && target.y >= 0 &&
          target.x + target.width <= viewport.width && target.y + target.height <= viewport.height,
          'native exit control must fit the landscape viewport');
        const previousSpeed = await speed.getAttribute('aria-label');
        await speed.click();
        assert.notEqual(await speed.getAttribute('aria-label'), previousSpeed);
        await exit.click();
        await page.getByRole('alertdialog', {name:'خروج از بازی'}).waitFor();
        await page.getByRole('button', {name:'ادامهٔ بازی'}).click();
        await page.locator('.main-battle-action.is-paused:visible').waitFor();
      }
    }
    await pause.click();
    await page.locator('.main-battle-action.is-paused').waitFor({state:'hidden'});
    assert.deepEqual([...problems, ...errors], []);
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
