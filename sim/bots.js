// Strategy bots. Each bot sees only what its player could see at the table:
// the dots on tokens it holds (or has held), public role reveals, and answers to its own Archduke questions.

const TYPES = {
  // names early, consumes, uses abilities freely
  aggressor: { nameAt: 3, fate: 'consume', revealOK: true, revealSafe: 2, reserve: 0, maxCards: 4, keepOwn: false, killMarquis: 'any', consumeSlaveP: 0.15, keepAscension: false },
  // hoards its own tokens to stay un-nameable, never reveals, names only on near-certainty
  turtle: { nameAt: 1, fate: 'enslave', revealOK: false, reserve: 2, maxCards: 2, keepOwn: true, killMarquis: 'mine', consumeSlaveP: 0, keepAscension: false },
  // buys cards, keeps Arrogation away from the Duke, names only when certain
  hoarder: { nameAt: 1, fate: 'enslave', revealOK: true, revealSafe: 3, reserve: 4, maxCards: 6, keepOwn: false, killMarquis: 'mine', consumeSlaveP: 0, keepAscension: true },
  // legal but aimless
  random: { random: true },
};

function subMultiset(dots, combo) {
  const c = {}; for (const d of combo) c[d] = (c[d] || 0) + 1;
  for (const d of dots) { if (!c[d]) return false; c[d]--; }
  return true;
}

class Knowledge {
  constructor(api) { this.api = api; this.seen = {}; this.allowed = {}; }
  scan() {
    for (const p of this.api.S.players) {
      if (p.status === 'dead') continue;
      const mine = this.seen[p.id] || (this.seen[p.id] = {});
      for (const t of p.tokens) (mine[t.owner] || (mine[t.owner] = new Map())).set(t.id, t.dots);
    }
  }
  reset(owner) {
    for (const v in this.seen) delete this.seen[v][owner];
    for (const v in this.allowed) delete this.allowed[v][owner];
  }
  cands(viewer, X) {
    const { api } = this;
    const dots = [...((this.seen[viewer] || {})[X.id] || new Map()).values()].map(String);
    const allow = (this.allowed[viewer] || {})[X.id];
    return api.COMBOS.filter(c => subMultiset(dots, c)
      && (!X.revealed || api.roleOfCombo(c) === api.baseRole(X))
      && (!allow || allow.has(c)));
  }
  // Archduke question modeled as "is your name one of these?" over half the remaining candidates
  bisect(viewer, X, rng) {
    const c = this.cands(viewer, X);
    if (c.length < 2) return;
    const sh = shuffle([...c], rng), half = sh.slice(0, Math.floor(sh.length / 2));
    const keep = half.includes(X.combo) ? half : sh.slice(half.length);
    (this.allowed[viewer] || (this.allowed[viewer] = {}))[X.id] = new Set(keep);
  }
}

function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const pickOne = (a, rng) => a[Math.floor(rng() * a.length)];

class Bots {
  constructor(api, types, rng) {
    this.api = api; this.types = types; this.rng = rng;
    this.know = new Knowledge(api);
    this.plan = {}; this.unknown = {};
  }
  get S() { return this.api.S; }
  // Endgame: the bag is empty, so the only new information comes from stealing tokens.
  inEndgame() { return this.endgame !== 'off' && this.S.bag.length === 0; }
  type(id) { return TYPES[this.types[id]]; }
  idOf(name) { return +name.slice(1); }

