// Balance sim for the rework: node sim-rework/run.js --games 2000 --players mix --bots mix
'use strict';
const { Game, ROLES } = require('./engine');
const { Bot, TYPES } = require('./bots');

const a = { games: 1000, players: 'mix', bots: 'mix', seed: 1, maxRounds: 60, trace: null, arrog: 'keep', remask: 'flat', market: 'value', lock: 'off', slaveTokens: 'toss', end2: 'on', cards: 'off', ownRedraw: 'off', strict: 'off', take: 'off', order: 'duel-first', fate: 'rebel', wait: 1, swap: 'on', slaveDiscard: 'on', buy3: 'on', marq: 'remask3', remaskEnd: 'flat', endUnmask: 'on', masterBuy: 'on', prince3: 'tribute3' };
const v = process.argv.slice(2);
for (let i = 0; i < v.length; i++) {
  const k = v[i].replace(/^--/, '');
  if (k === 'games') a.games = +v[++i]; else if (k === 'players') a.players = v[++i]; else if (k === 'bots') a.bots = v[++i];
  else if (k === 'seed') a.seed = +v[++i]; else if (k === 'max-rounds') a.maxRounds = +v[++i]; else if (k === 'trace') a.trace = +v[++i]; else if (k === 'arrogation') a.arrog = v[++i]; else if (k === 'remask') a.remask = v[++i]; else if (k === 'market') a.market = v[++i]; else if (k === 'mask-lock') a.lock = v[++i]; else if (k === 'slave-tokens') a.slaveTokens = v[++i]; else if (k === 'noblesse-end') a.end2 = v[++i]; else if (k === 'card-market') a.cards = v[++i]; else if (k === 'own-redraw') a.ownRedraw = v[++i]; else if (k === 'noblesse-strict') a.strict = v[++i]; else if (k === 'duel-take') a.take = v[++i]; else if (k === 'order') a.order = v[++i]; else if (k === 'fate') a.fate = v[++i]; else if (k === 'reincarnate-wait') a.wait = +v[++i]; else if (k === 'rebel-swap') a.swap = v[++i]; else if (k === 'slave-discard') a.slaveDiscard = v[++i]; else if (k === 'buy3') a.buy3 = v[++i]; else if (k === 'marquis-lv1') a.marq = v[++i]; else if (k === 'remask-end') a.remaskEnd = v[++i]; else if (k === 'end-unmask') a.endUnmask = v[++i]; else if (k === 'master-buy') a.masterBuy = v[++i]; else if (k === 'prince-lv3') a.prince3 = v[++i];
}
const kinds = a.bots === 'mix' ? [...Object.keys(TYPES), 'random'] : a.bots.split(',');
const seedR = (s => () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; })(a.seed * 7919);

const recs = [];
for (let gi = 0; gi < a.games; gi++) {
  const n = a.players === 'mix' ? 3 + Math.floor(seedR() * 4) : +a.players;
  const types = Array.from({ length: n }, () => kinds[Math.floor(seedR() * kinds.length)]);
  const g = new Game(n, types.map(t => new Bot(t, a.market, a.order !== 'buy-first', a.fate)), a.seed * 100003 + gi, { MAX_ROUNDS: a.maxRounds, ARROG_FREE: a.arrog, REMASK: a.remask, MASK_LOCK: a.lock === 'on', SLAVE_TOKENS: a.slaveTokens, NOBLESSE_END2: a.end2 === 'on', CARD_MARKET: a.cards === 'on', OWN_REDRAW: a.ownRedraw === 'on', NOBLESSE_STRICT: a.strict === 'on', DUEL_TAKE: a.take === 'on', REINCARNATE_WAIT: a.wait, REBEL_SWAP: a.swap === 'on', SLAVE_DISCARD: a.slaveDiscard === 'on', BUY3: a.buy3 === 'on', MARQ_LV1: a.marq, REMASK_END: a.remaskEnd, END_UNMASK: a.endUnmask === 'on', MASTER_BUY: a.masterBuy === 'on', PRINCE_LV3: a.prince3 });
  if (a.trace === gi) g.trace = true;
  const r = g.play();
  recs.push({ n, types, ...r, startRoles: r.players.map(p => p.startRole) });
  if (a.trace === gi) console.log(g.log.join('\n'));
}

