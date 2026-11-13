const { chromium } = require('playwright');
const assert = require('assert');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + require('path').resolve(__dirname, '../index.html'));
  // Build a game directly, then force a slave and run a rebellion that succeeds.
  await page.evaluate(() => {
    newGame(['A', 'B', 'C', 'D']);
    S.players[0].combo = '1112'; S.players[1].combo = '2233'; S.players[2].combo = '1123'; S.players[3].combo = '1111';
    startGame();
    // give B's tokens out: A holds 2, C holds 1, 1 stays in bag
    const bt = S.bag.filter(t => t.owner === 1 && t.dots > 0);   // B's numbered tokens (B's blanks stay in the bag)
    S.bag = S.bag.filter(t => !bt.slice(0, 3).includes(t));
    S.players[0].tokens.push(bt[0], bt[1]); S.players[2].tokens.push(bt[2]);
    S.players[1].status = 'slave'; S.players[1].master = 0;
    window.__before = { A: S.players[0].tokens.filter(t => t.owner === 1).length, C: S.players[2].tokens.filter(t => t.owner === 1).length, bag: S.bag.filter(t => t.owner === 1).length };
    window.__done = runRebellion(S.players[3]);
  });
  // drive modals: choose slave B, guess A's name (Bael 1112), then pick new name Sitri (3333)
  const clickIn = async (sel) => { await page.waitForSelector('#modal:not([hidden]) ' + sel); await page.click('#modal ' + sel); await page.waitForTimeout(30); };
  await clickIn('button[data-i="0"]');            // give Insubordination to slave B
  await clickIn('button[data-v="1112"]');         // B names master A correctly
  await clickIn('button[data-i="0"]');            // "Insubordination succeeded" OK
  await clickIn('button[data-i="0"]');            // pass device to B
  const oldDisabled = await page.$eval('#modal button[data-v="2233"]', b => b.disabled);
  await clickIn('button[data-v="3333"]');         // new name Sitri
  await clickIn('button[data-i="0"]');            // your new name OK
  await page.evaluate(() => window.__done);
  const res = await page.evaluate(() => {
    const own = arr => arr.filter(t => t.owner === 1);
    return {
      before: window.__before,
      after: { A: own(S.players[0].tokens).length, C: own(S.players[2].tokens).length, bag: own(S.bag).length },
      dots: [...own(S.players[0].tokens), ...own(S.players[2].tokens), ...own(S.bag)].filter(t => t.dots > 0).map(t => t.dots).sort().join(''),   // blanks stay blank
      Bcombo: S.players[1].combo, Bstatus: S.players[1].status, Astatus: S.players[0].status, Amaster: S.players[0].master,
    };
  });
  await browser.close();
  try {
    assert.deepStrictEqual(errors, []);
    assert.strictEqual(oldDisabled, true, 'old name should be disabled');
    assert.deepStrictEqual(res.after, res.before, 'token positions changed');
    assert.strictEqual(res.dots, '3333', 'old tokens not re-dotted to the new name');
    assert.strictEqual(res.Bcombo, '3333');
    assert.strictEqual(res.Bstatus, 'alive');
    assert.strictEqual(res.Astatus, 'slave');
    assert.strictEqual(res.Amaster, 1);
    console.log('ok  rebirth');
  } catch (e) { console.error('FAIL rebirth: ' + e.message); process.exitCode = 1; }
})();
