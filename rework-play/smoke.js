// Smoke test for the rework web version: plays games by clicking random enabled buttons and fails on any error.
// node rework-play/smoke.js [games]
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const games = +(process.argv[2] || 5);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, 'index.html'));
  let finished = 0, clicks = 0;
  for (let gi = 0; gi < games; gi++) {
    await page.evaluate(n => startSolo({ n, speed: 0 }), 3 + (gi % 4));
    // starting mask
    await page.locator('#dlgBody [data-m]').first().click();
    for (let step = 0; step < 4000; step++) {
      const over = await page.evaluate(() => G.over);
      if (over) { finished++; break; }
      const open = await page.evaluate(() => document.querySelector('#dlg').open);
      if (open) {
        const btns = page.locator('#dlgBody button:not([disabled]):visible');
        const n = await btns.count();
        if (!n) { await page.evaluate(() => closeDialog()); continue; }
        await btns.nth(Math.floor(Math.random() * n)).click({ timeout: 2000 }).catch(() => {}); clicks++;
        continue;
      }
      const myTurn = await page.evaluate(() => G.myTurn);
      if (!myTurn) { await page.waitForTimeout(5); continue; }
      const btns = page.locator('#actions button:not([disabled]), #endRow button');
      const n = await btns.count();
      const labels = await btns.allTextContents();
      let i = Math.floor(Math.random() * n);
      if (Math.random() < 0.25 || n === 1) i = labels.findIndex(l => l.startsWith('End turn'));
      await btns.nth(i).click({ timeout: 2000 }).catch(() => {}); clicks++;
    }
    const logErr = await page.evaluate(() => [...document.querySelectorAll('#log div')].map(d => d.textContent).filter(s => s.startsWith('Engine error')));
    errors.push(...logErr);
    const r = await page.evaluate(() => ({ round: G.g.round, over: G.over }));
    console.log(`game ${gi + 1}: round ${r.round}, ${r.over ? 'finished' : 'unfinished'}`);
    await page.evaluate(() => { closeDialog(); showHome(); });
  }
  console.log(`${finished}/${games} finished, ${clicks} clicks, ${errors.length} errors`);
  if (errors.length) { console.log([...new Set(errors)].slice(0, 10).join('\n')); process.exitCode = 1; }
  await browser.close();
})();
