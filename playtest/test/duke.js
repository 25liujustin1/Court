const { chromium } = require('playwright');
const assert = require('assert');
(async () => {
  const b = await chromium.launch(); const page = await b.newPage(); const errs=[];
  page.on('pageerror', e=>errs.push(e.message));
  await page.goto('file://' + require('path').resolve(__dirname, '../index.html'));
  const r = await page.evaluate(() => {
    newGame(['A','B','C','D']);
    S.players[0].combo='1113'; S.players[1].combo='2233'; S.players[2].combo='1123'; S.players[3].combo='1111';
    startGame();
    const duke=S.players[0];
    const without = isArch(duke);
    duke.events.push('Arrogation');
    const withCard = isArch(duke);
    S.current=0; S.view='turn'; render();
    const btn = !!document.querySelector('[data-act="archQ"]');
    return {without, withCard, btn, limit: archLimit()};
  });
  await b.close();
  try {
    assert.deepStrictEqual(errs, []);
    assert.deepStrictEqual(r, { without: false, withCard: true, btn: true, limit: 1 }); // 4 players: half of the 3 others, rounded down
    console.log('ok  duke');
  } catch (e) { console.error('FAIL duke: ' + e.message); process.exitCode = 1; }
})();
