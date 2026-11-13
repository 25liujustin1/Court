// Balance simulation: bots play many games on the real playtest rules code.
//   node sim/run.js --games 2000 --players 4 --bots mix --seed 1
//   --players 3..6 or "mix"   --bots mix | mix:aggressor,turtle | aggressor | turtle | hoarder | random | a comma list per seat
//   --max-rounds 60           --json  (print raw per-game records)
//   --trade on|off            bots buy single tokens from each other (on by default)
//   --card-trade on|off       bots buy Seize cards from each other to complete a set of 4 (on by default)
//   --tokens 4 --dots 4 --thefts 12  name tokens per player, max dots per token, Seize cards in the deck (defaults = rules)
//   --cap none|N              per-turn spending cap (rules: none; the old rule was 10)
//   --endgame dig|off         dig: once the bag is empty, bots spend everything on cards and steal to attack
//   --reveal always|smart     smart: aggressors/hoarders only use role abilities when revealing leaves them enough cover
//   --enslave old|new         (rules: new) new: slaves make 2 souls a turn for their master, and any soul a slave gets goes to the master
//   --consume half|half+N|all (rules: half+4)  tokens a consume takes (half rounded up, or all), plus an N-soul bonus from the bank
//   --fate smart|fixed        smart: bots weigh enslave vs consume each time; fixed: aggressors consume, others enslave
//   --marquis-kill free|type  free: everyone kills a marked Marquis when the bonus pays back the price; type: old per-bot rule
//   --welfare double-split|poorest|half|double|richestN|lead|capturesN  poorest is the rules (everyone gives the poorest non-thrall 1); double-split etc. are earlier experiments; richestN: the richest pays N to each other player;
//                             lead: the richest gives away half their lead over 2nd; capturesN: the top capturer pays N to each other player
//   --marquis rules|instant|nobonus|both   instant: naming a Marquis correctly devours it at once; nobonus: a Marquis's devours earn no +4
//   --arrogation forced|forcedN|optionalN|off  rules = forced, 4 copies (Insubordination merged in); off = the old separate Arrogation 2 + Insubordination 2
//   --fakes N --fake-elig public|real  N blank tokens per color in the bag (rules: 0); public: blanks count toward naming eligibility, real: only real tokens do
//   --token-rounds on|off      on (old rules, removed 2026-11-12): tokens only buyable in odd rounds until the bag first empties
//   --hold-cap none|N          holding cap of N tokens (+N per thrall); return 1 blank per turn to the bag (rules: none)
//   --devour-slots N     each devour raises the devourer's holding cap by N for good (rules: 0)
//   --cap-spoils on|off  holding cap also limits the tokens you take when binding or devouring (rules: off)
//   --return-pay N --swaps on|off  holding cap: souls you get for putting a token back (rules: 1; negative = it costs); bots at the cap swap 1 token for 1
//   --set-swaps on|off   bots swap 1 token for 1 with anyone when it leaves both with tighter sets (and save souls for the fees)
//   --card-cost N        souls per event card (rules: 1)
//   --trade-fee N        souls each side pays per name token traded (rules: 3)
//   --random-token 1|2        price of a random name token (rules: 1)
//   --deck Welfare=6,Ward=8   override event card counts (card names as in the rules)
//   --replay FILE.html        record every action of every game and write a step-through viewer (use with a few --games)
//   --arch eager|patient      eager: Archduke/Duke ask as soon as possible; patient: only when the answer lets them name next
const { loadPage } = require('./page');
const { Bots, TYPES } = require('./bots');

