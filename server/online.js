// Court online client. Runs on top of the playtest page (same rendering code), but the game lives on the server:
// this script shows the lobby, lets each player choose their name on their own device, sends actions to the server,
// shows the prompts the server routes to this player, and draws the view the server sends (other players' secrets
// already removed).
(() => {
  "use strict";
  const STORE = "court-online-seat";
  let sock = null, seat = null, lobby = null, prompt = null, draft = [1, 1, 1, 1], connectedOnce = false;
  // Your seat is remembered per TAB (sessionStorage): a reload puts you back in your seat, and every new tab is a new
  // player. (localStorage is shared by all tabs, which made every tab the same player.)
  try { seat = JSON.parse(sessionStorage.getItem(STORE) || "null"); } catch (e) { seat = null; }
  const saveSeat = () => { try { sessionStorage.setItem(STORE, JSON.stringify(seat)); } catch (e) {} };
  const roomInUrl = () => (new URLSearchParams(location.search).get("room") || "").toUpperCase();
  const app = () => document.querySelector("#app");

  // ---------- connection ----------
  function connect() {
    sock = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
    sock.onopen = () => { connectedOnce = true; if (seat) send({ t: "rejoin", code: seat.code, secret: seat.secret }); else draw(); };
    sock.onmessage = e => handle(JSON.parse(e.data));
    sock.onclose = () => { if (connectedOnce) toast("Connection lost, reconnecting…"); setTimeout(connect, 1500); };
  }
  const send = m => { if (sock && sock.readyState === 1) sock.send(JSON.stringify(m)); };
  window.__courtSend = send;   // used by server/test-online.js

  function handle(m) {
    if (m.t === "joined") { seat = { code: m.code, id: m.id, secret: m.secret }; saveSeat(); history.replaceState(null, "", `?room=${m.code}`); }
    else if (m.t === "rejoinFailed") { seat = null; saveSeat(); lobby = null; draw(); }
    else if (m.t === "lobby") { lobby = m; draw(); }
    else if (m.t === "state") { S = m.view; draw(); askPacts(); }
    else if (m.t === "prompt") showPrompt(m);
    else if (m.t === "clearPrompt") { if (prompt && prompt.id === m.id) { prompt = null; askPacts(); } }
    else if (m.t === "toast") toast(m.msg);
    else if (m.t === "announce") announceCard(m.title, m.body);
    else if (m.t === "chatHistory") { chat.items = m.items; chat.unread = 0; drawChat(); }
    else if (m.t === "chat") { chat.items.push(m.item); if (chat.items.length > 200) chat.items.shift(); if (!chat.open && m.item.from !== (seat && seat.id)) chat.unread++; drawChat(); }
  }

  // ---------- screens ----------
  const COLORS = ["Crimson", "Cobalt", "Emerald", "Amber", "Violet", "Teal"];
  const header = (extra = "") => `<header class="masthead"><div class="brand"><h1><a href="#" class="home-link" data-act="home" title="Back to the main screen">Court</a></h1><span>${extra}</span></div>
    <div class="toolbar"><button class="btn small" data-act="rules">Rules</button><button class="btn small" data-act="namesRef">Name table</button></div></header>`;
  const lobbyChip = p => `<span class="who" style="--pc:var(--c${p.id})"><i></i>${esc(p.name)}</span>`;

  function draw() {
    document.body.classList.add("online");
    drawChat();
    if (!seat || !lobby) return startScreen();
    if (lobby.phase === "lobby") return roomScreen();
    if (lobby.phase === "pick") return pickScreen();
    if (S && S.players) return gameScreen();
  }

  function startScreen() {
    app().innerHTML = `${header("online")}
      <section style="max-width:520px">
        <h2>Join the court</h2>
        <p class="muted">Each player uses their own device. One person creates a game and shares the code.</p>
        <p><label class="label" for="on-name">Your name</label><input type="text" id="on-name" maxlength="20" autocomplete="nickname"></p>
        <div class="toolbar"><button class="btn primary" data-oact="create">Create a game</button></div>
        <p style="margin-top:8px"><label class="label" for="on-code">Or join with a code</label><input type="text" id="on-code" maxlength="4" style="text-transform:uppercase" autocomplete="off" value="${esc(roomInUrl())}"></p>
        <div class="toolbar"><button class="btn" data-oact="join">Join game</button></div>
      </section>`;
  }

  function roomScreen() {
    const host = seat.id === lobby.host, n = lobby.players.length;
    app().innerHTML = `${header(`room ${lobby.code}`)}
      <section style="max-width:560px">
        <h2>Room ${lobby.code}</h2>
        <p class="muted">Share this code, or this page's link. ${n} of 6 players; at least 3 are needed.</p>
        <div style="display:flex;flex-direction:column;gap:8px">${lobby.players.map(p => `<div>${lobbyChip(p)} ${p.id === lobby.host ? '<span class="tag gold">host</span>' : ""} ${p.id === seat.id ? '<span class="muted">(you)</span>' : ""} ${p.connected ? "" : '<span class="tag warn">away</span>'}</div>`).join("")}</div>
        ${host ? `<div class="toolbar"><button class="btn primary" data-oact="start" ${n < 3 ? "disabled" : ""}>Start the game</button></div>` : `<p class="muted">Waiting for the host to start.</p>`}
      </section>`;
  }

  function pickScreen() {
    const mine = lobby.players[seat.id], done = lobby.players.filter(p => p.picked).length;
    if (mine.picked) {
      app().innerHTML = `${header(`room ${lobby.code}`)}<div class="handoff" style="--pc:var(--c${seat.id})"><span class="label">Choosing names</span>
        <div class="big">Waiting for the others</div><p class="muted">${done} of ${lobby.players.length} players have chosen.</p></div>`;
      return;
    }
    const c = keyOf(draft.join(""));
    app().innerHTML = `${header(`room ${lobby.code}`)}<section>
      <div class="section-head"><h2>${lobbyChip(mine)} choose your 4 name tokens</h2></div>
      <p class="muted">Tap a token to cycle 1 → 4 dots. Order doesn't matter. Nobody else sees this screen.</p>
      <div class="slots" style="--pc:var(--c${seat.id})">${draft.map((d, i) => `<button class="slot" data-oact="cycle" data-i="${i}" aria-label="Token ${i + 1}: ${d} dots"><svg viewBox="0 0 32 32" aria-hidden="true">${pipsSVG(d, 3)}</svg></button>`).join("")}</div>
      <div class="identity" style="--pc:var(--c${seat.id})"><div class="seal">${NAME_OF[c]}<small>${c}</small></div>
        <div class="facts"><span class="label">Your role</span><h2>${roleOfCombo(c)}</h2><span class="muted">Sum ${sumOf(c)} · mod 5 = ${sumOf(c) % 5}</span></div></div>
      <div class="toolbar"><button class="btn" data-oact="random">Random</button><button class="btn primary" data-oact="lock">Lock in</button></div>
      <p class="muted">${done} of ${lobby.players.length} players have chosen.</p></section>`;
  }

  function gameScreen() {
    VIEWER = seat.id;   // the Pacts tab shows only this player's vote buttons
    if (S.phase === "play" && PACT_TAB) { app().innerHTML = renderPacts(); return; }
    if (S.phase === "over") { app().innerHTML = renderOver().replace(/<button class="btn primary" data-act="newGame">New game<\/button>/, ""); return; }
    const I = P(seat.id), cur = P(S.current), mine = S.current === seat.id;
    const waitingFor = lobby && lobby.waitingFor != null && lobby.waitingFor !== seat.id ? P(lobby.waitingFor) : null;
    const waitNote = waitingFor ? `<div class="banner">Waiting for ${esc(waitingFor.name)} to decide…</div>` : "";
    if (mine && I.status !== "dead") {
      app().innerHTML = renderTurn().replace('<div class="toolbar"><button class="btn small" data-act="hide">Hide screen</button></div>', "") ;
      if (waitNote) app().insertAdjacentHTML("afterbegin", waitNote);
      return;
    }
    const identity = I.status === "dead"
      ? `<div class="handoff" style="--pc:var(--c${I.color})"><div class="big">You were devoured</div><p class="muted">You were ${NAME_OF[I.combo]}, the ${baseRole(I)}. You can keep watching the court.</p></div>`
      : `<div class="identity" style="--pc:var(--c${I.color})"><div class="seal">${NAME_OF[I.combo]}<small>${I.combo}</small></div>
          <div class="facts"><span class="label">Your secret name · keep it hidden</span><h2>${chip(I)}</h2>
          <div>${baseRole(I)} ${I.revealed ? '<span class="tag gold">revealed</span>' : '<span class="tag ok">hidden</span>'} ${I.status === "slave" ? `<span class="tag">thrall of ${esc(P(I.master).name)}</span>` : ""}</div></div></div>`;
    app().innerHTML = `${masthead()}
      <div class="handoff" style="--pc:var(--c${cur.color})"><span class="label">Round ${S.round}</span>
        <div class="big">${esc(cur.name)}'s turn</div>${waitNote}
        ${I.status === "alive" ? `<div class="toolbar"><button class="btn" data-act="interrupt">Act now<span class="sub">Name someone, or devour a marked Marquis, out of turn</span></button></div>` : ""}
      </div>
      ${identity}
      ${I.status !== "dead" ? `<section><div class="section-head"><h2>Your name tokens</h2><span class="label">Only you see the dots</span></div>${myTokens(I)}</section>
      <section><div class="section-head"><h2>Your event cards</h2><span class="label">Usable on your turn</span></div>${cardRows(I)}</section>` : ""}
      ${ledger()}${contractsHTML()}${logHTML()}`;
    app().querySelectorAll(".hand button").forEach(b => { b.disabled = true; });
  }

  // ---------- prompts from the server ----------
  function collect(m) {
    return [...m.querySelectorAll("input, select, textarea")].map(e => ({ tag: e.tagName.toLowerCase(), id: e.id, value: e.value, checked: !!e.checked, dataset: { ...e.dataset } }));
  }
  // A Pact waiting for this player's approval pops up on their screen. Server prompts take priority (a server prompt
  // replaces the pop-up; it comes back once that is answered). "Later" hides it; the vote stays on the Pacts tab.
  let pactShown = null; const pactLater = new Set();
  function askPacts() {
    if (!S || S.phase !== "play" || !seat || prompt || pactShown != null || !document.querySelector("#modal").hidden) return;
    const c = (S.contracts || []).find(c => c.status === "pending" && !pactLater.has(c.id) && pactApprovers(c).includes(seat.id) && !(seat.id in c.approvals));
    if (!c) return;
    pactShown = c.id;
    pactAsk(c, seat.id).then(v => {
      if (pactShown !== c.id) return;   // replaced by a server prompt
      pactShown = null;
      if (v === "yes" || v === "no") send({ t: "act", act: "contractVote", data: { id: String(c.id), v } });
      else { pactLater.add(c.id); askPacts(); }
    });
  }
  function showPrompt(m) {
    prompt = m; pactShown = null;
    const options = m.options.map((o, i) => ({ label: o.label, sub: o.sub, kind: o.kind, disabled: o.disabled,
      value: { i }, read: o.read ? (modal => ({ value: { i, form: collect(modal) } })) : undefined }));
    ask({ title: m.title, body: m.body, options }).then(res => {
      if (prompt !== m) return;
      if (typeof res === "string") send({ t: "answer", id: m.id, v: res });
      else if (res && res.i !== undefined) send({ t: "answer", id: m.id, i: res.i, form: res.form });
    });
    if (m.error) { const e = document.querySelector("#modal .err"); if (e) { e.textContent = m.error; e.hidden = false; } }
  }

  // ---------- clicks ----------
  document.addEventListener("click", e => {
    const o = e.target.closest("[data-oact]");
    if (o) {
      e.preventDefault(); e.stopImmediatePropagation();
      const a = o.dataset.oact;
      if (a === "create") send({ t: "create", name: document.querySelector("#on-name").value });
      if (a === "join") send({ t: "join", code: document.querySelector("#on-code").value, name: document.querySelector("#on-name").value });
      if (a === "start") send({ t: "start" });
      if (a === "cycle") { draft[+o.dataset.i] = draft[+o.dataset.i] % 4 + 1; draw(); }
      if (a === "random") { draft = [...COMBOS[Math.floor(Math.random() * COMBOS.length)]].map(Number); draw(); }
      if (a === "lock") send({ t: "pick", combo: draft.join("") });
      return;
    }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (b.disabled || !document.querySelector("#modal").hidden) return;
    const act = b.dataset.act;
    if (act === "rules" || act === "namesRef") { ACT[act](); return; }   // reference pop-ups stay on this device
    if (act === "hide" || act === "showTurn" || act === "newGame") return;
    if (act === "home") {
      PACT_TAB = false;
      // once the game is over, the title leaves the room and goes back to the start screen
      if (seat && lobby && (lobby.phase === "over" || (S && S.phase === "over"))) {
        send({ t: "leave" }); seat = null; saveSeat(); lobby = null; S = null; prompt = null;
        chat.items = []; chat.unread = 0; chat.open = false;
        history.replaceState(null, "", location.pathname);
      }
      draw(); window.scrollTo(0, 0); return;
    }
    if (act === "pactsTab") { PACT_TAB = !PACT_TAB; draw(); window.scrollTo(0, 0); return; }   // a view on this device only
    send({ t: "act", act, data: { ...b.dataset } });
  }, true);

  // ---------- announcements ----------
  // Big public events (namings, binds, devours) appear as cards at the top of every player's screen. They don't block
  // play; each one closes with its X or by itself after 12 seconds.
  function announceCard(title, body) {
    let box = document.querySelector("#court-announce");
    if (!box) { box = document.createElement("div"); box.id = "court-announce"; box.setAttribute("aria-live", "assertive"); document.body.appendChild(box); }
    const card = document.createElement("div"); card.className = "announce-card"; card.setAttribute("role", "status");
    card.innerHTML = `<button type="button" class="x-btn" aria-label="Close" title="Close">&times;</button><h3>${title}</h3><p>${body}</p>`;
    const close = () => card.remove();
    card.querySelector(".x-btn").addEventListener("click", e => { e.stopPropagation(); close(); });
    box.appendChild(card);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(close, 12000);
  }

  // ---------- chat ----------
  // A panel in the corner of every screen: table talk to everyone, or a private message to one player.
  const chat = { items: [], open: false, unread: 0, to: "" };
  const nameOf = id => (lobby && lobby.players[id] ? lobby.players[id].name : `Player ${id + 1}`);
  function drawChat() {
    let el = document.querySelector("#court-chat");
    if (!seat || !lobby) { if (el) el.hidden = true; return; }
    if (!el) {
      el = document.createElement("aside"); el.id = "court-chat"; document.body.appendChild(el);
      el.addEventListener("submit", e => {
        e.preventDefault();
        const input = el.querySelector("#chat-text"), text = input.value.trim();
        if (!text) return;
        const to = el.querySelector("#chat-to").value;
        send({ t: "chat", text, to: to === "" ? null : +to });
        input.value = ""; input.focus();
      });
      el.addEventListener("click", e => {
        if (e.target.closest("[data-chat-toggle]")) { chat.open = !chat.open; if (chat.open) chat.unread = 0; drawChat(); if (chat.open) el.querySelector("#chat-text")?.focus(); }
      }, true);
      el.addEventListener("change", e => { if (e.target.id === "chat-to") chat.to = e.target.value; });
    }
    el.hidden = false;
    el.classList.toggle("open", chat.open);
    const others = lobby.players.filter(p => p.id !== seat.id);
    if (!others.some(p => String(p.id) === chat.to)) chat.to = chat.to === "" ? "" : "";
    const line = c => {
      const priv = c.to != null, mine = c.from === seat.id;
      const who = `<b style="color:var(--c${c.from})">${esc(mine ? "You" : nameOf(c.from))}</b>`;
      const tag = priv ? `<span class="chat-priv">${mine ? `to ${esc(nameOf(c.to))}` : "to you"}, privately</span>` : "";
      return `<div class="chat-line${priv ? " priv" : ""}">${who} ${tag}<div>${esc(c.text)}</div></div>`;
    };
    const keepScroll = el.querySelector(".chat-log");
    const atBottom = !keepScroll || keepScroll.scrollTop + keepScroll.clientHeight >= keepScroll.scrollHeight - 20;
    const typed = el.querySelector("#chat-text") ? el.querySelector("#chat-text").value : "";
    const hadFocus = document.activeElement && document.activeElement.id === "chat-text";
    el.innerHTML = `<button type="button" class="chat-tab" data-chat-toggle aria-expanded="${chat.open}">Chat${chat.unread ? `<span class="chat-badge">${chat.unread}</span>` : ""}</button>
      <div class="chat-body" ${chat.open ? "" : "hidden"}>
        <div class="chat-head"><span class="label">Table talk</span><button type="button" class="x-btn" data-chat-toggle aria-label="Close chat" title="Close chat">&times;</button></div>
        <div class="chat-log" aria-live="polite">${chat.items.length ? chat.items.map(line).join("") : `<p class="muted">No messages yet. Say hello, make a deal, or lie.</p>`}</div>
        <form class="chat-form">
          <select id="chat-to" aria-label="Send to"><option value="">To everyone</option>${others.map(p => `<option value="${p.id}" ${String(p.id) === chat.to ? "selected" : ""}>Privately to ${esc(p.name)}</option>`).join("")}</select>
          <div class="chat-send"><input type="text" id="chat-text" maxlength="400" autocomplete="off" placeholder="Message…" value="${esc(typed)}"><button class="btn primary small" type="submit">Send</button></div>
        </form>
      </div>`;
    const log = el.querySelector(".chat-log");
    if (log && atBottom) log.scrollTop = log.scrollHeight;
    if (hadFocus) { const i = el.querySelector("#chat-text"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }

  // ---------- small helpers ----------
  let toastTimer = null;
  function toast(msg) {
    let t = document.querySelector("#court-toast");
    if (!t) { t = document.createElement("div"); t.id = "court-toast"; document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
  }
  const css = document.createElement("style");
  css.textContent = `body.online [data-act="newGame"]{display:none}
    body.online{padding-bottom:90px}
    #court-announce{position:fixed; top:16px; left:50%; transform:translateX(-50%); z-index:45; display:flex; flex-direction:column; gap:8px; width:min(480px, calc(100vw - 32px)); pointer-events:none}
    #court-announce .announce-card{pointer-events:auto; position:relative; background:var(--bg); border:1px solid var(--rule); border-top:4px solid var(--accent); border-radius:6px; box-shadow:0 6px 24px rgb(40 20 10 / .3); padding:12px 44px 12px 16px; animation:court-drop .25s ease-out}
    #court-announce h3{margin:0 0 4px; font-variant:small-caps; color:var(--accent)}
    #court-announce p{margin:0}
    #court-announce .x-btn{position:absolute; top:6px; right:6px; margin:0}
    @keyframes court-drop{from{transform:translateY(-12px); opacity:0} to{transform:none; opacity:1}}
    @media (prefers-reduced-motion:reduce){ #court-announce .announce-card{animation:none} }
    #court-chat{position:fixed; right:16px; bottom:16px; z-index:40; display:flex; flex-direction:column; align-items:flex-end; gap:8px; max-width:calc(100vw - 32px)}
    #court-chat .chat-tab{font:inherit; font-variant:small-caps; font-size:1.05rem; color:var(--on-accent); background:var(--accent); border:0; border-radius:999px; padding:10px 18px; cursor:pointer; box-shadow:0 2px 8px rgb(40 20 10 / .25); display:inline-flex; align-items:center; gap:8px}
    #court-chat.open .chat-tab{display:none}
    #court-chat .chat-badge{background:var(--on-accent); color:var(--accent); border-radius:999px; min-width:22px; height:22px; padding:0 6px; font-family:var(--font-head); font-size:.8rem; font-weight:600; display:inline-flex; align-items:center; justify-content:center}
    #court-chat .chat-body{width:340px; max-width:100%; height:440px; max-height:calc(100vh - 32px); background:var(--bg); border:1px solid var(--rule); border-top:3px solid var(--accent); border-radius:6px; box-shadow:0 6px 24px rgb(40 20 10 / .25); display:flex; flex-direction:column}
    #court-chat .chat-head{display:flex; align-items:center; justify-content:space-between; padding:8px 8px 6px 14px; border-bottom:2px solid var(--rule)}
    #court-chat .chat-head .x-btn{position:static; margin:0}
    #court-chat .chat-log{flex:1; overflow:auto; padding:10px 14px; display:flex; flex-direction:column; gap:8px; font-size:.95rem}
    #court-chat .chat-line.priv{border-left:3px solid var(--accent); padding-left:8px; background:var(--surface)}
    #court-chat .chat-priv{font-style:italic; color:var(--muted); font-size:.85rem}
    #court-chat .chat-form{border-top:1px solid var(--line); padding:8px; display:flex; flex-direction:column; gap:6px}
    #court-chat .chat-form select, #court-chat .chat-form input{min-height:38px}
    #court-chat .chat-send{display:flex; gap:6px}
    #court-chat .chat-send input{flex:1}
    @media (max-width:560px){ #court-chat .chat-body{width:calc(100vw - 32px); height:60vh} }
    #court-toast{position:fixed; left:50%; bottom:24px; transform:translateX(-50%); z-index:60; background:var(--ink); color:var(--bg); padding:10px 16px; border-radius:6px; font-size:.95rem; max-width:90vw}`;
  document.head.appendChild(css);

  connect();
  draw();
})();
