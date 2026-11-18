// Rules engine for the rework (rules-rework.md): masks, duels, souls as power.
// Standalone: the rework has no playtest page yet. Bots (bots.js) decide; this file enforces the rules.
'use strict';
(() => {   // own scope, so the browser can load engine.js and bots.js side by side

const ROLES = ['Archduke', 'Duke', 'Prince', 'Marquis', 'Earl'];
const [ARCH, DUKE, PRINCE, MARQ, EARL] = [0, 1, 2, 3, 4];

const NAMES = [];   // all 35 combinations of 4 tokens with 1-4 dots, sorted
for (let a = 1; a <= 4; a++) for (let b = a; b <= 4; b++) for (let c = b; c <= 4; c++) for (let d = c; d <= 4; d++) NAMES.push([a, b, c, d]);
const key = n => n.join('');
const roleOf = n => n.reduce((s, x) => s + x, 0) % 5;
const masksFor = role => [(role + 4) % 5, role, (role + 1) % 5];      // your role's mask and its two neighbours
const coverBits = m => (1 << ((m + 4) % 5)) | (1 << m) | (1 << ((m + 1) % 5));
const ALL_ROLES = 31;

// d20 table: weaker / stronger rounded to the nearest 5% -> faces (of 20) the stronger side wins on
const D20 = { 100: 10, 95: 11, 90: 12, 85: 12, 80: 13, 75: 14, 70: 15, 65: 16, 60: 16, 55: 17, 50: 18, 45: 18, 40: 19, 35: 19, 30: 19 };
function strongerWins(weak, strong) {
  if (strong <= 0) return 0.5;
  const q = Math.round((weak / strong) * 20) * 5;
  return q >= 100 ? 0.5 : (D20[q] ?? 20) / 20;
}
function winChance(a, b) { return a >= b ? strongerWins(b, a) : 1 - strongerWins(a, b); }

const dealEmpty = x => !x.souls && !x.tokens.length && !x.cards.length;   // one side of a trade hands over nothing

const DEFAULTS = {
  START_SOULS: 2, INCOME: 2, BUY_COST: 2, BUY_LIMIT: 2, CARD_COST: 3, UNMASK_GAIN: 4, RETURN_GAIN: 3, REMASK_COST: 6, REMASK: 'flat', MASK_LOCK: false, SLAVE_TOKENS: 'toss', NOBLESSE_END2: true,
  WIN_SOULS: 30, TRIBUTE: 1, ARROG_FREE: 'keep', BLANKS_PER_PLAYER: 1, FREEDOM_COST: 6, MAX_ROUNDS: 60, CARD_MARKET: false, OWN_REDRAW: false, NOBLESSE_STRICT: false, BACK_CAP_RICH: false, DUEL_TAKE: false, REBEL_SWAP: true, SLAVE_DISCARD: true, BLANKS_TRACK: false, BUY3: true, BUY3_COST: 6, MARQ_LV1: 'remask3', REMASK_END: 'flat', END_UNMASK: true, PRINCE_LV3: 'tribute3', MASTER_BUY: true, REINCARNATE_WAIT: 1, EARL_TRADE_CAP: 1, ARCH_LV1: 'discount', VASSAL_FREE: 'buyback', LV3_KEEP: true, BUYBACK_COST: 10, VASSAL_HOLD: 3,
  DECK: { Seize: 4, Collect: 6, Restoration: 2, Ward: 2, Pact: 2, Arrogation: 9 },
};

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

class Game {
  constructor(n, bots, seed, cfg = {}) {
    this.C = { ...DEFAULTS, ...cfg, DECK: { ...DEFAULTS.DECK, ...(cfg.DECK || {}) } };
    this.r = rng(seed); this.round = 1; this.turnNo = 0; this.log = [];
    this.stats = { duels: 0, upsets: 0, namings: 0, correct: 0, enslaves: 0, consumes: 0, reincarnations: 0, rebellions: 0, rebellionWins: 0, swaps: 0, buy3: 0, endUnmasks: 0, masterBuys: 0, princeTribute: 0, cardTrades: 0,
      vassals: 0, freedomBuys: 0, buybacks: 0, wards: 0, lastStands: 0, lastStandWins: 0, reveals: 0, unmasks: 0, remasks: 0, maskedTurns: 0, turns: 0,
      tokenBuys: 0, blanks: 0, cardBuys: 0, trades: 0, earlBonus: 0, seizes: 0, firstCapturer: null, backing: 0, tradeSouls: 0 };
    this.bag = []; this.deck = []; this.discard = []; this.claims = [];
    this.P = [];
    for (let i = 0; i < n; i++) {
      const p = { id: i, bot: bots[i], souls: this.C.START_SOULS, cards: [], tokens: [], status: 'free', master: null, gen: 0,
        mask: null, lastMask: null, lv3: false, roleKnown: false, pubRoles: ALL_ROLES, tookMine: new Set(), firstOnes: {},
        know: {}, wins: 0, captures: 0 };
      this.P.push(p);
      this.newName(p, []);
      p.startRole = p.role;
      p.mask = p.bot.pickMask(this, p, masksFor(p.role)); p.lastMask = p.mask; p.pubRoles = coverBits(p.mask);
    }
    for (let i = 0; i < n * this.C.BLANKS_PER_PLAYER; i++) this.bag.push({ blank: true });
    for (const [c, k] of Object.entries(this.C.DECK)) for (let i = 0; i < k; i++) this.deck.push(c);
    this.shuffle(this.deck);
  }
  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  pick(a) { return a[Math.floor(this.r() * a.length)]; }
  say(s) { if (this.trace) this.log.push(`R${this.round} ${s}`); }
  // public events for the web version's animations (players by id); no listener in the sim
  ev(type, data) { if (this.on) this.on(type, data); }

  // ---------- names and tokens ----------
  // New name: must contain the dots of `keep` (live tokens of this colour still in the bag); the missing pieces go into the bag.
  newName(p, keep) {
    const need = keep.map(t => t.d).sort();
    const ok = NAMES.filter(n => { const a = [...n]; return need.every(d => { const i = a.indexOf(d); if (i < 0) return false; a.splice(i, 1); return true; }); });
    p.name = this.pick(ok); p.role = roleOf(p.name);
    const rest = [...p.name]; for (const d of need) rest.splice(rest.indexOf(d), 1);
    for (const t of keep) t.gen = p.gen;
    for (const d of rest) this.bag.push({ c: p.id, d, gen: p.gen });
    this.shuffle(this.bag);
  }
  live(t) { return !t.blank && t.gen === this.P[t.c].gen && this.P[t.c].status !== 'waiting'; }
  // A colour's old tokens leave the game: holders discard them now, bag copies are thrown out when drawn.
  killColour(v) { for (const q of this.P) q.tokens = q.tokens.filter(t => t.c !== v.id); }
  count(q, c) { return q.tokens.filter(t => t.c === c).length; }
  draw(p) {            // one random draw from the bag; returns the token kept, or null (blank, dead, or own token while unmasked)
    if (!this.bag.length) return null;
    const i = Math.floor(this.r() * this.bag.length), t = this.bag[i];
    if (t.blank) { this.stats.blanks++; this.ev('draw', { p: p.id, dud: 'blank' }); return 'refund'; }
    if (!this.live(t)) { this.bag.splice(i, 1); this.ev('draw', { p: p.id, dud: 'dead', c: t.c }); return 'refund'; }
    if (t.c === p.id && !this.masked(p)) { this.ev('draw', { p: p.id, dud: 'own', c: t.c }); return this.C.OWN_REDRAW ? 'own' : 'refund'; }
    if (this.C.SLAVE_TOKENS !== 'keep' && p.status === 'slave' && (t.c === p.master || this.C.SLAVE_TOKENS.startsWith('none'))) { this.ev('draw', { p: p.id, dud: 'own', c: t.c }); return 'refund'; }   // a slave can't hold their master's tokens
    this.bag.splice(i, 1); p.tokens.push(t); this.ev('draw', { p: p.id, c: t.c }); return t;
  }
  // public: does the bag still hold a token p could keep? (token counts by colour are public)
  bagHasFor(p) { return this.bag.some(t => !t.blank && this.live(t) && !(t.c === p.id && !this.masked(p))); }
  gainToken(to, t, how) { if (this.C.SLAVE_TOKENS !== 'keep' && to.status === 'slave' && (t.c === to.master || this.C.SLAVE_TOKENS.startsWith('none'))) { this.bag.push(t); return; } to.tokens.push(t); if (how && t.c !== to.id) this.P[t.c].tookMine.add(to.id); }
  toBag(from, t) { from.tokens.splice(from.tokens.indexOf(t), 1); this.bag.push(t); this.checkVassals(); }

  // ---------- status ----------
  masked(p) { return p.status === 'slave' || p.mask !== null; }
  free(p) { return p.status === 'free'; }
  alive(p) { return p.status !== 'waiting'; }
  // Levels don't stack: masked -> Lv1 of the mask; unmasked -> Lv2 of the last mask; revealed -> Lv3 of the true role only.
  has(p, role, lv) {
    if (lv === 3) return p.lv3 && !this.masked(p) && p.role === role;
    if (lv === 1) return this.masked(p) && p.mask === role;
    return !this.masked(p) && !p.lv3 && p.lastMask === role;
  }
  subjects(m) { return this.P.filter(q => q.master === m.id && (q.status === 'slave' || q.status === 'vassal')); }
  pay(from, to, n) { n = Math.min(n, from.souls); from.souls -= n; if (to) to.souls += n; return n; }

  unmask(p) {
    if (!this.free(p) || p.mask === null) return false;
    const was = p.mask; p.mask = null; p.marqCheap = false; p.souls += this.C.UNMASK_GAIN; this.stats.unmasks++;
    let back = 0; for (const t of p.tokens.filter(t => t.c === p.id)) { this.toBag(p, t); p.souls += this.C.RETURN_GAIN; back++; }
    this.ev('maskoff', { p: p.id, mask: was, why: 'lower', back, gain: this.C.UNMASK_GAIN + back * this.C.RETURN_GAIN });
    this.say(`P${p.id} lowers their mask`); return true;
  }
  // remask price: 'flat' = REMASK_COST; 'half' = half your souls, rounded up; 'half6' = the larger of the two
  // REMASK_END (after Noblesse Oblige ends, 2 free players): 'quarter' = 25% of your souls, rounded up; 'quarter-rich' = 25% of the richest free player's souls, at least 6 (Marquis discount ignored)
  noblesseOver() { return this.P.filter(q => this.free(q)).length <= 2; }
  // END_UNMASK: once Noblesse Oblige ends, every free player is unmasked (no souls gained) and can't remask while it lasts
  dropMasks() { if (!this.C.END_UNMASK || !this.noblesseOver()) return; for (const q of this.P) if (this.free(q) && q.mask !== null) { this.ev('maskoff', { p: q.id, mask: q.mask, why: 'noblesse' }); q.mask = null; q.marqCheap = false; this.stats.endUnmasks++; this.say(`P${q.id} is unmasked (Noblesse Oblige has ended)`); } }
  remaskCost(p) { const end = this.P.filter(q => this.free(q)).length <= 2;
    if (end && this.C.REMASK_END === 'quarter') return Math.max(1, Math.ceil(p.souls / 4));
    if (end && this.C.REMASK_END === 'quarter-rich') return Math.max(this.C.REMASK_COST, Math.ceil(Math.max(...this.P.filter(q => this.free(q)).map(q => q.souls)) / 4));
    if (p.marqCheap) return 3; const h = Math.ceil(p.souls / 2); return this.C.REMASK === 'half' ? h : this.C.REMASK === 'half6' ? Math.max(h, this.C.REMASK_COST) : this.C.REMASK_COST; }
  remask(p, m) {
    const cost = this.remaskCost(p);
    if (!this.free(p) || p.mask !== null || p.souls < cost || !masksFor(p.role).includes(m) || p.maskLock > 0) return false;
    if (this.C.END_UNMASK && this.noblesseOver()) return false;   // no masks once Noblesse Oblige has ended
    p.souls -= cost; p.mask = m; p.lastMask = m; if (!this.C.LV3_KEEP) p.lv3 = false; p.marqCheap = false; this.stats.remasks++;
    p.pubRoles &= coverBits(m); this.say(`P${p.id} remasks as ${ROLES[m]}`); this.ev('maskon', { p: p.id, mask: m }); return true;
  }
  reveal(p) {
    if (!this.free(p) || this.masked(p) || p.lv3) return false;
    p.lv3 = true; p.roleKnown = true; p.pubRoles = 1 << p.role; this.stats.reveals++;
    this.say(`P${p.id} reveals: ${ROLES[p.role]}`); this.ev('reveal', { p: p.id, role: p.role }); return true;
  }

  // ---------- buying ----------
  // Archduke Lv. 1 as ARCH_LV1 'discount': token buys cost 1 soul less (draw-3 too)
  archOff(p) { return this.C.ARCH_LV1 === 'discount' && this.has(p, ARCH, 1) ? 1 : 0; }
  buyCost(p) { return this.C.BUY_COST - this.archOff(p); }
  buy3Cost(p) { return this.C.BUY3_COST - this.archOff(p); }
  buyTokens(p, n) {
    let got = 0, tries = 0;
    while (got < n && p.buys < this.C.BUY_LIMIT && p.souls >= this.buyCost(p) && this.bag.length && tries++ < 12) {
      p.buys++;
      const t = this.draw(p);
      if (t === 'own') { p.buys--; continue; }   // OWN_REDRAW: drawing your own token while unmasked doesn't use up the draw
      if (t && t !== 'refund') { p.souls -= this.buyCost(p); got++; this.stats.tokenBuys++; this.say(`P${p.id} buys a token (P${t.c})`); } else this.say(`P${p.id} draws a dud (refunded)`);
    }
    return got;
  }
  cardCost(p) { return this.has(p, EARL, 1) ? 2 : this.C.CARD_COST; }
  topCard() { if (!this.deck.length && this.discard.length) { this.deck = this.shuffle(this.discard.splice(0)); } return this.deck.shift(); }
  buyCard(p) {
    const cost = this.cardCost(p); if (p.souls < cost) return null;
    if (this.has(p, EARL, 2)) {                     // draw 2, keep 1, the other to the bottom
      const a = this.topCard(), b = this.topCard(); if (!a) return null;
      p.souls -= cost; this.stats.cardBuys++;
      const keep = b && p.bot.cardPref(this, p, b) > p.bot.cardPref(this, p, a) ? b : a, back = keep === a ? b : a;
      if (back) this.deck.push(back); this.gotCard(p, keep); this.ev('card', { p: p.id }); return keep;
    }
    const c = this.topCard(); if (!c) return null;
    p.souls -= cost; this.stats.cardBuys++; this.gotCard(p, c); this.say(`P${p.id} buys an event card`); this.ev('card', { p: p.id }); return c;
  }
  // a free player who draws Arrogation: 'keep' it, or 'give' it to a slave (discard if none; a true Earl may keep it)
  gotCard(p, c) {
    if (c !== 'Arrogation' || p.status !== 'free' || this.C.ARROG_FREE === 'keep' || p.role === EARL) { p.cards.push(c); return; }
    const subs = this.P.filter(q => q.status === 'slave' || q.status === 'vassal');
    if (subs.length) p.bot.giveArrogation(this, p, subs).cards.push(c); else this.discard.push(c);
  }
  hasCard(p, c, n = 1) { return p.cards.filter(x => x === c).length >= n; }
  useCard(p, c, n = 1) { for (let i = 0; i < n; i++) { p.cards.splice(p.cards.indexOf(c), 1); this.discard.push(c); } this.ev('play', { p: p.id, card: c, n }); }
  collect(p) { if (!this.hasCard(p, 'Collect')) return false; this.useCard(p, 'Collect'); p.souls += 3; this.ev('souls', { p: p.id, n: 3 }); this.say(`P${p.id} trades in Collect for 3 souls`); return true; }
  seize(p, v, c) {
    if (!this.hasCard(p, 'Seize', 2) || v === p || !this.alive(v) || !this.count(v, c) || this.against(p, v)) return false;
    this.useCard(p, 'Seize', 2); this.stats.seizes++;
    const t = this.pick(v.tokens.filter(t => t.c === c)); v.tokens.splice(v.tokens.indexOf(t), 1); this.gainToken(p, t, 'seize'); this.ev('move', { from: v.id, to: p.id, c }); this.say(`P${p.id} plays Seize: takes a P${c} token from P${v.id}`); this.checkVassals(); return true;
  }
  restore(p, h) {
    if (!this.hasCard(p, 'Restoration') || !this.count(h, p.id)) return false;
    this.useCard(p, 'Restoration'); this.toBag(h, this.pick(h.tokens.filter(t => t.c === p.id))); this.ev('tobag', { from: h.id, c: p.id }); this.say(`P${p.id} plays Restoration on P${h.id}`); return true;
  }
  // a token trade: buyer pays seller `price` souls for one token of colour c, passed face down
  trade(buyer, seller, c, price) {
    // anyone alive may trade; a slave or vassal may not sell their master's tokens (that would act against the master)
    if (!this.alive(buyer) || !this.alive(seller) || buyer.souls < price || !this.count(seller, c) || (c === buyer.id && !this.masked(buyer))) return false;
    if (this.against(seller, this.P[c])) return false;
    this.pay(buyer, seller, price); buyer.trades = (buyer.trades || 0) + 1;
    const t = this.pick(seller.tokens.filter(t => t.c === c)); seller.tokens.splice(seller.tokens.indexOf(t), 1); this.gainToken(buyer, t, 'trade');
    this.stats.trades++; this.ev('trade', { buyer: buyer.id, seller: seller.id, c, price }); this.say(`P${buyer.id} buys a P${c} token from P${seller.id} for ${price}`);
    for (const e of [buyer, seller]) if (this.has(e, EARL, 1) && e.earlBonus < this.C.EARL_TRADE_CAP) { e.earlBonus++; e.souls += 2; this.stats.earlBonus++; }
    return true;
  }
  // ---- general trades: any mix of souls, name tokens (by colour, face down) and event cards, either way; one side may be empty (a gift) ----
  // give = what a hands to b, get = what b hands to a: { souls, tokens: [colour, ...], cards: [name, ...] }
  canPass(from, to, c) {   // may a token of colour c pass from `from` to `to`?
    if (this.against(from, this.P[c])) return false;                         // a slave or vassal may not hand over their master's tokens
    if (c === to.id && !this.masked(to)) return false;                       // no collecting your own tokens while unmasked
    if (to.status === 'slave' && (c === to.master || this.C.SLAVE_TOKENS.startsWith('none'))) return false;   // the token would only go to the bag
    return true;
  }
  // blind: b's cards are hidden (a player's view), so only their number is checked
  dealOk(a, b, give, get, blind = false) {
    if (!a || !b || a === b || !this.alive(a) || !this.alive(b)) return false;
    const side = (from, to, x, hidden) => {
      if (!(Number.isInteger(x.souls) && x.souls >= 0 && x.souls <= from.souls)) return false;
      const n = {}; for (const c of x.tokens) n[c] = (n[c] || 0) + 1;
      for (const c in n) if (this.count(from, +c) < n[c] || !this.canPass(from, to, +c)) return false;
      if (hidden) return x.cards.length <= from.cards.length;
      const k = {}; for (const c of x.cards) k[c] = (k[c] || 0) + 1;
      for (const c in k) if (!this.hasCard(from, c, k[c])) return false;
      return true;
    };
    return !(dealEmpty(give) && dealEmpty(get)) && side(a, b, give, false) && side(b, a, get, blind);
  }
  deal(a, b, give, get) {
    if (!this.dealOk(a, b, give, get)) return false;
    const empty = dealEmpty;
    const move = (from, to, x) => {
      this.pay(from, to, x.souls);
      for (const c of x.tokens) { const t = this.pick(from.tokens.filter(t => t.c === c)); from.tokens.splice(from.tokens.indexOf(t), 1); this.gainToken(to, t, 'trade'); }
      for (const c of x.cards) { from.cards.splice(from.cards.indexOf(c), 1); to.cards.push(c); }
    };
    move(a, b, give); move(b, a, get);
    a.trades = (a.trades || 0) + 1;
    if (give.tokens.length || get.tokens.length) this.stats.trades++;
    if (give.cards.length || get.cards.length) this.stats.cardTrades = (this.stats.cardTrades || 0) + 1;
    const pub = x => ({ souls: x.souls, tokens: [...x.tokens], cards: x.cards.length });   // cards pass face down
    this.ev('deal', { a: a.id, b: b.id, give: pub(give), get: pub(get) });
    const desc = x => [x.souls && `${x.souls} souls`, x.tokens.length && `${x.tokens.length} token(s)`, x.cards.length && `${x.cards.length} card(s)`].filter(Boolean).join(', ') || 'nothing';
    this.say(`P${a.id} trades with P${b.id}: gives ${desc(give)}, gets ${desc(get)}`);
    // Earl Lv. 1: only a real trade (both sides hand something over) pays the bonus; a gift does not
    if (!empty(give) && !empty(get)) for (const e of [a, b]) if (this.has(e, EARL, 1) && e.earlBonus < this.C.EARL_TRADE_CAP) { e.earlBonus++; e.souls += 2; this.stats.earlBonus++; }
    this.checkVassals();
    return true;
  }
  // card trade (CARD_MARKET): buyer pays seller for one card
  tradeCard(buyer, seller, c, price) {
    if (!this.alive(buyer) || !this.alive(seller) || buyer === seller || buyer.souls < price || !this.hasCard(seller, c)) return false;
    seller.cards.splice(seller.cards.indexOf(c), 1); this.pay(buyer, seller, price); buyer.cards.push(c);
    this.stats.cardTrades = (this.stats.cardTrades || 0) + 1; return true;
  }
  archFree(p) { if (this.C.ARCH_LV1 !== 'free' || !this.has(p, ARCH, 1) || p.archFree) return false; p.archFree = true; const t = this.draw(p); return t && t !== 'refund' && t !== 'own'; }
  archDraw3(p, want) {
    const look = this.archLook(p); if (!look) return false;
    return this.archKeep(p, look, look.filter(t => !t.blank && this.live(t) && !(t.c === p.id && !this.masked(p))).sort((a, b) => want(b) - want(a))[0]);
  }
  archLook(p) {
    if (!this.has(p, ARCH, 2) || p.arch2 || p.souls < 2 || !this.bag.length) return null;
    p.arch2 = true; p.souls -= 2;
    const look = []; for (let i = 0; i < 3 && this.bag.length; i++) look.push(this.bag.splice(Math.floor(this.r() * this.bag.length), 1)[0]);
    return look;
  }
  archKeep(p, look, keep) {
    for (const t of look) if (t !== keep) { if (t.blank || this.live(t)) this.bag.push(t); }
    if (keep) { p.tokens.push(keep); this.say(`P${p.id} (Archduke) draws 3 and keeps a P${keep.c} token`); this.ev('draw', { p: p.id, c: keep.c, three: true }); }
    return !!keep;
  }
  // BUY3 (rules since 2026-11-15): pay 6 souls, draw 3, keep 1 by colour, the rest go back; counts as 1 of your 2 buys; refund if none can be kept
  buy3(p, want) {
    const look = this.buy3Look(p); if (!look) return false;
    return this.buy3Keep(p, look, this.keepable(p, look).sort((a, b) => want(b) - want(a))[0]);
  }
  keepable(p, look) { return look.filter(t => !t.blank && this.live(t) && !(t.c === p.id && !this.masked(p)) && !(p.status === 'slave' && t.c === p.master)); }
  buy3Look(p) {
    if (!this.C.BUY3 || p.buys >= this.C.BUY_LIMIT || p.souls < this.buy3Cost(p) || !this.bag.length) return null;
    p.buys++; this.stats.buy3++;
    const look = []; for (let i = 0; i < 3 && this.bag.length; i++) look.push(this.bag.splice(Math.floor(this.r() * this.bag.length), 1)[0]);
    return look;
  }
  buy3Keep(p, look, keep) {
    for (const t of look) if (t !== keep && (t.blank || this.live(t))) this.bag.push(t);   // dead tokens are discarded
    if (!keep) { this.say(`P${p.id} draws 3, keeps none (refunded)`); this.ev('draw', { p: p.id, dud: 'blank', three: true }); return false; }
    p.souls -= this.buy3Cost(p); this.stats.tokenBuys++; p.tokens.push(keep); this.ev('draw', { p: p.id, c: keep.c, three: true }); this.say(`P${p.id} draws 3 and keeps a P${keep.c} token`); return true;
  }
  // Archduke Lv3: one yes/no question per round. Kinds: role (is your role r?) or name (is your name n?)
  ask(p, t, q) {
    if (!this.has(p, ARCH, 3) || p.asked || t === p) return false;
    p.asked = true; const k = (p.know[t.id] ||= { gen: t.gen, roles: ALL_ROLES, notNames: new Set() });
    if (k.gen !== t.gen) { k.gen = t.gen; k.roles = ALL_ROLES; k.notNames = new Set(); }
    if (q.role !== undefined) { if (t.role === q.role) k.roles = 1 << q.role; else k.roles &= ~(1 << q.role); }
    else if (key(t.name) === q.name) { k.roles = 1 << t.role; k.name = q.name; } else k.notNames.add(q.name);
    return true;
  }
  // what observer o knows about target t's role (public mask history and reveals, plus private Archduke answers)
  rolesKnown(o, t) { const k = o.know[t.id]; return k && k.gen === t.gen ? (t.pubRoles & k.roles) || t.pubRoles : t.pubRoles; }
  notNames(o, t) { const k = o.know[t.id]; return k && k.gen === t.gen ? k.notNames : new Set(); }

  // ---------- duels ----------
  against(a, b) { return (a.status === 'slave' || a.status === 'vassal') && a.master === b.id; }   // a may not act against their master
  canDuel(p, t) {
    if (p === t || !this.alive(t) || !this.alive(p) || p.duels <= 0 || this.against(p, t)) return false;
    if (this.has(p, DUKE, 2) || this.has(p, DUKE, 3)) return true;
    if (this.C.NOBLESSE_END2 && this.free(p) && this.free(t) && this.P.filter(q => this.free(q)).length <= 2) return true;   // Noblesse Oblige ends with 2 free players
    if (t.souls > p.souls || Math.abs(t.souls - p.souls) <= 2) return true;
    if (this.C.NOBLESSE_STRICT) return false;   // NOBLESSE_STRICT: no token exceptions (3+ tokens, actively trading)
    return this.count(p, t.id) >= 3 || p.tookMine.has(t.id);
  }
  strength(p, role) { let s = p.souls; if (this.has(p, DUKE, 1)) s *= 1.25; if (role === 'def' && this.has(p, MARQ, 2)) s *= 1.5; return s; }
  // Resolve a duel; returns true if `a` (the challenger) wins. opts: { cap: max win chance for a, rebellion, lastStand }
  fight(a, d, opts = {}) {
    this.stats.duels++;
    let sa = this.strength(a, 'att'), sd = this.strength(d, 'def');
    const cap = Math.floor((this.C.BACK_CAP_RICH ? Math.max(a.souls, d.souls) : d.souls) / 2), back = { a: [], d: [] }, used = { a: 0, d: 0 };
    for (const q of this.P) {
      if (q === a || q === d || !this.free(q)) continue;
      const b = q.bot.back(this, q, a, d); if (!b || b.amount <= 0) continue;
      const side = b.side; if (this.against(q, side === 'a' ? d : a)) continue;
      const amt = Math.min(b.amount, q.souls, cap - used[side]); if (amt <= 0) continue;
      q.souls -= amt; used[side] += amt; back[side].push([q, amt]); this.stats.backing += amt;
    }
    sa += used.a; sd += used.d;
    let pa = winChance(sa, sd); if (opts.cap !== undefined) pa = Math.min(pa, opts.cap);
    const aw = this.r() < pa;
    this.ev('duel', { a: a.id, d: d.id, sa, sd, pa, aw, kind: opts.rebellion ? 'rebellion' : opts.lastStand ? 'last stand' : 'duel', backA: used.a, backD: used.d });
    if ((aw && pa < 0.5) || (!aw && pa > 0.5)) this.stats.upsets++;
    const W = aw ? a : d, ws = aw ? 'a' : 'd', ls = aw ? 'd' : 'a';
    for (const [q, amt] of back[ws]) q.souls += amt;
    for (const [q, amt] of back[ls]) { if (this.has(q, PRINCE, 1)) q.souls += amt; else W.souls += amt; }
    this.say(`P${a.id} duels P${d.id} (${sa.toFixed(1)} vs ${sd.toFixed(1)}, ${Math.round(pa * 100)}%): P${W.id} wins`);
    return aw;
  }
  duel(p, t) {
    if (!this.canDuel(p, t)) return null;
    p.duels--;
    const vassalize = this.has(p, PRINCE, 2) && this.count(p, t.id) >= 3 && this.free(t);
    const aw = this.fight(p, t);
    const W = aw ? p : t, L = aw ? t : p;
    this.loseDuel(W, L);
    if (aw && this.has(p, DUKE, 3) && t.tokens.length) { const g = t.bot.giveToken(this, t, p); if (g) { t.tokens.splice(t.tokens.indexOf(g), 1); this.gainToken(p, g); } }
    if (aw && vassalize && this.free(t)) { this.subjugate(p, t, 'vassal'); this.stats.vassals++; }
    return aw;
  }
  loseDuel(W, L) {
    if (this.masked(L) && L.status !== 'slave') {
      // Marquis Lv1: 'keep' (old) pays 3 to stay masked; 'remask3' (rules since 2026-11-15) makes the next remask cost 3
      if (this.C.MARQ_LV1 === 'keep' && this.has(L, MARQ, 1) && L.souls >= 3 && L.bot.keepMask(this, L)) { L.souls -= 3; return; }
      if (this.C.MARQ_LV1 === 'remask3' && this.has(L, MARQ, 1)) L.marqCheap = true;
      this.ev('maskoff', { p: L.id, mask: L.mask, why: 'duel' }); L.mask = null; this.say(`P${L.id} loses their mask`);
      // MASK_LOCK: a mask lost in a duel can't be replaced until the end of your next turn
      if (this.C.MASK_LOCK) L.maskLock = this.cur === L ? 2 : 1;
      return;
    }
    if (!L.tokens.length) return;
    const t = W.bot.victorPick(this, W, L);
    // DUEL_TAKE: the victor takes the token instead of sending it to the bag (an unmasked victor's own colour still goes to the bag)
    if (this.C.DUEL_TAKE && !(t.c === W.id && !this.masked(W)) && this.free(W)) { L.tokens.splice(L.tokens.indexOf(t), 1); this.gainToken(W, t, 'duel'); this.ev('move', { from: L.id, to: W.id, c: t.c }); }
    else { this.toBag(L, t); this.ev('tobag', { from: L.id, c: t.c }); }
  }

  // ---------- naming ----------
  eligible(p, t) {
    if (!this.free(p) || this.masked(p) || !this.alive(t) || this.masked(t) || p === t || this.against(p, t) || this.claims.some(c => c.t === t)) return false;
    const mine = this.count(p, t.id); let most = 0;
    for (const q of this.P) if (q !== t && q !== p) most = Math.max(most, this.count(q, t.id));
    return (mine >= 1 && mine >= most) || (most === 0 && mine === 0);
  }
  candidates(p, t) {
    const seen = p.tokens.filter(x => x.c === t.id).map(x => x.d), roles = this.rolesKnown(p, t), no = this.notNames(p, t);
    return NAMES.filter(n => (roles >> roleOf(n)) & 1 && !no.has(key(n)) && (() => { const a = [...n]; return seen.every(d => { const i = a.indexOf(d); if (i < 0) return false; a.splice(i, 1); return true; }); })());
  }
  name(p, t, guessKey) {
    if (!this.eligible(p, t)) return null;
    this.stats.namings++;
    const cands = this.candidates(p, t), guess = guessKey ? guessKey.split('').map(Number) : cands.length ? this.pick(cands) : this.pick(NAMES);
    const ok = key(guess) === key(t.name);
    this.ev('name', { p: p.id, t: t.id, ok, guess: key(guess) });
    this.say(`P${p.id} tries to name P${t.id}: ${ok ? 'correct' : 'wrong'}`);
    if (ok) {
      this.stats.correct++;
      if (t.lv3 && t.role === MARQ) {              // Marquis Lv3: +6 souls and a Ward, then a duel for their life
        this.say(`P${t.id} is a revealed Marquis: +6 souls, then a last stand after their next turn`); t.souls += 6; this.stats.lastStands++; this.claims.push({ t, by: p, kind: 'lastStand' }); return true;
      }
      const kind = this.fateFor(p, t, p.bot.fate(this, p, t));
      if (this.hasCard(t, 'Ward') && t.bot.ward(this, t)) { this.say(`P${t.id} plays Ward`); this.useCard(t, 'Ward'); this.stats.wards++; this.claims.push({ t, by: p, kind }); return true; }
      this.capture(p, t, kind); return true;
    }
    const kind = this.fateFor(t, p, t.bot.fate(this, t, p));
    if (kind === 'enslave') for (const x of p.tokens.filter(x => x.c === t.id)) this.toBag(p, x);
    this.capture(t, p, kind); return false;
  }
  fateFor(m, v, want) {   // role restrictions on the fate
    if (v.lv3 && v.role === MARQ && !this.masked(v)) return 'consume';   // a revealed Marquis can't be enslaved; this beats a revealed Prince's "may not consume"
    if (this.has(m, PRINCE, 3)) return 'enslave';
    return want;
  }
  capture(m, v, kind) {
    if (this.stats.firstCapturer === null) this.stats.firstCapturer = m.id;
    m.captures++;
    for (const c of this.claims) if (c.by === v) { if (c.t === m) c.dead = true; else c.by = m; }
    this.claims = this.claims.filter(c => !c.dead && c.t !== v);
    for (const s of this.subjects(v)) s.master = m.id;        // slaves can't have slaves: v's subjects move to m
    if (kind === 'enslave') this.subjugate(m, v, 'slave'); else this.consume(m, v);
  }
  subjugate(m, v, status) {
    v.status = status; v.master = m.id; if (status === 'slave' || !this.C.LV3_KEEP) v.lv3 = false;   // a vassal keeps their name, so a reveal stays
    // SLAVE_TOKENS 'master': the new slave's held tokens pass to the master (the master's own colour goes back to the bag)
    // SLAVE_TOKENS 'toss' (rules): the master's tokens go back to the bag, the slave keeps the rest; 'master': the rest pass to the master too
    if (status === 'slave' && this.C.SLAVE_TOKENS === 'master') for (const t of v.tokens.splice(0)) { if (t.c === m.id) this.bag.push(t); else m.tokens.push(t); }
    if (status === 'slave' && this.C.SLAVE_TOKENS === 'none-master') for (const t of v.tokens.splice(0)) { if (t.c === m.id) this.bag.push(t); else m.tokens.push(t); }
    if (status === 'slave' && this.C.SLAVE_TOKENS === 'none-bag') for (const t of v.tokens.splice(0)) this.bag.push(t);
    if (status === 'slave' && this.C.SLAVE_TOKENS === 'toss') for (const t of v.tokens.filter(t => t.c === m.id)) this.toBag(v, t);
    // SLAVE_DISCARD (rules): a slave's tokens leave the game, as for a consumed player (bumping gen makes bag copies dead)
    if (status === 'slave' && this.C.SLAVE_DISCARD) { this.killColour(v); v.gen++; }
    // BLANKS_TRACK: 1 blank per free player — a blank leaves the bag when someone is enslaved
    if (status === 'slave' && this.C.BLANKS_TRACK) { const i = this.bag.findIndex(t => t.blank); if (i >= 0) this.bag.splice(i, 1); }
    this.ev('enslave', { m: m.id, v: v.id, status });
    if (status === 'slave') { this.stats.enslaves++; v.mask = v.bot.pickMask(this, v, masksFor(v.role)); v.lastMask = v.mask; v.pubRoles &= coverBits(v.mask); }
    for (const s of this.subjects(v)) if (s !== v) s.master = m.id;
    this.tossMasterTokens(m);
    this.say(`P${m.id} ${status === 'slave' ? 'enslaves' : 'vassalizes'} P${v.id}`);
  }
  // a slave can never hold their master's tokens (SLAVE_TOKENS 'toss' or 'master')
  tossMasterTokens(m) { if (this.C.SLAVE_TOKENS !== 'keep') for (const s of this.subjects(m)) if (s.status === 'slave') for (const t of s.tokens.filter(t => t.c === m.id)) this.toBag(s, t); }
  consume(m, v) {
    this.stats.consumes++; this.ev('consume', { m: m.id, v: v.id, souls: Math.floor(v.souls / 2) });
    m.souls += Math.floor(v.souls / 2); v.souls = 0;
    m.cards.push(...v.cards.splice(0));
    for (const t of v.tokens.splice(0)) this.bag.push(t);
    for (const s of this.subjects(v)) s.master = m.id;
    this.tossMasterTokens(m);
    this.killColour(v); v.status = 'waiting'; v.waitTurns = this.C.REINCARNATE_WAIT; v.master = null; v.mask = null; v.lv3 = false;
    this.say(`P${m.id} consumes P${v.id}`);
  }
  // a master may consume their slave; a revealed Prince (Lv3) may not
  consumeSlave(m, s) { if (s.master !== m.id || s.status !== 'slave' || this.has(m, PRINCE, 3)) return false; this.capture(m, s, 'consume'); return true; }
  // a new name for a living player (rebellion or a Marquis's last stand); old tokens leave the game
  rebirth(p) {
    this.killColour(p); p.gen++;
    this.bag = this.bag.filter(t => t.blank || t.c !== p.id || t.gen === p.gen);
    this.newName(p, []); p.lv3 = false; p.pubRoles = p.mask !== null ? coverBits(p.mask) : ALL_ROLES; p.roleKnown = false;
    if (p.mask !== null && !masksFor(p.role).includes(p.mask)) { p.mask = p.bot.pickMask(this, p, masksFor(p.role)); p.lastMask = p.mask; p.pubRoles = coverBits(p.mask); }
  }
  reincarnate(p) {
    const g0 = p.gen; p.gen++;
    const keep = this.bag.filter(t => !t.blank && t.c === p.id && t.gen === g0);   // only live tokens must be part of the new name
    this.bag = this.bag.filter(t => t.blank || t.c !== p.id); this.bag.push(...keep);
    this.newName(p, keep);
    p.status = 'free'; p.souls = this.C.START_SOULS; p.lv3 = false; p.roleKnown = false;
    p.mask = p.bot.pickMask(this, p, masksFor(p.role)); p.lastMask = p.mask; p.pubRoles = coverBits(p.mask);
    this.stats.reincarnations++; this.say(`P${p.id} reincarnates`); this.ev('reincarnate', { p: p.id });
  }
  // Arrogation: a slave (or vassal) duels their master; win = freedom and a new name, lose = master takes half their souls
  rebel(s) {
    if ((s.status !== 'slave' && s.status !== 'vassal') || !this.hasCard(s, 'Arrogation')) return null;
    s.prevStatus = s.status;
    this.useCard(s, 'Arrogation'); this.stats.rebellions++; this.ev('rebel', { s: s.id, m: s.master }); this.say(`P${s.id} plays Arrogation against P${s.master}`);
    const m = this.P[s.master];
    const won = this.fight(s, m, { rebellion: true });
    if (won) {
      this.stats.rebellionWins++; s.status = 'free'; s.master = null;
      if (this.C.BLANKS_TRACK) this.bag.push({ blank: true });   // a freed slave's blank comes back (a swap then removes one again)
      if (s.mask === null) s.mask = s.lastMask; this.rebirth(s);
      // REBEL_SWAP (rules): a slave who wins swaps places with the master (not for vassals, or a master who can't be enslaved)
      if (this.C.REBEL_SWAP && !(m.lv3 && m.role === MARQ && !this.masked(m)) && s.prevStatus === 'slave') { this.stats.swaps++; this.ev('swap', { a: s.id, b: m.id }); this.capture(s, m, 'enslave'); }
    } else this.pay(s, m, Math.floor(s.souls / 2));
    return won;
  }
  // VASSAL_FREE 'buyback' (rules since 2026-11-17): a vassal buys their own tokens back from their Prince, BUYBACK_COST each
  // (the Prince must sell), and is free once the Prince holds fewer than VASSAL_HOLD of them. 'flat': buy freedom for FREEDOM_COST.
  buyBack(v) {
    if (this.C.VASSAL_FREE !== 'buyback' || v.status !== 'vassal' || v.souls < this.C.BUYBACK_COST) return false;
    const m = this.P[v.master]; if (!this.count(m, v.id)) return false;
    this.pay(v, m, this.C.BUYBACK_COST);
    const t = this.pick(m.tokens.filter(t => t.c === v.id)); m.tokens.splice(m.tokens.indexOf(t), 1); v.tokens.push(t);
    this.stats.buybacks++;
    this.ev('trade', { buyer: v.id, seller: m.id, c: v.id, price: this.C.BUYBACK_COST }); this.say(`P${v.id} buys back a token from P${m.id}`);
    this.checkVassals(); return true;
  }
  // vassals whose Prince no longer holds enough of their tokens go free
  checkVassals() {
    if (this.C.VASSAL_FREE !== 'buyback') return;
    for (const v of this.P) if (v.status === 'vassal' && this.count(this.P[v.master], v.id) < this.C.VASSAL_HOLD) {
      this.say(`P${v.id} is no longer a vassal of P${v.master}`); this.ev('freed', { p: v.id, m: v.master }); v.status = 'free'; v.master = null; this.stats.freedomBuys++;
    }
  }
  buyFreedom(v) { if (this.C.VASSAL_FREE !== 'flat' || v.status !== 'vassal' || v.souls < this.C.FREEDOM_COST) return false; this.pay(v, this.P[v.master], this.C.FREEDOM_COST); v.status = 'free'; v.master = null; this.stats.freedomBuys++; return true; }
  // MASTER_BUY (rules since 2026-11-15): any master may pay their slave 2 souls for a token of a chosen colour; counts as one of the master's 2 token buys
  princeBuy(p, s, c) {
    const any = this.C.MASTER_BUY && s.status === 'slave';
    if (!(any || this.has(p, PRINCE, 3)) || s.master !== p.id || p.souls < 2 || !this.count(s, c)) return false;
    if (any && p.buys >= this.C.BUY_LIMIT) return false;
    if (any) p.buys++; this.stats.masterBuys++;
    this.pay(p, s, 2); const t = this.pick(s.tokens.filter(t => t.c === c)); s.tokens.splice(s.tokens.indexOf(t), 1); p.tokens.push(t); this.ev('trade', { buyer: p.id, seller: s.id, c, price: 2 }); this.say(`P${p.id} buys a P${c} token from their slave P${s.id}`);
    return true;
  }
  earlArrogation(p) {
    if (p.role !== EARL || !this.hasCard(p, 'Arrogation', 2) || this.masked(p)) return false;
    if (!p.lv3) this.reveal(p);
    this.useCard(p, 'Arrogation', 2); p.souls += 7; this.ev('souls', { p: p.id, n: 7 }); this.say(`P${p.id} discards 2 Arrogation for 7 souls`); return true;
  }
  earlFree(p) { if (!this.has(p, EARL, 3) || p.earlFree) return false; p.earlFree = true; const c = this.topCard(); if (c) { this.gotCard(p, c); this.ev('card', { p: p.id }); } return !!c; }

  resolveClaims(p) {      // claims on p resolve at the end of p's next turn
    for (const c of this.claims.filter(c => c.t === p)) {
      this.claims.splice(this.claims.indexOf(c), 1);
      if (!this.alive(c.by) || !this.alive(p)) continue;
      const by = c.by.status === 'free' ? c.by : this.P[c.by.master] || c.by;
      if (by === p) continue;
      if (c.kind === 'lastStand') {
        const won = this.fight(p, by, { cap: 0.5, lastStand: true });
        if (won) { this.stats.lastStandWins++; this.rebirth(p); } else this.capture(by, p, 'consume');
      } else this.capture(by, p, this.fateFor(by, p, c.kind));
    }
  }

  // ---------- turns ----------
  winner() {
    for (const p of this.P) {
      if (!this.free(p) || p.souls < this.C.WIN_SOULS) continue;
      if (this.P.every(q => q === p || q.status === 'waiting' || ((q.status === 'slave' || q.status === 'vassal') && q.master === p.id))
          && this.P.some(q => q !== p && q.status !== 'waiting')) return p;
    }
    return null;
  }
  turn(p) { if (this.beginTurn(p)) { p.bot.turn(this, p); this.endTurn(p); } }
  // beginTurn returns false if p skips this turn (waiting to reincarnate). The web version calls these two around the player's actions.
  beginTurn(p) {
    this.dropMasks(); this.checkVassals();
    if (p.status === 'waiting' && p.waitTurns > 0) { p.waitTurns--; this.say(`P${p.id} waits to reincarnate`); return false; }   // REINCARNATE_WAIT
    if (p.status === 'waiting') this.reincarnate(p);
    p.buys = 0; p.trades = 0; p.duels = 1; p.earlBonus = 0; p.archFree = false; p.arch2 = false; p.asked = false; p.earlFree = false;
    p.souls += this.C.INCOME; this.ev('turn', { p: p.id }); this.ev('souls', { p: p.id, n: this.C.INCOME });
    if ((p.status === 'slave' || p.status === 'vassal') && p.master !== null) {
      const m = this.P[p.master];
      // PRINCE_LV3 'tribute3' (rules since 2026-11-16): a revealed Prince's slaves pay 3 a round; the bank covers what they can't
      if (this.C.PRINCE_LV3 === 'tribute3' && p.status === 'slave' && this.has(m, PRINCE, 3)) { const paid = this.pay(p, m, 3); m.souls += 3 - paid; this.stats.princeTribute += 3; this.ev('tribute', { from: p.id, to: m.id, n: 3 }); }
      else { const n = this.pay(p, m, this.C.TRIBUTE); if (n) this.ev('tribute', { from: p.id, to: m.id, n }); }
    }
    this.stats.turns++; if (this.masked(p)) this.stats.maskedTurns++;
    this.cur = p; return true;
  }
  endTurn(p) {
    this.dropMasks();
    this.resolveClaims(p);
    if (p.maskLock > 0) p.maskLock--;
    p.tookMine.clear();
    this.check();
  }
  check() {
    for (const p of this.P) {
      if (p.souls < 0) throw new Error(`P${p.id} has negative souls`);
      if (p.status === 'waiting') continue;
      const live = this.bag.filter(t => !t.blank && t.c === p.id && t.gen === p.gen).length + this.P.reduce((s, q) => s + q.tokens.filter(t => t.c === p.id && t.gen === p.gen).length, 0);
      if (live > 4) throw new Error(`P${p.id} has ${live} live tokens`);
      if (this.C.SLAVE_TOKENS !== 'keep' && p.status === 'slave' && p.tokens.some(t => t.c === p.master)) throw new Error(`slave P${p.id} holds a master token`);
    }
  }
  play() {
    let w = null;
    for (; this.round <= this.C.MAX_ROUNDS && !w; this.round++) {
      for (const p of this.P) { this.turnNo++; this.turn(p); if ((w = this.winner())) break; }
    }
    return { winner: w ? w.id : null, rounds: Math.min(this.round, this.C.MAX_ROUNDS), stats: this.stats, players: this.P };
  }
}

const EXPORTS = { Game, ROLES, NAMES, ARCH, DUKE, PRINCE, MARQ, EARL, masksFor, coverBits, roleOf, winChance, strongerWins, key, ALL_ROLES };
if (typeof module !== 'undefined') module.exports = EXPORTS; else globalThis.ReworkEngine = EXPORTS;
})();
