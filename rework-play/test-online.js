// Online test for the rework: starts the server, opens 3 browsers (separate profiles), creates a room, joins, starts a
// 4-seat game (one bot) and plays random actions until the game ends. Fails on any page error, and checks every
// message each browser receives for leaked secrets (other players' names, roles, dots, cards; the bag's and deck's contents).
// node rework-play/test-online.js [games]
'use strict';
process.env.PACE = '0'; process.env.AWAY_MS = '3000';
const { chromium } = require('playwright');
const { server } = require('./server');

const GAMES = +(process.argv[2] || 1), PLAYERS = 3, SEATS = 4, STEP_LIMIT = 6000;
const errors = [], leaks = [], seen = { welcome: 0, offer: 0, backAsk: 0, humanBacks: 0, chat: 0, trades: 0, myTurns: 0 };

function checkLeaks(who, m) {
  if (seen[m.t] !== undefined) seen[m.t]++;
  if (m.t === 'update') { seen.humanBacks += m.events.filter(e => e.type === 'duel' && (e.data.backers || []).some(b => b[0] < PLAYERS)).length; seen.trades += m.events.filter(e => e.type === 'deal').length; if (m.myTurn) seen.myTurns++; }
  if (m.t !== 'update' || m.over) return;
  const me = m.seat, bad = s => leaks.push(`${who}: ${s}`);
  for (const q of m.state.P) {
    if (q.id === me) continue;
    if (q.name) bad(`sees P${q.id}'s name`);
    if (q.role !== null && !q.lv3) bad(`sees P${q.id}'s role`);
    if (q.tokens.some(t => t.d)) bad(`sees P${q.id}'s token dots`);
    if (q.cards.some(c => c !== '?')) bad(`sees P${q.id}'s cards`);
    if (Object.keys(q.know || {}).length) bad(`sees P${q.id}'s Archduke answers`);
  }
  if (m.state.bag.some(t => t.d)) bad('sees dots in the bag');
  if (m.state.deck.some(c => c !== '?')) bad('sees the deck');
  for (const e of m.events) if (e.before) for (const q of e.before.P) if (q.id !== me && (q.name || (q.role !== null && !q.lv3) || q.tokens.some(t => t.d))) bad(`snapshot shows P${q.id}'s secrets`);
}

