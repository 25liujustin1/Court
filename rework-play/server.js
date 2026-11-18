// Court rework online: a small game server. Each room runs the rework engine (sim-rework/engine.js) and the sim's bots;
// players send commands (net.js runCommand) and get updates with other players' secrets removed (net.js redact).
//
//   npm start            then open http://localhost:3010 (other devices on your network: http://<your-ip>:3010)
//   PORT=8080 npm start  (hosts such as Render or Fly set PORT themselves)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Game } = require('../sim-rework/engine');
const { Bot, TYPES } = require('../sim-rework/bots');
const { HumanBot, runCommand, redact, snapView, normDeal } = require('./net');

const PORT = +process.env.PORT || 3010;
const ROOT = path.join(__dirname, '..');
const MIN_SEATS = 3, MAX_SEATS = 6;
const AWAY_MS = +process.env.AWAY_MS || 45000;      // a player gone this long during their turn has it ended for them
const PACE = process.env.PACE !== undefined ? +process.env.PACE : 1;                 // scales the pause after each bot turn (0 = no pause, for tests)
const ROOM_IDLE_MS = 3 * 3600 * 1000;

// ---------- static files: the page, its art, and the two engine files it loads ----------
const TYPES_MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8' };
function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/' || p === '/index.html') p = '/rework-play/index.html';
  else if (!p.startsWith('/sim-rework/')) p = '/rework-play' + p;
  const allowed = p === '/sim-rework/engine.js' || p === '/sim-rework/bots.js' || /^\/rework-play\/(index\.html|net\.js|art\/[\w\-./]+)$/.test(p);
  const file = path.normalize(path.join(ROOT, p));
  if (!allowed || !file.startsWith(ROOT) || p.includes('..')) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES_MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': p.includes('/art/') ? 'public, max-age=86400' : 'no-cache' });
    res.end(data);
  });
}

