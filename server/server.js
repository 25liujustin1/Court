// Court online: a small game server. Each room runs the playtest page's own rules code in a Node vm (the same way the
// sim does), so there is one copy of the rules. The server is the referee: it holds the real game state, routes each
// prompt to the player who must answer it, and sends every player a view with other players' secrets removed.
//
//   npm run server            then open http://localhost:3000 (other devices on your network: http://<your-ip>:3000)
//   PORT=8080 npm run server
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { loadPage } = require('../sim/page');

const PORT = +process.env.PORT || 3000;
const PAGE = path.join(__dirname, '..', 'playtest', 'index.html');
const CLIENT = path.join(__dirname, 'online.js');
const RULEBOOK = path.join(__dirname, '..', 'playtest', 'rulebook.pdf');
const MAX_PLAYERS = 6, MIN_PLAYERS = 3;

// Actions a player may take when it isn't their turn; everything else must come from the current player.
const OFF_TURN = new Set(['interrupt', 'contractVote', 'contractVerdict']);   // Pact votes come from any player, any time
// Page actions that only matter to the local pass-and-play screen.
const LOCAL_ONLY = new Set(['rules', 'namesRef', 'showTurn', 'hide', 'newGame', 'resume', 'setupStart', 'revealPick', 'cycle', 'randomPick', 'lockPick', 'pactsTab', 'home']);

const rooms = new Map();
const newCode = () => { const A = 'BCDFGHJKLMNPQRSTVWXZ'; let c; do { c = Array.from({ length: 4 }, () => A[crypto.randomInt(A.length)]).join(''); } while (rooms.has(c)); return c; };
const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };

// The read() functions in the page's prompts inspect the form inside the pop-up. The client sends the form's fields
// back; this is just enough of a DOM for those functions (ids, data-* attributes, :checked, [id^="..."]).
function fakeModal(fields) {
  const items = (fields || []).map(f => ({ tag: f.tag, id: f.id || '', value: f.value ?? '', checked: !!f.checked, dataset: f.dataset || {} }));
  const camel = a => a.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const matches = (f, sel) => {
    const m = sel.match(/^([a-z]+)?((?:\[[^\]]+\])*)(:checked)?$/);
    if (!m) return false;
    if (m[1] && f.tag !== m[1]) return false;
    for (const [, attr] of (m[2] || '').matchAll(/\[([^\]]+)\]/g)) {
      const pre = attr.match(/^id\^="([^"]*)"$/);
      if (pre) { if (!f.id.startsWith(pre[1])) return false; continue; }
      if (attr.startsWith('data-') && !(camel(attr) in f.dataset)) return false;
    }
    return !m[3] || f.checked;
  };
  return {
    querySelector: sel => sel.startsWith('#') ? items.find(f => f.id === sel.slice(1)) || null : items.find(f => matches(f, sel)) || null,
    querySelectorAll: sel => items.filter(f => matches(f, sel)),
  };
}