function args() {
  const a = { games: 1000, players: '4', bots: 'mix', seed: 1, maxRounds: 60, json: false, arch: 'eager', trade: 'on', cardTrade: 'on', tokens: 4, dots: 4, thefts: 12, reveal: 'always', cap: 'none', endgame: 'dig', replay: null, randomToken: 1, fakes: 4, fakeElig: 'public', tokenRounds: 'off', holdCap: '6', capThralls: 'on', returnPay: 1, capSpoils: 'off', devourSlots: 0, swaps: 'off', setSwaps: 'off', tradeFee: 3, cardCost: 1, arrogation: 'forced', marquis: 'rules', welfare: 'poorest', enslave: 'new', consume: 'half+4', fate: 'smart', marquisKill: 'free' };
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; i++) {
    const k = v[i].replace(/^--/, '');
    if (k === 'json') a.json = true;
    else if (k === 'max-rounds') a.maxRounds = +v[++i];
    else if (k === 'card-trade') a.cardTrade = v[++i];
    else if (k === 'random-token') a.randomToken = +v[++i];
    else if (k === 'marquis-kill') a.marquisKill = v[++i];
    else if (k === 'fake-elig') a.fakeElig = v[++i];
    else if (k === 'token-rounds') a.tokenRounds = v[++i];
    else if (k === 'hold-cap') a.holdCap = v[++i];
    else if (k === 'cap-thralls') a.capThralls = v[++i];
    else if (k === 'return-pay') a.returnPay = +v[++i];
    else if (k === 'cap-spoils') a.capSpoils = v[++i];
    else if (k === 'devour-slots') a.devourSlots = +v[++i];
    else if (k === 'set-swaps') a.setSwaps = v[++i];
    else if (k === 'trade-fee') a.tradeFee = +v[++i];
    else if (k === 'card-cost') a.cardCost = +v[++i];
    else a[k] = v[++i];
  }
  a.games = +a.games; a.seed = +a.seed; a.tokens = +a.tokens; a.dots = +a.dots; a.thefts = +a.thefts; a.fakes = +a.fakes;
  return a;
}

