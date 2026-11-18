// Strategy bots for the rework sim. Each bot only uses what its player could know:
// public token counts by colour, public masks / reveals, its own Archduke answers. Held tokens stay face down
// until a naming attempt, so bots judge a naming by how many of the target's tokens they hold and what roles fit.
'use strict';
(() => {   // own scope, so the browser can load engine.js and bots.js side by side
const { NAMES, ARCH, DUKE, PRINCE, MARQ, EARL, masksFor, roleOf, winChance, ALL_ROLES } = typeof require !== 'undefined' ? require('./engine') : globalThis.ReworkEngine;

// Chance a naming succeeds holding k of the target's tokens, knowing their role is one of `roles` (bitmask):
// average over every name that fits and every set of k of its 4 pieces of 1 / (names still fitting what you saw).
const memo = new Map();
function successP(k, roles) {
  const id = k * 32 + roles; if (memo.has(id)) return memo.get(id);
  const fit = NAMES.filter(n => (roles >> roleOf(n)) & 1);
  if (!fit.length) return 0;
  const contains = (n, seen) => { const a = [...n]; return seen.every(d => { const i = a.indexOf(d); if (i < 0) return false; a.splice(i, 1); return true; }); };
  let tot = 0, cnt = 0;
  for (const n of fit) {
    const idx = [0, 1, 2, 3], subs = [];
    const rec = (start, cur) => { if (cur.length === k) { subs.push(cur.map(i => n[i])); return; } for (let i = start; i < 4; i++) rec(i + 1, [...cur, i]); };
    rec(0, []);
    for (const seen of subs) { tot += 1 / fit.filter(m => contains(m, seen)).length; cnt++; }
  }
  const v = tot / cnt; memo.set(id, v); return v;
}

const TYPES = {
  // names at a 1-in-3 chance, unmasks freely for souls, duels at even odds, reveals when few hold its tokens
  aggressor: { nameAt: 0.33, duelAt: 0.5, revealThreat: 1, reserve: 0, remaskThreat: 3, cardsAbove: 8, consumeThreat: 2, unmaskForCash: 2, backShare: 0.25, prize: 40, guard: 25, rebelFear: 0.3 },
  // between the two
  balanced: { nameAt: 0.5, duelAt: 0.6, revealThreat: 0, reserve: 2, remaskThreat: 2, cardsAbove: 10, consumeThreat: 2, unmaskForCash: 3, backShare: 0.2, prize: 35, guard: 35, rebelFear: 0.2 },
  // stays masked, names only when certain, remasks as soon as anyone holds 2 of its tokens, never reveals
  turtle: { nameAt: 0.99, duelAt: 0.7, revealThreat: -1, reserve: 6, remaskThreat: 2, cardsAbove: 12, consumeThreat: 1, unmaskForCash: 9, backShare: 0.1, prize: 25, guard: 50, rebelFear: 0.1 },
};

class Bot {
  constructor(type, market = 'value', duelFirst = true, fateMode = 'rebel') { this.market = market; this.duelFirst = duelFirst; this.fateMode = fateMode; this.type = type; this.T = TYPES[type] || TYPES.balanced; this.random = type === 'random'; }
  threat(g, p) { let m = 0; for (const q of g.P) if (q !== p) m = Math.max(m, g.count(q, p.id)); return m; }
  pickMask(g, p, opts) { return g.pick(opts); }
  cardPref(g, p, c) { return { Arrogation: p.status === 'free' ? (p.role === EARL ? 3 : 0) : 9, Seize: 5, Collect: 4, Restoration: 3, Ward: 4, Pact: 0 }[c] ?? 1; }
  keepMask(g, p) { return true; }
  // hand an Arrogation to someone else's slave, preferring the richest master's
  giveArrogation(g, p, subs) { const other = subs.filter(q => q.master !== p.id); const pool = other.length ? other : subs; return pool.sort((a, b) => g.P[b.master].souls - g.P[a.master].souls)[0]; }
  ward(g, p) { return true; }
  // fate after a capture. 'rebel' (default): enslave, unless this slave looks able to rebel (a won rebellion now swaps you into their place);
  // 'enslave': always enslave; 'threat': consume anyone holding your tokens (the old bots)
  fate(g, m, v) {
    if (this.random) return g.r() < 0.5 ? 'consume' : 'enslave';
    if (this.fateMode === 'enslave') return 'enslave';
    if (this.fateMode === 'threat') return g.count(v, m.id) >= this.T.consumeThreat ? 'consume' : 'enslave';
    const risk = winChance(v.souls, m.souls) * (g.hasCard(v, 'Arrogation') ? 1.5 : 1);
    return risk >= this.T.rebelFear ? 'consume' : 'enslave';
  }
  // the duel winner picks which token the loser returns to the bag: your own first (it protects you),
  // then the loser's own (it puts their name back where you can buy it)
  victorPick(g, W, L) {
    // hunting L: knock their own token loose, unless L is close to naming you (3+ of your tokens); with Noblesse over, always hunt
    const hunting = g.count(W, L.id) >= 2 || (g.count(W, L.id) >= 1 && g.count(L, W.id) < 3) || g.noblesseOver();
    if (hunting) { const theirs = L.tokens.filter(t => t.c === L.id); if (theirs.length) return g.pick(theirs); }
    const own = L.tokens.filter(t => t.c === W.id); if (own.length) return g.pick(own);
    const theirs = L.tokens.filter(t => t.c === L.id); if (theirs.length) return g.pick(theirs);
    return g.pick(L.tokens);
  }
  giveToken(g, p, to) { const not = p.tokens.filter(t => t.c !== to.id); return g.pick(not.length ? not : p.tokens); }
  back(g, q, a, d) {
    if (this.random || q.souls < 4) return null;
    const free = g.P.filter(x => g.free(x)), lead = free.reduce((b, x) => (x.souls > b.souls ? x : b), free[0]);
    if (g.has(q, PRINCE, 1)) return { side: a.souls < d.souls ? 'a' : 'd', amount: Math.floor(q.souls / 2) };
    if (lead === a && lead !== q) return { side: 'd', amount: Math.floor(q.souls * this.T.backShare) };
    if (lead === d && lead !== q) return { side: 'a', amount: Math.floor(q.souls * this.T.backShare) };
    if (g.count(a, q.id) >= 2 && g.count(d, q.id) < 2) return { side: 'd', amount: Math.floor(q.souls * this.T.backShare) };
    return null;
  }
  // ---- token market: prices from what the token is worth to each side ----
  // worth of going from k to k+1 tokens of colour c, in souls: the gain in naming chance times the prize,
  // more if it makes you the top holder (eligible), plus a little for reaching 3 (a duel right under Noblesse Oblige)
  tokenWorth(g, p, c, k) {
    const t = g.P[c]; if (!g.free(p) || !g.alive(t) || t.master === p.id || c === p.id || k >= 4) return 0;   // slaves can't name: tokens are worth nothing to them
    let m = 0; for (const q of g.P) if (q !== p && q !== t) m = Math.max(m, g.count(q, c));
    const roles = g.rolesKnown(p, t), dp = successP(k + 1, roles) - (k ? successP(k, roles) : 0);
    const eligNow = k >= 1 && k >= m, eligAfter = k + 1 >= m;
    const mult = eligAfter ? (eligNow ? 1 : 1.5) : 0.4;
    return this.T.prize * dp * mult + (k + 1 === 3 ? 4 : 0);
  }
  // worth to p of taking one of its own tokens back from holder h: how much it cuts h's naming chance
  defenceWorth(g, p, h) {
    const k = g.count(h, p.id); if (!k) return 0;
    let m = 0; for (const q of g.P) if (q !== p && q !== h) m = Math.max(m, g.count(q, p.id));
    const roles = h.pubRoles, top = k >= m ? 1 : 0.3;
    return this.T.guard * top * (successP(k, roles) - (k > 1 ? successP(k - 1, roles) : 0));
  }
  ask(g, q, c) { if (c === q.id) return Infinity; if (q.bot.random) return 3; return Math.max(2, q.bot.tokenWorth(g, q, c, g.count(q, c) - 1)); }
  tradeTokens(g, p, reserve) {
    for (let n = 0; n < 3; n++) {
      let best = null;
      for (const q of g.P) {
        if (q === p || !g.alive(q)) continue;
        for (const c of new Set(q.tokens.map(t => t.c))) {
          if (g.against(q, g.P[c])) continue;                  // a slave can't sell their master's tokens
          if (c === p.id && !g.masked(p)) continue;            // unmasked players can't collect their own tokens
          const bid = c === p.id ? this.defenceWorth(g, p, q) : this.tokenWorth(g, p, c, g.count(p, c));
          const ask = this.ask(g, q, c);
          if (bid < ask) continue;
          const price = Math.ceil((bid + ask) / 2);
          if (p.souls - price < reserve) continue;
          if (!best || bid - ask > best.gap) best = { q, c, price, gap: bid - ask };
        }
      }
      if (!best || !g.trade(p, best.q, best.c, best.price)) return;
      g.stats.tradeSouls = (g.stats.tradeSouls || 0) + best.price;
    }
  }
  // card market: complete a Seize pair. Slaves sell for 3 (they can't use Seize); a free player with 1 asks 8; with 2+ won't sell
  buySeize(g, p, reserve) {
    for (let n = 0; n < 2; n++) {
      if (g.P.filter(q => q !== p).every(q => !g.hasCard(q, 'Seize'))) return;
      const mine = p.cards.filter(c => c === 'Seize').length, bid = mine % 2 ? 12 : 6;
      let best = null;
      for (const q of g.P) {
        if (q === p || !g.alive(q) || !g.hasCard(q, 'Seize')) continue;
        const k = q.cards.filter(c => c === 'Seize').length, ask = q.bot.random ? 4 : !g.free(q) ? 3 : k >= 2 ? Infinity : 8;
        if (ask > bid) continue;
        const price = Math.ceil((bid + ask) / 2); if (p.souls - price < reserve) continue;
        if (!best || ask < best.ask) best = { q, ask, price };
      }
      if (!best || !g.tradeCard(p, best.q, 'Seize', best.price)) return;
    }
  }
  // slaves buy one Arrogation from a free player who isn't their master, for 2
  buyArrogation(g, p) {
    if (g.hasCard(p, 'Arrogation') || p.souls < 2) return;
    const q = g.P.find(q => q !== p && g.free(q) && q.id !== p.master && g.hasCard(q, 'Arrogation') && !(q.role === EARL && g.hasCard(q, 'Arrogation', 2)));
    if (q) g.tradeCard(p, q, 'Arrogation', 2);
  }
  // the player this bot is hunting: most of their tokens held, unmasked first
  target(g, p) {
    let best = null, bs = -1;
    for (const t of g.P) {
      if (t === p || !g.alive(t) || t.status === 'slave' || (t.master === p.id) || g.against(p, t)) continue;
      const s = g.count(p, t.id) * 10 + (g.masked(t) ? 0 : 5) + (t.status === 'free' ? 3 : 0) + g.r();
      if (s > bs) { bs = s; best = t; }
    }
    return best;
  }
  nameChance(g, p, t) {
    const k = g.count(p, t.id), roles = g.rolesKnown(p, t);
    let s = k === 0 ? 1 / NAMES.filter(n => (roles >> roleOf(n)) & 1).length : successP(Math.min(k, 4), roles);
    const no = g.notNames(p, t).size; if (no) s = Math.min(1, s * (1 + no / 10));
    return s;
  }
  // could p name t if p were unmasked? (p's own mask is the only thing in the way)
  eligibleUnmasked(g, p, t) { const m = p.mask; p.mask = null; const ok = g.eligible(p, t); p.mask = m; return ok; }

  turn(g, p) {
    while (g.collect(p));
    if (this.random) return this.randomTurn(g, p);
    if (p.status !== 'free') return this.subjectTurn(g, p);
    const T = this.T;

    if (p.role === EARL && g.hasCard(p, 'Arrogation', 2) && !g.masked(p) && this.threat(g, p) <= T.revealThreat) g.earlArrogation(p);
    g.archFree(p); g.earlFree(p);

    const tgt = this.target(g, p);
    if (g.has(p, ARCH, 3) && tgt) {
      const roles = g.rolesKnown(p, tgt), opts = [0, 1, 2, 3, 4].filter(r => (roles >> r) & 1);
      if (opts.length > 1) g.ask(p, tgt, { role: g.pick(opts) });
      else { const c = g.candidates(p, tgt); if (c.length) g.ask(p, tgt, { name: g.pick(c).join('') }); }
    }

    // defence first: get your own tokens away from whoever holds the most
    const th = g.P.filter(q => q !== p && g.count(q, p.id) >= 2).sort((a, b) => g.count(b, p.id) - g.count(a, p.id))[0];
    if (th && g.hasCard(p, 'Restoration')) g.restore(p, th);
    if (g.hasCard(p, 'Seize', 2)) {
      if (th) g.seize(p, th, p.id);
      else if (tgt) { const h = g.P.filter(q => q !== p && g.count(q, tgt.id)).sort((a, b) => g.count(b, tgt.id) - g.count(a, tgt.id))[0]; if (h) g.seize(p, h, tgt.id); }
    }

    // duel: strip the target's mask, or take your own tokens back from a threat
    const doDuel = () => {
      let best = null, bv = 0;
      for (const t of g.P) {
        if (!g.canDuel(p, t)) continue;
        const ch = winChance(g.strength(p, 'att'), g.strength(t, 'def') + Math.floor(t.souls / 4));
        let v = 0;
        if (t === tgt && g.masked(t) && t.status !== 'slave') v += 2;
        if (!g.masked(t) && g.count(t, p.id) >= 2) v += 2;
        if (t === tgt && !g.masked(t) && g.count(t, t.id) >= 1) v += 1;     // knock their own tokens back into the bag
        if (g.has(p, PRINCE, 2) && g.count(p, t.id) >= 3 && g.free(t)) v += 3;
        if (g.masked(p) && this.type === 'turtle' && ch < 0.9) v -= 1;   // a masked loser only loses the mask; near-certain duels are free
        // a long shot is worth it when losing is cheap: a masked loser only pays a remask
        const longShot = t === tgt && g.masked(t) && p.souls >= 3 * g.remaskCost(p) && ch >= 0.1;
        if (v > 0 && (ch >= T.duelAt || longShot) && v * ch > bv) { bv = v * ch; best = t; }
      }
      if (best) g.duel(p, best);
    };
    // duel before buying, so a token knocked into the bag can be drawn the same turn
    if (this.duelFirst) doDuel();

    // tokens: buy toward the target
    const reserve = T.reserve + (g.masked(p) ? 0 : 0);
    if (g.has(p, ARCH, 2) && tgt) g.archDraw3(p, t => (t.c === tgt.id ? 2 : t.c === p.id ? 1 : 0));
    // masters buy from their slaves before drawing (2 souls, the slave must sell; uses one of the 2 buys): any token worth 2+ to them
    if (g.C.MASTER_BUY || g.has(p, PRINCE, 3)) for (const s of g.subjects(p)) for (let n = 0; n < 4; n++) {
      const cs = [...new Set(s.tokens.map(t => t.c))].map(c => [c, this.tokenWorth(g, p, c, g.count(p, c))]).filter(([, w]) => w >= 2).sort((x, y) => y[1] - x[1]);
      if (!cs.length || p.souls - 2 < reserve || !g.princeBuy(p, s, cs[0][0])) break;
    }
    // draw 3 keep 1 when there's a target and souls to spare (6 + reserve + a remask's worth); otherwise single draws
    const want = t => (tgt && t.c === tgt.id ? 3 : t.c === p.id ? 2 : g.free(g.P[t.c]) ? 1 : 0);
    while (p.buys < g.C.BUY_LIMIT && g.bagHasFor(p)) {
      if (g.C.BUY3 && tgt && p.souls - g.C.BUY3_COST >= reserve + 6) { g.buy3(p, want); continue; }
      if (p.souls - g.C.BUY_COST < reserve) break;
      g.buyTokens(p, 1);
    }
    if (this.market === 'value') this.tradeTokens(g, p, reserve);
    if (g.C.CARD_MARKET) this.buySeize(g, p, reserve);
    else if (tgt && p.souls >= 3 + reserve) {     // old flat market: 3 souls from someone holding no more of that colour
      const seller = g.P.filter(q => q !== p && q !== tgt && g.free(q) && g.count(q, tgt.id) && g.count(q, tgt.id) <= g.count(p, tgt.id)).sort((a, b) => g.count(b, tgt.id) - g.count(a, tgt.id))[0];
      if (seller) g.trade(p, seller, tgt.id, 3);
    }

    if (!this.duelFirst) doDuel();

    // naming: unmask if a good enough shot is open
    const shots = g.P.filter(t => t !== p && g.alive(t) && !g.masked(t) && this.eligibleUnmasked(g, p, t)).map(t => [t, this.nameChance(g, p, t)]).sort((a, b) => b[1] - a[1]);
    if (shots.length && shots[0][1] >= T.nameAt && (g.count(p, shots[0][0].id) > 0)) {
      if (g.masked(p)) g.unmask(p);
      const [t] = shots[0];
      if (g.eligible(p, t)) g.name(p, t);
    } else if (g.masked(p) && p.tokens.filter(t => t.c === p.id).length >= T.unmaskForCash && this.threat(g, p) < 2) g.unmask(p);

    if (p.status !== 'free') return;
    // reveal for Lv3 when few hold your tokens; remask when someone gets close
    if (!g.masked(p) && !p.lv3 && this.threat(g, p) <= T.revealThreat && (p.role !== PRINCE || g.subjects(p).length)) g.reveal(p);
    if (!g.masked(p) && this.threat(g, p) >= T.remaskThreat && p.souls >= g.remaskCost(p)) g.remask(p, masksFor(p.role).includes(p.lastMask) ? p.lastMask : masksFor(p.role)[1]);
    while (p.souls - g.cardCost(p) >= T.cardsAbove) { if (!g.buyCard(p)) break; }
  }
  subjectTurn(g, p) {
    if (p.status === 'vassal' && g.buyFreedom(p)) return;
    while (p.status === 'vassal' && g.buyBack(p)) {}
    if (p.status !== 'vassal' && p.status !== 'slave') return;
    if (g.C.CARD_MARKET) this.buyArrogation(g, p);
    if (g.hasCard(p, 'Arrogation')) {
      const m = g.P[p.master];
      if (winChance(p.souls, m.souls) >= 0.2 || g.r() < 0.15) { g.rebel(p); if (p.status === 'free') return; }
    }
    while (p.souls >= g.cardCost(p) + (p.status === 'vassal' ? 2 : 0)) { if (!g.buyCard(p)) break; }
  }
  randomTurn(g, p) {
    if (p.status !== 'free') return this.subjectTurn(g, p);
    if (g.r() < 0.5) g.buyTokens(p, 2);
    if (g.r() < 0.3) g.buyCard(p);
    if (g.r() < 0.2) { const t = g.pick(g.P); g.duel(p, t); }
    if (g.r() < 0.2) { if (g.masked(p)) g.unmask(p); else g.remask(p, g.pick(masksFor(p.role))); }
    if (!g.masked(p) && g.r() < 0.3) { const ts = g.P.filter(t => g.eligible(p, t)); if (ts.length) g.name(p, g.pick(ts)); }
  }
}

if (typeof module !== 'undefined') module.exports = { Bot, TYPES, successP }; else globalThis.ReworkBots = { Bot, TYPES, successP };
})();