  // ---------- evaluating colors and targets ----------
  colorScore(p, c) {
    const S = this.S, T = this.type(p.id), api = this.api;
    if (T.random) return this.rng();
    if (c === p.id) return T.keepOwn && api.countColor(p, p.id) < 4 ? 10 : -1;
    const X = S.players[c];
    if (X.status === 'dead') return -5;
    if (X.status === 'slave') return -2;
    const mine = api.countColor(p, c);
    const rival = Math.max(0, ...S.players.filter(o => o.id !== p.id && o.id !== c && o.status !== 'dead').map(o => api.countColor(o, c)));
    const lead = mine + 1 - rival;
    return 3 + (lead >= 1 ? 2 : lead === 0 ? 1 : 0) - this.know.cands(p.id, X).length / api.COMBOS.length;
  }
  namingTargets(p) {
    return this.S.players.filter(t => t.id !== p.id && t.status === 'alive' && this.api.eligibility(p, t) == null)
      .map(t => ({ t, c: this.know.cands(p.id, t) }))
      .sort((a, b) => a.c.length - b.c.length);
  }
  announce(p, victim) {
    const br = this.api.baseRole(p), T = this.type(p.id);
    if (br === 'Marquis') return 'consume';
    if (br === 'Prince') return 'enslave';
    if (T.random) return pickOne(['enslave', 'consume'], this.rng);
    return this.fatePolicy === 'smart' && victim ? this.chooseFate(p, victim) : T.fate;
  }
  // Smart enslave-or-consume: compare the slave's income for the rest of the game with the consume bonus
  // plus the victim's tokens, and count the risk that the slave later rebels (they're more dangerous the
  // closer they are to knowing the master's name).
  chooseFate(master, victim) {
    const S = this.S, api = this.api, T = this.type(master.id);
    const free = S.players.filter(x => x.status === 'alive').length;
    const roundsLeft = Math.max(2, 11 - S.round);                       // median game is about 11 rounds
    const tokenValue = t => t.owner === victim.id ? 0                    // the victim's own color leaves the game on consume
      : t.owner === master.id ? 1 : S.players[t.owner].status === 'alive' ? 2 : 0.5;
    const toks = victim.tokens.map(tokenValue).sort((a, b) => b - a);
    const half = toks.slice(0, Math.ceil(toks.length / 2)).reduce((a, b) => a + b, 0) * 0.8; // random half, roughly
    const consumeV = (api.CONSUME_BONUS || 0) + half;
    const slaveIncome = api.SLAVE_INCOME || 1;
    const rebellionsLeft = S.deck.filter(c => c === 'Insubordination').length + S.discard.filter(c => c === 'Insubordination').length;
    const theirOdds = 1 / Math.max(1, this.know.cands(victim.id, master).length); // chance the slave names me right
    const risk = rebellionsLeft ? 25 * theirOdds * Math.min(1, rebellionsLeft / 2) : 0; // losing a rebellion swaps us
    const enslaveV = slaveIncome * roundsLeft + (toks[0] || 0) - risk;
    const lean = T.fate === 'consume' ? 2 : -2;                          // keep a little of each bot's personality
    if (free <= 2) return T.fate;                                        // either choice wins the game
    return consumeV + lean > enslaveV ? 'consume' : 'enslave';
  }

