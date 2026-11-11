// End-to-end check of the online server: 3 separate browsers create/join a room, choose names, and play turns.
// Checks that each browser only ever receives its own secrets, and that prompts reach the right player.
const { chromium } = require('playwright');
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 3000 + Math.floor(Math.random() * 2000);
const URL_ = `http://localhost:${PORT}/`;
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: String(PORT), COURT_TEST: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let srvErr = ''; srv.stderr.on('data', d => { srvErr += d; });
  await new Promise((res, rej) => { srv.stdout.on('data', d => { if (/running/.test(d)) res(); }); setTimeout(() => rej(new Error('server did not start')), 8000); });
  const browser = await chromium.launch();
  const errors = [];
  const players = [];
  try {
    for (let i = 0; i < 3; i++) {
      const ctx = await browser.newContext(); const page = await ctx.newPage();
      page.on('pageerror', e => errors.push(`p${i}: ${e.message}`));
      await page.goto(URL_); players.push(page);
    }
    const [a, b, c] = players;
    await a.fill('#on-name', 'Ana'); await a.click('[data-oact="create"]');
    await a.waitForSelector('text=Room ');
    const code = (await a.textContent('h2')).replace('Room ', '').trim();
    for (const [pg, nm] of [[b, 'Ben'], [c, 'Cal']]) { await pg.fill('#on-name', nm); await pg.fill('#on-code', code); await pg.click('[data-oact="join"]'); await pg.waitForSelector(`text=Room ${code}`); }
    // chat: table talk reaches everyone; a private message reaches only its recipient
    await a.click('#court-chat .chat-tab');
    await a.fill('#chat-text', 'hello court'); await a.click('#court-chat button[type="submit"]');
    await a.selectOption('#chat-to', '1'); await a.fill('#chat-text', 'psst Ben, ally with me'); await a.click('#court-chat button[type="submit"]');
    await wait(400);
    const heard = async pg => pg.evaluate(() => [...document.querySelectorAll('#court-chat .chat-line, #court-chat .chat-badge')].map(e => e.textContent).join(' | '));
    await b.click('#court-chat .chat-tab'); await c.click('#court-chat .chat-tab');
    const [hb, hc] = [await heard(b), await heard(c)];
    assert.ok(hb.includes('hello court') && hc.includes('hello court'), 'table talk reaches everyone');
    assert.ok(hb.includes('psst Ben'), 'the private message reaches Ben');
    assert.ok(!hc.includes('psst Ben'), 'the private message must not reach Cal');
    console.log('ok  chat: table talk reaches everyone; private messages reach only the recipient');
    await a.click('[data-oact="start"]');
    // everyone picks a name at the same time
    for (const pg of players) { await pg.waitForSelector('[data-oact="lock"]'); await pg.click('[data-oact="cycle"][data-i="3"]'); await pg.click('[data-oact="lock"]'); }
    for (const pg of players) await pg.waitForFunction(() => S && S.phase === 'play');

    // hidden information: nobody sees anyone else's name, card faces or token dots
    const leaks = [];
    for (const [i, pg] of players.entries()) {
      const v = await pg.evaluate(() => S);
      for (const q of v.players) {
        if (q.id === i) { if (!q.combo) leaks.push(`p${i} can't see own name`); continue; }
        if (q.combo) leaks.push(`p${i} sees p${q.id}'s name`);
        if (q.events.some(e => e !== '?')) leaks.push(`p${i} sees p${q.id}'s cards`);
        if (q.tokens.some(t => t.dots)) leaks.push(`p${i} sees p${q.id}'s token dots`);
      }
      if (v.bag.some(t => t.dots)) leaks.push(`p${i} sees bag dots`);
      if (v.deck.some(x => x !== '?')) leaks.push(`p${i} sees the deck`);
    }
    assert.deepStrictEqual(leaks, []);

    // Pacts: a Pact with yourself pops up on every other player's screen; it takes effect once all of them approve
    {
      const cur = await a.evaluate(() => S.current), maker = players[cur], others = players.filter((_, i) => i !== cur);
      await maker.evaluate(() => __courtSend({ t: 'testGive', card: 'Pact' }));
      await maker.waitForSelector('[data-act="playContract"]');
      await maker.click('[data-act="playContract"]');
      await maker.waitForSelector('#modal:not([hidden]) >> text=Yourself'); await maker.click('#modal button:has-text("Yourself")');
      await maker.waitForSelector('#modal:not([hidden]) #ct'); await maker.fill('#ct', 'I will not name anyone this round. If broken: everything split.');
      await maker.click('#modal button:has-text("Propose")');
      for (const pg of others) await pg.waitForSelector('#modal:not([hidden]) >> text=proposes a Pact', { timeout: 5000 });
      assert.strictEqual(await maker.evaluate(() => document.querySelector('#modal').hidden), true, 'the maker gets no approval pop-up');
      await others[0].click('#modal button:has-text("Approve")');
      await wait(300);
      assert.strictEqual(await a.evaluate(() => S.contracts[0].status), 'pending', 'one approval of two is not enough');
      await others[1].click('#modal button:has-text("Approve")');
      for (const pg of players) await pg.waitForFunction(() => S.contracts[0] && S.contracts[0].status === 'active');
      // the Pacts tab shows each player only their own verdict buttons
      await others[0].click('[data-act="pactsTab"]');
      const btns = await others[0].$$eval('[data-act="contractVerdict"]', bs => bs.map(b => b.textContent));
      assert.deepStrictEqual(btns, ['Broken', 'Kept']);
      await others[0].click('[data-act="contractVerdict"][data-v="kept"]'); await others[1].click('[data-act="pactsTab"]'); await others[1].click('[data-act="contractVerdict"][data-v="kept"]');
      for (const pg of players) await pg.waitForFunction(() => S.contracts[0].status === 'kept');
      for (const pg of others) await pg.click('[data-act="pactsTab"]');
      console.log('ok  Pacts online: approval pop-ups reach the other players; votes from the Pacts tab close it');
    }

    // play several turns: the current player buys a card (prompts go only to them), then ends the turn
    for (let turn = 0; turn < 6; turn++) {
      const [cur, serial] = await a.evaluate(() => [S.current, S.turnSerial]);
      const pg = players[cur];
      await pg.waitForSelector('[data-act="endTurn"]');
      // only the current player has the turn view
      for (const [i, other] of players.entries()) if (i !== cur) assert.strictEqual(await other.$('[data-act="endTurn"]'), null, `p${i} sees an End turn button on p${cur}'s turn`);
      const btn = await pg.$('[data-act="buyEvent"]:not([disabled])');
      if (btn) {
        await btn.click();
        // whatever pops up (card drawn, Welfare...), answer it with its first enabled button
        for (let k = 0; k < 6; k++) {
          await wait(150);
          const open = await players.map(p => p.evaluate(() => !document.querySelector('#modal').hidden));
          const states = await Promise.all(open);
          const who = states.findIndex(Boolean);
          if (who < 0) break;
          await players[who].click('#modal .sheet-actions button:not([disabled]), #modal [data-v]:not([disabled])');
        }
      }
      await wait(150);
      await pg.click('[data-act="endTurn"]');
      for (const p of players) await p.waitForFunction(prev => S.turnSerial !== prev, serial);   // every screen has moved to the next turn
    }
    const rounds = await a.evaluate(() => S.round);
    assert.ok(rounds >= 2, 'the game advanced through turns');

    // a cross-player prompt: the current player names someone; on a wrong guess the TARGET's browser gets the choice
    {
      const cur = await a.evaluate(() => S.current);
      const namer = players[cur], tid = (cur + 1) % 3, target = players[tid];
      const tname = ['Ana', 'Ben', 'Cal'][tid];
      const elig = await namer.evaluate(t => eligibility(P(S.current), P(t)), tid);
      if (elig == null) {
        await namer.click('[data-act="name"]');
        await namer.click(`#modal .sheet-actions button:has-text("${tname}")`);
        await namer.click('#modal .sheet-actions button:not([disabled])');           // announce
        // guess a name that is certainly wrong
        await namer.click('#modal [data-v="3344"]');   // every test player is Bael (1112), so Andromalius is wrong
        await wait(300);
        const wrong = await namer.evaluate(() => S.log.some(l => /^Wrong\./.test(l.t)));
        if (wrong) {
          // "Wrong name" is a public announcement: a card on every screen, not a pop-up anyone has to answer
          for (const p of players) await p.waitForSelector('#court-announce .announce-card h3:has-text("Wrong name")', { timeout: 5000 });
          await target.waitForSelector('#modal:not([hidden]) h2:has-text("decides")');
          assert.strictEqual(await namer.evaluate(() => document.querySelector('#modal').hidden), true, "the namer must not get the target's choice");
          await target.click('#modal .sheet-actions button:not([disabled])');
          await wait(300);
          const fate = await a.evaluate(n => S.players[n].status, cur);
          assert.ok(fate === 'slave' || fate === 'dead', "the target's choice was applied");
          for (const p of players) await p.waitForSelector(`#court-announce .announce-card h3:has-text("${fate === 'slave' ? 'is bound' : 'is devoured'}")`, { timeout: 5000 });
          console.log(`ok  cross-player prompt: the target (${tname}) decided the namer's fate (${fate === 'slave' ? 'bound' : 'devoured'})`);
        } else console.log('note: the random guess was right (1 in 35); cross-player check skipped this run');
      }
    }

    // reconnect: reload a player's page and they get their seat back
    await b.reload(); await b.waitForFunction(() => S && S.phase === 'play' && S.players.some(p => p.combo));
    assert.deepStrictEqual(errors, []);
    console.log(`ok  online server: room ${code}, 3 players, ${rounds - 1}+ rounds, no hidden-information leaks, reconnect works`);
  } catch (e) {
    console.error('FAIL online server:', e.stack, errors.length ? '\n  page errors: ' + errors.join('; ') : '', srvErr ? '\n  server: ' + srvErr.slice(0, 500) : '');
    process.exitCode = 1;
  } finally {
    await browser.close(); srv.kill();
  }
})();
