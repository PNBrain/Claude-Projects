/* Clocktower Grimoire – client. Vanilla JS, no build step. */
(function () {
  'use strict';
  const C = window.BOTC;
  const CH = C.CHARACTERS;

  // ------------------------------------------------------------ utils
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
  };
  const cname = (id) => (CH[id] ? CH[id].name : id ? id : '—');
  const cteam = (id) => (CH[id] ? CH[id].team : '');
  const initials = (name) => name.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let key = store.get('botc.key');
  let role = store.get('botc.role'); // st | player | spectator
  let V = null; // latest server view
  let es = null;
  const ui = {
    tab: null, sel: null, compose: null, scriptQ: '', showAllChars: false, editScript: false,
    nominator: '', nominee: '', exiler: '', exilee: '', clockMs: 2000, seenMsgs: null, newInfo: false,
    notesOpen: {}, logNote: '', logPublic: false,
  };
  let notes = null;
  let pendingRender = false;

  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
  }

  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-key': key || '' }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
    return j;
  }
  async function act(type, data) {
    try { await post('/api/action', { type, ...(data || {}) }); return true; } catch (e) { toast(e.message, 4000); return false; }
  }

  // ------------------------------------------------------------ connection
  function connect() {
    if (es) es.close();
    es = new EventSource('/api/events?key=' + encodeURIComponent(key || ''));
    es.onmessage = (e) => {
      const v = JSON.parse(e.data);
      if (v.role === 'kicked') { logout(v.reason); return; }
      if ((role === 'st' || role === 'player') && v.role !== role) { logout('Your session has expired. Please sign in again.'); return; }
      const first = !V;
      V = v;
      if (v.role === 'player') onPlayerView(first);
      render();
    };
    es.onerror = () => { const b = $('#conn'); if (b) b.classList.add('off'); };
    es.onopen = () => { const b = $('#conn'); if (b) b.classList.remove('off'); };
  }
  function logout(reason) {
    if (es) es.close();
    es = null; V = null; key = null; role = null; notes = null; ui.tab = null; ui.seenMsgs = null;
    store.del('botc.key'); store.del('botc.role');
    render();
    if (reason) toast(reason, 5000);
  }
  function onPlayerView(first) {
    const msgs = (V.me && V.me.messages) || [];
    if (ui.seenMsgs === null) ui.seenMsgs = msgs.length;
    else if (msgs.length > ui.seenMsgs) {
      ui.seenMsgs = msgs.length;
      if (ui.tab !== 'me') ui.newInfo = true;
      toast('New information from the Storyteller');
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    }
    if (first || !notes) loadNotes();
  }

  // ------------------------------------------------------------ notes (player)
  function notesKey() { return 'botc.notes.' + (V && V.me ? V.me.id : 'x'); }
  function loadNotes() {
    let local = null;
    try { local = JSON.parse(store.get(notesKey()) || 'null'); } catch { /* */ }
    const server = V.notes;
    notes = (server && (!local || (server.savedAt || 0) >= (local.savedAt || 0))) ? server : local;
    if (!notes) notes = { general: '', seats: {} };
    notes.seats = notes.seats || {};
  }
  let notesTimer = null;
  function saveNotes() {
    notes.savedAt = Date.now();
    store.set(notesKey(), JSON.stringify(notes));
    clearTimeout(notesTimer);
    notesTimer = setTimeout(() => post('/api/notes', { notes }).catch(() => toast('Notes saved on this device only (server unreachable)')), 700);
  }
  function seatNote(id) { return (notes.seats[id] = notes.seats[id] || { claim: '', read: '', text: '', cands: [] }); }

  // ------------------------------------------------------------ rendering infra
  function busy(el) {
    const a = document.activeElement;
    return a && el && el.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(a.type)));
  }
  document.addEventListener('focusout', () => setTimeout(() => { if (pendingRender && !busy($('#app')) && !busy($('#modal'))) render(); }, 0));

  function render() {
    const app = $('#app');
    if (!V) {
      if (!role || (role !== 'spectator' && !key)) { app.innerHTML = landing(); return; }
      app.innerHTML = '<div class="loading">Connecting to the Town Square…</div>';
      if (!es) connect();
      return;
    }
    if (busy(app) || busy($('#modal'))) { pendingRender = true; return; }
    pendingRender = false;
    const tabs = tabList();
    if (!ui.tab || !tabs.find((t) => t[0] === ui.tab)) ui.tab = tabs[0][0];
    const scrollY = window.scrollY;
    app.innerHTML = header() + `<nav class="tabs">${tabs.map(([id, label, icon]) => `<button data-act="tab" data-tab="${id}" class="${ui.tab === id ? 'on' : ''}"><span class="ti">${icon}</span><span>${label}</span>${id === 'me' && ui.newInfo ? '<i class="dot"></i>' : ''}</button>`).join('')}</nav><main class="main tab-${ui.tab}">${body()}</main>`;
    window.scrollTo(0, scrollY);
    renderModal();
  }
  function tabList() {
    if (V.role === 'st') return [['grim', 'Grimoire', '◉'], ['setup', 'Setup', '⚙'], ['night', 'Night', '☾'], ['day', 'Day', '☀'], ['log', 'Log', '☰'], ['more', 'More', '⋯']];
    if (V.role === 'player') return [['town', 'Town', '◉'], ['me', 'Me', '♟'], ['notes', 'Notes', '✎'], ['script', 'Script', '❖'], ['log', 'Log', '☰']];
    return [['town', 'Town', '◉'], ['script', 'Script', '❖'], ['log', 'Log', '☰']];
  }
  function phaseLabel() {
    if (V.phase === 'setup') return '<span class="ph setup">Setting up</span>';
    if (V.phase === 'night') return `<span class="ph night">☾ ${V.nightNumber === 1 ? 'First night' : 'Night ' + V.nightNumber}</span>`;
    if (V.phase === 'day') return `<span class="ph day">☀ Day ${V.dayNumber}</span>`;
    return `<span class="ph ended ${V.winner}">${V.winner === 'good' ? 'Good wins' : V.winner === 'evil' ? 'Evil wins' : 'Game over'}</span>`;
  }
  function header() {
    const who = V.role === 'st' ? 'Storyteller' : V.role === 'player' ? esc(V.me.name) : 'Spectator';
    return `<header class="top"><div class="brand"><span class="logo">⌚</span><span>${esc(C.EDITIONS[V.edition] || 'Clocktower')}</span></div>${phaseLabel()}<div class="who"><i id="conn" class="conn"></i>${who}</div></header>`;
  }
  function body() {
    switch (ui.tab) {
      case 'grim': return stGrimoire();
      case 'setup': return stSetup();
      case 'night': return stNight();
      case 'day': return stDay();
      case 'more': return stMore();
      case 'town': return townTab();
      case 'me': return meTab();
      case 'notes': return notesTab();
      case 'script': return scriptTab();
      case 'log': return logTab();
      default: return '';
    }
  }

  // ------------------------------------------------------------ landing
  function landing() {
    return `<div class="landing">
      <div class="crest">⌚</div>
      <h1>Blood on the Clocktower</h1>
      <p class="sub">Town Square &amp; Grimoire</p>
      <form class="card" data-form="join">
        <h2>Join as a player</h2>
        <label>Your name<input name="name" maxlength="30" autocomplete="nickname" placeholder="e.g. Sarah"></label>
        <details><summary>Rejoining on another device?</summary><label>Rejoin code<input name="code" maxlength="6" autocapitalize="characters" placeholder="From the Me tab"></label></details>
        <button class="btn primary" type="submit">Join the town</button>
      </form>
      <form class="card" data-form="claim">
        <h2>Storyteller</h2>
        <label>8-digit token<input name="token" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" autocomplete="one-time-code" placeholder="••••••••"></label>
        <button class="btn gold" type="submit">Claim control</button>
        <p class="hint">Claiming signs out any other Storyteller device.</p>
      </form>
      <button class="btn ghost" data-act="spectate">Just watch the Town Square</button>
    </div>`;
  }

  // ------------------------------------------------------------ the circle
  function seatPos(i, n, size) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = 47 - size * 0.62; // keep tokens and name labels inside the circle
    return { x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a), a };
  }
  function circle(mode) {
    const seats = mode === 'st' ? V.full.seats : V.seats;
    const n = seats.length;
    if (!n) return `<div class="circle empty"><div class="center"><p>No seats yet.</p>${mode === 'st' ? '<p class="hint">Players appear here when they join. Add seats in Setup.</p>' : ''}</div></div>`;
    const size = Math.max(10.5, Math.min(19, 215 / n));
    const v = V.vote;
    let hand = '';
    if (v && v.index >= 0 && v.index < v.order.length) {
      const i = seats.findIndex((s) => s.id === v.order[v.index]);
      if (i > -1) hand = `<div class="clockhand" style="transform:rotate(${(i / n) * 360}deg)"></div>`;
    }
    const pubById = Object.fromEntries(V.seats.map((s) => [s.id, s]));
    const items = seats.map((s, i) => {
      const p = seatPos(i, n, size);
      const pub = pubById[s.id] || s;
      const cls = ['seat', s.alive ? 'alive' : 'dead', s.isTraveller ? 'trav' : ''];
      if (mode === 'st' && ui.sel === s.id) cls.push('sel');
      if (mode === 'player' && V.me.seatId === s.id) cls.push('mine');
      let badges = '';
      if (v) {
        if (v.nominee === s.id) cls.push('nominee');
        if (v.order[v.index] === s.id) cls.push('current');
        const counted = v.order.indexOf(s.id) < v.index && s.id in v.votes;
        if (counted) badges += `<i class="vb ${v.votes[s.id] ? 'yes' : 'no'}">${v.votes[s.id] ? '✓' : '✗'}</i>`;
        else if (v.hands[s.id]) badges += '<i class="vb vhand">✋</i>';
      }
      if (!s.alive) badges += s.voteToken ? '<i class="gv" title="Has a ghost vote">●</i>' : '<i class="gv used" title="Ghost vote used">○</i>';
      let inner;
      if (mode === 'st') {
        const t = cteam(s.character);
        const marks = (s.drunk ? '<b class="mk dr">D</b>' : '') + (s.poisoned ? '<b class="mk po">P</b>' : '') + (s.reminders.length ? `<b class="mk rm">${s.reminders.length}</b>` : '') + (s.alignment && s.character && s.alignment !== C.defaultAlignment(s.character) && t !== 'traveller' ? `<b class="mk al">${s.alignment === 'evil' ? 'E' : 'G'}</b>` : '');
        inner = `<span class="tok team-${t || 'none'} ${s.alignment === 'evil' ? 'evil' : ''}"><span class="cn ${cname(s.character).length > 9 ? 'long' : ''}">${s.character ? esc(cname(s.character)) : '?'}</span>${s.shownChar ? `<span class="sc">thinks ${esc(cname(s.shownChar))}</span>` : ''}${marks}</span>`;
      } else {
        const tr = s.isTraveller && pub.character ? `<span class="sc">${esc(cname(pub.character))}</span>` : '';
        inner = `<span class="tok life"><span class="cn">${esc(initials(s.name) || '?')}</span>${tr}</span>`;
      }
      const online = pub.linked ? `<i class="on ${pub.online ? 'yes' : ''}"></i>` : '';
      return `<button class="${cls.join(' ')}" style="left:${p.x}%;top:${p.y}%;--sz:${size}cqmin" data-act="seat" data-id="${s.id}">${inner}<span class="nm">${online}${esc(s.name)}</span>${badges}</button>`;
    }).join('');
    return `<div class="circle">${hand}${items}<div class="center">${circleCenter(mode)}</div></div>`;
  }
  function circleCenter(mode) {
    const v = V.vote;
    if (v) {
      return `<div class="cv"><div class="k">${v.kind === 'exile' ? 'Exile' : 'Vote'}</div><div class="big">${v.tally}<small>/${v.needed}</small></div><div class="s">${esc(seatName(v.nominee))}</div>${V.day.highest && v.kind !== 'exile' ? `<div class="s dim">to beat ${V.day.highest}</div>` : ''}</div>`;
    }
    const alive = V.seats.filter((s) => s.alive).length;
    let s = `<div class="cv"><div class="big">${alive}<small>/${V.seats.length}</small></div><div class="s">alive</div>`;
    const votes = V.seats.filter((x) => x.alive || x.voteToken).length;
    s += `<div class="s dim">${plural(votes, 'vote')}</div>`;
    if (V.day && V.day.onBlock && V.phase === 'day') s += `<div class="s block">⚖ ${esc(seatName(V.day.onBlock))}</div>`;
    if (mode === 'st' && V.full.bluffs.length) s += `<div class="s dim bl">Bluffs: ${V.full.bluffs.map(cname).map(esc).join(', ')}</div>`;
    return s + '</div>';
  }
  const seatName = (id) => (V.seats.find((s) => s.id === id) || {}).name || '?';

  // ------------------------------------------------------------ shared bits
  function charCard(id, extra = '') {
    const c = CH[id]; if (!c) return '';
    return `<div class="cc team-${c.team}"><div class="cch"><span class="tokmini team-${c.team}">${esc(initials(c.name))}</span><b>${esc(c.name)}</b><span class="tm">${esc(C.TEAM_LABEL[c.team].replace(/s$/, ''))}</span>${extra}</div><p>${esc(c.ability)}</p></div>`;
  }
  function charOptions(selected, opts = {}) {
    const script = new Set(V.script);
    const groups = {};
    for (const id of C.ORDER) {
      const c = CH[id];
      if (c.team === 'fabled' && !opts.fabled) continue;
      const inScript = script.has(id) || c.team === 'traveller';
      if (!inScript && !ui.showAllChars && !opts.all && id !== selected) continue;
      (groups[c.team] = groups[c.team] || []).push(id);
    }
    let html = `<option value="">${esc(opts.empty || '— none —')}</option>`;
    for (const t of C.TEAMS) {
      if (!groups[t]) continue;
      if (opts.teams && !opts.teams.includes(t)) continue;
      html += `<optgroup label="${C.TEAM_LABEL[t]}">${groups[t].map((id) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${esc(CH[id].name)}${script.has(id) || CH[id].team === 'traveller' ? '' : ' *'}</option>`).join('')}</optgroup>`;
    }
    return html;
  }
  function seatOptions(selected, filter, empty = '— choose —') {
    return `<option value="">${empty}</option>` + V.seats.filter(filter || (() => true)).map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}${s.alive ? '' : ' (dead)'}</option>`).join('');
  }
  function distRow(n) {
    const d = C.distribution(n);
    if (!d) return `<p class="hint">${n} players: Clocktower needs at least 5.</p>`;
    return `<div class="dist"><span><b>${d[0]}</b> Townsfolk</span><span><b>${d[1]}</b> Outsider${d[1] === 1 ? '' : 's'}</span><span><b>${d[2]}</b> Minion${d[2] === 1 ? '' : 's'}</span><span><b>${d[3]}</b> Demon</span></div>`;
  }

  // ------------------------------------------------------------ ST: Grimoire
  function stGrimoire() {
    let out = winBanner();
    out += `<div class="grim-layout"><div class="grim-circle">${circle('st')}</div><div class="grim-side">${ui.sel ? seatEditor() : grimHelp()}</div></div>`;
    return out;
  }
  function winBanner() {
    if (!V.winHints || !V.winHints.length) return '';
    return V.winHints.map((h) => `<div class="banner ${h.team}"><span>${esc(h.text)}</span><button class="btn sm ${h.team === 'good' ? 'primary' : 'danger'}" data-act="win" data-team="${h.team}">Declare ${h.team} win</button></div>`).join('');
  }
  function grimHelp() {
    const f = V.full;
    const fab = V.fabled.length ? `<div class="sect"><h3>Fabled in play</h3>${V.fabled.map((id) => charCard(id)).join('')}</div>` : '';
    return `<div class="card"><h3>Grimoire</h3><p class="hint">Tap a seat to change its character, life, drunkenness, poisoning and reminders, or to send that player private info.</p>
      ${f.seats.length ? distRow(f.seats.filter((s) => !s.isTraveller).length) : ''}
      <div class="legend"><span><b class="mk dr">D</b> drunk</span><span><b class="mk po">P</b> poisoned</span><span><b class="mk rm">n</b> reminders</span><span><b class="mk al">E</b> alignment flipped</span><span>● ghost vote</span></div></div>${fab}`;
  }
  function seatEditor() {
    const s = V.full.seats.find((x) => x.id === ui.sel);
    if (!s) { ui.sel = null; return grimHelp(); }
    const pub = V.seats.find((x) => x.id === s.id) || {};
    const remOpts = [];
    const inPlay = new Set(V.full.seats.map((x) => x.character).filter(Boolean).concat(V.fabled));
    for (const id of inPlay) for (const r of (CH[id] ? CH[id].reminders : [])) remOpts.push([id, r]);
    const player = V.players.find((p) => p.id === s.playerId);
    return `<div class="card editor">
      <div class="edh"><input class="title-in" data-change="renameSeat" data-id="${s.id}" value="${esc(s.name)}" aria-label="Seat name"><button class="btn sm ghost" data-act="closeSel">✕</button></div>
      <p class="hint">${player ? `Linked to ${esc(player.name)}'s device ${pub.online ? '<span class="ok">● online</span>' : '<span class="dim">○ offline</span>'}` : 'No device linked'}</p>
      <label>Character<select data-change="assign" data-id="${s.id}">${charOptions(s.character)}</select></label>
      ${s.character ? charCard(s.character) : ''}
      <label>Player thinks they are <select data-change="setShown" data-id="${s.id}">${charOptions(s.shownChar, { empty: '(their real character)' })}</select></label>
      <div class="row wrap">
        <div class="seg"><button class="${s.alignment !== 'evil' ? 'on good' : ''}" data-act="align" data-id="${s.id}" data-v="good">Good</button><button class="${s.alignment === 'evil' ? 'on evil' : ''}" data-act="align" data-id="${s.id}" data-v="evil">Evil</button></div>
        <button class="chip ${s.alive ? '' : 'on dead'}" data-act="alive" data-id="${s.id}" data-v="${s.alive ? 0 : 1}">${s.alive ? '♥ Alive' : '✝ Dead'}</button>
        ${s.alive ? '' : `<button class="chip ${s.voteToken ? 'on' : ''}" data-act="ghost" data-id="${s.id}" data-v="${s.voteToken ? 0 : 1}">${s.voteToken ? '● Ghost vote' : '○ Vote used'}</button>`}
        <button class="chip ${s.drunk ? 'on dr' : ''}" data-act="flag" data-id="${s.id}" data-flag="drunk">Drunk</button>
        <button class="chip ${s.poisoned ? 'on po' : ''}" data-act="flag" data-id="${s.id}" data-flag="poisoned">Poisoned</button>
        <button class="chip ${s.isTraveller ? 'on trav' : ''}" data-act="trav" data-id="${s.id}" data-v="${s.isTraveller ? 0 : 1}">Traveller</button>
      </div>
      <label>Vote counts as <select data-change="setVoteMod" data-id="${s.id}"><option value="1">1 (normal)</option><option value="3" ${s.voteMod === 3 ? 'selected' : ''}>3 (Bureaucrat)</option><option value="-1" ${s.voteMod === -1 ? 'selected' : ''}>−1 (Thief)</option></select></label>
      <div class="sect"><h4>Reminders</h4>
        <div class="chips">${s.reminders.map((r) => `<span class="rem">${r.charId ? `<small>${esc(cname(r.charId))}</small>` : ''}${esc(r.text)}<button data-act="remRem" data-id="${s.id}" data-r="${r.id}" aria-label="Remove">✕</button></span>`).join('') || '<span class="dim">none</span>'}</div>
        <div class="row"><select data-change="addRem" data-id="${s.id}"><option value="">+ Add reminder…</option>${remOpts.map(([id, r]) => `<option value="${esc(id + '|' + r)}">${esc(cname(id))}: ${esc(r)}</option>`).join('')}<option value="|Drunk">Drunk</option><option value="|Poisoned">Poisoned</option><option value="|Dead">Dead</option><option value="|No ability">No ability</option></select>
        <input id="customRem" placeholder="Custom…" maxlength="40"><button class="btn sm" data-act="addCustomRem" data-id="${s.id}">Add</button></div>
      </div>
      <label>Private Storyteller note<textarea data-change="setStNote" data-id="${s.id}" rows="2">${esc(s.stNote)}</textarea></label>
      <div class="sect"><h4>Tell this player (on their device)</h4>
        <div class="row wrap">
          <button class="btn sm gold" data-act="reveal" data-id="${s.id}" ${s.character ? '' : 'disabled'}>Show their character${s.revealed ? ' again' : ''}</button>
          <button class="btn sm" data-act="compose" data-id="${s.id}">Send info…</button>
          <button class="btn sm" data-act="quick" data-id="${s.id}" data-k="yes">Nod (yes)</button>
          <button class="btn sm" data-act="quick" data-id="${s.id}" data-k="no">Shake (no)</button>
        </div>
        ${s.messages.length ? `<details><summary>${plural(s.messages.length, 'message')} sent</summary>${s.messages.slice().reverse().map(msgView).join('')}</details>` : ''}
      </div>
      <div class="row wrap end">
        <button class="btn sm ghost" data-act="move" data-id="${s.id}" data-dir="-1">⟲ Move back</button>
        <button class="btn sm ghost" data-act="move" data-id="${s.id}" data-dir="1">Move forward ⟳</button>
      </div>
    </div>`;
  }

  // ------------------------------------------------------------ ST: Setup
  function stSetup() {
    const f = V.full;
    const nonTrav = f.seats.filter((s) => !s.isTraveller);
    const n = nonTrav.length;
    const unseated = V.players.filter((p) => !p.seatId);
    let out = '';
    // Edition
    out += `<section class="card"><h3>1 · Edition</h3><div class="row wrap">${Object.entries(C.EDITIONS).map(([id, label]) => `<button class="chip ${V.edition === id ? 'on' : ''}" data-act="edition" data-ed="${id}">${esc(label)}</button>`).join('')}</div>
      ${V.edition === 'custom' ? `<button class="btn sm" data-act="toggleScriptEdit">${ui.editScript ? 'Done editing script' : `Edit custom script (${V.script.length} characters)`}</button>${ui.editScript ? scriptEditor() : ''}` : `<p class="hint">${V.script.length} characters on this script.</p>`}
    </section>`;
    // Seats
    out += `<section class="card"><h3>2 · Seats <small class="dim">(clockwise order)</small></h3>
      <ol class="seatlist">${f.seats.map((s, i) => `<li><span class="num">${i + 1}</span><input data-change="renameSeat" data-id="${s.id}" value="${esc(s.name)}" maxlength="30">
        <span class="ctl"><button class="ib" data-act="move" data-id="${s.id}" data-dir="-1" aria-label="Up">↑</button><button class="ib" data-act="move" data-id="${s.id}" data-dir="1" aria-label="Down">↓</button>
        <select data-change="linkSeat" data-id="${s.id}" aria-label="Linked device"><option value="">no device</option>${V.players.map((p) => `<option value="${p.id}" ${s.playerId === p.id ? 'selected' : ''}>${esc(p.name)}${p.online ? ' ●' : ''}</option>`).join('')}</select>
        <button class="ib ${s.isTraveller ? 'on' : ''}" data-act="trav" data-id="${s.id}" data-v="${s.isTraveller ? 0 : 1}" title="Traveller">T</button><button class="ib danger" data-act="removeSeat" data-id="${s.id}" aria-label="Remove">✕</button></span></li>`).join('')}</ol>
      <div class="row"><input id="newSeat" placeholder="Add a seat (player without a device)" maxlength="30"><button class="btn sm" data-act="addSeat">Add</button><button class="btn sm ghost" data-act="shuffleSeats">Shuffle</button></div>
      ${unseated.length ? `<div class="sect"><h4>Joined but not seated</h4>${unseated.map((p) => `<div class="row"><span>${esc(p.name)}</span><button class="btn sm" data-act="seatPlayer" data-p="${p.id}">Seat</button><button class="btn sm ghost" data-act="seatPlayer" data-p="${p.id}" data-trav="1">Seat as Traveller</button></div>`).join('')}</div>` : ''}
    </section>`;
    // Pool
    const pool = f.pool;
    const counts = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
    pool.forEach((id) => { if (counts[cteam(id)] !== undefined) counts[cteam(id)]++; });
    const d = C.distribution(n);
    const mods = pool.filter((id) => CH[id].setup).map((id) => `${cname(id)}: ${CH[id].setup}`);
    const expect = d ? [...d] : null;
    if (expect) { let m = 0; pool.forEach((id) => { if (C.OUTSIDER_MOD[id]) m += C.OUTSIDER_MOD[id]; }); expect[1] = Math.max(0, d[1] + m); expect[0] = d[0] - (expect[1] - d[1]); }
    out += `<section class="card"><h3>3 · Characters in the bag</h3>
      ${d ? `<p>For <b>${n}</b> non-Traveller players:</p>${distRow(n)}` : `<p class="hint">Add at least 5 non-Traveller seats.</p>`}
      ${mods.length ? `<p class="hint">Setup changes: ${esc(mods.join(' · '))}${pool.includes('godfather') ? ' (Godfather assumed +1; adjust if you chose −1)' : ''}${pool.includes('drunk') ? ' · Drunk counts as an Outsider but the player is shown a Townsfolk' : ''}</p>` : ''}
      <div class="poolcount">${['townsfolk', 'outsider', 'minion', 'demon'].map((t, i) => `<span class="team-${t} ${expect && counts[t] !== expect[i] ? 'bad' : 'good'}">${counts[t]}${expect ? '/' + expect[i] : ''} ${C.TEAM_LABEL[t]}</span>`).join('')}<span class="${pool.length === n ? 'good' : 'bad'}">${pool.length}/${n} total</span></div>
      ${['townsfolk', 'outsider', 'minion', 'demon'].map((t) => `<div class="pickrow"><h4 class="team-${t}">${C.TEAM_LABEL[t]}</h4><div class="chips">${V.script.filter((id) => cteam(id) === t).map((id) => `<button class="chip team-${t} ${pool.includes(id) ? 'on' : ''}" data-act="pool" data-c="${id}" title="${esc(CH[id].ability)}">${esc(cname(id))}</button>`).join('')}</div></div>`).join('')}
      <div class="row wrap"><button class="btn" data-act="randomPool" ${d ? '' : 'disabled'}>🎲 Random bag</button><button class="btn ghost" data-act="clearPool">Clear</button><button class="btn primary" data-act="deal" ${pool.length === n && n ? '' : 'disabled'}>Deal bag to seats at random</button></div>
      <p class="hint">Or assign characters one by one: tap a seat on the Grimoire tab.</p>
    </section>`;
    // Bluffs & fabled
    out += `<section class="card"><h3>4 · Demon bluffs &amp; Fabled</h3>
      <div class="row wrap">${[0, 1, 2].map((i) => `<select data-change="bluff" data-i="${i}">${charOptions(f.bluffs[i], { teams: ['townsfolk', 'outsider'], empty: `Bluff ${i + 1}` })}</select>`).join('')}<button class="btn sm" data-act="autoBluffs">Suggest</button></div>
      <h4>Fabled</h4><div class="chips">${C.ORDER.filter((id) => cteam(id) === 'fabled').map((id) => `<button class="chip team-fabled ${V.fabled.includes(id) ? 'on' : ''}" data-act="fabled" data-c="${id}" title="${esc(CH[id].ability)}">${esc(cname(id))}</button>`).join('')}</div>
    </section>`;
    // Start
    const assigned = f.seats.filter((s) => s.character).length;
    out += `<section class="card"><h3>5 · Begin</h3>
      <p>${assigned}/${f.seats.length} seats have a character. ${f.seats.filter((s) => s.revealed).length} players have been shown theirs.</p>
      <div class="row wrap"><button class="btn gold" data-act="reveal" data-id="all" ${assigned ? '' : 'disabled'}>Send every player their character</button>
      ${V.phase === 'setup' ? `<button class="btn primary" data-act="startNight">☾ Start the first night</button>` : ''}</div>
      <p class="hint">Players see their character on the <b>Me</b> tab. Drunk and Lunatic players are shown the character they think they are.</p>
    </section>`;
    return out;
  }
  function scriptEditor() {
    const script = new Set(V.script);
    return `<div class="scripted">${['townsfolk', 'outsider', 'minion', 'demon'].map((t) => `<div class="pickrow"><h4 class="team-${t}">${C.TEAM_LABEL[t]}</h4><div class="chips">${C.ORDER.filter((id) => cteam(id) === t).map((id) => `<button class="chip team-${t} ${script.has(id) ? 'on' : ''}" data-act="scriptToggle" data-c="${id}" title="${esc(CH[id].ability)}">${esc(cname(id))}</button>`).join('')}</div></div>`).join('')}</div>`;
  }

  // ------------------------------------------------------------ ST: Night
  function nightSteps() {
    const f = V.full;
    const first = V.nightNumber <= 1;
    const list = first ? C.FIRST_NIGHT : C.OTHER_NIGHT;
    const nonTrav = f.seats.filter((s) => !s.isTraveller).length;
    const steps = [];
    for (const [id, text] of list) {
      if (id === 'dusk' || id === 'dawn') { steps.push({ id, name: id === 'dusk' ? 'Dusk' : 'Dawn', text, seats: [] }); continue; }
      if (id === 'minioninfo' || id === 'demoninfo') {
        if (nonTrav >= 7) steps.push({ id, name: id === 'minioninfo' ? 'Minion info' : 'Demon info', text, seats: [], evilInfo: true });
        continue;
      }
      const seats = f.seats.filter((s) => (s.character === id && !(s.character === 'drunk')) || (s.character === 'drunk' && s.shownChar === id) || (s.character === 'lunatic' && id === 'lunatic'));
      if (seats.length) steps.push({ id, name: cname(id), text, seats });
    }
    return steps;
  }
  function stNight() {
    if (V.phase !== 'night') {
      return `<div class="card"><h3>Night</h3><p>${V.phase === 'setup' ? 'The game hasn\'t started yet.' : 'It is currently day.'}</p>
        <button class="btn primary" data-act="startNight">☾ Start ${V.phase === 'setup' ? 'the first night' : 'night ' + (V.nightNumber + 1)}</button>
        <p class="hint">Previewing the ${V.nightNumber < 1 ? 'first' : 'next'} night order:</p></div>` + nightList(true);
    }
    const unrevealed = V.full.seats.filter((s) => s.character && !s.revealed).length;
    return `${winBanner()}<div class="card"><h3>☾ ${V.nightNumber === 1 ? 'First night' : 'Night ' + V.nightNumber}</h3>
      <p class="hint">Work down the list. Greyed rows are dead players: wake them only if their ability says so.</p>
      ${unrevealed ? `<div class="banner"><span>${plural(unrevealed, 'player')} haven't been shown their character.</span><button class="btn sm gold" data-act="reveal" data-id="all">Send characters</button></div>` : ''}
    </div>` + nightList(false) + `<div class="card"><button class="btn primary wide" data-act="startDay">☀ Dawn: start day ${V.nightNumber}</button><p class="hint">Players who died since dusk are announced automatically.</p></div>`;
  }
  function nightList(preview) {
    const steps = nightSteps();
    if (preview && V.nightNumber >= 1) { /* show next night = other nights */ }
    const done = V.full.nightDone || {};
    return `<ol class="night">${steps.map((st) => {
      const allDead = st.seats.length && st.seats.every((s) => !s.alive);
      const who = st.seats.map((s) => `<span class="who ${s.alive ? '' : 'dead'}">${esc(s.name)}${s.character === 'drunk' ? ' <em>(Drunk)</em>' : ''}${s.drunk ? ' <b class="mk dr">D</b>' : ''}${s.poisoned ? ' <b class="mk po">P</b>' : ''}${s.alive ? '' : ' ✝'}</span>`).join('');
      const btns = preview ? '' : st.seats.filter((s) => s.playerId).map((s) => `<button class="btn xs" data-act="compose" data-id="${s.id}" data-night="${st.id}">Send to ${esc(s.name)}</button>`).join('') + (st.evilInfo && st.id === 'demoninfo' ? `<button class="btn xs gold" data-act="evilInfo">Send Minion &amp; Demon info to devices</button>` : '');
      return `<li class="step ${done[st.id] ? 'done' : ''} ${allDead ? 'deadstep' : ''} team-${cteam(st.id) || 'special'}">
        ${preview ? '' : `<button class="check" data-act="nightDone" data-k="${st.id}" aria-label="Done">${done[st.id] ? '✓' : ''}</button>`}
        <div class="stepb"><div class="sth"><b>${esc(st.name)}</b>${who}</div><p>${esc(st.text)}</p>${btns ? `<div class="row wrap">${btns}</div>` : ''}</div></li>`;
    }).join('')}</ol>`;
  }

  // ------------------------------------------------------------ ST: Day
  function stDay() {
    let out = winBanner();
    if (V.phase !== 'day') {
      out += `<div class="card"><h3>Day</h3><p>${V.phase === 'night' ? 'It is night.' : V.phase === 'setup' ? 'The game hasn\'t started.' : 'The game is over.'}</p>
        ${V.phase === 'night' ? `<button class="btn primary" data-act="startDay">☀ Dawn: start day ${V.nightNumber}</button>` : ''}</div>`;
      return out + nominationHistory();
    }
    const d = V.day;
    const alive = V.seats.filter((s) => s.alive).length;
    out += `<div class="card"><h3>☀ Day ${V.dayNumber}</h3><p>${alive} alive · a successful vote needs <b>${Math.ceil(alive / 2)}</b>${d.highest ? ` and must beat <b>${d.highest}</b>` : ''}.</p>`;
    if (d.executed) out += `<div class="banner"><span>${esc(seatName(d.executed))} was executed today.</span></div>`;
    else if (d.onBlock) out += `<div class="banner block"><span>⚖ <b>${esc(seatName(d.onBlock))}</b> is about to die (${d.highest} votes).</span><span class="row"><button class="btn sm danger" data-act="execute" data-id="${d.onBlock}" data-dies="1">Execute</button><button class="btn sm ghost" data-act="execute" data-id="${d.onBlock}" data-dies="0">Executed, survives</button></span></div>`;
    out += `<div class="row wrap"><button class="btn" data-act="startNight">☾ End the day: start night ${V.nightNumber + 1}</button></div></div>`;
    out += V.vote ? votePanel() : nominationForm();
    return out + nominationHistory();
  }
  function nominationForm() {
    const d = V.day;
    const travs = V.seats.filter((s) => s.isTraveller && s.alive);
    return `<div class="card"><h3>New nomination</h3>
      <div class="row wrap"><label>Nominator<select data-change="uiSet" data-k="nominator">${seatOptions(ui.nominator, null)}</select></label>
      <label>Nominee<select data-change="uiSet" data-k="nominee">${seatOptions(ui.nominee, null)}</select></label></div>
      <button class="btn primary" data-act="nominate">Nominate</button>
      <p class="hint">Already nominated today: ${d.nominators.map(seatName).map(esc).join(', ') || 'nobody'} · Already nominees: ${d.nominees.map(seatName).map(esc).join(', ') || 'nobody'}</p>
    </div>
    ${travs.length ? `<div class="card"><h3>Exile a Traveller</h3><div class="row wrap"><label>Called by<select data-change="uiSet" data-k="exiler">${seatOptions(ui.exiler)}</select></label><label>Traveller<select data-change="uiSet" data-k="exilee">${seatOptions(ui.exilee, (s) => s.isTraveller && s.alive)}</select></label></div><button class="btn" data-act="exile">Call for exile</button><p class="hint">Exile needs support from half of all players (${Math.ceil(V.seats.length / 2)}), alive or dead. It isn't an execution.</p></div>` : ''}`;
  }
  function votePanel() {
    const v = V.vote;
    const full = Object.fromEntries(V.full.seats.map((s) => [s.id, s]));
    return `<div class="card vote"><h3>${v.kind === 'exile' ? 'Exile' : 'Vote'}: ${esc(seatName(v.nominator))} → <b>${esc(seatName(v.nominee))}</b></h3>
      <div class="tally"><span class="big">${v.tally}</span> / ${v.needed} needed${V.day.highest && v.kind !== 'exile' ? ` · to beat ${V.day.highest}` : ''}</div>
      <div class="row wrap">
        ${v.running ? '<button class="btn" data-act="voteStop">⏸ Pause clock</button>' : `<button class="btn primary" data-act="voteStart" ${v.done ? 'disabled' : ''}>▶ ${v.index < 0 ? 'Start' : 'Resume'} the clock</button>`}
        <select data-change="uiSet" data-k="clockMs" aria-label="Clock speed">${[1000, 1500, 2000, 3000, 4000].map((ms) => `<option value="${ms}" ${+ui.clockMs === ms ? 'selected' : ''}>${ms / 1000}s per player</option>`).join('')}</select>
        <button class="btn" data-act="voteStep" ${v.done ? 'disabled' : ''}>Step ▸</button>
        <button class="btn ghost" data-act="voteReset">Reset</button>
      </div>
      <ol class="voters">${v.order.map((id, i) => {
        const s = full[id]; const can = v.canVote[id];
        const counted = i < v.index;
        const mod = s.voteMod !== 1 ? `<b class="mk">${s.voteMod === 3 ? '×3' : '−1'}</b>` : '';
        return `<li class="${i === v.index ? 'cur' : ''} ${counted ? 'counted' : ''} ${can ? '' : 'novote'}">
          <span class="nm">${esc(s.name)}${s.alive ? '' : ' ✝'}${id === v.nominee ? ' <em>(nominee)</em>' : ''}${mod}</span>
          <span class="st">${!can ? 'no vote token' : v.hands[id] ? '✋ hand up' : 'hand down'}</span>
          <span class="seg sm"><button class="${counted && v.votes[id] ? 'on good' : ''}" data-act="voteSet" data-id="${id}" data-v="1" ${can ? '' : 'disabled'}>Yes</button><button class="${counted && !v.votes[id] ? 'on evil' : ''}" data-act="voteSet" data-id="${id}" data-v="0">No</button></span>
          ${s.playerId ? '' : `<button class="ib ${v.hands[id] ? 'on' : ''}" data-act="voteHand" data-id="${id}" data-v="${v.hands[id] ? 0 : 1}" title="Set hand for player without a device" ${can ? '' : 'disabled'}>✋</button>`}
        </li>`;
      }).join('')}</ol>
      <div class="row wrap"><button class="btn gold" data-act="voteFinish">Record result</button><button class="btn ghost danger" data-act="voteCancel">Withdraw nomination</button></div>
      <p class="hint">Players raise their hand on their own device; the clock locks each vote in as it passes. Dead players' ghost votes are used up when the result is recorded.</p>
    </div>`;
  }
  function nominationHistory() {
    const noms = V.nominations.slice().reverse();
    if (!noms.length) return '';
    const res = { onBlock: 'about to die', tie: 'tie', failed: 'failed', exiled: 'exiled', notExiled: 'not exiled' };
    return `<div class="card"><h3>Nominations</h3><table class="noms"><thead><tr><th>Day</th><th>Nomination</th><th>Votes</th><th>Result</th></tr></thead><tbody>${noms.map((n) => `<tr><td>${n.day}</td><td>${esc(seatName(n.nominator))} → <b>${esc(seatName(n.nominee))}</b>${n.kind === 'exile' ? ' <em>(exile)</em>' : ''}<div class="voters-inline">${n.voters.map(seatName).map(esc).join(', ') || '—'}</div></td><td>${n.count}/${n.needed}</td><td class="r-${n.result}">${res[n.result] || n.result}</td></tr>`).join('')}</tbody></table></div>`;
  }

  // ------------------------------------------------------------ ST: More
  function stMore() {
    return `<div class="card"><h3>Game</h3><div class="row wrap">
        <button class="btn" data-act="undo" ${V.canUndo ? '' : 'disabled'}>↶ Undo last change</button>
        <button class="btn primary" data-act="win" data-team="good">Declare Good win</button>
        <button class="btn danger" data-act="win" data-team="evil">Declare Evil win</button>
        ${V.winner ? '<button class="btn ghost" data-act="win" data-team="">Resume game</button>' : ''}
      </div><div class="row wrap">
        <button class="btn" data-act="newGame" data-keep="0">New game (same seats)</button>
        <button class="btn ghost" data-act="newGame" data-keep="1">Restart, same characters</button>
      </div>
      <label class="inline"><input type="checkbox" data-change="showAll" ${ui.showAllChars ? 'checked' : ''}> Show off-script characters in pickers</label></div>
      <div class="card"><h3>Devices</h3>
        <p>Players open ${V.lanUrls.length ? V.lanUrls.map((u) => `<code>${esc(u)}</code>`).join(' or ') : 'this server\'s address'} on the same Wi-Fi.</p>
        <table class="noms"><thead><tr><th>Player</th><th>Code</th><th>Seat</th><th></th></tr></thead><tbody>${V.players.map((p) => `<tr><td>${p.online ? '<span class="ok">●</span>' : '<span class="dim">○</span>'} ${esc(p.name)}</td><td><code>${esc(p.code)}</code></td><td>${p.seatId ? esc(seatName(p.seatId)) : '<em>unseated</em>'}</td><td><button class="btn xs ghost danger" data-act="kick" data-p="${p.id}">Remove</button></td></tr>`).join('') || '<tr><td colspan="4" class="dim">Nobody has joined yet.</td></tr>'}</tbody></table>
      </div>
      <div class="card"><h3>Storyteller</h3><p class="hint">To use another device, enter the token there. This device is then signed out.</p><button class="btn ghost" data-act="logout">Sign out of Storyteller</button></div>`;
  }

  // ------------------------------------------------------------ Player: Town
  function townTab() {
    let out = '';
    if (V.phase === 'ended') out += `<div class="banner ${V.winner}"><span>${V.winner === 'good' ? '🕊 Good wins!' : '🔥 Evil wins!'}</span></div>`;
    if (V.role === 'player' && !V.me.seatId) out += `<div class="banner"><span>You've joined. The Storyteller will seat you shortly.</span></div>`;
    out += `<div class="town">${circle(V.role === 'player' ? 'player' : 'spec')}</div>`;
    const v = V.vote;
    if (v) {
      const mine = V.role === 'player' && V.me.seatId;
      const idx = mine ? v.order.indexOf(V.me.seatId) : -1;
      const counted = idx > -1 && idx < v.index;
      const can = mine && v.canVote[V.me.seatId];
      const up = mine && v.hands[V.me.seatId];
      out += `<div class="card vote pv"><h3>${v.kind === 'exile' ? 'Exile' : 'Vote'}: ${esc(seatName(v.nominator))} nominated <b>${esc(seatName(v.nominee))}</b></h3>
        <div class="tally"><span class="big">${v.tally}</span> / ${v.needed} needed${V.day.highest && v.kind !== 'exile' ? ` · to beat ${V.day.highest}` : ''}</div>
        ${v.index >= 0 && v.index < v.order.length ? `<p>The clock hand is on <b>${esc(seatName(v.order[v.index]))}</b>.</p>` : v.done ? '<p>Counting finished.</p>' : '<p>Waiting for the Storyteller to start the count.</p>'}
        ${mine ? (counted ? `<div class="locked ${v.votes[V.me.seatId] ? 'yes' : 'no'}">Your vote was counted: ${v.votes[V.me.seatId] ? 'YES' : 'no'}</div>` : can ? `<button class="hand ${up ? 'up' : ''}" data-act="hand" data-v="${up ? 0 : 1}">${up ? '✋ Hand raised: tap to lower' : 'Raise hand to vote'}</button>${!V.seats.find((s) => s.id === V.me.seatId).alive ? '<p class="hint">You are dead: voting uses your one ghost vote.</p>' : ''}` : '<p class="hint">You have no vote token left.</p>') : ''}
      </div>`;
    }
    if (V.phase === 'day' && V.day.onBlock && !v) out += `<div class="banner block"><span>⚖ ${esc(seatName(V.day.onBlock))} is about to die with ${V.day.highest} votes.</span></div>`;
    if (V.phase === 'day' && V.day.executed) out += `<div class="banner"><span>${esc(seatName(V.day.executed))} was executed today.</span></div>`;
    const nonTrav = V.seats.filter((s) => !s.isTraveller).length;
    out += `<div class="card"><h3>This game</h3>${nonTrav >= 5 ? distRow(nonTrav) : ''}
      ${V.seats.filter((s) => s.isTraveller && s.character).map((s) => charCard(s.character, `<span class="dim">· ${esc(s.name)}</span>`)).join('')}
      ${V.fabled.map((id) => charCard(id)).join('')}
      <p class="hint">● ghost vote available · ○ ghost vote used. Dead players can vote only once more.</p></div>`;
    const today = V.nominations.filter((n) => n.day === V.dayNumber);
    if (today.length && V.phase === 'day') out += `<div class="card"><h3>Today's votes</h3>${today.map((n) => `<p>${esc(seatName(n.nominator))} → <b>${esc(seatName(n.nominee))}</b>: ${n.count} vote${n.count === 1 ? '' : 's'} <span class="dim">(${n.voters.map(seatName).map(esc).join(', ') || 'none'})</span></p>`).join('')}</div>`;
    return out;
  }

  // ------------------------------------------------------------ Player: Me
  function msgView(m) {
    let h = `<div class="msg ${m.kind}"><div class="mh"><span>${m.phase === 'night' ? '☾ Night ' + m.night : m.phase === 'day' ? '☀ Day' : '•'}</span><span class="dim">${fmtTime(m.t)}</span></div>`;
    if (m.text) h += `<div class="mt">${esc(m.text)}</div>`;
    if (m.number !== undefined) h += `<div class="mnum">${m.number}</div>`;
    if (m.yes !== undefined) h += `<div class="myes ${m.yes ? 'y' : 'n'}">${m.yes ? 'Yes (nod)' : 'No (shake)'}</div>`;
    if (m.align) h += `<div class="malign ${m.align}">${m.align === 'good' ? '👍 Good' : '👎 Evil'}</div>`;
    if (m.seats && m.seats.length) h += `<div class="mseats">${m.seats.map((id) => `<span class="pchip">👉 ${esc(seatName(id))}</span>`).join('')}</div>`;
    if (m.chars && m.chars.length) h += m.chars.map((id) => charCard(id)).join('');
    return h + '</div>';
  }
  function meTab() {
    ui.newInfo = false;
    const me = V.me;
    let out = '';
    if (me.character) {
      const c = CH[me.character];
      const align = me.alignment || (c ? C.defaultAlignment(me.character) : 'good');
      out += `<div class="card mychar team-${c.team}"><div class="kicker">You are</div><h2>${esc(c.name)}</h2>
        <div class="row"><span class="badge team-${c.team}">${esc(C.TEAM_LABEL[c.team].replace(/s$/, ''))}</span><span class="badge ${align}">${align === 'good' ? 'Good' : 'Evil'}</span></div>
        <p class="ability">${esc(c.ability)}</p><p class="hint">Keep your screen away from your neighbours.</p></div>`;
    } else out += `<div class="card"><h3>Your character</h3><p class="dim">${me.seatId ? 'The Storyteller hasn\'t shown you your character yet.' : 'You haven\'t been seated yet.'}</p></div>`;
    const msgs = (me.messages || []).slice().reverse();
    out += `<div class="card"><h3>From the Storyteller</h3>${msgs.length ? msgs.map(msgView).join('') : '<p class="dim">Nothing yet. Private information you receive at night appears here.</p>'}</div>`;
    out += `<div class="card"><h3>Device</h3><p>Rejoin code: <code class="code">${esc(me.code)}</code></p><p class="hint">Use this code to continue on another phone, tablet or laptop.</p>
      <div class="row"><input id="rename" value="${esc(me.name)}" maxlength="30" aria-label="Your name"><button class="btn sm" data-act="rename">Rename</button></div>
      <button class="btn ghost sm" data-act="leave">Leave this device</button></div>`;
    return out;
  }

  // ------------------------------------------------------------ Player: Notes
  const READS = [['', '?', 'Unknown'], ['trust', '★', 'Trusted'], ['good', 'G', 'Probably good'], ['sus', '?!', 'Suspicious'], ['evil', 'E', 'Probably evil'], ['demon', 'D', 'Demon?']];
  function notesTab() {
    if (!notes) return '<div class="loading">Loading notes…</div>';
    const scriptChars = V.script.concat(C.editionTravellers(V.edition));
    const tally = {};
    for (const s of V.seats) { const r = (notes.seats[s.id] || {}).read || ''; tally[r] = (tally[r] || 0) + 1; }
    let out = `<div class="card"><h3>My notes <small class="dim">(private to you)</small></h3>
      <textarea class="general" data-note="general" rows="4" placeholder="Theories, timelines, who said what…">${esc(notes.general || '')}</textarea>
      <div class="readsum">${READS.filter(([k]) => tally[k]).map(([k, b, l]) => `<span class="rd rd-${k || 'none'}">${b} ${tally[k]} ${l.toLowerCase()}</span>`).join('')}</div></div>`;
    out += `<div class="nseats">` + V.seats.map((s, i) => {
      const n = notes.seats[s.id] || {};
      const me = V.me.seatId === s.id;
      const claimOpts = `<option value="">Claims…</option>` + ['townsfolk', 'outsider', 'minion', 'demon', 'traveller'].map((t) => `<optgroup label="${C.TEAM_LABEL[t]}">${scriptChars.filter((id) => cteam(id) === t).map((id) => `<option value="${id}" ${n.claim === id ? 'selected' : ''}>${esc(cname(id))}</option>`).join('')}</optgroup>`).join('') + `<option value="nothing" ${n.claim === 'nothing' ? 'selected' : ''}>Won't say</option>`;
      const cands = (n.cands || []).map((id) => `<span class="cand team-${cteam(id)}">${esc(cname(id))}<button data-act="candDel" data-id="${s.id}" data-c="${id}" aria-label="Remove">✕</button></span>`).join('');
      return `<div class="ncard rd-${n.read || 'none'} ${s.alive ? '' : 'dead'} ${me ? 'me' : ''}">
        <div class="nh"><span class="num">${i + 1}</span><b>${esc(s.name)}</b>${me ? '<em>(you)</em>' : ''}${s.alive ? '' : `<span class="dim">✝ ${s.voteToken ? '●' : '○'}</span>`}${s.isTraveller ? '<span class="badge team-traveller">Traveller</span>' : ''}</div>
        <div class="reads">${READS.map(([k, b, l]) => `<button class="rb rd-${k || 'none'} ${(n.read || '') === k ? 'on' : ''}" data-act="read" data-id="${s.id}" data-v="${k}" title="${l}">${b}</button>`).join('')}</div>
        <div class="row"><select data-change="claim" data-id="${s.id}">${claimOpts}</select>
          <select data-change="cand" data-id="${s.id}"><option value="">+ Could be…</option>${scriptChars.map((id) => `<option value="${id}">${esc(cname(id))}</option>`).join('')}</select></div>
        ${n.claim && CH[n.claim] ? `<p class="claimab">${esc(CH[n.claim].ability)}</p>` : ''}
        ${cands ? `<div class="chips">${cands}</div>` : ''}
        <textarea data-note="seat" data-id="${s.id}" rows="2" placeholder="Notes about ${esc(s.name)}…">${esc(n.text || '')}</textarea>
      </div>`;
    }).join('') + '</div>';
    out += `<div class="card"><button class="btn ghost sm danger" data-act="clearNotes">Clear all my notes</button></div>`;
    return out;
  }

  // ------------------------------------------------------------ Script & Log
  function scriptTab() {
    const q = ui.scriptQ.toLowerCase();
    const ids = V.script.concat(C.editionTravellers(V.edition), V.fabled);
    const match = (id) => !q || CH[id].name.toLowerCase().includes(q) || CH[id].ability.toLowerCase().includes(q);
    let out = `<div class="card"><input class="search" data-change="scriptQ" data-live="1" value="${esc(ui.scriptQ)}" placeholder="Search characters…" type="search"><p class="hint">* "Each night*" means every night except the first.</p></div>`;
    for (const t of C.TEAMS) {
      const list = ids.filter((id) => cteam(id) === t && match(id));
      if (!list.length) continue;
      out += `<section class="card"><h3 class="team-${t}">${C.TEAM_LABEL[t]}</h3>${[...new Set(list)].map((id) => charCard(id)).join('')}</section>`;
    }
    return out;
  }
  function logTab() {
    const entries = (V.role === 'st' ? V.full.log : V.log).slice().reverse();
    let out = '';
    if (V.role === 'st') out += `<div class="card"><div class="row"><input id="logNote" placeholder="Add a note to the log…" maxlength="500"><label class="inline"><input type="checkbox" id="logPublic"> public</label><button class="btn sm" data-act="logNote">Add</button></div></div>`;
    out += `<div class="card"><h3>Game log</h3>${entries.length ? `<ul class="log">${entries.map((l) => `<li class="${l.public ? '' : 'priv'}"><span class="lt">${l.phase === 'night' ? '☾' + l.night : l.phase === 'day' ? '☀' + l.day : '•'} ${fmtTime(l.t)}</span>${l.public ? '' : '🔒 '}${esc(l.text)}</li>`).join('')}</ul>` : '<p class="dim">Nothing has happened yet.</p>'}</div>`;
    return out;
  }

  // ------------------------------------------------------------ Compose modal (ST)
  function renderModal() {
    const m = $('#modal');
    if (!ui.compose || V.role !== 'st') { m.innerHTML = ''; return; }
    if (busy(m)) return;
    const c = ui.compose;
    const s = V.full.seats.find((x) => x.id === c.seatId);
    if (!s) { ui.compose = null; m.innerHTML = ''; return; }
    m.innerHTML = `<div class="overlay" data-act="closeCompose"></div><div class="sheet" role="dialog" aria-label="Send information">
      <div class="edh"><h3>Send to ${esc(s.name)}${s.character ? ` <small class="dim">(${esc(cname(s.character))}${s.shownChar ? ', thinks ' + esc(cname(s.shownChar)) : ''})</small>` : ''}</h3><button class="btn sm ghost" data-act="closeCompose">✕</button></div>
      <div class="row wrap">${['YOU ARE', 'THIS IS THE DEMON', 'THESE ARE YOUR MINIONS', 'THESE CHARACTERS ARE NOT IN PLAY', 'THIS CHARACTER SELECTED YOU', 'YOU ARE NOW'].map((t) => `<button class="chip ${c.text === t ? 'on' : ''}" data-act="cText" data-t="${t}">${t}</button>`).join('')}</div>
      <label>Message<textarea id="cText" rows="2" placeholder="e.g. One of these players is the Chef">${esc(c.text)}</textarea></label>
      <div class="row wrap"><label>Show character<select data-change="cChar">${charOptions('', { empty: '+ character token', all: true, fabled: true })}</select></label>
        <label>Point to player<select data-change="cSeat">${seatOptions('', null, '+ player')}</select></label></div>
      <div class="chips">${c.chars.map((id) => `<span class="cand team-${cteam(id)}">${esc(cname(id))}<button data-act="cCharDel" data-c="${id}">✕</button></span>`).join('')}${c.seats.map((id) => `<span class="pchip">👉 ${esc(seatName(id))}<button data-act="cSeatDel" data-c="${id}">✕</button></span>`).join('')}</div>
      <div class="row wrap"><label>Number (fingers)<input id="cNum" type="number" min="0" max="20" value="${c.number == null ? '' : c.number}" inputmode="numeric"></label>
        <div class="seg"><button class="${c.yes === true ? 'on good' : ''}" data-act="cYes" data-v="1">Yes</button><button class="${c.yes === false ? 'on evil' : ''}" data-act="cYes" data-v="0">No</button></div>
        <div class="seg"><button class="${c.align === 'good' ? 'on good' : ''}" data-act="cAlign" data-v="good">👍 Good</button><button class="${c.align === 'evil' ? 'on evil' : ''}" data-act="cAlign" data-v="evil">👎 Evil</button></div></div>
      <div class="row end"><button class="btn ghost" data-act="cClear">Clear</button><button class="btn gold" data-act="cSend">Send</button></div>
      <p class="hint">Use "YOU ARE" + a character to change what this player believes they are.</p>
    </div>`;
  }
  function syncCompose() {
    if (!ui.compose) return;
    const t = $('#cText'); if (t) ui.compose.text = t.value;
    const n = $('#cNum'); if (n) ui.compose.number = n.value === '' ? null : parseInt(n.value, 10);
  }

  // ------------------------------------------------------------ random bag
  function randomPool() {
    const n = V.full.seats.filter((s) => !s.isTraveller).length;
    const d = C.distribution(n); if (!d) return null;
    const pick = (team, k, exclude = []) => {
      const opts = V.script.filter((id) => cteam(id) === team && !exclude.includes(id));
      const out = [];
      while (out.length < k && opts.length) out.push(opts.splice(Math.floor(Math.random() * opts.length), 1)[0]);
      return out;
    };
    const demon = pick('demon', d[3]);
    const minions = pick('minion', d[2]);
    let os = d[1];
    for (const id of demon.concat(minions)) if (C.OUTSIDER_MOD[id]) os += id === 'godfather' ? (Math.random() < 0.5 ? -1 : 1) : C.OUTSIDER_MOD[id];
    const outsiders = pick('outsider', Math.max(0, os));
    const townsfolk = pick('townsfolk', n - demon.length - minions.length - outsiders.length);
    return townsfolk.concat(outsiders, minions, demon);
  }

  // ------------------------------------------------------------ events
  const clickHandlers = {
    tab: (d) => { ui.tab = d.tab; render(); window.scrollTo(0, 0); },
    spectate: () => { role = 'spectator'; store.set('botc.role', role); connect(); render(); },
    seat: (d) => {
      if (V.role === 'st') { ui.sel = ui.sel === d.id ? null : d.id; render(); const ed = $('.editor'); if (ed && window.innerWidth < 900) ed.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      else if (V.role === 'player') { ui.tab = 'notes'; render(); const el = $(`[data-note="seat"][data-id="${d.id}"]`); if (el) el.closest('.ncard').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    },
    closeSel: () => { ui.sel = null; render(); },
    align: (d) => act('setAlignment', { seatId: d.id, alignment: d.v }),
    alive: (d) => act('setAlive', { seatId: d.id, alive: d.v === '1' }),
    ghost: (d) => act('setVoteToken', { seatId: d.id, value: d.v === '1' }),
    flag: (d) => act('toggleFlag', { seatId: d.id, flag: d.flag }),
    trav: (d) => act('setTraveller', { seatId: d.id, value: d.v === '1' }),
    remRem: (d) => act('removeReminder', { seatId: d.id, reminderId: d.r }),
    addCustomRem: (d) => { const i = $('#customRem'); if (i && i.value.trim()) act('addReminder', { seatId: d.id, text: i.value }); },
    reveal: (d) => act('reveal', { seatId: d.id }).then((ok) => ok && toast(d.id === 'all' ? 'Characters sent to every player' : 'Character sent')),
    quick: (d) => act('sendInfo', { seatId: d.id, yes: d.k === 'yes' }).then((ok) => ok && toast('Sent')),
    compose: (d) => { ui.compose = { seatId: d.id, text: '', chars: [], seats: [], number: null, yes: null, align: null }; renderModal(); },
    closeCompose: () => { ui.compose = null; renderModal(); },
    cText: (d) => { syncCompose(); ui.compose.text = d.t; renderModal(); },
    cCharDel: (d) => { syncCompose(); ui.compose.chars = ui.compose.chars.filter((x) => x !== d.c); renderModal(); },
    cSeatDel: (d) => { syncCompose(); ui.compose.seats = ui.compose.seats.filter((x) => x !== d.c); renderModal(); },
    cYes: (d) => { syncCompose(); const v = d.v === '1'; ui.compose.yes = ui.compose.yes === v ? null : v; renderModal(); },
    cAlign: (d) => { syncCompose(); ui.compose.align = ui.compose.align === d.v ? null : d.v; renderModal(); },
    cClear: () => { const id = ui.compose.seatId; ui.compose = { seatId: id, text: '', chars: [], seats: [], number: null, yes: null, align: null }; renderModal(); },
    cSend: async () => {
      syncCompose();
      const c = ui.compose;
      const payload = { seatId: c.seatId, text: c.text, chars: c.chars, seats: c.seats };
      if (Number.isInteger(c.number)) payload.number = c.number;
      if (c.yes !== null) payload.yes = c.yes;
      if (c.align) payload.align = c.align;
      if (/^YOU ARE( NOW)?$/.test(c.text.trim()) && c.chars.length === 1) payload.kind = 'character';
      if (await act('sendInfo', payload)) { toast('Sent to ' + seatName(c.seatId)); ui.compose = null; renderModal(); }
    },
    move: (d) => act('moveSeat', { seatId: d.id, dir: +d.dir }),
    removeSeat: (d) => { if (confirm(`Remove ${seatName(d.id)}'s seat?`)) act('removeSeat', { seatId: d.id }); },
    addSeat: () => { const i = $('#newSeat'); act('addSeat', { name: i ? i.value : '' }); },
    shuffleSeats: () => { if (confirm('Shuffle the seating order?')) act('shuffleSeats'); },
    seatPlayer: (d) => act('seatPlayer', { playerId: d.p, traveller: !!d.trav }),
    edition: (d) => { if (d.ed === V.edition) return; if (V.full.pool.length && !confirm('Change edition? Characters not on the new script are removed from the bag.')) return; act('setEdition', { edition: d.ed, script: d.ed === 'custom' ? V.script : undefined }); },
    toggleScriptEdit: () => { ui.editScript = !ui.editScript; render(); },
    scriptToggle: (d) => { const s = new Set(V.script); s.has(d.c) ? s.delete(d.c) : s.add(d.c); act('setEdition', { edition: 'custom', script: C.ORDER.filter((id) => s.has(id)) }); },
    pool: (d) => { const p = V.full.pool.slice(); const i = p.indexOf(d.c); i > -1 ? p.splice(i, 1) : p.push(d.c); act('setPool', { ids: p }); },
    randomPool: () => { const p = randomPool(); if (p) act('setPool', { ids: p }); },
    clearPool: () => act('setPool', { ids: [] }),
    deal: () => { if (V.full.seats.some((s) => s.character && !s.isTraveller) && !confirm('Re-deal characters to every non-Traveller seat?')) return; act('dealPool').then((ok) => ok && toast('Characters dealt: check the Grimoire')); },
    autoBluffs: () => act('autoBluffs'),
    fabled: (d) => { const f = V.fabled.slice(); const i = f.indexOf(d.c); i > -1 ? f.splice(i, 1) : f.push(d.c); act('setFabled', { ids: f }); },
    startNight: () => { if (V.vote && !confirm('A vote is in progress. End the day anyway?')) return; if (V.phase === 'day' && !V.day.executed && V.day.onBlock && !confirm(`${seatName(V.day.onBlock)} is about to die but hasn't been executed. End the day anyway?`)) return; act('startNight').then((ok) => { if (ok) { ui.tab = 'night'; render(); } }); },
    startDay: () => act('startDay').then((ok) => { if (ok) { ui.tab = 'day'; render(); } }),
    nightDone: (d) => act('nightToggle', { key: d.k }),
    evilInfo: () => act('sendEvilInfo').then((ok) => ok && toast('Minion & Demon info sent')),
    nominate: () => {
      const a = ui.nominator, b = ui.nominee;
      if (!a || !b) return toast('Pick a nominator and a nominee');
      const na = V.seats.find((s) => s.id === a);
      const warn = [];
      if (!na.alive) warn.push(`${na.name} is dead and normally can't nominate.`);
      if (V.day.nominators.includes(a)) warn.push(`${na.name} has already nominated today.`);
      if (V.day.nominees.includes(b)) warn.push(`${seatName(b)} has already been nominated today.`);
      if (V.day.executed) warn.push('There has already been an execution today.');
      if (warn.length && !confirm(warn.join('\n') + '\n\nAllow it anyway?')) return;
      act('nominate', { nominator: a, nominee: b }).then((ok) => { if (ok) { ui.nominator = ''; ui.nominee = ''; } });
    },
    exile: () => { if (!ui.exiler || !ui.exilee) return toast('Pick who calls and which Traveller'); act('nominate', { nominator: ui.exiler, nominee: ui.exilee, kind: 'exile' }).then((ok) => { if (ok) { ui.exiler = ''; ui.exilee = ''; } }); },
    voteStart: () => act('voteStart', { intervalMs: +ui.clockMs }),
    voteStop: () => act('voteStop'),
    voteStep: () => act('voteStep'),
    voteReset: () => act('voteReset'),
    voteSet: (d) => act('voteSet', { seatId: d.id, yes: d.v === '1' }),
    voteHand: (d) => act('voteHand', { seatId: d.id, up: d.v === '1' }),
    voteFinish: () => act('voteFinish'),
    voteCancel: () => { if (confirm('Withdraw this nomination? It won\'t count as anyone\'s nomination today.')) act('voteCancel'); },
    execute: (d) => act('execute', { seatId: d.id, dies: d.dies === '1' }),
    win: (d) => { if (!d.team || confirm(`Declare that ${d.team} wins?`)) act('declareWinner', { team: d.team || null }); },
    undo: () => act('undo').then((ok) => ok && toast('Undone')),
    newGame: (d) => { if (confirm(d.keep === '1' ? 'Restart with the same characters? Life, votes, reminders and the log reset.' : 'Start a new game with the same seats? Characters, the log and messages are cleared.')) act('newGame', { keepCharacters: d.keep === '1' }); },
    kick: (d) => { if (confirm('Remove this player\'s device from the game? Their notes are deleted.')) act('kickPlayer', { playerId: d.p }); },
    logout: () => logout(),
    logNote: () => { const i = $('#logNote'); const p = $('#logPublic'); if (i && i.value.trim()) act('logNote', { text: i.value, pub: p && p.checked }); },
    hand: (d) => act('hand', { up: d.v === '1' }),
    rename: () => { const i = $('#rename'); if (i) act('rename', { name: i.value }).then((ok) => ok && toast('Renamed')); },
    leave: () => { if (confirm('Leave the game on this device? You can rejoin with your name (the Storyteller re-links you) but your notes on the server are deleted.')) post('/api/leave').finally(() => logout()); },
    read: (d) => { seatNote(d.id).read = d.v; saveNotes(); render(); },
    candDel: (d) => { const n = seatNote(d.id); n.cands = (n.cands || []).filter((x) => x !== d.c); saveNotes(); render(); },
    clearNotes: () => { if (confirm('Delete all your notes?')) { notes = { general: '', seats: {} }; saveNotes(); render(); } },
  };
  const changeHandlers = {
    renameSeat: (el) => act('renameSeat', { seatId: el.dataset.id, name: el.value }),
    assign: (el) => act('assign', { seatId: el.dataset.id, charId: el.value || null }),
    setShown: (el) => act('setShown', { seatId: el.dataset.id, charId: el.value || null }),
    setVoteMod: (el) => act('setVoteMod', { seatId: el.dataset.id, mod: +el.value }),
    setStNote: (el) => act('setStNote', { seatId: el.dataset.id, text: el.value }),
    linkSeat: (el) => act('linkSeat', { seatId: el.dataset.id, playerId: el.value || null }),
    addRem: (el) => { if (!el.value) return; const [charId, text] = el.value.split('|'); act('addReminder', { seatId: el.dataset.id, text, charId }); },
    bluff: (el) => { const b = V.full.bluffs.slice(); b[+el.dataset.i] = el.value; act('setBluffs', { ids: b.filter(Boolean) }); },
    uiSet: (el) => { ui[el.dataset.k] = el.value; },
    showAll: (el) => { ui.showAllChars = el.checked; render(); },
    scriptQ: (el) => { ui.scriptQ = el.value; },
    claim: (el) => { seatNote(el.dataset.id).claim = el.value; saveNotes(); render(); },
    cand: (el) => { if (!el.value) return; const n = seatNote(el.dataset.id); n.cands = n.cands || []; if (!n.cands.includes(el.value)) n.cands.push(el.value); saveNotes(); render(); },
    cChar: (el) => { syncCompose(); if (el.value && !ui.compose.chars.includes(el.value)) ui.compose.chars.push(el.value); renderModal(); },
    cSeat: (el) => { syncCompose(); if (el.value && !ui.compose.seats.includes(el.value)) ui.compose.seats.push(el.value); renderModal(); },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = clickHandlers[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el.dataset, el); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (!el) return;
    const fn = changeHandlers[el.dataset.change];
    if (fn) fn(el);
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.note && notes) {
      if (el.dataset.note === 'general') notes.general = el.value;
      else seatNote(el.dataset.id).text = el.value;
      saveNotes();
    }
    if (el.dataset.change === 'scriptQ') {
      ui.scriptQ = el.value;
      const pos = el.selectionStart;
      $('main').innerHTML = scriptTab();
      const ni = $('.search'); ni.focus(); ni.setSelectionRange(pos, pos);
    }
  });
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-form]');
    if (!f) return;
    e.preventDefault();
    const fd = new FormData(f);
    try {
      if (f.dataset.form === 'join') {
        const r = await post('/api/join', { name: fd.get('name'), code: fd.get('code') });
        key = r.key; role = 'player';
      } else {
        const r = await post('/api/claim', { token: String(fd.get('token') || '').trim() });
        key = r.key; role = 'st';
      }
      store.set('botc.key', key); store.set('botc.role', role);
      connect(); render();
    } catch (err) { toast(err.message, 4000); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.compose) { ui.compose = null; renderModal(); }
    if (e.key === 'Enter' && e.target.id === 'customRem') { e.preventDefault(); const b = $('[data-act="addCustomRem"]'); if (b) b.click(); }
    if (e.key === 'Enter' && e.target.id === 'newSeat') { e.preventDefault(); clickHandlers.addSeat(); }
    if (e.key === 'Enter' && e.target.id === 'logNote') { e.preventDefault(); clickHandlers.logNote(); }
  });

  render();
  if (role === 'spectator' || key) connect();
})();