const pct = (x, n) => n ? `${(100 * x / n).toFixed(1)}%` : '—';
const ci = (x, n) => n ? `±${(196 * Math.sqrt((x / n) * (1 - x / n) / n)).toFixed(1)}` : '';
const done = recs.filter(r => r.winner !== null), sum = k => recs.reduce((s, r) => s + r.stats[k], 0), per = k => (sum(k) / recs.length).toFixed(2);
const med = xs => { const s = [...xs].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : '—'; };
const L = [];
L.push(`Rework sim · ${recs.length} games · players ${a.players} · bots ${a.bots} · seed ${a.seed} · round limit ${a.maxRounds} · free Arrogation ${a.arrog} · remask ${a.remask} · market ${a.market} · mask lock ${a.lock} · slave tokens ${a.slaveTokens} · noblesse ends at 2 ${a.end2} · card market ${a.cards} · own redraw ${a.ownRedraw} · noblesse strict ${a.strict} · duel take ${a.take} · bot order ${a.order} · bot fate ${a.fate} · reincarnation wait ${a.wait} · rebel swap ${a.swap} · slave tokens discarded ${a.slaveDiscard} · draw 3 keep 1 ${a.buy3} · Marquis Lv1 ${a.marq} · remask after Noblesse ${a.remaskEnd} · unmask all after Noblesse ${a.endUnmask} · master buy ${a.masterBuy} · Prince Lv3 ${a.prince3}`);
L.push(`Finished ${done.length} · stalemates ${recs.length - done.length} (${pct(recs.length - done.length, recs.length)})`);
L.push(`Rounds: median ${med(done.map(r => r.rounds))} (finished games)`);
L.push('', 'Win rate by starting role (fair share = 1 / players)');
const fair = done.reduce((s, r) => s + 1, 0) ? (done.reduce((s, r) => s + 1 / r.n, 0) / done.length) : 0;
for (let ro = 0; ro < 5; ro++) {
  let seats = 0, wins = 0; for (const r of done) r.startRoles.forEach((x, i) => { if (x === ro) { seats++; if (r.winner === i) wins++; } });
  L.push(`  ${ROLES[ro].padEnd(9)} ${String(seats).padStart(6)} ${String(wins).padStart(6)}   ${pct(wins, seats).padStart(6)} ${ci(wins, seats)}`);
}
L.push(`  (fair share ≈ ${(100 * fair).toFixed(1)}%)`, '', 'Win rate by bot type');
for (const k of kinds) {
  let seats = 0, wins = 0; for (const r of done) r.types.forEach((x, i) => { if (x === k) { seats++; if (r.winner === i) wins++; } });
  L.push(`  ${k.padEnd(10)} ${String(seats).padStart(6)} ${String(wins).padStart(6)}   ${pct(wins, seats).padStart(6)} ${ci(wins, seats)}`);
}
const fc = done.filter(r => r.stats.firstCapturer !== null);
L.push('', `First player to capture someone won ${pct(fc.filter(r => r.stats.firstCapturer === r.winner).length, fc.length)} of finished games`);
L.push(`Turns spent masked: ${pct(sum('maskedTurns'), sum('turns'))} (slaves always count as masked)`);
L.push(`Per game: duels ${per('duels')} (upsets ${pct(sum('upsets'), sum('duels'))}), souls committed as backing ${per('backing')}`);
L.push(`Per game: namings ${per('namings')} (${pct(sum('correct'), sum('namings'))} correct), enslaves ${per('enslaves')}, consumes ${per('consumes')}, reincarnations ${per('reincarnations')}`);
L.push(`Per game: unmasks ${per('unmasks')}, remasks ${per('remasks')}, role reveals ${per('reveals')}`);
L.push(`Per game: rebellions ${per('rebellions')} (${pct(sum('rebellionWins'), sum('rebellions'))} won, swaps ${per('swaps')}), vassals ${per('vassals')}, freedom bought ${per('freedomBuys')}`);
L.push(`Per game: Wards ${per('wards')}, Marquis last stands ${per('lastStands')} (${pct(sum('lastStandWins'), sum('lastStands'))} survived), Seizes ${per('seizes')}`);
L.push(`Per game: token buys ${per('tokenBuys')} (draw-3 buys ${per('buy3')}, blank draws ${per('blanks')}), card buys ${per('cardBuys')}, token trades ${per('trades')} (avg price ${(sum('tradeSouls') / Math.max(1, sum('trades'))).toFixed(1)}), Earl trade bonuses ${per('earlBonus')}, card trades ${per('cardTrades')}, master buys from slaves ${per('masterBuys')}`);
console.log(L.join('\n'));
