// Targeted checks for bugs that were fixed. Scripted answers replace the modal: window.ask is swapped for a queue.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const cases = {
  async 'Unusable Insubordination is discarded and the drawer draws another card'(page) {
    const r = await page.evaluate(async () => {
      newGame(['A', 'B', 'C', 'D']);
      S.players.forEach((p, i) => p.combo = ['1112', '2233', '1111', '1122'][i]);
      startGame();
      S.players[1].status = 'slave'; S.players[1].master = 0; S.players[1].rebelBlocked = [0];
      const titles = []; window.ask = async o => { titles.push(o.title); return o.options.find(x => !x.disabled)?.value ?? null; };
      S.deck = ['Collect'];                     // the replacement draw
      await runRebellion(S.players[3]);
      return { titles, deck: S.deck.length, discard: S.discard.includes('Insubordination'), hand: S.players[3].events };
    });
    assert.deepStrictEqual(r.titles, ['Insubordination', 'You drew: Collect']);
    assert.strictEqual(r.deck, 0);
    assert.strictEqual(r.discard, true);
    assert.deepStrictEqual(r.hand, ['Collect'], 'the drawer gets a replacement card');
  },

  async 'A marked Marquis cannot pay to kill itself'(page) {
    const r = await page.evaluate(() => {
      newGame(['A', 'B', 'C', 'D']);
      S.players.forEach((p, i) => p.combo = ['2222', '2233', '1111', '1122'][i]);
      startGame();
      S.players[0].markedBy = 1; S.players[0].souls = 10;
      S.current = 0; S.view = 'turn'; render();
      const alone = !!document.querySelector('[data-act="killMarquis"]');
      S.players[2].combo = '1223'; S.players[2].markedBy = 1; render();
      const withOther = !!document.querySelector('[data-act="killMarquis"]');
      return { alone, withOther };
    });
    assert.strictEqual(r.alone, false, 'kill button shown when the only marked Marquis is yourself');
    assert.strictEqual(r.withOther, true, 'kill button missing when another Marquis is marked');
    // the target list must not include yourself
    await page.click('[data-act="killMarquis"]');
    const labels = await page.$$eval('#modal button', bs => bs.map(b => b.textContent));
    assert.ok(labels.some(l => l.includes('C')) && !labels.some(l => /^A/.test(l)), 'kill list: ' + labels.join(' | '));
  },

  async 'Ward: a correct naming becomes a claim that resolves at the end of the target\'s next turn'(page) {
    const r = await page.evaluate(async () => {
      newGame(['A', 'B', 'C', 'D']);
      S.players.forEach((p, i) => p.combo = ['1112', '2233', '1111', '1122'][i]);
      startGame();
      const [A, B, C] = S.players;
      B.events = ['Ward', 'Ward', 'Ward'];
      S.current = 0;
      const q = [1, 'consume', '2233', true, true];   // A names B correctly (devour); pass device; raise a Ward
      window.ask = async () => q.length ? q.shift() : true;
      await doNaming(A, { onTurn: true });
      const waiting = { B: B.status, claim: !!activeClaim(B), canName: eligibility(C, B) };
      // B's own (next) turn ends: no more Wards, so the devour resolves
      S.turnSerial++; S.current = 1; S.queue = [2, 3];
      window.ask = async o => o.options && o.options[0] ? o.options[0].value : true;
      await ACT.endTurn();
      return { waiting, after: B.status, wards: B.events.filter(c => c === 'Ward').length };
    });
    assert.strictEqual(r.waiting.B, 'alive');
    assert.strictEqual(r.waiting.claim, true);
    assert.match(r.waiting.canName, /Warded/, 'nobody else may name a warded player');
    assert.strictEqual(r.after, 'dead');
    assert.strictEqual(r.wards, 0);
  },

  async 'Ward: the claim passes to whoever captures the claimant; capturing the claimant yourself ends it and you are reborn'(page) {
    const r = await page.evaluate(async () => {
      const run = async (whoCaptures) => {
        newGame(['A', 'B', 'C', 'D']);
        S.players.forEach((p, i) => p.combo = ['1112', '2233', '1111', '1122'][i]);
        startGame();
        const [A, B, C] = S.players;
        S.claims = []; S.turnSerial = 5;
        addClaim({ target: 1, claimant: 0, act: 'consume', kind: 'named', named: true });
        let reborn = false;
        window.ask = async o => { if (/choose your new name/.test(o.title)) { reborn = true; return '1111'; } return o.options && o.options[0] ? o.options[0].value : true; };
        await consume(whoCaptures === 'B' ? B : C, A);
        const c = S.claims[0];
        return { status: c.status, claimant: c.claimant, reborn, B: B.status };
      };
      return { third: await run('C'), self: await run('B') };
    });
    assert.deepStrictEqual(r.third, { status: 'waiting', claimant: 2, reborn: false, B: 'alive' }, 'the claim passes to C');
    assert.deepStrictEqual(r.self, { status: 'ended', claimant: 0, reborn: true, B: 'alive' }, 'B escapes and is reborn');
  },

  async 'A Marquis who names a Prince wrongly is consumed by the Prince'(page) {
    const r = await page.evaluate(async () => {
      newGame(['A', 'B', 'C', 'D']);
      S.players.forEach((p, i) => p.combo = ['2222', '1123', '1111', '1122'][i]); // A Marquis, B Prince
      startGame();
      S.players[0].souls = 5; S.players[0].events.push('Collect');
      S.current = 0; S.view = 'turn';
      const before = S.players[1].souls;
      const q = [1, 'consume', '1111', true]; // A names B as Furfur (wrong); one info dialog (the "Wrong name" one is an announcement now)
      window.ask = async () => q.shift();
      await doNaming(S.players[0], { onTurn: true });
      const A = S.players[0], B = S.players[1];
      return { A: A.status, marked: A.markedBy, gained: B.souls - before - CONSUME_BONUS, Bcards: B.events.includes('Collect'), left: q.length };
    });
    assert.deepStrictEqual(r, { A: 'dead', marked: null, gained: 5, Bcards: true, left: 0 });
  },

  async 'A Prince who names a Marquis correctly devours them; a Ward delays it to the end of the Marquis\'s next turn'(page) {
    const r = await page.evaluate(async () => {
      const run = async wards => {
        newGame(['A', 'B', 'C', 'D']);
        S.players.forEach((p, i) => p.combo = ['1123', '2222', '1111', '1122'][i]);
        startGame();
        const B = S.players[1];   // A is a Prince (1123), B the Marquis (2222)
        for (let i = 0; i < wards; i++) B.events.push('Ward');
        S.current = 0;
        const q = [1, 'enslave', '2222', true, true, true];
        window.ask = async () => q.length ? q.shift() : true;
        await doNaming(S.players[0], { onTurn: true });
        const mid = B.status;
        if (wards) { S.turnSerial++; S.current = 1; S.queue = [2, 3]; window.ask = async o => o.options && o.options[0] ? o.options[0].value : true; await ACT.endTurn(); }
        return { mid, after: B.status, marked: B.markedBy };
      };
      return { plain: await run(0), warded: await run(3) };
    });
    assert.deepStrictEqual(r.plain, { mid: 'dead', after: 'dead', marked: null });
    assert.deepStrictEqual(r.warded, { mid: 'alive', after: 'dead', marked: null });
  },

  async 'Anyone may name a player when nobody else holds their tokens'(page) {
    const r = await page.evaluate(() => {
      newGame(['A', 'B', 'C', 'D']);
      S.players.forEach((p, i) => p.combo = ['1112', '2233', '1111', '1122'][i]);
      startGame();
      const [A, B, C] = S.players;
      // B holds all 4 of their own tokens; A and C hold none
      B.tokens.push(...S.bag.filter(t => t.owner === 1)); S.bag = S.bag.filter(t => t.owner !== 1);
      const turtle = { A: eligibility(A, B), C: eligibility(C, B) };
      // once C holds one, only C (the most) may name B
      const t = B.tokens.pop(); C.tokens.push(t);
      const normal = { A: eligibility(A, B), C: eligibility(C, B) };
      // a slave can still never name
      A.status = 'slave'; A.master = 2; C.tokens.pop(); B.tokens.push(t);
      return { turtle, normal, slave: eligibility(A, B) };
    });
    assert.deepStrictEqual(r.turtle, { A: null, C: null });
    assert.strictEqual(r.normal.C, null);
    assert.match(r.normal.A, /hold none/);
    assert.match(r.slave, /Thralls cannot name/);
  },

  async 'Arrogation can be discarded'(page) {
    const r = await page.evaluate(async () => {
      newGame(['A', 'B', 'C', 'D']);
      S.players.forEach((p, i) => p.combo = ['1112', '2233', '1111', '1122'][i]);
      startGame();
      const labels = []; window.ask = async o => { labels.push(...o.options.map(x => x.label)); return 'discard'; };
      const before = S.deck.filter(c => c === 'Arrogation').length;
      await runAscension(S.players[0]);
      return { offered: labels.includes('Discard it'), inDeck: S.deck.filter(c => c === 'Arrogation').length - before, discarded: S.discard.filter(c => c === 'Arrogation').length, inHand: S.players[0].events.includes('Arrogation') };
    });
    assert.deepStrictEqual(r, { offered: true, inDeck: 0, discarded: 1, inHand: false });
  },

  async 'Scrying card: only in token rounds, and it uses up the token purchase for the turn'(page) {
    const r = await page.evaluate(async () => {
      newGame(['A', 'B', 'C', 'D']);
      S.players.forEach((p, i) => p.combo = ['1112', '2233', '1111', '1122'][i]);
      startGame();
      window.ask = async o => o.options.find(x => x.read) ? o.options.find(x => x.read).read({ querySelectorAll: () => [{ dataset: { k: '0' } }] }).value : true;
      const A = S.players[0]; A.souls = 20; S.current = 0; S.tokenBought = false;
      S.round = 2; A.events.push('Scrying');
      await ACT.playName();
      const evenRound = { held: A.events.includes('Scrying'), tokens: A.tokens.length };
      S.round = 3;
      await ACT.playName();
      const oddRound = { held: A.events.includes('Scrying'), tokens: A.tokens.length, tokenBought: S.tokenBought };
      await ACT.buyToken();
      return { evenRound, oddRound, afterBuy: A.tokens.length };
    });
    assert.deepStrictEqual(r.evenRound, { held: true, tokens: 0 }, 'Scrying card worked in a card round');
    assert.deepStrictEqual(r.oddRound, { held: false, tokens: 1, tokenBought: true });
    assert.strictEqual(r.afterBuy, 1, 'bought a token after using a Scrying card the same turn');
  },

  async 'Capture rules: slave income and souls go to the master, +4 per consume (not own slave), Prince pays the bank'(page) {
    const r = await page.evaluate(async () => {
      newGame(['A', 'B', 'C', 'D']);
      S.players.forEach((p, i) => p.combo = ['1112', '2233', '1111', '1122'][i]);
      startGame();
      const [A, B, C, D] = S.players;
      window.ask = async () => true;   // answer pop-ups (the devour announcements)
      B.status = 'slave'; B.master = 0;
      A.souls = 0; B.souls = 0;
      // slave's turn: 2 souls to the master
      S.queue = [1]; nextTurn();
      const income = { master: A.souls, slave: B.souls };
      // slave cashes a Collect card: the souls end up with the master after the action
      B.events.push('Collect'); S.current = 1; await ACT.playSoul(); slaveSoulSweep();
      const soulCard = { master: A.souls, slave: B.souls };
      // consuming someone pays 4 from the bank on top of their souls
      C.souls = 3; const before = D.souls; await consume(D, C);
      const consumeGain = D.souls - before;
      // consuming your own slave pays no bonus
      const aBefore = A.souls; await consume(A, B);
      // a Prince buying from their own slave pays the bank: the 2 souls don't come back
      newGame(['P', 'S', 'X', 'Y']);
      S.players.forEach((p, i) => p.combo = ['1123', '2233', '1111', '1122'][i]);  // P is a Prince
      startGame();
      const [P0, S1] = S.players; S1.status = 'slave'; S1.master = 0; S1.souls = 0; S1.tokens.push(S.bag.pop());
      P0.souls = 10; S.current = 0; S.spent = 0;
      window.ask = async o => o.title.startsWith('Buy a token') ? 1 : '0';
      await ACT.princeBuy(); slaveSoulSweep();
      return { income, soulCard, consumeGain, ownSlaveGain: A.souls - aBefore, prince: { souls: P0.souls, tokens: P0.tokens.length } };
    });
    assert.deepStrictEqual(r, { income: { master: 2, slave: 0 }, soulCard: { master: 4, slave: 0 }, consumeGain: 7, ownSlaveGain: 0, prince: { souls: 8, tokens: 1 } });
  },

  async 'Paid Marquis devour: the original namer gets the spoils and the 4-soul bonus; the payer just pays'(page) {
    const r = await page.evaluate(async () => {
      newGame(['A', 'B', 'C', 'D']);
      S.players.forEach((p, i) => p.combo = ['2222', '2233', '1111', '1122'][i]); // A is the Marquis
      startGame();
      const [A, B, C] = S.players;
      A.markedBy = 1; A.souls = 3; A.events = ['Collect'];
      C.souls = 10; B.souls = 0; S.current = 2; S.spent = 0;
      await killMarquis(C, A, true);
      return { payer: C.souls, namer: B.souls, namerCards: B.events.includes('Collect'), A: A.status };
    });
    assert.deepStrictEqual(r, { payer: 6, namer: 7, namerCards: true, A: 'dead' }); // payer 10 - 4; namer gets A's 3 souls + 4 bonus
  },

  async 'A deck of only unusable Insubordinations does not loop forever'(page) {
    const r = await page.evaluate(async () => {
      newGame(['A', 'B', 'C', 'D']);
      S.players.forEach((p, i) => p.combo = ['1112', '2233', '1111', '1122'][i]);
      startGame();
      S.deck = ['Insubordination', 'Insubordination']; S.discard = [];
      window.ask = async () => true;
      await drawEvent(S.players[0]);
      return { deck: S.deck.length, discard: S.discard.length };
    });
    assert.strictEqual(r.deck + r.discard, 2);
  },

  async 'Welfare: everyone gives 1 soul to the poorest player who is not a thrall'(page) {
    const r = await page.evaluate(async () => {
      newGame(['A', 'B', 'C', 'D']);
      S.players.forEach((p, i) => { p.combo = ['1112', '2233', '1111', '1122'][i]; });
      startGame();
      S.players.forEach((p, i) => { p.souls = [10, 4, 0, 3][i]; p.events = []; p.tokens = []; });
      S.players[2].status = 'slave'; S.players[2].master = 0;   // C is A's thrall with net worth 0: must not receive
      window.ask = async () => true;
      await runEqualizer();
      return S.players.map(p => p.souls);
    });
    assert.deepStrictEqual(r, [9, 3, 0, 5], 'D (net worth 3) is the poorest non-thrall and collects 1 from A and B');
  },

  async 'Devour: the devourer chooses which half of the tokens to take, by color'(page) {
    const r = await page.evaluate(async () => {
      newGame(['A', 'B', 'C', 'D']);
      S.players.forEach((p, i) => p.combo = ['1112', '2233', '1111', '1122'][i]);
      startGame();
      const [A, B, C, D] = S.players;
      const take = o => S.bag.splice(S.bag.findIndex(t => t.owner === o), 1)[0];
      B.tokens = [take(2), take(3), take(3), take(0)];   // C, D, D, A tokens
      let shown = null;
      window.ask = async o => { shown = [...o.body.matchAll(/(P\d|[A-D])'s token/g)].map(x => x[1]); const want = []; o.body.replace(/data-k="(\d+)"[^>]*> [\s\S]*?([A-D])'s token/g, (_, i, who) => { if (who === 'D' && want.length < 2) want.push(+i); }); return want; };
      await consume(A, B);
      return { got: A.tokens.map(t => S.players[t.owner].name).sort().join(''), bagHasC: S.bag.some(t => t.owner === 2), shown: !!shown };
    });
    assert.deepStrictEqual(r, { got: 'DD', bagHasC: true, shown: true });
  },

  async 'Thralls cannot trade, and nobody can trade with a thrall'(page) {
    const r = await page.evaluate(async () => {
      newGame(['A', 'B', 'C', 'D']);
      S.players.forEach((p, i) => p.combo = ['1112', '2233', '1111', '1122'][i]);
      startGame();
      S.players[1].status = 'slave'; S.players[1].master = 0;
      S.current = 1; S.view = 'turn'; render();
      const thrallSeesTrade = !!document.querySelector('[data-act="trade"]');
      let opts = null; window.ask = async o => { if (!opts) opts = o.options; return null; };
      S.current = 2; await ACT.trade();
      const toThrall = opts.find(o => /B/.test(o.label));
      return { thrallSeesTrade, thrallDisabled: !!(toThrall && toThrall.disabled) };
    });
    assert.deepStrictEqual(r, { thrallSeesTrade: false, thrallDisabled: true });
  },

  async 'Broken Pact with yourself: approved by all, broken when all but one agree; devoured, forfeit handed out; a Ward delays it'(page) {
    const r = await page.evaluate(async () => {
      const run = async wards => {
        newGame(['A', 'B', 'C', 'D']);
        S.players.forEach((p, i) => p.combo = ['1112', '2233', '1111', '1122'][i]);
        startGame();
        const [A, B, C, D] = S.players;
        D.status = 'slave'; D.master = 0;                     // A's thrall
        A.souls = 6; A.events = ['Seize', 'Collect', 'Pact']; for (let i = 0; i < wards; i++) A.events.push('Ward');
        A.tokens = S.bag.filter(t => t.owner === 2).slice(0, 2);   // 2 of C's tokens
        B.souls = 0; C.souls = 0; B.events = []; C.events = []; B.tokens = []; C.tokens = [];
        S.current = 0;
        const asked = [];
        const forfeit = o => /A's souls/.test(o.title) ? 1 : /A's event cards/.test(o.title) ? 2 : /A's name tokens/.test(o.title) ? 'split' : /A's thralls/.test(o.title) ? 1 : undefined;
        window.ask = async o => {
          asked.push(o.title);
          if (o.title === 'Pact with…') return 'self';
          if (o.title === 'Write the terms') return 'No naming Cobalt. If broken: souls to B, cards to C, tokens split, thralls to B';
          const f = forfeit(o); if (f !== undefined) return f;
          return true;
        };
        await ACT.playContract();
        const c = S.contracts[0];
        const noForfeitQuestions = !asked.some(t => /who gets/i.test(t));
        const pending = c.status;
        const vote = (who, v) => ACT.contractVote({ dataset: { id: String(c.id), who: String(who), v } });
        const verdict = (who, v) => ACT.contractVerdict({ dataset: { id: String(c.id), who: String(who), v: String(v) } });
        await vote(1, 'yes'); await vote(2, 'yes');
        const half = c.status;
        await vote(3, 'yes');
        const sealed = c.status, cardDiscarded = S.discard.includes('Pact');
        await verdict(1, 0); await verdict(2, 0);
        const twoOfFour = c.status;                          // 4 players: needs 3
        await verdict(3, 0);
        const mid = A.status;
        if (wards) {
          S.turnSerial++; S.current = 0; S.queue = [3];
          window.ask = async o => { const f = forfeit(o); if (f !== undefined) return f; return o.options && o.options[0] ? (o.options[0].value === true ? false : o.options[0].value) : true; };
          await ACT.endTurn();
        }
        return { noForfeitQuestions, pending, half, sealed, cardDiscarded, twoOfFour, mid, A: A.status, B: [B.souls, B.events.length, B.tokens.length], C: [C.souls, C.events.length, C.tokens.length], D: [D.status, D.master] };
      };
      return { plain: await run(0), warded: await run(3) };
    });
    assert.ok(r.plain.noForfeitQuestions, 'the forfeit is written into the terms, not asked when proposing');
    assert.deepStrictEqual([r.plain.pending, r.plain.half, r.plain.sealed, r.plain.cardDiscarded], ['pending', 'pending', 'active', true]);
    assert.strictEqual(r.plain.twoOfFour, 'active', 'two of four verdicts are not enough');
    assert.strictEqual(r.plain.mid, 'dead');
    // A had 6 souls, 2 cards (Seize, Collect), 2 of C's tokens: souls to B, cards to C, tokens split, thrall D to B.
    assert.deepStrictEqual(r.plain.B[0], 6);
    assert.deepStrictEqual(r.plain.C[1], 2);
    assert.strictEqual(r.plain.B[2] + r.plain.C[2], 2);
    assert.deepStrictEqual(r.plain.D, ['slave', 1]);
    assert.strictEqual(r.warded.mid, 'alive', 'the Ward delays the devour');
    assert.strictEqual(r.warded.A, 'dead', 'and it happens at the end of their next turn');
  },

  async 'Pacts between two players: the other party must accept; a rejection returns the card; the table picks the breaker'(page) {
    const r = await page.evaluate(async () => {
      newGame(['A', 'B', 'C']);
      S.players.forEach((p, i) => p.combo = ['1112', '2233', '1111'][i]);
      startGame();
      const [A, B, C] = S.players;
      A.events = ['Pact', 'Pact']; S.current = 0;
      let fate = false;
      window.ask = async o => {
        if (o.title === 'Pact with…') return 1;
        if (o.title === 'Write the terms') return 'A and B leave each other alone';
        if (o.options && o.options.some(x => x.value === 'consume')) { fate = true; return 'consume'; }
        return false;   // no Ward, etc.
      };
      await ACT.playContract();
      const c1 = S.contracts[0];
      await ACT.contractVote({ dataset: { id: String(c1.id), who: '2', v: 'yes' } });   // C can't approve a Pact between A and B
      const afterC = c1.status;
      await ACT.contractVote({ dataset: { id: String(c1.id), who: '1', v: 'no' } });
      const rejected = [c1.status, A.events.filter(x => x === 'Pact').length];
      await ACT.playContract();
      const c2 = S.contracts[1];
      await ACT.contractVote({ dataset: { id: String(c2.id), who: '1', v: 'yes' } });
      const sealed = c2.status;
      await ACT.contractVerdict({ dataset: { id: String(c2.id), who: '0', v: '1' } });     // A says B broke it
      await ACT.contractVerdict({ dataset: { id: String(c2.id), who: '1', v: '0' } });     // B says A broke it
      const split = c2.status;
      await ACT.contractVerdict({ dataset: { id: String(c2.id), who: '2', v: '1' } });     // C agrees with A: 2 of 3
      return { afterC, rejected, sealed, split, final: c2.status, breaker: c2.breaker, B: B.status, fate };
    });
    assert.strictEqual(r.afterC, 'pending');
    assert.deepStrictEqual(r.rejected, ['rejected', 2], 'rejected: the Pact card goes back');
    assert.strictEqual(r.sealed, 'active');
    assert.strictEqual(r.split, 'active', 'a split table decides nothing');
    assert.deepStrictEqual([r.final, r.breaker, r.B, r.fate], ['broken', 1, 'dead', true]);
  },

  async 'Thralls cannot be in Pacts: none can be proposed to them, and binding a party voids the Pact'(page) {
    const r = await page.evaluate(async () => {
      newGame(['A', 'B', 'C', 'D']);
      S.players.forEach((p, i) => p.combo = ['1112', '2233', '1111', '1122'][i]);
      startGame();
      const [A, B, C, D] = S.players;
      D.status = 'slave'; D.master = 2;
      A.events = ['Pact', 'Pact']; S.current = 0;
      let offered = null;
      window.ask = async o => {
        if (o.title === 'Pact with…') { offered = o.options.map(x => x.value); return 1; }
        if (o.title === 'Write the terms') return 'Truce';
        return false;
      };
      await ACT.playContract();                       // pending with B
      const c1 = S.contracts[0];
      await enslave(C, B);                            // B is bound while it waits: void, card back to A
      const pendingVoid = [c1.status, A.events.filter(x => x === 'Pact').length];
      B.status = 'alive'; B.master = null;
      await ACT.playContract();
      const c2 = S.contracts[1];
      await ACT.contractVote({ dataset: { id: String(c2.id), who: '1', v: 'yes' } });
      const sealed = c2.status;
      await enslave(C, A);                            // a party is bound: void
      return { offered, pendingVoid, sealed, activeVoid: c2.status };
    });
    assert.ok(!r.offered.includes(3), 'no Pact can be proposed to a thrall');
    assert.deepStrictEqual(r.pendingVoid, ['void', 2], 'a waiting Pact card goes back to the free proposer');
    assert.deepStrictEqual([r.sealed, r.activeVoid], ['active', 'void']);
  },

  async 'Pacts with two players left: one player alone cannot declare the other a breaker'(page) {
    const r = await page.evaluate(async () => {
      newGame(['A', 'B', 'C']);
      S.players.forEach((p, i) => p.combo = ['1112', '2233', '1111'][i]);
      startGame();
      const [A, B, C] = S.players;
      C.status = 'dead';
      A.events = ['Pact']; S.current = 0;
      window.ask = async o => o.title === 'Pact with…' ? 1 : o.title === 'Write the terms' ? 'Truce' : (o.options && o.options.some(x => x.value === 'consume')) ? 'consume' : false;
      await ACT.playContract();
      const c = S.contracts[0];
      await ACT.contractVote({ dataset: { id: String(c.id), who: '1', v: 'yes' } });
      await ACT.contractVerdict({ dataset: { id: String(c.id), who: '0', v: '1' } });   // A alone says B broke it
      const alone = [c.status, B.status];
      await ACT.contractVerdict({ dataset: { id: String(c.id), who: '1', v: '1' } });   // B admits it
      return { alone, both: [c.status, B.status] };
    });
    assert.deepStrictEqual(r.alone, ['active', 'alive']);
    assert.deepStrictEqual(r.both, ['broken', 'dead']);
  },

  async 'Scrying, second mode: cards that act when drawn take effect, keep 2 of the others'(page) {
    const r = await page.evaluate(async () => {
      newGame(['A', 'B', 'C', 'D']);
      S.players.forEach((p, i) => p.combo = ['1112', '2233', '1111', '1122'][i]);
      startGame();
      const A = S.players[0];
      A.events = ['Scrying', 'Scrying']; S.current = 0;
      S.deck = ['Seize', 'Welfare', 'Ward', 'Collect', 'Pact'];
      let shown = null;
      window.ask = async o => { if (/Keep 2 of the top cards/.test(o.title)) { shown = [...o.body.matchAll(/data-k="(\d+)"> (\w+)/g)].map(x => x[2]); return [0, 2]; } return true; };
      await ACT.scry2();
      return { shown, hand: A.events.slice().sort(), deck: S.deck, welfareDone: S.discard.includes('Welfare') && S.log.some(l => /drew Welfare/.test(l.t)) };
    });
    assert.deepStrictEqual(r.shown, ['Seize', 'Ward', 'Collect']);
    assert.deepStrictEqual(r.hand, ['Collect', 'Seize']);
    assert.deepStrictEqual(r.deck, ['Pact'], 'only the top 4 were looked at');
    assert.strictEqual(r.welfareDone, true, 'Welfare took effect');
  },

  async 'Arrogation: a Duke may keep it; otherwise a usable thrall forces a rebellion; otherwise back or discard'(page) {
    const r = await page.evaluate(async () => {
      const setup = (dukeFirst, thrall) => {
        newGame(['A', 'B', 'C', 'D']);
        S.players.forEach((p, i) => p.combo = [dukeFirst ? '1113' : '1112', '2233', '1111', '1122'][i]);  // 1113 = Duke
        startGame();
        if (thrall) { S.players[2].status = 'slave'; S.players[2].master = 1; }
      };
      const run = async (dukeFirst, thrall, answer) => {
        setup(dukeFirst, thrall);
        let offered = null;
        window.ask = async o => {
          if (o.title === 'You drew Arrogation') { offered = o.options.map(x => x.value).filter(v => v != null); return answer; }
          return o.options.find(x => !x.disabled && x.value != null)?.value ?? null;   // thrall pick, then decline the naming
        };
        await runAscension(S.players[0]);
        return { offered, kept: S.players[0].events.includes('Arrogation'), rebelled: S.log.some(l => /gave Arrogation to/.test(l.t)) };
      };
      return {
        dukeNoThrall: await run(true, false, 'keep'),
        otherWithThrall: await run(false, true, 'show'),
        otherNoThrall: await run(false, false, 'discard'),
      };
    });
    assert.deepStrictEqual(r.dukeNoThrall.offered, ['keep', 'back', 'discard']);
    assert.strictEqual(r.dukeNoThrall.kept, true);
    assert.strictEqual(r.otherWithThrall.offered, null, 'no choice: it goes straight to a thrall');
    assert.strictEqual(r.otherWithThrall.rebelled, true);
    assert.deepStrictEqual(r.otherNoThrall.offered, ['back', 'discard']);
  },

  async 'After a devour, the devourer may give taken tokens away unseen, free, to players who are not thralls'(page) {
    const r = await page.evaluate(async () => {
      newGame(['A', 'B', 'C', 'D']);
      S.players.forEach((p, i) => p.combo = ['1112', '2233', '1111', '1122'][i]);
      startGame();
      const [A, B, C, D] = S.players;
      D.status = 'slave'; D.master = 2;
      const take = o => S.bag.splice(S.bag.findIndex(t => t.owner === o), 1)[0];
      B.tokens = [take(2), take(3)]; B.souls = 0;            // one C token, one D token; no souls to inherit
      let offeredTo = null;
      window.ask = async o => {
        if (/Keep \d+ of/.test(o.title)) return [0];          // take 1 of the 2
        if (/give away any tokens/.test(o.title)) { offeredTo = [...o.body.matchAll(/Give to ([A-D])/g)].map(x => x[1]); return [[0, 2]]; }  // give it to C
        return true;
      };
      const souls = [A.souls, C.souls];
      await consume(A, B);
      return { offeredTo: [...new Set(offeredTo)], A: A.tokens.length, C: C.tokens.length, souls: [A.souls - souls[0], C.souls - souls[1]] };
    });
    assert.deepStrictEqual(r.offeredTo, ['C'], 'only non-thralls other than the devourer and victim');
    assert.deepStrictEqual([r.A, r.C], [0, 1]);
    assert.deepStrictEqual(r.souls, [4, 0], 'no fee (A only gained the 4-soul devour bonus)');
  },

  async 'Announcements: a correct naming and the devour that follows make one public announcement; a wrong naming says who was wrong'(page) {
    const r = await page.evaluate(async () => {
      newGame(['A', 'B', 'C', 'D']);
      S.players.forEach((p, i) => p.combo = ['1112', '2233', '1111', '1122'][i]);
      startGame();
      const [A, B] = S.players;
      const said = [];
      globalThis.__announce = (title, body) => said.push(title + ' :: ' + body);
      let target = 1;
      window.ask = async o => {
        if (o.title === 'Who are you naming?') return target;
        if (/^Announce:/.test(o.title)) return 'consume';
        if (o.options && o.options.some(x => x.value === 'consume')) return 'consume';   // the wrongly named target decides
        if (/Ward/.test(o.title)) return false;
        return o.options && o.options[0] ? o.options[0].value : true;
      };
      window.pickName = async () => '2233';
      S.current = 0; A.tokens.push(S.bag.find(t => t.owner === 1));
      await doNaming(A, { onTurn: true });
      const right = said.splice(0);
      const C = S.players[2]; A.status = 'alive'; A.tokens.push(S.bag.find(t => t.owner === 2));
      target = 2; window.pickName = async () => '4444';
      await doNaming(A, { onTurn: true });
      return { right, wrong: said };
    });
    assert.strictEqual(r.right.length, 1, JSON.stringify(r.right));
    assert.match(r.right[0], /^B is devoured :: A named B correctly\. A devoured B, who was .+, the /);
    assert.match(r.wrong[0], /^Wrong name :: A named C as .+, and was wrong\. C now decides A's fate\./);
    assert.match(r.wrong[1], /A named C wrongly\. C (bound|devoured) A/);
  },

  async 'Old saves with a single interrupt still load'(page) {
    const r = await page.evaluate(() => {
      const s = normalize({ interrupt: { target: 1 } });
      const t = normalize({ interrupt: null });
      const old = normalize({ interrupts: [], deck: ['Theft', 'Meta'], discard: ['Shield'], players: [{ events: ['Name', 'Soul', 'Blood Contract'] }] });
      return { s: s.interrupts.length, sOld: 'interrupt' in s, t: t.interrupts.length, deck: old.deck, discard: old.discard, hand: old.players[0].events };
    });
    assert.deepStrictEqual(r, { s: 1, sOld: false, t: 0, deck: ['Seize', 'Meta'], discard: ['Ward'], hand: ['Scrying', 'Collect', 'Pact'] });
  },
};

(async () => {
  const browser = await chromium.launch();
  let failed = 0;
  for (const [name, fn] of Object.entries(cases)) {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + path.resolve(__dirname, '../index.html'));
    // Announcements are pop-ups at a shared table; most tests don't answer pop-ups, so they are off unless a test turns them on.
    if (!/announce/i.test(name)) await page.evaluate(() => { globalThis.__announce = () => {}; });
    try { await fn(page); assert.deepStrictEqual(errors, [], 'page errors'); console.log('ok  ' + name); }
    catch (e) { failed++; console.error('FAIL ' + name + '\n     ' + e.message); }
    await ctx.close();
  }
  await browser.close();
  if (failed) process.exitCode = 1;
})();
