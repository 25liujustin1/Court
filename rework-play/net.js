// Shared by the page (solo and online) and the online server (server.js):
// - HumanBot: how the engine asks a person's decisions (preset answers; their choices arrive with their commands)
// - runCommand: every action a player can take, as a command with plain arguments (player ids, colours, numbers),
//   checked and applied to the game. Solo play runs it in the page; online, the server runs it on the real game.
// - redact / hydrate: what one player may see of the game (their own secrets, everyone's public facts), and turning
//   that back into a Game object so the page can use the engine's own rules to show what is possible.
// - snapView: a public snapshot of the table for animations.
'use strict';
(() => {
const node = typeof require !== 'undefined' && typeof module !== 'undefined';
const E = node ? require('../sim-rework/engine') : globalThis.ReworkEngine;
const B = node ? require('../sim-rework/bots') : globalThis.ReworkBots;
const { Game, NAMES, ARCH, EARL, masksFor, coverBits, key } = E;
const { Bot, TYPES } = B;

// A person's "bot": the engine asks it for decisions; a person's own choices (duel pick, fate when naming) are set
// from their command just before the engine runs; decisions made on someone else's turn use these presets.
class HumanBot {
  constructor(type = 'you') { this.type = type; this.human = true; this.random = false; this.T = TYPES.balanced; this.nextFate = 'enslave'; this.wrongFate = 'enslave'; this.namingNow = false; this.pendingPick = null; this.autoWard = true; this.prefMask = null; }
  pickMask(g, p, opts) { return opts.includes(this.prefMask) ? this.prefMask : opts[1]; }
  cardPref(g, p, c) { return Bot.prototype.cardPref.call(this, g, p, c); }
  keepMask() { return true; }
  fate() { return this.namingNow ? this.nextFate : this.wrongFate; }
  ward() { return this.autoWard; }
  victorPick(g, W, L) {
    if (this.pendingPick !== null) { const t = L.tokens.find(t => t.c === this.pendingPick); if (t) return t; }
    return Bot.prototype.victorPick.call(this, g, W, L);
  }
  giveToken(g, p, to) { return Bot.prototype.giveToken.call(this, g, p, to); }
  giveArrogation(g, p, subs) { return subs[0]; }
  back() { return null; }
  tokenWorth() { return 1e9; }      // bots never buy from a person on their own turn; people sell on theirs
  defenceWorth() { return 0; }
}

const NAME_KEYS = new Set(NAMES.map(key));
const no = msg => ({ ok: false, msg });

// a bot's asking price for one of its tokens of colour c (null = won't sell)
function botAsk(g, q, c) { const a = Math.ceil(q.bot.ask ? q.bot.ask(g, q, c) : Infinity); return isFinite(a) && a <= 999 ? a : null; }
// what a bot offers for p's token of colour c (null = no offer)
function botBid(g, p, q, c) {
  if (q === p || !g.alive(q) || q.bot.human || q.bot.random || !q.bot.tokenWorth) return null;
  if (g.against(p, g.P[c]) || (c === q.id && !g.masked(q))) return null;
  const bid = Math.floor(c === q.id ? q.bot.defenceWorth(g, q, p) : q.bot.tokenWorth(g, q, c, g.count(q, c)));
  return bid >= 2 && q.souls >= bid ? bid : null;
}
// may p buy a token of colour c from q?
const mayBuyColour = (g, p, q, c) => !g.against(q, g.P[c]) && !(c === p.id && !g.masked(p)) && !(p.status === 'slave' && c === p.master);

// a trade offer as sent by a page: { souls, tokens: [colour...], cards: [name...] }, cleaned up
const CARD_NAMES = ['Seize', 'Collect', 'Restoration', 'Ward', 'Pact', 'Arrogation'];
function normDeal(x) {
  x = x && typeof x === 'object' ? x : {};
  const souls = Math.floor(+x.souls || 0);
  return { souls: souls >= 0 && souls <= 999 ? souls : 0,
    tokens: (Array.isArray(x.tokens) ? x.tokens : []).filter(c => Number.isInteger(c) && c >= 0 && c < 6).slice(0, 24),
    cards: (Array.isArray(x.cards) ? x.cards : []).filter(c => CARD_NAMES.includes(c)).slice(0, 30) };
}
// what a card is worth to bot q, in souls
function cardWorth(g, q, c) { if (c === 'Collect') return 3; const pref = q.bot.cardPref(g, q, c); return pref >= 9 ? 8 : pref >= 4 ? 3 : pref >= 2 ? 2 : pref > 0 ? 1 : 0; }
// does bot q accept a trade from p? q receives `give` and hands over `get`. Accepts anything worth at least what it costs them.
function botAccepts(g, q, p, give, get) {
  let v = give.souls - get.souls;
  const mine = {};                                   // q's token counts as the trade goes through
  for (const c of give.tokens) {
    const k = mine[c] ?? g.count(q, c);
    v += c === q.id ? q.bot.defenceWorth(g, q, p) / Math.max(1, give.tokens.filter(x => x === c).length) : q.bot.tokenWorth(g, q, c, k);
    mine[c] = k + 1;
  }
  for (const c of get.tokens) { const a = botAsk(g, q, c); if (a === null) return false; v -= a; }
  for (const c of give.cards) v += cardWorth(g, q, c);
  for (const c of get.cards) v -= cardWorth(g, q, c) + 1;
  return v >= 0;
}

// Run one command for player p. Returns { ok, msg?, ...result }; result fields go only to p.
// ctx keeps per-game state between commands (a draw-3 waiting for its keep).
function runCommand(g, p, cmd, a = {}, ctx = {}) {
  const P = i => (Number.isInteger(i) && i >= 0 && i < g.P.length ? g.P[i] : null);
  const looks = ctx.looks || (ctx.looks = {});
  const c = Number.isInteger(a.c) ? a.c : null;
  if (looks[p.id] && cmd !== 'draw3Keep') return no('Choose a token to keep first.');
  if (p.needMask && cmd !== 'chooseMask') return no('Choose your mask first.');
  const free = g.free(p);
  switch (cmd) {
    case 'chooseMask': {
      const m = a.m;
      if (!p.needMask || !masksFor(p.role).includes(m)) return no('You cannot choose that mask.');
      if (g.free(p) && p.mask !== null) { p.mask = m; p.lastMask = m; p.pubRoles = coverBits(m); }
      p.bot.prefMask = m; p.needMask = false; return { ok: true };
    }
    case 'collect': return { ok: g.collect(p) };
    case 'buyToken':
      if (!(free || p.status === 'slave') || p.buys >= g.C.BUY_LIMIT || p.souls < g.buyCost(p) || !g.bag.length) return no('You cannot buy a token now.');
      return { ok: true, got: g.buyTokens(p, 1) };
    case 'draw3Look': {
      const kind = a.kind === 'arch' ? 'arch' : 'buy';
      if (kind === 'buy' && !(free || p.status === 'slave')) return no('You cannot buy a token now.');
      if (kind === 'arch' && !free) return no('Only a free player may use that.');
      const look = kind === 'buy' ? g.buy3Look(p) : g.archLook(p);
      if (!look) return no('Could not draw.');
      const okList = kind === 'buy' ? g.keepable(p, look) : look.filter(t => !t.blank && g.live(t) && !(t.c === p.id && !g.masked(p)));
      looks[p.id] = { kind, look, okList };
      return { ok: true, look: look.map(t => ({ c: t.blank ? null : t.c, blank: !!t.blank, live: t.blank ? true : g.live(t), keep: okList.includes(t) })) };
    }
    case 'draw3Keep': {
      const L = looks[p.id]; if (!L) return no('Nothing to keep.');
      delete looks[p.id];
      const keep = Number.isInteger(a.i) && L.okList.includes(L.look[a.i]) ? L.look[a.i] : null;
      const kept = L.kind === 'buy' ? g.buy3Keep(p, L.look, keep) : g.archKeep(p, L.look, keep);
      return { ok: true, kept };
    }
    case 'masterBuy': return { ok: free && !!P(a.s) && c !== null && g.princeBuy(p, P(a.s), c) };
    case 'buyCard': {
      const n0 = p.cards.length, card = g.buyCard(p);
      return card ? { ok: true, card: p.cards.length > n0 ? p.cards[p.cards.length - 1] : card } : no('You cannot buy a card now.');
    }
    case 'deal': {         // a trade with another player: bots answer at once; people online get it as an offer (server.js)
      const q = P(a.q), give = normDeal(a.give), get = normDeal(a.get);
      if (!q || q.bot.human) return no('They decide for themselves: send them an offer.');
      // their cards are hidden from p: check only how many they hold, and treat asking for cards they lack as a plain decline
      if (!g.dealOk(p, q, give, get, true)) return no('That trade is not possible.');
      if (!g.dealOk(p, q, give, get) || !botAccepts(g, q, p, give, get)) return { ok: true, accepted: false };
      return { ok: g.deal(p, q, give, get), accepted: true };
    }
    case 'duel': {
      const t = P(a.t); if (!t || !g.canDuel(p, t)) return no('You cannot duel them.');
      p.bot.pendingPick = Number.isInteger(a.pick) ? a.pick : null;
      try { return { ok: true, won: g.duel(p, t) }; } finally { p.bot.pendingPick = null; }
    }
    case 'name': {
      const t = P(a.t); if (!t || !g.eligible(p, t)) return no('You cannot name them.');
      if (!NAME_KEYS.has(a.guess)) return no('That is not a name.');
      p.bot.nextFate = a.fate === 'consume' ? 'consume' : 'enslave'; p.bot.namingNow = true;
      try { const ok = g.name(p, t, a.guess); return { ok: true, correct: !!ok, guess: a.guess }; } finally { p.bot.namingNow = false; }
    }
    case 'seize': return { ok: free && !!P(a.q) && c !== null && g.seize(p, P(a.q), c) };
    case 'restore': return { ok: free && !!P(a.q) && g.restore(p, P(a.q)) };
    case 'unmask': return { ok: g.unmask(p) };
    case 'remask': return { ok: Number.isInteger(a.m) && g.remask(p, a.m) };
    case 'reveal': return { ok: g.reveal(p) };
    case 'archFree':
      if (!free || !g.has(p, ARCH, 1) || p.archFree) return no('Not now.');
      return { ok: true, got: !!g.archFree(p) };
    case 'ask': {
      const t = P(a.t); if (!free || !t || !g.alive(t)) return no('Not now.');
      const q = Number.isInteger(a.role) ? { role: a.role } : NAME_KEYS.has(a.name) ? { name: a.name } : null;
      if (!q || !g.ask(p, t, q)) return no('Not now.');
      return { ok: true, yes: q.role !== undefined ? t.role === q.role : key(t.name) === q.name };
    }
    case 'earlFree': {
      if (!free || !g.has(p, EARL, 3) || p.earlFree) return no('Not now.');
      const n0 = p.cards.length, got = g.earlFree(p);
      return { ok: true, card: got && p.cards.length > n0 ? p.cards[p.cards.length - 1] : null };
    }
    case 'earlArrogation': return { ok: g.earlArrogation(p) };
    case 'consume': return { ok: free && !!P(a.s) && g.consumeSlave(p, P(a.s)) };
    case 'rebel': { const won = g.rebel(p); return won === null ? no('Not now.') : { ok: true, won }; }
    case 'buyFreedom': return { ok: g.buyFreedom(p) };
    case 'buyBack': return { ok: g.buyBack(p) };
    default: return no('Unknown action.');
  }
}

// ---------- what one player may see ----------
const SELF_SKIP = new Set(['bot', 'tookMine', 'know', 'name', 'tokens', 'cards']);
const PUBLIC = ['id', 'souls', 'soulsIn', 'status', 'master', 'gen', 'mask', 'lastMask', 'lv3', 'roleKnown', 'pubRoles', 'buys', 'trades', 'duels', 'earlBonus', 'archFree', 'arch2', 'asked', 'earlFree', 'maskLock', 'waitTurns', 'captures', 'wins', 'needMask'];
function redact(g, viewer, all = false) {
  return {
    round: g.round, turnNo: g.turnNo, C: g.C,
    bag: g.bag.map(t => t.blank ? { blank: true } : { c: t.c, gen: t.gen, ...(all ? { d: t.d } : {}) }),
    deck: g.deck.map(x => all ? x : '?'), discard: [...g.discard],
    claims: g.claims.map(c => ({ t: c.t.id, by: c.by.id, kind: c.kind })),
    P: g.P.map(q => {
      const see = all || q.id === viewer, o = {};
      if (see) { for (const [k, v] of Object.entries(q)) if (!SELF_SKIP.has(k) && (typeof v !== 'object' || v === null)) o[k] = v; }
      else for (const k of PUBLIC) o[k] = q[k] ?? null;
      o.name = see ? [...q.name] : null;
      o.role = see || q.lv3 ? q.role : null;
      o.cards = see ? [...q.cards] : q.cards.map(() => '?');
      o.tokens = q.tokens.map(t => ({ c: t.c, gen: t.gen, d: see ? t.d : 0 }));
      o.tookMine = [...q.tookMine];
      o.know = see ? Object.fromEntries(Object.entries(q.know).map(([k, v]) => [k, { ...v, notNames: [...v.notNames] }])) : {};
      o.bot = { type: q.bot.type, human: !!q.bot.human };
      return o;
    }),
  };
}
// a Game object built from a redacted view: the engine's checks (canDuel, eligible, candidates...) work on it; it is never played
function hydrate(s) {
  const g = Object.create(Game.prototype);
  Object.assign(g, { round: s.round, turnNo: s.turnNo, C: s.C, bag: s.bag, deck: s.deck, discard: s.discard, log: [], trace: false, stats: {}, r: Math.random });
  g.P = s.P.map(q => ({ ...q, tookMine: new Set(q.tookMine), know: Object.fromEntries(Object.entries(q.know || {}).map(([k, v]) => [k, { ...v, notNames: new Set(v.notNames) }])) }));
  g.claims = s.claims.map(c => ({ t: g.P[c.t], by: g.P[c.by], kind: c.kind }));
  return g;
}
// a public snapshot of the table (for animations); `all` shows everyone's secrets (game over, or testing)
function snapView(g, idx, viewer, all = false) {
  return { round: g.round, idx, bag: g.bag.length, blanks: g.bag.filter(t => t.blank).length, deck: g.deck.length, discard: g.discard.length, noblesse: g.noblesseOver(),
    P: g.P.map(q => { const see = all || q.id === viewer; return { id: q.id, status: q.status, master: q.master, mask: q.mask, lastMask: q.lastMask, lv3: q.lv3, role: see || q.lv3 ? q.role : null, souls: q.souls, cards: q.cards.length,
      tokens: q.tokens.map(t => ({ c: t.c, d: see ? t.d : 0 })), waitTurns: q.waitTurns, name: see && q.name ? [...q.name] : null, bot: { type: q.bot.type } }; }) };
}


// ---------- backing by people ----------
// A duel is settled inside one engine step (a bot's turn, the end of a turn, a command), so the engine can't stop and wait for a
// person. Instead: run the step on a copy of the game; if a duel came up that a person could back (the engine's backRequests), ask
// them, and repeat with their answers until nobody is left to ask; then run the step on the real game with all the answers.
// The game draws its random numbers from its own state (g.rs), so the copy and the real run make exactly the same choices.

// a deep copy that keeps prototypes (Game, Bot, HumanBot), Sets and Maps, and shared references; functions are shared
function cloneGraph(root) {
  const seen = new Map();
  const c = x => {
    if (x === null || typeof x !== 'object') return x;
    if (seen.has(x)) return seen.get(x);
    if (Array.isArray(x)) { const a = []; seen.set(x, a); for (const v of x) a.push(c(v)); return a; }
    if (x instanceof Set) { const o = new Set(); seen.set(x, o); for (const v of x) o.add(c(v)); return o; }
    if (x instanceof Map) { const o = new Map(); seen.set(x, o); for (const [k, v] of x) o.set(c(k), c(v)); return o; }
    const o = Object.create(Object.getPrototypeOf(x)); seen.set(x, o);
    for (const k of Object.keys(x)) o[k] = c(x[k]);
    return o;
  };
  return c(root);
}
// step(game, ctx) does the work on whichever game it is given (look players up by id). ask(request) resolves to
// { [player id]: { side: 'a'|'d', amount } } for the people in request.who; leaving someone out means they pass.
async function withBacking(g, ctx, step, ask) {
  if (!g.P.some(q => q.bot.human && g.free(q))) return step(g, ctx);   // nobody who could back: nothing to ask
  const answers = {};
  for (let round = 0; round < 12; round++) {
    const log = g.log, on = g.on; g.log = []; g.on = null;
    const [cg, cctx] = cloneGraph([g, ctx]);
    g.log = log; g.on = on;
    cg.backAnswers = answers; cg.backRequests = []; cg.fightNo = 0; cg.trace = false;
    try { step(cg, cctx); } catch (err) { break; }   // the real run below reports any error
    const req = cg.backRequests.find(r => !(r.fno in answers));
    if (!req) break;
    answers[req.fno] = (await ask(req)) || {};
  }
  g.backAnswers = answers; g.backRequests = null; g.fightNo = 0;
  try { return step(g, ctx); } finally { g.backAnswers = null; }
}

const EXPORTS = { HumanBot, runCommand, redact, hydrate, snapView, botAsk, botBid, mayBuyColour, normDeal, botAccepts, CARD_NAMES, cloneGraph, withBacking };
if (node) module.exports = EXPORTS; else globalThis.ReworkNet = EXPORTS;
})();