async function player(browser, url, i) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { localStorage.setItem('court-rework-speed', '0'); });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`P${i}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`P${i}: ${m.text()}`); });
  page.on('dialog', d => d.accept());
  page.on('websocket', ws => ws.on('framereceived', f => { try { checkLeaks(`browser ${i}`, JSON.parse(f.payload)); } catch {} }));
  await page.goto(url);
  return page;
}

async function play(page, i, host, stop) {
  let clicks = 0;
  for (let step = 0; step < STEP_LIMIT && !stop.done; step++) {
    const st = await page.evaluate(() => typeof G === 'undefined' ? null : ({ online: !!(G && G.online), over: !!(G && G.over), my: !!(G && G.myTurn && !G.busy), dlg: document.querySelector('#dlg').open, lobby: !!document.querySelector('#lb-leave'), toasts: document.querySelectorAll('.toast').length })).catch(() => null);   // null while the page reloads
    if (!st) { await page.waitForTimeout(50); continue; }
    if (st.over) { stop.done = true; break; }
    if (st.toasts && await page.locator('.toast.backing').count()) {   // a duel to back: back a random side, or pass
      await page.evaluate(() => { const t = document.querySelector('.toast.backing'); if (!t) return; const r = [...t.querySelectorAll('input.bk-side:not([disabled])')];
        if (r.length && Math.random() < 0.6) { const x = r[Math.floor(Math.random() * r.length)]; x.checked = true; x.dispatchEvent(new Event('change')); t.querySelector('.bk-go').click(); } else t.querySelector('.bk-pass').click(); }).catch(() => {});
      continue;
    }
    if (st.toasts) { await page.locator('.toast [data-y]').nth(Math.random() < 0.8 ? 0 : 1).click({ timeout: 1000 }).catch(() => {}); continue; }   // mostly accept
    if (st.dlg && st.lobby) { await page.waitForTimeout(30); continue; }
    if (st.dlg) {
      const btns = page.locator('#dlgBody button:not([disabled]):visible');
      const n = await btns.count().catch(() => 0);
      if (!n) { await page.evaluate(() => closeDialog()).catch(() => {}); continue; }
      await btns.nth(Math.floor(Math.random() * n)).click({ timeout: 1000 }).catch(() => {}); clicks++;
      continue;
    }
    if (!st.my) {
      if (Math.random() < 0.01) await page.evaluate(() => { $('#chatIn').value = 'hello'; $('#chatForm').requestSubmit(); }).catch(() => {});
      await page.waitForTimeout(15); continue;
    }
    // now and then, offer another person a 1-soul-for-1-soul trade, so player-to-player trades get exercised
    if (Math.random() < 0.05) await page.evaluate(() => {
      const p = ME(), qs = G.g.P.filter(q => q !== p && G.g.alive(q) && q.bot.human && q.souls > 0);
      if (p.souls > 0 && qs.length) Net.offer(qs[0].id, { souls: 1, tokens: [], cards: [] }, { souls: 1, tokens: [], cards: [] });
    }).catch(() => {});
    const btns = page.locator('#actions button:not([disabled]), #endRow button');
    const n = await btns.count().catch(() => 0); if (!n) { await page.waitForTimeout(15); continue; }
    const labels = await btns.allTextContents().catch(() => []);
    let k = Math.floor(Math.random() * n);
    if (Math.random() < 0.3 || n === 1) k = labels.findIndex(l => l.startsWith('End turn'));
    if (k < 0) k = 0;
    await btns.nth(k).click({ timeout: 1000 }).catch(() => {}); clicks++;
  }
  return clicks;
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  let finished = 0, clicks = 0;
  try {
    for (let gi = 0; gi < GAMES; gi++) {
      const pages = [];
      for (let i = 0; i < PLAYERS; i++) pages.push(await player(browser, url, i));
      await pages[0].fill('#on-nick', 'Host'); await pages[0].click('#on-create');
      await pages[0].waitForSelector('.roomcode');
      const code = await pages[0].textContent('.roomcode');
      for (let i = 1; i < PLAYERS; i++) { await pages[i].fill('#on-nick', 'P' + i); await pages[i].fill('#on-code', code); await pages[i].click('#on-join'); await pages[i].waitForSelector('#lb-leave'); }
      await pages[0].selectOption('#lb-n', String(SEATS));
      await pages[0].waitForTimeout(100);
      await pages[0].click('#lb-go');
      // one player reloads mid-game to test rejoining
      const stop = { done: false };
      const reload = (async () => { await pages[1].waitForTimeout(4000); if (!stop.done) { await pages[1].reload().catch(e => errors.push('reload: ' + e.message)); } })();
      const counts = await Promise.all(pages.map((p, i) => play(p, i, i === 0, stop)));
      await reload;
      clicks += counts.reduce((a, b) => a + b, 0);
      const r = await pages[0].evaluate(() => ({ over: G.over, round: G.g.round, logErr: [...document.querySelectorAll('#log div')].map(d => d.textContent).filter(s => /error/i.test(s)) }));
      errors.push(...r.logErr);
      if (r.over) finished++;
      console.log(`game ${gi + 1}: round ${r.round}, ${r.over ? 'finished' : 'unfinished'}`);
      for (const p of pages) await p.context().close();
    }
  } finally {
    await browser.close(); server.close();
  }
  if (!seen.trades) errors.push('no player-to-player trade went through');
  console.log(`seen: ${JSON.stringify(seen)}`);
  console.log(`${finished}/${GAMES} finished, ${clicks} clicks, ${errors.length} errors, ${leaks.length} leaks`);
  if (errors.length) console.log([...new Set(errors)].slice(0, 10).join('\n'));
  if (leaks.length) console.log([...new Set(leaks)].slice(0, 10).join('\n'));
  if (errors.length || leaks.length || finished < GAMES) process.exitCode = 1;
  process.exit();
})();