  // ---------- choosing the next action on your own turn ----------
  options(p, done) {
    const S = this.S, api = this.api, T = this.type(p.id), br = api.baseRole(p), out = [];
    const add = (act, plan = {}, key = act) => { if (!done.has(key)) out.push({ act, plan, key }); };
    // 'always': aggressors and hoarders use abilities whenever useful. 'smart': only if, once your role is public,
    // the rival holding the most of your tokens would still face at least revealSafe possible names.
    const canReveal = T.random || p.revealed || (T.revealOK && (this.revealPolicy !== 'smart' || this.exposure(p) >= T.revealSafe));

    if (api.countCard(p, 'Collect')) add('playSoul');
    // under a waiting Ward claim: go after the claimant (a wrong guess can't make things worse)
    const claim = p.status === 'alive' && api.activeClaim(p);
    if (claim && claim.claimant != null) {
      const cl = S.players[claim.claimant];
      if (cl.status === 'alive' && api.eligibility(p, cl) == null) {
        const c = this.know.cands(p.id, cl);
        if (c.length) add('name', { target: cl.id, act: this.announce(p, cl), guess: pickOne(c, this.rng), cands: c.length }, 'nameClaimant');
      }
    }
    if (p.status === 'alive') {
      const ts = this.namingTargets(p);
      if (ts.length) {
        const best = ts[0];
        const go = T.random ? this.rng() < 0.3 : best.c.length <= T.nameAt;
        if (go && best.c.length) add('name', { target: best.t.id, act: this.announce(p, best.t), guess: pickOne(best.c, this.rng), cands: best.c.length });
      }
    }
    const marked = S.players.filter(x => x.status !== 'dead' && x.markedBy != null && x.id !== p.id);
    if (marked.length && br !== 'Prince' && api.canSpend(p, api.MARQUIS_KILL)) {
      // 'free': if the consume bonus pays back the kill price, anyone kills any marked Marquis (the payer gets the bonus)
      const freeKill = false;   // the devour bonus now goes to the namer, so paying is only free for the namer (covered by the per-type rule)
      const m = marked.find(x => T.random || freeKill || T.killMarquis === 'any' || x.markedBy === p.id);
      if (m) add('killMarquis', { target: m.id });
    }
    if (api.isArch(p) && canReveal && !(br === 'Duke' && p.archUses >= api.archLimit())) {
      let qs = S.players.filter(t => t.id !== p.id && t.status === 'alive' && !p.asked.includes(t.id))
        .map(t => ({ t, n: this.know.cands(p.id, t).length, ok: api.eligibility(p, t) == null }))
        .filter(x => x.n > 1).sort((a, b) => (b.ok - a.ok) || (a.n - b.n));
      // patient: only ask when halving the list lets you name that player right away
      if (this.archPolicy === 'patient' && !T.random) qs = qs.filter(x => x.ok && x.n > T.nameAt && x.n <= 2 * T.nameAt);
      if (qs.length) add('archQ', { target: qs[0].t.id });
    }
    if (api.countCard(p, 'Seize') >= 4) { const best = this.theftTarget(p); if (best) add('theft4', best); }
    if (this.cardTrading && !T.random) { const deal = this.theftDeal(p); if (deal) add('trade', deal, `tradeCards:${deal.partner}`); }
    if (T.random && api.countCard(p, 'Seize') >= 2) {
      const vs = S.players.filter(v => v.id !== p.id && v.status !== 'dead' && v.events.length);
      if (vs.length) add('theft2', { target: pickOne(vs, this.rng).id });
    }
    if (api.countCard(p, 'Scrying') && S.bag.length && api.tokenRound() && !S.tokenBought) add('playName');
    else if (!T.random && api.countCard(p, 'Scrying') >= 2 && (!S.bag.length || this.inEndgame())) add('scry2');
    if (api.tokenRound() && !S.tokenBought && S.bag.length) {
      if (api.canSpend(p, 3)) add('draw2'); else if (api.canSpend(p, api.RANDOM_TOKEN_COST)) add('buyToken');
    }
    if (br === 'Prince' && canReveal && api.canSpend(p, 2)) {
      const sl = api.slavesOf(p).filter(s => s.tokens.length);
      if (sl.length) add('princeBuy', { target: sl[0].id });
    }
    if (br === 'Earl' && !S.earlUsed && canReveal) add('earl');
    if (this.trading && !T.random) { const deal = this.bestDeal(p); if (deal) add('trade', deal); }
    if (br !== 'Prince' && api.slavesOf(p).length && this.rng() < (T.random ? 0.1 : T.consumeSlaveP)) add('consumeSlave', { target: api.slavesOf(p)[0].id });
    const cardsLeft = T.random ? 3 : T.maxCards;
    const tokenSave = this.trading && this.saveFor && this.saveFor[p.id] && this.saveFor[p.id] !== Infinity ? this.saveFor[p.id] : 0;
    const cardSave = this.cardTrading && this.saveCards ? this.saveCards[p.id] || 0 : 0;
    const saving = Math.max(tokenSave, cardSave);
    const dig = !T.random && this.inEndgame(); // endgame: spend everything above a small reserve on cards, digging for Seize cards
    const reserve = dig ? 2 : Math.max(T.reserve || 0, saving);
    if (api.canSpend(p, 1) && p.souls - 1 >= reserve && (dig || (this.cardsThisTurn || 0) < cardsLeft)) out.push({ act: 'buyEvent', plan: {} });

    if (T.random) { if (!out.length || this.rng() < 0.2) return null; return pickOne(out, this.rng); }
    return out[0] || null;
  }

