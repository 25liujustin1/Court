// Plays several games with random clicks and checks invariants after each one.
// GAMES=20 npm test  runs more games.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const GAMES = +process.env.GAMES || 5;
const MAX_TURNS = 400;

async function playOne(browser, g) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForTimeout(200);

  const modalOpen = () => page.evaluate(() => !document.querySelector('#modal').hidden);
  async function drainModals(maxSteps = 30) {
    for (let i = 0; i < maxSteps; i++) {
      if (!(await modalOpen())) return;
      const clicked = await page.evaluate(() => {
        const ct = document.querySelector('#ct'); if (ct && !ct.value) ct.value = 'No naming for 2 rounds';
        const gs = document.querySelector('#tg-souls'); if (gs && gs.value === '0') gs.value = '1';
        document.querySelectorAll('#modal input[data-idx], #modal input[data-tidx]').forEach(c => { if (Math.random() < 0.3) c.checked = true; });
        const ks = [...document.querySelectorAll('#modal input[data-k]')];
        if (ks.length) { const m = (document.querySelector('#modal h2').textContent.match(/Keep (\d+)/) || [])[1]; ks.forEach((k, i) => k.checked = i < +m); }
        const bs = [...document.querySelectorAll('#modal button:not(:disabled)')];
        if (!bs.length) return 'stuck';
        const err = document.querySelector('#modal .err');
        if (err && !err.hidden) { const c = bs.find(b => /Cancel|Decline/.test(b.textContent)); if (c) { c.click(); return true; } }
        const nonCancel = bs.filter(b => !/Cancel|Keep playing/.test(b.textContent));
        const pool = nonCancel.length ? nonCancel : bs;
        pool[Math.floor(Math.random() * pool.length)].click();
        return true;
      });
      if (clicked === 'stuck') { errors.push('modal with no enabled buttons: ' + await page.evaluate(() => document.querySelector('#modal h2').textContent)); return; }
      if (!clicked) return;
      await page.waitForTimeout(10);
    }
  }
  async function act(name) {
    const sel = `[data-act="${name}"]:not(:disabled)`;
    if (await page.$(sel)) { await page.click(sel); await page.waitForTimeout(10); await drainModals(); return true; }
    return false;
  }
  const phase = () => page.evaluate(() => S && S.phase);

  await page.selectOption('#np', String(3 + (g % 4)));
  await act('setupStart');
  const n = await page.evaluate(() => S.players.length);
  for (let i = 0; i < n; i++) { await act('revealPick'); await act('randomPick'); await act('lockPick'); }

  const opts = ['buyToken', 'buyEvent', 'buyEvent', 'buyToken', 'name', 'earl', 'archQ', 'princeBuy', 'consumeSlave', 'killMarquis', 'playSoul', 'playName', 'theft2', 'theft4', 'playContract', 'trade', 'trade', 'draw2'];
  let turns = 0;
  for (; turns < MAX_TURNS && !errors.length; turns++) {
    if (await phase() === 'over') break;
    await act('showTurn');
    for (let k = 0; k < 6; k++) {
      const a = opts[Math.floor(Math.random() * opts.length)];
      if (a === 'name' && Math.random() < 0.6) continue;
      await act(a);
      if (await phase() === 'over') break;
      if (await page.evaluate(() => S.view) !== 'turn') break;
    }
    if (Math.random() < 0.08) await act('interrupt');
    if (Math.random() < 0.15 && await act('pactsTab')) {   // open the Pacts tab, cast a few random votes, go back
      for (let v = 0; v < 3; v++) {
        const bs = await page.$$('[data-act="contractVote"]:not(:disabled), [data-act="contractVerdict"]:not(:disabled)');
        if (!bs.length) break;
        await bs[Math.floor(Math.random() * bs.length)].click(); await page.waitForTimeout(10); await drainModals();
        if (await phase() === 'over') break;
      }
      if (await phase() !== 'over') await act('pactsTab');
    }
    if (await phase() === 'over') break;
    if (await page.evaluate(() => S.view) === 'turn') await act('endTurn');
  }

  const r = await page.evaluate(() => {
    const all = [...S.bag, ...S.players.flatMap(p => p.tokens)];
    const byOwner = {}; all.forEach(t => byOwner[t.owner] = (byOwner[t.owner] || 0) + 1);
    // walk the log oldest-first: token purchases in even rounds are only legal after the bag first emptied
    // The page keeps only the last 300 log lines. If the bag emptied but that line has scrolled out of the log,
    // token rounds were already over before the oldest line we can still see.
    let lifted = S.capLifted && !S.log.some(l => /empty for the first time/.test(l.t)), offRound = 0; const offLines = [];
    for (const l of [...S.log].reverse()) {
      if (/empty for the first time/.test(l.t)) lifted = true;
      if (!lifted && l.r % 2 === 0 && /bought a name token\.|paid \d+ souls, drew|played Scrying/.test(l.t)) { offRound++; offLines.push(`R${l.r}: ${l.t}`); }
    }
    return {
      phase: S.phase, round: S.round, winner: S.winner, n: S.players.length,
      // a proposed Pact holds its card until it is approved or rejected
      cards: S.deck.length + S.discard.length + S.players.reduce((a, p) => a + p.events.length, 0) + S.contracts.filter(c => c.status === 'pending').length,
      deckSize: Object.values(DECK_COUNTS).reduce((a, b) => a + b, 0),
      negSouls: S.players.filter(p => p.souls < 0).map(p => p.name),
      byOwner, offRound, offLines, nearby: (() => { const L = [...S.log].reverse(); const i = L.findIndex(l => !/x/.test('') && l.r % 2 === 0 && /bought a name token\.|paid \d+ souls, drew|played Scrying/.test(l.t)); return i < 0 ? [] : L.slice(Math.max(0, i - 8), i + 2).map(l => `R${l.r}: ${l.t}`); })(),
      players: S.players.map(p => ({ id: p.id, status: p.status, master: p.master, masterStatus: p.master == null ? null : S.players[p.master].status })),
      free: S.players.filter(p => p.status === 'alive').map(p => p.id),
    };
  });
  await page.screenshot({ path: path.resolve(__dirname, 'last-game.png') });
  await ctx.close();

  const tag = `game ${g + 1} (${r.n}p)`;
  assert.deepStrictEqual(errors, [], `${tag}: page errors`);
  assert.strictEqual(r.cards, r.deckSize, `${tag}: event cards not conserved`);
  assert.deepStrictEqual(r.negSouls, [], `${tag}: negative souls`);
  assert.strictEqual(r.offRound, 0, [`${tag}: name tokens bought in an even round before the bag emptied:`, ...r.offLines, 'context:', ...r.nearby].join('\n    '));
  for (const p of r.players) {
    const held = r.byOwner[p.id] || 0;
    assert.strictEqual(held, p.status === 'dead' ? 0 : 4, `${tag}: player ${p.id} (${p.status}) has ${held} tokens in play`);
    if (p.status === 'slave') assert.ok(p.masterStatus && p.masterStatus !== 'dead', `${tag}: slave ${p.id} has a dead or missing master`);
    else assert.strictEqual(p.master, null, `${tag}: non-slave ${p.id} has a master`);
  }
  if (r.phase === 'over') assert.deepStrictEqual(r.free, [r.winner], `${tag}: winner isn't the only free player`);
  else assert.ok(r.free.length > 1, `${tag}: game not over but ${r.free.length} free players`);
  console.log(`ok  ${tag}: ${r.phase === 'over' ? `won by player ${r.winner} in round ${r.round}` : `unfinished after ${turns} turns (round ${r.round})`}`);
}

(async () => {
  const browser = await chromium.launch();
  try { for (let g = 0; g < GAMES; g++) await playOne(browser, g); }
  catch (e) { console.error('FAIL', e.message); process.exitCode = 1; }
  finally { await browser.close(); }
})();