function mulberry32(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

async function playGame(page, opts, rng) {
  const { ctx, api } = page;
  const BOT_NAMES = Object.keys(TYPES);
  const n = opts.players === 'mix' ? 3 + Math.floor(rng() * 4) : +opts.players;
  const pool = opts.bots === 'mix' ? BOT_NAMES : opts.bots.startsWith('mix:') ? opts.bots.slice(4).split(',') : null;
  const types = pool ? Array.from({ length: n }, () => pool[Math.floor(rng() * pool.length)])
    : opts.bots.includes(',') ? opts.bots.split(',').slice(0, n) : Array(n).fill(opts.bots);
  if (types.length !== n || types.some(t => !TYPES[t])) throw new Error('bad --bots: ' + opts.bots);

  ctx.__rng = rng;
  const bots = new Bots(api, types, rng);
  bots.archPolicy = opts.arch;
  bots.revealPolicy = opts.reveal;
  bots.endgame = opts.endgame;
  bots.fatePolicy = opts.fate;
  bots.marquisPolicy = opts.marquisKill;
  bots.trading = opts.trade !== 'off';
  bots.cardTrading = opts.cardTrade !== 'off';
  bots.swaps = opts.swaps === 'on';
  bots.setSwaps = opts.setSwaps === 'on';
  const rec = { n, types, theft4: 0, cardsBought: 0, trades: 0, tokenTrades: 0, tradeOffers: 0, attempts: 0, correct: 0, wrong: 0, captures: [], bagEmpty: null, shields: 0, rebOk: 0, rebFail: 0, marquisKills: 0, archQs: 0, buyRounds: [], returns: 0, setSwaps: 0 };
  ctx.__ask = o => bots.answer(o);
  rec.ownGains = {};
  rec.marked = []; rec.namings = []; rec.rebels = []; rec.revealRound = Array(n).fill(null);
  let lastNaming = {}, pendingMarquisKill = false;
  const outcome = new Map();
  const logBuf = [];
  ctx.__onLog = t => {
    if (opts.replay) logBuf.push(t);
    const S = api.S; let m;
    const id = s => +s.slice(1);
    if ((m = t.match(/(P\d) is now marked/))) rec.marked.push(id(m[1])); // can share a line with "Correct."
    if ((m = t.match(/^(P\d) named (P\d) as/))) { rec.attempts++; lastNaming = { a: id(m[1]), t: id(m[2]) }; rec.namings.push(lastNaming); }
    else if (/^Correct/.test(t)) { rec.correct++; lastNaming.ok = true; outcome.set(`${lastNaming.a}>${lastNaming.t}`, 'named'); }
    else if (/^Wrong\./.test(t)) { rec.wrong++; lastNaming.ok = false; outcome.set(`${lastNaming.t}>${lastNaming.a}`, 'backfire'); }
    else if ((m = t.match(/^(P\d) (devoured|bound) (P\d)/))) {
      m[2] = m[2] === 'devoured' ? 'consumed' : 'enslaved'; // the stats keep the old internal names
      const by = id(m[1]), victim = id(m[3]), key = `${by}>${victim}`;
      // why it happened: A named B correctly, B named A wrongly (backfire), a paid Marquis kill, or A consuming their own slave
      const cause = pendingMarquisKill ? 'marquisKill' : outcome.get(key) || (m[2] === 'consumed' ? 'ownSlave' : 'other');
      outcome.delete(key); pendingMarquisKill = false;
      rec.captures.push({ by, kind: m[2], victim, round: S.round, cause });
    }
    else if (/empty for the first time/.test(t)) rec.bagEmpty = S.round;
    else if (/raised a Ward against a correct naming/.test(t)) { // the naming was right; the capture resolves later
      rec.shields++; rec.correct++; lastNaming.ok = true; outcome.set(`${lastNaming.a}>${lastNaming.t}`, 'named');
    }
    else if (/raised a Ward against/.test(t)) rec.shields++;
    else if (/who was claiming them: the claim ends/.test(t)) rec.wardEscapes = (rec.wardEscapes || 0) + 1;
    else if (/claim on .* passes to/.test(t)) rec.claimsPassed = (rec.claimsPassed || 0) + 1;
    else if (/ bought a name token./.test(t)) { rec.buy2 = (rec.buy2 || 0) + 1; rec.buyRounds.push(S.round); }
    else if (/ paid 3 souls, drew/.test(t)) { rec.draw3 = (rec.draw3 || 0) + 1; rec.buyRounds.push(S.round); }
    else if (/returned a .* token to the bag face down/.test(t)) rec.returns = (rec.returns || 0) + 1;
    else if (/ played Scrying, drew/.test(t)) { rec.scry1 = (rec.scry1 || 0) + 1; rec.buyRounds.push(S.round); }
    else if (/discarded 2 Scrying cards and looked/.test(t)) rec.scry2 = (rec.scry2 || 0) + 1;
    else if ((m = t.match(/^(?:Insubordination|Arrogation) succeeded: (P\d)/))) { rec.rebOk++; rec.rebels.push(id(m[1])); }
    else if (/^(?:Insubordination|Arrogation) failed/.test(t)) rec.rebFail++;
    else if (/to devour the marked Marquis/.test(t)) { rec.marquisKills++; pendingMarquisKill = true; }
    else if (/compelled/.test(t)) rec.archQs++;
    else if ((m = t.match(/^(P\d) discarded 4 Seize cards and stole one of (P\d)'s tokens from (P\d)/))) {
      rec.theft4++;
      const by = S.players[id(m[1])], color = id(m[2]);
      (rec.steals || (rec.steals = [])).push({ by: by.id, color, from: id(m[3]), nowHolds: api.countColor(by, color), cands: bots.know.cands(by.id, S.players[color]).length });
    }
    else if (/bought an event card|took the Earl's free/.test(t)) rec.cardsBought++;
    else if ((m = t.match(/^Welfare: ((?:P\d(?: and )?)+) \(net worth/))) { rec.welfare = (rec.welfare || 0) + 1; (rec.welfareTo || (rec.welfareTo = [])).push(...m[1].split(' and ').map(id)); }
    else if ((m = t.match(/^Welfare: P\d had (\d+) souls and paid (\d+)/))) { (rec.welfarePaid || (rec.welfarePaid = [])).push({ r: S.round, before: +m[1], paid: +m[2] }); const g = t.match(/gives half their souls \(\d+\) to (P\d), who had the fewest/); if (g) (rec.welfareTo || (rec.welfareTo = [])).push(id(g[1])); }
    else if ((m = t.match(/gives half their souls \(\d+\) to (P\d), who had the fewest/))) (rec.welfareTo || (rec.welfareTo = [])).push(id(m[1]));
    else if (/event deck ran out and was reshuffled/.test(t)) rec.reshuffles = (rec.reshuffles || 0) + 1;
    else if (/^P\d and P\d traded/.test(t)) rec.trades++;
    else if (/declined a trade/.test(t)) rec.tradeOffers++;
    else if (/ played Restoration:/.test(t)) rec.restores = (rec.restores || 0) + 1;
    else if (/^Name tokens traded face down/.test(t)) { rec.tokenTrades++; if (/gave 1 .*gave 1 /.test(t)) rec.setSwaps++; }
    else if ((m = t.match(/^(P\d) was reborn/))) bots.know.reset(+m[1].slice(1));
  };

  api.newGame(types.map((_, i) => 'P' + i));
  const S = api.S;
  S.players.forEach(p => { p.combo = api.COMBOS[Math.floor(rng() * api.COMBOS.length)]; });
  rec.startRoles = S.players.map(p => api.baseRole(p));
  api.startGame();
  bots.know.scan();

  // replay: a full snapshot after every action (the viewer shows everything, including secret names and each bot's knowledge)
  if (opts.replay) rec.steps = [];
  const snap = (actor, act, plan) => {
    if (!opts.replay) return;
    rec.steps.push({
      round: S.round, current: S.current, actor, act, plan: { ...plan }, log: logBuf.splice(0),
      bag: S.bag.length, deck: S.deck.length, discard: S.discard.length, thefts: { deck: S.deck.filter(c => c === 'Seize').length, discard: S.discard.filter(c => c === 'Seize').length },
      players: S.players.map(p => {
        const cards = {}; p.events.forEach(c => cards[c] = (cards[c] || 0) + 1);
        const know = {}, elig = [];
        if (p.status !== 'dead') for (const t of S.players) if (t.id !== p.id && t.status !== 'dead') {
          know[t.id] = bots.know.cands(p.id, t).length;
          if (t.status === 'alive' && api.eligibility(p, t) == null) elig.push(t.id);
        }
        return { status: p.status, master: p.master, souls: p.souls, combo: p.combo, role: api.baseRole(p), revealed: !!p.revealed, marked: p.markedBy,
          cards, tokens: p.tokens.map(t => [t.owner, t.dots]), know, elig, slaves: api.slavesOf(p).length };
      }),
    });
  };
  snap(null, 'start', {});

  // mirrors the page's click handler: run the action, then the same housekeeping
  async function runAct(act, plan) {
    bots.plan = plan;
    const ownBefore = S.players.map(q => api.countColor(q, q.id)), actor = S.current;
    await api.ACT[act]();
    // which actions put players' own tokens back in their hands (by bot type; "(other)" = gained on someone else's action)
    S.players.forEach((q, i) => {
      const d = api.countColor(q, q.id) - ownBefore[i];
      if (d > 0) { const k = `${types[i]}|${act}${i === actor ? '' : ' (other)'}`; rec.ownGains[k] = (rec.ownGains[k] || 0) + d; }
    });
    if (S.spent > api.SPEND_CAP) throw new Error(`spend cap broken after ${act}: ${S.spent}`);
    if (S.phase === 'play') { api.slaveSoulSweep(); await api.capSweep(); }
    if (S.phase === 'play' && !api.checkWin()) {
      const it = api.topInt();
      if (S.players[S.current].status === 'dead' && !(it && it.target === S.current)) api.nextTurn();
    }
    bots.know.scan();
    // first round each player's role became public while they were still in the game
    for (const q of S.players) if (q.revealed && q.status !== 'dead' && rec.revealRound[q.id] == null) rec.revealRound[q.id] = S.round;
  }

  let guard = 0;
  while (S.phase === 'play' && S.round <= opts.maxRounds) {
    if (++guard > 20000) throw new Error('turn loop did not terminate');
    const p = S.players[S.current];
    const done = new Set(); bots.cardsThisTurn = 0;
    for (let step = 0; step < 300; step++) {
      const choice = bots.options(p, done);
      if (!choice) break;
      const top = S.log[0], spent = S.spent, souls = p.souls;
      await runAct(choice.act, choice.plan);
      if (choice.act === 'archQ' && p.asked.includes(choice.plan.target)) bots.know.bisect(p.id, S.players[choice.plan.target], rng);
      if (choice.act === 'buyEvent') bots.cardsThisTurn++;
      snap(p.id, choice.act, choice.plan);
      if (S.log[0] === top && S.spent === spent && p.souls === souls) done.add(choice.key || choice.act); // no effect: don't retry this turn
      if (choice.act !== 'buyEvent' && choice.act !== 'playSoul') done.add(choice.key || choice.act);
      if (S.phase !== 'play' || S.current !== p.id || p.status === 'dead') break;
    }
    if (S.phase !== 'play') break;
    if (S.current === p.id) { await runAct('endTurn', {}); snap(p.id, 'endTurn', {}); }
  }

  // same invariants as the browser tests
  const cards = S.deck.length + S.discard.length + S.players.reduce((a, p) => a + p.events.length, 0);
  const deckSize = Object.values(api.DECK_COUNTS).reduce((a, b) => a + b, 0);
  if (cards !== deckSize) throw new Error(`event cards: ${cards} of ${deckSize}`);
  if (S.players.some(p => p.souls < 0)) throw new Error('negative souls');
  for (const p of S.players) {
    const held = [...S.bag, ...S.players.flatMap(q => q.tokens)].filter(t => t.owner === p.id).length;
    if (held !== (p.status === 'dead' ? 0 : api.CFG.TOKENS + api.FAKES)) throw new Error(`player ${p.id} (${p.status}) has ${held} tokens in play`);
  }

  rec.rounds = S.round;
  rec.stalemate = S.phase !== 'over';
  rec.winner = S.phase === 'over' ? S.winner : null;
  if (rec.winner != null) {
    const w = S.players[rec.winner];
    rec.winnerType = types[rec.winner];
    rec.winnerStartRole = rec.startRoles[rec.winner];
    rec.winnerEndRole = api.baseRole(w);
  }
  const first = rec.captures[0];
  rec.firstCaptor = first ? first.by : null;
  rec.firstCaptureRound = first ? first.round : null;
  // a free player nobody else holds a token of can't be named at all
  // stalemate diagnosis: for each free player still standing, why nobody names them
  if (rec.stalemate) {
    const TYPES_ = require('./bots').TYPES;
    rec.lastCaptureRound = rec.captures.length ? rec.captures[rec.captures.length - 1].round : 0;
    rec.bagLeft = S.bag.length;
    rec.stall = S.players.filter(t => t.status === 'alive').map(t => {
      const others = S.players.filter(o => o.id !== t.id && o.status !== 'dead');
      const holders = others.filter(o => api.countColor(o, t.id) > 0);
      if (!holders.length) return 'nobody holds their tokens';
      const top = Math.max(...holders.map(o => api.countColor(o, t.id)));
      const leaders = holders.filter(o => api.countColor(o, t.id) === top);
      const eligible = leaders.filter(o => o.status === 'alive');
      if (!eligible.length) return 'only a slave holds the most';
      const conf = eligible.filter(o => { const T = TYPES_[types[o.id]]; return bots.know.cands(o.id, t).length <= (T.nameAt ?? 15); });
      if (!conf.length) {
        (rec.stuck || (rec.stuck = [])).push(...eligible.map(o => ({ namer: types[o.id], cands: bots.know.cands(o.id, t).length, held: api.countColor(o, t.id) })));
        return `eligible namers aren't confident`;
      }
      return 'a confident eligible namer exists';
    });
  }
  // where each free player's tokens sit at the end: their own hand, the most any one rival holds, spread over rivals
  // every free player's view of every other free player at the end
  rec.views = [];
  for (const a of S.players) for (const t of S.players) {
    if (a.id === t.id || a.status !== 'alive' || t.status !== 'alive') continue;
    rec.views.push({ a: a.id, aType: types[a.id], t: t.id, tType: types[t.id], held: api.countColor(a, t.id), roleKnown: !!t.revealed,
      cands: bots.know.cands(a.id, t).length, eligible: api.eligibility(a, t) == null, thefts: api.countCard(a, 'Seize'), souls: a.souls,
      slaves: api.slavesOf(a).length, cards: a.events.length, shields: api.countCard(a, 'Ward'), captured: rec.captures.filter(c => c.by === a.id).length, tokens: a.tokens.length });
  }
  rec.tokenSpread = S.players.filter(p => p.status === 'alive').map(p => {
    const others = S.players.filter(o => o.id !== p.id && o.status !== 'dead').map(o => api.countColor(o, p.id)).filter(Boolean).sort((a, b) => b - a);
    const othersReal = S.players.filter(o => o.id !== p.id && o.status !== "dead").map(o => api.countReal(o, p.id)).filter(Boolean).sort((a, b) => b - a);
    return { id: p.id, type: types[p.id], self: api.countColor(p, p.id), selfReal: api.countReal(p, p.id), othersReal, others, bag: S.bag.filter(t => t.owner === p.id).length };
  });
  rec.theftWhere = { free: S.players.filter(p => p.status === 'alive').map(p => api.countCard(p, 'Seize')),
    slaves: S.players.filter(p => p.status === 'slave').reduce((a, p) => a + api.countCard(p, 'Seize'), 0),
    deck: S.deck.filter(c => c === 'Seize').length, discard: S.discard.filter(c => c === 'Seize').length,
    deckSize: S.deck.length, deckCards: S.deck.slice(), discardSize: S.discard.length, cardsHeld: S.players.filter(p => p.status !== 'dead').map(p => p.events.length) };
  rec.theftsHeld = S.players.filter(p => p.status === 'alive').map(p => p.events.filter(c => c === 'Seize').length);
  rec.unnameable = S.players.filter(p => p.status === 'alive' && !S.players.some(o => o.id !== p.id && o.status !== 'dead' && api.countColor(o, p.id) > 0)).map(p => p.id);
  rec.unknown = bots.unknown;
  return rec;
}

const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '—';
const ci = (a, b) => b ? '±' + (196 * Math.sqrt((a / b) * (1 - a / b) / b)).toFixed(1) : '';
const median = xs => { const s = xs.filter(x => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : '—'; };

function report(recs, opts) {
  const done = recs.filter(r => !r.error), won = done.filter(r => r.winner != null);
  const L = [];
  L.push(`MADK sim · ${recs.length} games · players ${opts.players} · bots ${opts.bots} · arch ${opts.arch} · trade ${opts.trade} · card-trade ${opts.cardTrade} · ${opts.tokens} tokens 1-${opts.dots} dots · ${opts.thefts} Seize cards · reveal ${opts.reveal} · cap ${opts.cap} · endgame ${opts.endgame} · enslave ${opts.enslave} · consume ${opts.consume} · fate ${opts.fate} · marquis-kill ${opts.marquisKill} · fakes ${opts.fakes} (${opts.fakeElig}) · token rounds ${opts.tokenRounds} · hold cap ${opts.holdCap} (thrall slots ${opts.capThralls}, return pay ${opts.returnPay}, cap spoils ${opts.capSpoils}, devour slots ${opts.devourSlots}, swaps ${opts.swaps}) · set swaps ${opts.setSwaps} · trade fee ${opts.tradeFee} · card cost ${opts.cardCost} · seed ${opts.seed} · round limit ${opts.maxRounds}`);
  const errs = recs.filter(r => r.error);
  if (errs.length) L.push(`ERRORS in ${errs.length} games, first: ${errs[0].error}`);
  L.push(`Finished ${won.length} · stalemates ${done.length - won.length} (${pct(done.length - won.length, done.length)})`);
  L.push(`Rounds: median ${median(won.map(r => r.rounds))} · first capture round: median ${median(done.map(r => r.firstCaptureRound))} · bag first empty: median round ${median(done.map(r => r.bagEmpty))} (never in ${done.filter(r => r.bagEmpty == null).length})`);

  L.push('', 'Win rate by starting role (a fair role wins its share of seats)');
  L.push('  role       seats  wins   win/seat        ');
  for (const role of ['Archduke', 'Duke', 'Prince', 'Marquis', 'Earl']) {
    const seats = won.reduce((a, r) => a + r.startRoles.filter(x => x === role).length, 0);
    const wins = won.filter(r => r.winnerStartRole === role).length;
    L.push(`  ${role.padEnd(9)} ${String(seats).padStart(6)} ${String(wins).padStart(5)}   ${pct(wins, seats).padStart(6)} ${ci(wins, seats)}`);
  }
  const fair = won.length ? won.reduce((a, r) => a + 1 / r.n, 0) / won.length : 0;
  L.push(`  (fair share per seat ≈ ${(100 * fair).toFixed(1)}%)`);

  if (new Set(done.flatMap(r => r.types)).size > 1) {
    L.push('', 'Win rate by bot type');
    for (const t of Object.keys(TYPES)) {
      const seats = won.reduce((a, r) => a + r.types.filter(x => x === t).length, 0);
      const wins = won.filter(r => r.winnerType === t).length;
      if (seats) L.push(`  ${t.padEnd(9)} ${String(seats).padStart(6)} ${String(wins).padStart(5)}   ${pct(wins, seats).padStart(6)} ${ci(wins, seats)}`);
    }
  }

  L.push('', 'How winners win, by starting role (per win: rivals the winner captured, and why)');
  L.push('  role      wins  captured  by-naming  by-backfire  marquis-kill  own-slave   wrong-guesses  ever-marked  via-rebellion');
  for (const role of ['Archduke', 'Duke', 'Prince', 'Marquis', 'Earl']) {
    const ws = won.filter(r => r.winnerStartRole === role);
    if (!ws.length) continue;
    const avg = f => (ws.reduce((a, r) => a + f(r), 0) / ws.length).toFixed(2);
    const caps = (r, c) => r.captures.filter(x => x.by === r.winner && (!c || x.cause === c)).length;
    L.push(`  ${role.padEnd(9)} ${String(ws.length).padStart(4)}  ${avg(r => caps(r)).padStart(8)}  ${avg(r => caps(r, 'named')).padStart(9)}  ${avg(r => caps(r, 'backfire')).padStart(11)}  ${avg(r => caps(r, 'marquisKill')).padStart(12)}  ${avg(r => caps(r, 'ownSlave')).padStart(9)}   ${avg(r => r.namings.filter(x => x.a === r.winner && x.ok === false).length).padStart(13)}  ${pct(ws.filter(r => r.marked.includes(r.winner)).length, ws.length).padStart(11)}  ${pct(ws.filter(r => r.rebels.includes(r.winner)).length, ws.length).padStart(13)}`);
  }
  L.push('  (captured = bound or devoured by the winner; by-backfire = the victim named the winner wrongly and the winner chose their fate)');

  const withCap = won.filter(r => r.firstCaptor != null);
  const snow = withCap.filter(r => r.firstCaptor === r.winner).length;
  L.push('', `Snowballing: first player to capture someone went on to win ${pct(snow, withCap.length)} ${ci(snow, withCap.length)} of finished games (fair ≈ ${(100 * fair).toFixed(1)}%)`);

  const turtleSeats = done.reduce((a, r) => a + r.types.filter(t => t === 'turtle').length, 0);
  if (turtleSeats) {
    const caught = done.reduce((a, r) => a + r.types.filter((t, i) => t === 'turtle' && r.captures.some(c => c.victim === i)).length, 0);
    L.push(`Turtles: ${turtleSeats} turtle seats, captured in ${pct(caught, turtleSeats)}`);
  }
  const stale = done.filter(r => r.stalemate);
  if (stale.length) L.push(`Stalemates: ${pct(stale.filter(r => r.unnameable.length).length, stale.length)} end with at least one free player nobody can name`);

  const sum = k => done.reduce((a, r) => a + (r[k] || 0), 0);
  L.push('', `Naming: ${sum('attempts')} attempts, ${pct(sum('correct'), sum('attempts'))} correct · ${(sum('attempts') / Math.max(1, done.length)).toFixed(1)} per game`);
  L.push(`Trades: ${sum('tokenTrades')} token trades, ${sum('trades') - sum('tokenTrades')} card trades, ${sum('tradeOffers')} declined · ${(sum('tokenTrades') / Math.max(1, done.length)).toFixed(1)} per game`);
  { const all = done.flatMap(r => r.buyRounds.map(b => b / Math.max(1, r.rounds))); const late = all.filter(x => x > 0.5).length;
    L.push(`Token buys: ${(all.length / Math.max(1, done.length)).toFixed(1)} per game, ${pct(late, all.length)} in the second half of the game`); }
  if (sum('setSwaps')) L.push(`Set swaps (1 token for 1): ${(sum('setSwaps') / Math.max(1, done.length)).toFixed(1)} per game`);
  if (sum('restores')) L.push(`Restoration played: ${(sum('restores') / Math.max(1, done.length)).toFixed(2)} per game`);
  if (sum('returns')) L.push(`Tokens put back in the bag: ${(sum('returns') / Math.max(1, done.length)).toFixed(1)} per game`);
  L.push(`4-Seize token steals: ${(sum('theft4') / Math.max(1, done.length)).toFixed(2)} per game`);
  L.push(`Wards raised ${sum('shields')} · Insubordinations ${sum('rebOk')} won / ${sum('rebFail')} lost · marked Marquis killed ${sum('marquisKills')} · Archduke questions ${sum('archQs')}`);

  const unk = {}; done.forEach(r => Object.entries(r.unknown).forEach(([k, v]) => unk[k] = (unk[k] || 0) + v));
  if (Object.keys(unk).length) L.push('', 'Prompts the bots had no rule for (answered with the first option): ' + JSON.stringify(unk));
  return L.join('\n');
}

(async () => {
  const opts = args();
  const page = loadPage({ TOKENS: opts.tokens, MAX_DOTS: opts.dots, DECK: Object.assign({ Seize: opts.thefts }, opts.arrogation !== 'off' ? { Arrogation: +(opts.arrogation.replace(/\D/g, '') || 4) } : { Arrogation: 2, Insubordination: 2 }, Object.fromEntries((opts.deck || '').split(',').filter(Boolean).map(kv => { const [k, v] = kv.split('='); return [k, +v]; }))), SPEND_CAP: opts.cap === 'none' ? Infinity : +opts.cap,
    RANDOM_TOKEN_COST: opts.randomToken, FAKES: opts.fakes, FAKE_ELIG: opts.fakeElig, TOKEN_ROUNDS: opts.tokenRounds === 'on', HOLD_CAP: opts.holdCap === 'none' ? Infinity : +opts.holdCap, CAP_THRALL_SLOTS: opts.capThralls !== 'off', RETURN_PAY: opts.returnPay, CAP_SPOILS: opts.capSpoils === 'on', DEVOUR_SLOTS: opts.devourSlots, TRADE_FEE: opts.tradeFee, CARD_COST: opts.cardCost,
    ARROGATION_MERGE: opts.arrogation.replace(/\d+$/, ''),
    MARQUIS_INSTANT: opts.marquis === 'instant' || opts.marquis === 'both', MARQUIS_NO_BONUS: opts.marquis === 'nobonus' || opts.marquis === 'both',
    WELFARE: opts.welfare.replace(/\d+$/, ''), WELFARE_MULT: opts.welfare.startsWith('networth') ? +(opts.welfare.replace(/\D/g, '') || 2) : undefined, WELFARE_PAY: +(opts.welfare.replace(/\D/g, '') || 1),
    SLAVE_INCOME: opts.enslave === 'new' ? 2 : 1, SLAVE_SOULS_TO_MASTER: opts.enslave === 'new',
    CONSUME_TOKENS: opts.consume.startsWith('all') ? 'all' : 'half', CONSUME_BONUS: +(opts.consume.split('+')[1] || 0) });
  const recs = [];
  for (let g = 0; g < opts.games; g++) {
    const rng = mulberry32(opts.seed * 1000003 + g);
    try { recs.push(await playGame(page, opts, rng)); }
    catch (e) { recs.push({ error: `game ${g}: ${e.stack || e}` }); }
  }
  if (opts.replay) {
    const fs = require('fs'), path = require('path');
    const games = recs.map((r, g) => r.error ? null : {
      index: g, seed: opts.seed, n: r.n, types: r.types, startRoles: r.startRoles, winner: r.winner, rounds: r.rounds, stalemate: r.stalemate,
      captures: r.captures, steps: r.steps,
    }).filter(Boolean);
    const data = { setup: { tokens: opts.tokens, dots: opts.dots, thefts: opts.thefts, players: opts.players, bots: opts.bots, endgame: opts.endgame, reveal: opts.reveal }, names: page.api.NAME_OF, games };
    const tpl = fs.readFileSync(path.join(__dirname, 'replay-template.html'), 'utf8');
    fs.mkdirSync(path.dirname(path.resolve(opts.replay)), { recursive: true });
    const json = JSON.stringify(data).replace(/</g, '\\u003c'); // safe inside <script>
    fs.writeFileSync(opts.replay, tpl.replace('/*REPLAY_DATA*/null', () => json));
    console.error(`replay of ${games.length} games written to ${path.resolve(opts.replay)}`);
  }
  console.log(opts.json ? JSON.stringify(recs) : report(recs, opts));
  if (recs.some(r => r.error)) process.exitCode = 1;
})();