  // ---------- trading ----------
  // Fewest of someone's tokens you must see so that, whatever their dots, at most `nameAt` names remain.
  // (4 tokens, 1-3 dots: 3 tokens leave at most 3 names, so an aggressor needs 3; certainty needs all 4.)
  tokensNeeded(nameAt) {
    const C = this.api.COMBOS, cache = this._need || (this._need = {});
    if (cache[nameAt]) return cache[nameAt];
    for (let k = 1; k <= C[0].length; k++) {
      let worst = 0;
      for (const t of C) {
        const pick = (i, cur) => {
          if (cur.length === k) { worst = Math.max(worst, C.filter(c => subMultiset(cur, c)).length); return; }
          for (let j = i; j < t.length; j++) pick(j + 1, cur.concat(t[j]));
        };
        pick(0, []);
      }
      if (worst <= nameAt) return (cache[nameAt] = k);
    }
    return (cache[nameAt] = C[0].length);
  }
  // Buy 1 token for souls. Two motives: gather a target's tokens until you can name them,
  // or (turtle) pull your own tokens back out of other hands.
  bestDeal(p) {
    const S = this.S, api = this.api, T = this.type(p.id);
    if (p.status !== 'alive') return null;   // thralls can't trade
    const budget = Math.min(p.souls, api.SPEND_CAP - S.spent) - api.TRADE_FEE; // what's left for the price after your fee
    const sellers = S.players.filter(q => q.id !== p.id && q.status === 'alive' && q.souls >= api.TRADE_FEE); // slaves can't sell tokens
    const deals = [];
    if (T.keepOwn && !this.inEndgame()) for (const q of sellers) if (api.countColor(q, p.id)) deals.push({ partner: q.id, color: p.id, score: 10 });
    if (p.status === 'alive') {
      for (const X of S.players) {
        if (X.id === p.id || X.status !== 'alive') continue;
        const m = api.countColor(p, X.id);
        if (this.know.cands(p.id, X).length <= T.nameAt) continue; // already sure enough
        if (m + 1 < this.tokensNeeded(T.nameAt) - 1) continue;     // too far away to be worth it yet
        for (const q of sellers) if (q.id !== X.id && api.countColor(q, X.id)) deals.push({ partner: q.id, color: X.id, score: m + 1 });
      }
    }
    // token counts are public, so the buyer can work out each seller's asking price before offering
    deals.forEach(d => { d.price = this.askingPrice(S.players[d.partner], d.color); });
    const possible = deals.filter(d => d.price + api.TRADE_FEE <= api.SPEND_CAP);
    const affordable = possible.filter(d => d.price <= budget).sort((a, b) => (b.score - a.score) || (a.price - b.price));
    // nothing affordable yet but something worth buying: save souls instead of buying cards
    this.saveFor = this.saveFor || {};
    this.saveFor[p.id] = affordable.length ? 0 : Math.min(...possible.map(d => d.price + api.TRADE_FEE), Infinity);
    return affordable[0] || null;
  }
  // Expected names a rival would face for p if p's role were public and the rival held k of p's tokens
  // (averaged over which k of p's tokens they hold).
  exposure(p) {
    const api = this.api, S = this.S;
    const k = Math.max(0, ...S.players.filter(o => o.id !== p.id && o.status !== 'dead').map(o => api.countColor(o, p.id)));
    const key = p.combo + ':' + k, cache = this._exp || (this._exp = {});
    if (cache[key] != null) return cache[key];
    const role = api.roleOfCombo(p.combo), C = api.COMBOS.filter(c => api.roleOfCombo(c) === role), t = [...p.combo];
    let tot = 0, n = 0;
    const pick = (i, cur) => {
      if (cur.length === k) { tot += C.filter(c => subMultiset(cur, c)).length; n++; return; }
      for (let j = i; j < t.length; j++) pick(j + 1, cur.concat(t[j]));
    };
    pick(0, []);
    return (cache[key] = tot / n);
  }