class Room {
  constructor(code) {
    this.code = code; this.players = []; this.phase = 'lobby'; this.picks = {};
    this.chat = []; this.chatSeq = 0;
    this.page = null; this.busy = false; this.pending = null; this.promptSeq = 0;
  }
  get api() { return this.page.api; }
  lobbyMsg() {
    return { t: 'lobby', code: this.code, phase: this.phase, host: 0, waitingFor: this.pending ? this.pending.to : null,
      players: this.players.map(p => ({ id: p.id, name: p.name, connected: !!p.ws, picked: this.picks[p.id] != null })) };
  }
  // what one player may see: their own secrets, everyone's public information
  view(pid) {
    const S = this.api.S, v = JSON.parse(JSON.stringify(S));
    if (S.phase !== 'over') {
      for (const q of v.players) {
        if (q.id === pid) continue;
        if (q.status !== 'dead') q.combo = null;
        q.events = q.events.map(() => '?');
        q.tokens = q.tokens.map(t => ({ id: t.id, owner: t.owner, dots: 0 }));
      }
      v.bag = v.bag.map(() => ({ id: -1, owner: null, dots: 0 }));
      v.deck = v.deck.map(() => '?');
    }
    return v;
  }
  broadcast() {
    const lobby = this.lobbyMsg();
    for (const p of this.players) {
      send(p.ws, lobby);
      if (this.page && (this.phase === 'play' || this.phase === 'over')) send(p.ws, { t: 'state', you: p.id, view: this.view(p.id) });
    }
  }
  // Chat: table talk to everyone, or a private message to one player. Private messages only ever go to the sender and
  // the recipient. The last 200 messages are kept so a reload brings the conversation back.
  chatVisible(pid) { return this.chat.filter(c => c.to == null || c.to === pid || c.from === pid); }
  sendChatHistory(pid) { send(this.players[pid].ws, { t: 'chatHistory', items: this.chatVisible(pid) }); }
  say(pid, to, text) {
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!text) return;
    if (to != null && (!Number.isInteger(to) || !this.players[to] || to === pid)) return;
    const c = { id: ++this.chatSeq, from: pid, to: to ?? null, text, ts: Date.now() };
    this.chat.push(c); if (this.chat.length > 200) this.chat.shift();
    for (const p of this.players) if (c.to == null || p.id === c.to || p.id === pid) send(p.ws, { t: 'chat', item: c });
  }
  toast(pid, msg) { send(this.players[pid] && this.players[pid].ws, { t: 'toast', msg }); }

  join(ws, name) {
    if (this.phase !== 'lobby') return { error: 'That game has already started.' };
    if (this.players.length >= MAX_PLAYERS) return { error: 'That room is full (6 players).' };
    const p = { id: this.players.length, name: String(name || '').trim().slice(0, 20) || `Player ${this.players.length + 1}`, secret: crypto.randomBytes(12).toString('hex'), ws };
    this.players.push(p);
    return p;
  }
  start(pid) {
    if (pid !== 0) return this.toast(pid, 'Only the host can start the game.');
    if (this.phase !== 'lobby') return;
    if (this.players.length < MIN_PLAYERS) return this.toast(pid, `You need at least ${MIN_PLAYERS} players.`);
    this.page = loadPage({ ONLINE: true });
    this.page.ctx.__ask = o => this.prompt(o);
    // Public announcements (a naming, a bind, a devour) go to every player at once and don't wait for anyone.
    this.page.ctx.__announce = (title, body) => { for (const p of this.players) send(p.ws, { t: 'announce', title: String(title), body: String(body || '') }); };
    this.phase = 'pick';
    this.broadcast();
  }
  pick(pid, combo) {
    if (this.phase !== 'pick') return;
    const key = this.api.keyOf(String(combo));
    if (!this.api.COMBOS.includes(key)) return this.toast(pid, 'That isn\'t a valid name.');
    this.picks[pid] = key;
    if (this.players.every(p => this.picks[p.id] != null)) {
      this.api.newGame(this.players.map(p => p.name));
      this.api.S.players.forEach(q => { q.combo = this.picks[q.id]; });
      this.api.startGame();
      this.phase = 'play';
    }
    this.broadcast();
  }

  // ---- actions and prompts ----
  async act(pid, act, data) {
    if (this.phase !== 'play') return;
    const api = this.api, S = api.S;
    if (!api.ACT[act] || LOCAL_ONLY.has(act)) return;
    if (this.busy) return this.toast(pid, 'Wait for the current action to finish.');
    if (!OFF_TURN.has(act) && S.current !== pid) return this.toast(pid, 'It isn\'t your turn.');
    if (act === 'interrupt' && S.players[pid].status !== 'alive') return this.toast(pid, 'Thralls can\'t act out of turn.');
    this.busy = true; S.actor = pid; S.promptTo = undefined;
    try { await api.ACT[act]({ dataset: data || {} }); await api.afterAction(); }
    catch (e) { console.error(`[${this.code}] ${act} failed:`, e); }
    finally {
      if (api.S) { api.S.actor = null; api.S.promptTo = undefined; }
      this.busy = false; this.pending = null;
      if (api.S && api.S.phase === 'over') this.phase = 'over';
      this.broadcast();
    }
  }
  prompt(o) {
    const S = this.api.S;
    const to = o.to ?? S.promptTo ?? S.actor ?? S.current;
    return new Promise(res => {
      this.pending = { id: ++this.promptSeq, to, o, res };
      this.broadcast();
      this.sendPrompt();
    });
  }
  sendPrompt(error) {
    const p = this.pending; if (!p) return;
    const pl = this.players[p.to];
    send(pl && pl.ws, { t: 'prompt', id: p.id, title: p.o.title, body: p.o.body || '', error: error || null,
      options: (p.o.options || []).map(x => ({ label: x.label, sub: x.sub || '', kind: x.kind || '', disabled: !!x.disabled, read: !!x.read })) });
  }
  answer(pid, msg) {
    const p = this.pending;
    if (!p || p.id !== msg.id || p.to !== pid) return;
    let value;
    if (msg.v !== undefined) value = msg.v;
    else {
      const opt = (p.o.options || [])[msg.i];
      if (!opt || opt.disabled) return;
      if (opt.read) {
        const r = opt.read(fakeModal(msg.form));
        if (r && r.error) return this.sendPrompt(r.error);
        value = r ? r.value : undefined;
      } else value = opt.value;
    }
    this.pending = null;
    send(this.players[pid].ws, { t: 'clearPrompt', id: p.id });
    p.res(value);
  }
}