// ---------- rooms ----------
const rooms = new Map();
const newCode = () => { const A = 'BCDFGHJKLMNPQRSTVWXZ'; let c; do { c = Array.from({ length: 4 }, () => A[crypto.randomInt(A.length)]).join(''); } while (rooms.has(c)); return c; };
const send = (ws, m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const COLOR_NAMES = ['Crimson', 'Cobalt', 'Emerald', 'Amber', 'Violet', 'Teal'];
const LPC = { bodies: ['male', 'female', 'muscular', 'teen'],   // a teen gets either head (body key teen_m or teen_f)
 
  hairs: ['page', 'wavy', 'princess', 'sara'], hairColors: ['black', 'white', 'red', 'orange', 'blonde', 'chestnut'], eyes: ['red', 'gold', 'black'] };
const pick = a => a[crypto.randomInt(a.length)];
// roughly how long clients take to animate a batch of events at normal speed, so bot turns don't race ahead
const ANIM_SLOW = 1.5;   // the page slows every animation by this (ANIM_SLOW in index.html); the pause after a bot turn follows it
const EV_MS = { duel: 2600, name: 2600, enslave: 1300, consume: 1500, reveal: 1500, swap: 1300, reincarnate: 1000, rebel: 1000, maskoff: 800 };

class Room {
  constructor(code) {
    this.code = code; this.seats = []; this.n = 4; this.bots = 'mix'; this.phase = 'lobby'; this.host = 0;
    this.g = null; this.gameId = 0; this.idx = -1; this.turnOpen = false; this.endTurn = null; this.evq = []; this.cur = null;
    this.ctx = {}; this.offers = new Map(); this.offerSeq = 0; this.touched = Date.now(); this.awayTimer = null; this.looks = null;
  }
  get humans() { return this.seats.filter(Boolean).length; }
  seatOf(ws) { return this.seats.findIndex(s => s && s.ws === ws); }
  publicSeats() { return Array.from({ length: this.phase === 'lobby' ? this.n : this.g.P.length }, (_, i) => { const s = this.seats[i]; return s ? { nick: s.nick, connected: !!s.ws, bot: false } : { bot: true }; }); }
  lobbyMsg() { return { t: 'lobby', code: this.code, phase: this.phase, n: this.n, bots: this.bots, host: this.host, humans: this.humans, seats: this.publicSeats() }; }
  broadcastLobby() { const m = this.lobbyMsg(); for (const s of this.seats) if (s) send(s.ws, m); }
  note(seat, text) { const s = this.seats[seat]; if (s) send(s.ws, { t: 'note', text }); }

  // ---------- game ----------
  start() {
    const n = this.n, kinds = Object.keys(TYPES);
    const bots = Array.from({ length: n }, (_, i) => this.seats[i] ? new HumanBot('human') : new Bot(this.bots === 'mix' ? pick(kinds) : this.bots));
    const g = new Game(n, bots, crypto.randomInt(1e9), {});
    g.trace = true; g.log = [];
    g.on = (type, data) => { this.evq.push({ type, data, before: this.cur, logN: g.log.length }); this.cur = this.snaps(); };
    for (const q of g.P) if (q.bot.human) q.needMask = true;
    this.backups = g.P.map(() => new Bot('balanced'));
    this.g = g; this.gameId++; this.phase = 'play'; this.idx = -1; this.ctx = {}; this.offers.clear(); this.winner = null;
    // skin: any hue (h), saturation (s) and lightness scale (k), shown once released; natural: a human tone worn until then (rollSkin / rollNatural in index.html)
    this.looks = Array.from({ length: n }, () => ({ body: (b => b === 'teen' ? pick(['teen_m', 'teen_f']) : b)(pick(LPC.bodies)), skin: { h: 50 + crypto.randomInt(305), s: (45 + crypto.randomInt(46)) / 100, k: (50 + crypto.randomInt(51)) / 100 }, natural: { h: 16 + crypto.randomInt(17), s: (30 + crypto.randomInt(31)) / 100, k: (40 + crypto.randomInt(63)) / 100 }, eyes: pick(LPC.eyes), hair: pick(LPC.hairs), hairColor: pick(LPC.hairColors) }));
    this.cur = this.snaps();
    this.broadcastLobby(); this.flush();
    this.loop().catch(err => { console.error(`room ${this.code}:`, err); this.say(`Server error: ${err.message}. The game stopped.`); this.phase = 'over'; this.flush(); });
  }
  snaps() { return this.g.P.map(q => snapView(this.g, this.idx, q.id, this.phase === 'over')); }
  say(s) { this.g.log.push(`R${this.g.round} ${s}`); }
  // send every player their view, the events since the last update (with the table as it was before each), and the log lines
  flush(actor = null, rid = null, res = null) {
    const g = this.g, over = this.phase === 'over', events = this.evq, log = g.log;
    this.evq = []; g.log = []; this.cur = this.snaps();
    for (let i = 0; i < g.P.length; i++) {
      const s = this.seats[i]; if (!s || !s.ws) continue;
      send(s.ws, { t: 'update', gameId: this.gameId, seat: i, idx: this.idx, myTurn: this.turnOpen && this.idx === i && !over, over, winner: this.winner,
        state: redact(g, i, over), looks: this.looks, seats: this.publicSeats(),
        events: events.map(e => ({ type: e.type, data: e.data, logN: e.logN, before: e.before ? e.before[i] : null })), log,
        ...(i === actor ? { rid, res } : {}) });
    }
    return events;
  }
  async loop() {
    const g = this.g, id = this.gameId;
    // everyone chooses a starting mask first (a minute at most; then the default stays)
    for (let t = 0; t < 600 && g.P.some(q => q.needMask && this.seats[q.id] && this.seats[q.id].ws); t++) await sleep(100);
    for (const q of g.P) q.needMask = false;
    this.flush();
    while (this.phase === 'play' && this.gameId === id) {
      this.idx++;
      if (this.idx >= g.P.length) { this.idx = 0; g.round++; this.say(`Round ${g.round} begins.`); }
      const p = g.P[this.idx], seat = this.seats[p.id]; g.turnNo++; this.cur = this.snaps();
      if (g.round > g.C.MAX_ROUNDS) { this.say('The round limit is reached: nobody wins.'); this.phase = 'over'; this.flush(); break; }
      if (seat && seat.ws) {
        const wasWaiting = p.status === 'waiting';
        if (!g.beginTurn(p)) { this.flush(); await this.pause([]); continue; }
        if (wasWaiting) p.needMask = true;
        this.turnOpen = true; this.flush();
        await new Promise(res => { this.endTurn = res; this.watchAway(p.id); });
        if (this.gameId !== id) return;
        this.finishTurn(p);
      } else {
        // a bot, or a player who is away: a bot plays the turn
        if (seat) { const hb = p.bot; p.bot = this.backups[p.id]; try { g.turn(p); } finally { p.bot = hb; } this.say(`${COLOR_NAMES[p.id]} is away: a bot played their turn.`); }
        else g.turn(p);
        if (p.status !== 'waiting') p.needMask = false;
        const ev = this.flush(); await this.pause(ev);
      }
      if (this.phase !== 'play' || this.checkWin()) break;
    }
  }
  finishTurn(p) {
    const g = this.g;
    if (this.ctx.looks && this.ctx.looks[p.id]) runCommand(g, p, 'draw3Keep', {}, this.ctx);
    p.needMask = false; this.turnOpen = false; this.endTurn = null; clearTimeout(this.awayTimer);
    for (const [oid, o] of this.offers) if (o.from === p.id) { this.offers.delete(oid); const s = this.seats[o.to]; if (s) send(s.ws, { t: 'offerGone', id: oid }); }
    g.endTurn(p);
    this.flush();
  }
  checkWin() {
    const w = this.g.winner();
    if (!w) return false;
    this.winner = w.id; this.phase = 'over'; this.turnOpen = false; this.say(`${COLOR_NAMES[w.id]} wins the game.`);
    this.flush(); this.broadcastLobby(); return true;
  }
  async pause(events) {
    if (!PACE) return;
    const ms = 500 + ANIM_SLOW * events.reduce((s, e) => s + (EV_MS[e.type] || 600), 0);
    await sleep(Math.min(ms, 18000) * PACE);
  }
  // end the current player's turn for them if they stay disconnected
  watchAway(pid) {
    clearTimeout(this.awayTimer);
    const s = this.seats[pid];
    if (s && !s.ws) this.awayTimer = setTimeout(() => { if (this.turnOpen && this.idx === pid && this.endTurn && !(this.seats[pid] || {}).ws) { this.say(`${COLOR_NAMES[pid]} is away: their turn ends.`); this.endTurn(); } }, AWAY_MS);
  }

  // ---------- messages from players ----------
  command(seat, m) {
    const g = this.g, p = g.P[seat];
    const reply = res => this.flush(seat, m.rid, res);
    if (this.phase !== 'play') return reply({ ok: false, msg: 'The game is over.' });
    const offTurn = m.cmd === 'chooseMask';
    if (!offTurn && !(this.turnOpen && this.idx === seat)) return reply({ ok: false, msg: 'It is not your turn.' });
    let res;
    try { res = runCommand(g, p, m.cmd, m.a || {}, this.ctx); } catch (err) { console.error(err); res = { ok: false, msg: 'Server error: ' + err.message }; }
    reply(res);
    if (res.ok && this.checkWin() && this.endTurn) this.endTurn();
  }
  offer(seat, m) {       // a trade offer to another person: { to, give, get } (see normDeal in net.js)
    const g = this.g, p = g.P[seat], q = g.P[m.to];
    if (this.phase !== 'play' || !(this.turnOpen && this.idx === seat)) return this.note(seat, 'You can only make offers on your turn.');
    if (!q || q === p || !this.seats[q.id] || !q.bot.human) return this.note(seat, 'That offer is not possible.');
    const give = normDeal(m.give), get = normDeal(m.get);
    if (!g.dealOk(p, q, give, get, true)) return this.note(seat, 'That offer is not possible right now.');   // blind: their cards are hidden from you
    const id = ++this.offerSeq; this.offers.set(id, { id, from: seat, to: q.id, give, get });
    send(this.seats[q.id].ws, { t: 'offer', id, from: seat, give, get });
  }
  offerReply(seat, m) {
    const o = this.offers.get(m.id); if (!o || o.to !== seat) return;
    this.offers.delete(m.id);
    const g = this.g, q = g.P[o.to];
    // asking for cards they don't hold reads as a decline, so offers can't be used to probe a hand
    const k = {}; for (const c of o.get.cards) k[c] = (k[c] || 0) + 1;
    const lacks = Object.entries(k).some(([c, n]) => !g.hasCard(q, c, n));
    if (m.yes && lacks) this.note(seat, "You don't hold the cards they asked for.");
    if (!m.yes || lacks) return this.note(o.from, `${COLOR_NAMES[seat]} declines your offer.`);
    if (!(this.turnOpen && this.idx === o.from)) return this.note(seat, 'That offer has lapsed.');
    const ok = g.deal(g.P[o.from], g.P[o.to], o.give, o.get);
    if (!ok) { this.note(seat, 'The trade is no longer possible.'); this.note(o.from, `${COLOR_NAMES[seat]} accepted, but the trade is no longer possible.`); }
    else this.note(o.from, `${COLOR_NAMES[seat]} accepts your offer.`);
    this.flush();
    if (ok && this.checkWin() && this.endTurn) this.endTurn();
  }
}

// ---------- connections ----------
function handle(ws, m) {
  const room = ws.room;
  switch (m.t) {
    case 'create': {
      if (room) leave(ws);
      const r = new Room(newCode()); rooms.set(r.code, r);
      const token = crypto.randomBytes(12).toString('hex');
      r.seats[0] = { nick: clean(m.nick), token, ws }; ws.room = r;
      send(ws, { t: 'welcome', code: r.code, seat: 0, token }); r.broadcastLobby();
      return;
    }
    case 'join': {
      const r = rooms.get(String(m.code || '').toUpperCase());
      if (!r) return send(ws, { t: 'error', text: 'No room with that code.', fatal: true });
      let seat = r.seats.findIndex(s => s && m.token && s.token === m.token);
      if (seat >= 0) { const old = r.seats[seat].ws; if (old && old !== ws) { old.room = null; old.close(); } r.seats[seat].ws = ws; }
      else {
        if (r.phase !== 'lobby') return send(ws, { t: 'error', text: 'That game has already started.', fatal: true });
        seat = Array.from({ length: MAX_SEATS }, (_, i) => i).find(i => !r.seats[i]);
        if (seat === undefined) return send(ws, { t: 'error', text: 'The room is full.', fatal: true });
        r.seats[seat] = { nick: clean(m.nick), token: crypto.randomBytes(12).toString('hex'), ws };
        r.n = Math.max(r.n, seat + 1, r.humans);
      }
      if (ws.room && ws.room !== r) leave(ws);
      ws.room = r; r.touched = Date.now();
      send(ws, { t: 'welcome', code: r.code, seat, token: r.seats[seat].token });
      r.broadcastLobby();
      if (r.phase !== 'lobby') { r.flush(); if (r.turnOpen && r.idx === seat) clearTimeout(r.awayTimer); }
      return;
    }
  }
  if (!room) return;
  room.touched = Date.now();
  const seat = room.seatOf(ws); if (seat < 0) return;
  switch (m.t) {
    case 'config':
      if (seat !== room.host || room.phase !== 'lobby') return;
      if (Number.isInteger(m.n)) room.n = Math.min(MAX_SEATS, Math.max(MIN_SEATS, m.n, room.seats.reduce((a, s, i) => s ? i + 1 : a, 0)));
      if (['mix', ...Object.keys(TYPES)].includes(m.bots)) room.bots = m.bots;
      room.broadcastLobby(); return;
    case 'start': if (seat === room.host && room.phase === 'lobby') room.start(); return;
    case 'restart':
      if ((seat !== room.host && (room.seats[room.host] || {}).ws) || room.phase !== 'over') return;
      room.host = seat;
      room.phase = 'lobby'; room.gameId++; room.broadcastLobby(); return;
    case 'cmd': if (room.phase === 'play' || room.phase === 'over') room.command(seat, m); return;
    case 'end': if (room.phase === 'play' && room.turnOpen && room.idx === seat && room.endTurn) room.endTurn(); return;
    case 'offer': room.offer(seat, m); return;
    case 'offerReply': room.offerReply(seat, m); return;
    case 'chat': { const text = String(m.text || '').slice(0, 200).trim(); if (text) for (const s of room.seats) if (s) send(s.ws, { t: 'chat', from: seat, text }); return; }
    case 'leave': leave(ws, true); return;
  }
}
const clean = s => String(s || 'Player').replace(/[<>&"]/g, '').trim().slice(0, 16) || 'Player';
function leave(ws, forGood = false) {
  const r = ws.room; if (!r) return;
  const seat = r.seatOf(ws); ws.room = null;
  if (seat < 0) return;
  if (r.phase === 'lobby' && forGood) { r.seats[seat] = undefined; if (seat === r.host) r.host = r.seats.findIndex(Boolean); }
  else r.seats[seat].ws = null;
  if (forGood && r.phase !== 'lobby') r.seats[seat].ws = null;
  if (!r.seats.some(s => s && s.ws)) { r.touched = Date.now(); }
  if (r.host < 0 || !r.seats.some(Boolean)) { rooms.delete(r.code); return; }
  r.broadcastLobby();
  if (r.phase === 'play') { if (r.turnOpen && r.idx === seat) r.watchAway(seat); r.flush(); }
}
setInterval(() => { for (const [code, r] of rooms) if (!r.seats.some(s => s && s.ws) && Date.now() - r.touched > ROOM_IDLE_MS) { r.gameId++; r.phase = 'over'; if (r.endTurn) r.endTurn(); rooms.delete(code); } }, 60000).unref();

const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200); return res.end('ok'); }
  serveStatic(req, res);
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
wss.on('connection', ws => {
  ws.room = null; ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', data => { let m; try { m = JSON.parse(data); } catch { return; } try { handle(ws, m); } catch (err) { console.error(err); } });
  ws.on('close', () => leave(ws));
});
setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); } }, 30000).unref();

if (require.main === module) {
  server.listen(PORT, () => {
    const ips = Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);
    console.log(`Court rework server on http://localhost:${PORT}`);
    for (const ip of ips) console.log(`  other devices on your network: http://${ip}:${PORT}`);
  });
}
module.exports = { server, rooms };