  // Best victim and color for a 4-Seize token steal, or null if nothing is worth stealing.
  theftTarget(p) {
    let best = null;
    for (const v of this.S.players) {
      if (v.id === p.id || v.status === 'dead') continue;
      for (const c of new Set(v.tokens.map(t => t.owner))) {
        // focus: steal toward the player you're closest to finishing
        if (c === p.id && this.inEndgame()) continue; // endgame: steal to attack, not to hide
        const base = this.colorScore(p, c);
        const s = base > 0 && c !== p.id ? base + 2 * this.api.countColor(p, c) : base;
        if (s > 0 && (!best || s > best.s)) best = { s, target: v.id, color: c };
      }
    }
    return best;
  }
  // Seller's price per Seize card: 1 + the Seize cards they hold. Someone one card from a set (3) won't sell.
  // Card hands are hidden; this stands for asking the table "who'll sell me Seize cards?" and getting honest answers.
  theftPrice(q) { const s = this.api.countCard(q, 'Seize'); return s >= 3 ? Infinity : 1 + s; }
  // Buy Seize cards only when this turn's purchases complete a set of 4; otherwise save up for it.
  theftDeal(p) {
    const S = this.S, api = this.api;
    this.saveCards = this.saveCards || {};
    this.saveCards[p.id] = 0;
    const k = api.countCard(p, 'Seize');
    if (p.status !== 'alive' || k < 1 || k >= 4 || !this.theftTarget(p)) return null;
    const sellers = S.players.filter(q => q.id !== p.id && q.status === 'alive')   // thralls can't trade
      .map(q => ({ q, have: api.countCard(q, 'Seize'), price: this.theftPrice(q) }))
      .filter(x => x.have > 0 && x.price !== Infinity).sort((a, b) => a.price - b.price);
    let need = 4 - k, cost = 0; const legs = [];
    for (const x of sellers) { if (!need) break; const n = Math.min(need, x.have); legs.push({ partner: x.q.id, n, price: x.price }); cost += n * x.price; need -= n; }
    if (need || cost > api.SPEND_CAP) return null;
    if (cost > Math.min(p.souls, api.SPEND_CAP - S.spent)) { this.saveCards[p.id] = cost; return null; }
    return { kind: 'cards', card: 'Seize', ...legs[0] };
  }

  // What a seller wants (in souls, on top of their own fee) for one token of `color`.
  askingPrice(seller, color) {
    const S = this.S, api = this.api;
    const X = S.players[color];
    let v = 1;
    if (X.status === 'alive' && color !== seller.id) {
      const mine = api.countColor(seller, color);
      const rival = Math.max(0, ...S.players.filter(o => o.id !== seller.id && o.id !== color && o.status !== 'dead').map(o => api.countColor(o, color)));
      if (mine >= rival) v += 3; // it's what keeps me in the lead on that player
    }
    return v;
  }