// ---- HTTP: the playtest page in online mode, plus the client script ----
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const page = fs.readFileSync(PAGE, 'utf8');
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<script>globalThis.MADK_CONFIG = { ONLINE: true };</script></head><body class="online">
${page}
<script src="/online.js"></script></body></html>`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(html);
  }
  if (url.pathname === '/rulebook.pdf') {   // the printed rulebook, linked from the Rules pop-up and the start screen
    if (!fs.existsSync(RULEBOOK)) { res.writeHead(404); return res.end('No rulebook yet'); }
    res.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': 'inline; filename="Court rulebook.pdf"', 'cache-control': 'no-cache' });
    return fs.createReadStream(RULEBOOK).pipe(res);
  }
  if (url.pathname === '/online.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(fs.readFileSync(CLIENT));
  }
  res.writeHead(404); res.end('Not found');
});

// ---- WebSocket: lobby, actions, prompt answers ----
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', ws => {
  let room = null, me = null;
  ws.on('message', async raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'create') {
      room = new Room(newCode()); rooms.set(room.code, room);
      me = room.join(ws, m.name);
      send(ws, { t: 'joined', code: room.code, id: me.id, secret: me.secret }); room.sendChatHistory(me.id);
      return room.broadcast();
    }
    if (m.t === 'join') {
      const r = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!r) return send(ws, { t: 'toast', msg: 'No room with that code.' });
      const p = r.join(ws, m.name);
      if (p.error) return send(ws, { t: 'toast', msg: p.error });
      room = r; me = p;
      send(ws, { t: 'joined', code: room.code, id: me.id, secret: me.secret }); room.sendChatHistory(me.id);
      return room.broadcast();
    }
    if (m.t === 'rejoin') {
      const r = rooms.get(m.code); const p = r && r.players.find(x => x.secret === m.secret);
      if (!p) return send(ws, { t: 'rejoinFailed' });
      if (p.ws && p.ws !== ws) try { p.ws.close(); } catch {}
      room = r; me = p; p.ws = ws;
      send(ws, { t: 'joined', code: room.code, id: me.id, secret: me.secret }); room.sendChatHistory(me.id);
      room.broadcast();
      if (room.pending && room.pending.to === me.id) room.sendPrompt();
      return;
    }
    // Leaving (after the game is over): this socket stops getting the old room's updates.
    if (m.t === 'leave') { if (me && me.ws === ws) me.ws = null; room = null; me = null; return; }
    if (!room || !me) return;
    if (m.t === 'start') return room.start(me.id);
    if (m.t === 'pick') return room.pick(me.id, m.combo);
    if (m.t === 'act') return room.act(me.id, String(m.act), m.data);
    if (m.t === 'answer') return room.answer(me.id, m);
    if (m.t === 'chat') return room.say(me.id, m.to == null ? null : +m.to, m.text);
    // Test hook, only when the server runs with COURT_TEST=1: give the sender an event card.
    if (m.t === 'testGive' && process.env.COURT_TEST && room.api.S) { room.api.S.players[me.id].events.push(String(m.card)); return room.broadcast(); }
  });
  ws.on('close', () => { if (me && me.ws === ws) { me.ws = null; room && room.broadcast(); } });
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log(`Court server running.`);
  console.log(`  This computer:   http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`  Same network:    http://${ip}:${PORT}`));
});

module.exports = { server, rooms };