  // ---------- answering the page's prompts ----------
  answer(o) {
    const S = this.S, api = this.api, plan = this.plan || {};
    const title = String(o.title).replace(/<[^>]+>/g, '');
    const opts = (o.options || []).filter(x => !x.disabled);
    const vals = opts.map(x => x.value).filter(v => v != null);
    const body = String(o.body || '');
    const dataV = [...body.matchAll(/data-v="([^"]+)"(?! disabled)/g)].map(m => m[1]);
    const cur = S.players[S.current];
    let m;

    if (title === 'Who are you naming?' || /^(Compel a yes\/no|Buy a token from which thrall|Devour which thrall|Devour which marked Marquis|Steal an event card|Steal a name token)/.test(title)) return plan.target;
    if (title === 'Which color?') return plan.color;
    // trades: the buyer's plan stands for what the two agreed out loud
    if (title === 'Trade with…') return plan.partner;
    if (/^What you give P\d$/.test(title)) return { souls: plan.kind === 'cards' ? plan.n * plan.price : plan.price, idx: [], tidx: [] };
    if ((m = title.match(/^(P\d): (P\d) offers/)) && plan.kind === 'cards') {
      const o = S.players[this.idOf(m[1])];
      const idx = o.events.map((c, i) => c === plan.card ? i : -1).filter(i => i >= 0);
      if (idx.length < plan.n || plan.price < this.theftPrice(o)) return null;
      return { souls: 0, idx: idx.slice(0, plan.n), tidx: [] };
    }
    if ((m = title.match(/^(P\d): (P\d) offers/))) {
      const o = S.players[this.idOf(m[1])];
      const toks = o.tokens.map((t, i) => ({ t, i })).filter(x => x.t.owner === plan.color);
      if (o.status !== 'alive' || !toks.length || o.souls < api.TRADE_FEE || plan.price < this.askingPrice(o, plan.color)) return null;
      return { souls: 0, idx: [], tidx: [pickOne(toks, this.rng).i] };
    }
    if (title.startsWith('Announce:')) return vals.includes(plan.act) ? plan.act : vals[0];
    if (/^Name P\d$/.test(title)) return plan.guess;
    if (/ is the Marquis$/.test(title)) return vals.includes(true);
    if (/: use your Ward\?$/.test(title)) return true;
    if (/: discard 3 (more )?Wards to delay/.test(title)) return true;
    if (/: give away any tokens you just took\?$/.test(title)) return [];   // bots keep their spoils
    if (title === 'Keep 2 of the top cards') {
      const cards = [...body.matchAll(/data-k="(\d+)"> ([A-Za-z]+)/g)].map(x => x[2]);
      const want = { Seize: 5, Ward: 4, Collect: 3, Scrying: 2, Pact: 1 };
      return cards.map((c, i) => ({ i, s: want[c] || 0 })).sort((a, b) => b.s - a.s).slice(0, 2).map(x => x.i);
    }
    if ((m = title.match(/^(P\d): Keep (\d+) of (P\d)'s name tokens$/))) {
      const me = S.players[this.idOf(m[1])];
      const owners = [...body.matchAll(/(P\d)'s token/g)].map(x => this.idOf(x[1]));
      return owners.map((c, i) => ({ i, s: this.colorScore(me, c) })).sort((a, b) => b.s - a.s).slice(0, +m[2]).map(x => x.i);
    }
    if ((m = title.match(/^Keep (\d+) of (\d+)$/))) {
      const owners = [...body.matchAll(/(P\d)'s token/g)].map(x => this.idOf(x[1]));
      let bi = 0, bs = -Infinity;
      owners.forEach((c, i) => { const s = this.colorScore(cur, c); if (s > bs) { bs = s; bi = i; } });
      return [bi].concat(owners.map((_, i) => i).filter(i => i !== bi)).slice(0, +m[1]);
    }
    if (/^P\d: take 1 of P\d's name tokens$/.test(title) || /^Pick one of P\d's tokens$/.test(title)) return pickOne(dataV, this.rng);
    if ((m = title.match(/^(P\d) (decides|punishes)(?: (P\d))?/))) {
      const T = this.type(this.idOf(m[1]));
      // victim: named in "punishes", otherwise the player whose wrong guess this is (bots only name on their own turn)
      const victim = m[3] ? S.players[this.idOf(m[3])] : cur;
      const want = T.random ? pickOne(vals, this.rng) : this.fatePolicy === 'smart' ? this.chooseFate(S.players[this.idOf(m[1])], victim) : T.fate;
      return vals.includes(want) ? want : vals[0];
    }
    if (/^(Insubordination|Arrogation): give it to a thrall$/.test(title)) return pickOne(vals, this.rng);
    if ((m = title.match(/^(P\d): name your binder (P\d)$/))) {
      const c = this.know.cands(this.idOf(m[1]), S.players[this.idOf(m[2])]);
      return pickOne(c.length ? c : api.COMBOS, this.rng);
    }
    if ((m = title.match(/^(P\d): choose your new name$/))) {
      const old = S.players[this.idOf(m[1])].combo;
      return pickOne(dataV.filter(v => v !== old), this.rng);
    }
    if (title === 'You drew Arrogation') {
      const T = this.type(cur.id);
      if (vals.includes('show') || !vals.includes('back')) {   // merged card
        if (vals.includes('keep')) return 'keep';                  // a Duke keeps it
        if (!vals.includes('back')) return vals[0];                // forced
        // optional: show it unless it could free one of your own thralls
        const mine = S.players.some(x => x.status === 'slave' && x.master === cur.id && !x.rebelBlocked.includes(cur.id));
        if (vals.includes('show') && !mine) return 'show';
        const thefts = a => a.filter(c => c === 'Seize').length;
        return thefts(S.deck) === 0 && thefts(S.discard) > 0 ? 'discard' : 'back';
      }
      if (api.baseRole(cur) === 'Duke' || T.keepAscension || (T.random && this.rng() < 0.5)) return 'keep';
      // Discard it when the Seize cards are in the discard pile and none are left in the deck: putting it back only delays the reshuffle.
      const thefts = a => a.filter(c => c === 'Seize').length;
      return !T.random && thefts(S.deck) === 0 && thefts(S.discard) > 0 ? 'discard' : 'back';
    }
    if (title === 'Arrogation: put it back') return opts.find(x => x.label === 'Random').value;
    if (opts.length === 1 && opts[0].value === true) return true; // plain info dialogs
    this.unknown[title] = (this.unknown[title] || 0) + 1;
    return vals[0] ?? null;
  }
}

module.exports = { Bots, TYPES, Knowledge, subMultiset, shuffle };
