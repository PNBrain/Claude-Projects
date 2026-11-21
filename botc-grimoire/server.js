'use strict';
/*
 * Blood on the Clocktower – local-network Grimoire & Town Square.
 * No npm dependencies: Node's http module + Server-Sent Events.
 *
 *   node server.js                     start (prints LAN URLs and the Storyteller token)
 *   node server.js --set-token 12345678   save a preset 8-digit Storyteller token
 *   BOTC_ST_TOKEN=12345678 PORT=3000 node server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const CH = require('./public/characters.js');

const PORT = parseInt(process.env.PORT || argValue('--port') || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.BOTC_DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
fs.mkdirSync(DATA_DIR, { recursive: true });

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}
function loadJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJSON(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}
const rid = (n = 9) => crypto.randomBytes(n).toString('base64url');

// ---------------------------------------------------------------- Storyteller token
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const config = loadJSON(CONFIG_FILE, {});
if (process.argv.includes('--set-token')) {
  const t = argValue('--set-token');
  if (!/^\d{8}$/.test(t || '')) { console.error('The token must be exactly 8 digits.'); process.exit(1); }
  config.stToken = t;
  saveJSON(CONFIG_FILE, config);
  console.log('Storyteller token saved to', CONFIG_FILE);
  process.exit(0);
}
let ST_TOKEN = process.env.BOTC_ST_TOKEN || config.stToken;
let tokenGenerated = false;
if (ST_TOKEN && !/^\d{8}$/.test(ST_TOKEN)) { console.error('BOTC_ST_TOKEN must be exactly 8 digits.'); process.exit(1); }
if (!ST_TOKEN) {
  ST_TOKEN = String(crypto.randomInt(0, 100000000)).padStart(8, '0');
  config.stToken = ST_TOKEN;
  saveJSON(CONFIG_FILE, config);
  tokenGenerated = true;
}

// ---------------------------------------------------------------- State
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');

function emptyDay() {
  return { nominators: [], nominees: [], highest: 0, onBlock: null, executed: null, exiled: [] };
}
function freshGame(seats = []) {
  return {
    id: rid(6), edition: 'tb', script: CH.editionScript('tb'),
    phase: 'setup', dayNumber: 0, nightNumber: 0,
    seats, pool: [], bluffs: [], fabled: [],
    nightDone: {}, aliveAtDusk: null,
    day: emptyDay(), nominations: [], vote: null,
    log: [], winner: null,
  };
}
function newSeat(name, playerId = null) {
  return {
    id: rid(5), name: String(name || 'Player').slice(0, 30), playerId,
    character: null, shownChar: null, alignment: null, isTraveller: false,
    alive: true, voteToken: true, drunk: false, poisoned: false,
    reminders: [], stNote: '', voteMod: 1, revealed: false, messages: [],
  };
}

const db = loadJSON(STATE_FILE, null) || { stKey: null, players: {}, game: freshGame() };
const notes = loadJSON(NOTES_FILE, {});
let undoStack = [];

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { saveJSON(STATE_FILE, db); saveJSON(NOTES_FILE, notes); } catch (e) { console.error('Save failed:', e.message); }
  }, 250);
}

const G = () => db.game;
const seatById = (id) => G().seats.find((s) => s.id === id);
const seatName = (id) => (seatById(id) || {}).name || '?';
const charName = (id) => (CH.CHARACTERS[id] || {}).name || id || '—';
const team = (s) => (s && s.character && CH.CHARACTERS[s.character] ? CH.CHARACTERS[s.character].team : null);
const playerByKey = (key) => Object.values(db.players).find((p) => p.key === key);

function log(text, pub = true) {
  const g = G();
  g.log.push({ t: Date.now(), text, public: pub, phase: g.phase, day: g.dayNumber, night: g.nightNumber });
  if (g.log.length > 1000) g.log.splice(0, g.log.length - 1000);
}
function message(seat, msg) {
  seat.messages.push({ id: rid(5), t: Date.now(), night: G().nightNumber, phase: G().phase, ...msg });
  if (seat.messages.length > 200) seat.messages.splice(0, seat.messages.length - 200);
}

// ---------------------------------------------------------------- Derived helpers
const aliveSeats = () => G().seats.filter((s) => s.alive);
function voteOrder(nomineeId) {
  const seats = G().seats;
  const i = seats.findIndex((s) => s.id === nomineeId);
  if (i < 0) return [];
  const order = [];
  for (let k = 1; k <= seats.length; k++) order.push(seats[(i + k) % seats.length].id);
  return order; // ends with the nominee
}
function canVote(seat, kind) {
  if (kind === 'exile') return true;
  return seat.alive || seat.voteToken;
}
function voteNeeded(kind) {
  if (kind === 'exile') return Math.ceil(G().seats.length / 2);
  return Math.ceil(aliveSeats().length / 2);
}
function voteTally(v) {
  let count = 0;
  for (const id of Object.keys(v.votes)) {
    if (!v.votes[id]) continue;
    const s = seatById(id);
    count += v.kind === 'exile' ? 1 : (s ? s.voteMod || 1 : 1);
  }
  return count;
}

function winHints() {
  const g = G();
  if (g.phase === 'setup' || g.winner) return [];
  const hints = [];
  const demons = g.seats.filter((s) => !s.isTraveller && team(s) === 'demon');
  if (demons.length && demons.every((s) => !s.alive)) {
    hints.push({ team: 'good', text: 'Every Demon is dead. Good wins unless something keeps the game going (e.g. Scarlet Woman, Mastermind).' });
  }
  const aliveNonTravellers = g.seats.filter((s) => s.alive && !s.isTraveller).length;
  if (aliveNonTravellers <= 2) hints.push({ team: 'evil', text: `Only ${aliveNonTravellers} non-Traveller players alive. Evil wins.` });
  const ex = g.day.executed && seatById(g.day.executed);
  if (ex && ex.character === 'saint' && !ex.alive) hints.push({ team: 'evil', text: 'The Saint died by execution. Evil wins (unless drunk or poisoned).' });
  return hints;
}

// ---------------------------------------------------------------- Views
function publicSeat(s) {
  return {
    id: s.id, name: s.name, alive: s.alive, voteToken: s.voteToken, isTraveller: s.isTraveller,
    character: s.isTraveller ? s.character : null, linked: !!s.playerId,
    online: !!(s.playerId && onlinePlayers.has(s.playerId)),
  };
}
function publicVote(v) {
  if (!v) return null;
  return {
    kind: v.kind, nominee: v.nominee, nominator: v.nominator, order: v.order, index: v.index,
    votes: v.votes, hands: v.hands, running: v.running, done: v.done, intervalMs: v.intervalMs,
    needed: voteNeeded(v.kind), tally: voteTally(v),
    canVote: Object.fromEntries(v.order.map((id) => [id, canVote(seatById(id) || {}, v.kind)])),
  };
}
function publicView() {
  const g = G();
  return {
    gameId: g.id, edition: g.edition, script: g.script, phase: g.phase,
    dayNumber: g.dayNumber, nightNumber: g.nightNumber,
    seats: g.seats.map(publicSeat), fabled: g.fabled,
    day: { onBlock: g.day.onBlock, highest: g.day.highest, executed: g.day.executed, nominees: g.day.nominees, nominators: g.day.nominators },
    nominations: g.nominations.slice(-60),
    vote: publicVote(g.vote),
    log: g.log.filter((l) => l.public).slice(-300),
    winner: g.winner,
    serverTime: Date.now(),
  };
}
function stView() {
  const g = G();
  const pv = publicView();
  return {
    ...pv, role: 'st',
    full: { seats: g.seats, pool: g.pool, bluffs: g.bluffs, nightDone: g.nightDone, log: g.log.slice(-500) },
    players: Object.values(db.players).map((p) => ({ id: p.id, name: p.name, code: p.code, seatId: (G().seats.find((s) => s.playerId === p.id) || {}).id || null, online: onlinePlayers.has(p.id) })),
    winHints: winHints(), canUndo: undoStack.length > 0, lanUrls: lanUrls(),
  };
}
function playerView(p) {
  const seat = G().seats.find((s) => s.playerId === p.id) || null;
  const me = { id: p.id, name: p.name, code: p.code, seatId: seat ? seat.id : null };
  if (seat) {
    me.character = seat.revealed ? seat.shownChar || seat.character : null;
    me.alignment = seat.revealed ? seat.alignment : null;
    me.messages = seat.messages;
  } else me.messages = [];
  return { ...publicView(), role: 'player', me, notes: notes[p.id] || null };
}

// ---------------------------------------------------------------- Realtime (SSE)
const clients = new Set(); // {res, kind:'st'|'player'|'spectator', playerId}
const onlinePlayers = new Map(); // playerId -> connection count
let broadcastTimer = null;
function viewFor(c) {
  if (c.kind === 'st') return c.stKey === db.stKey ? stView() : { role: 'kicked', reason: 'Another device claimed Storyteller control.' };
  if (c.kind === 'player') {
    const p = db.players[c.playerId];
    return p ? playerView(p) : { role: 'kicked', reason: 'You were removed from the game.' };
  }
  return { ...publicView(), role: 'spectator' };
}
function send(c, obj) { try { c.res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { /* closed */ } }
function broadcast() {
  clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => {
    for (const c of clients) send(c, viewFor(c));
  }, 20);
}
function changed() { persist(); broadcast(); }
setInterval(() => { for (const c of clients) { try { c.res.write(': ping\n\n'); } catch { /* */ } } }, 25000);

// ---------------------------------------------------------------- Vote clock
let clockTimer = null;
function stopClock() { clearInterval(clockTimer); clockTimer = null; if (G().vote) G().vote.running = false; }
function stepVote() {
  const v = G().vote;
  if (!v || v.done) return;
  if (v.index < 0) v.index = 0;
  const id = v.order[v.index];
  const s = seatById(id);
  v.votes[id] = !!(s && canVote(s, v.kind) && v.hands[id]);
  v.index++;
  if (v.index >= v.order.length) { v.done = true; stopClock(); }
}
function startClock(ms) {
  stopClock();
  const v = G().vote;
  if (!v || v.done) return;
  v.running = true;
  v.intervalMs = Math.max(500, Math.min(10000, ms || 2000));
  if (v.index < 0) v.index = 0;
  clockTimer = setInterval(() => { stepVote(); changed(); }, v.intervalMs);
}

// ---------------------------------------------------------------- Storyteller actions
function requireSeat(id) { const s = seatById(id); if (!s) throw new Error('Unknown seat'); return s; }
function assignCharacter(seat, charId) {
  const c = CH.CHARACTERS[charId];
  if (charId && !c) throw new Error('Unknown character');
  seat.character = charId || null;
  seat.alignment = charId ? (c.team === 'traveller' ? seat.alignment || 'good' : CH.defaultAlignment(charId)) : null;
  seat.isTraveller = !!(c && c.team === 'traveller');
  seat.shownChar = null;
  if (charId === 'drunk') seat.shownChar = pickNotInPlay('townsfolk', [seat.id]);
  if (charId === 'lunatic') {
    const demon = G().seats.find((s) => team(s) === 'demon');
    seat.shownChar = demon ? demon.character : G().script.find((id) => CH.CHARACTERS[id].team === 'demon') || null;
  }
  seat.revealed = false;
}
function inPlayIds(excludeSeatIds = []) {
  const ids = new Set();
  for (const s of G().seats) {
    if (excludeSeatIds.includes(s.id)) continue;
    if (s.character) ids.add(s.character);
    if (s.shownChar) ids.add(s.shownChar);
  }
  return ids;
}
function pickNotInPlay(teamName, excludeSeatIds = [], avoid = []) {
  const used = inPlayIds(excludeSeatIds);
  const opts = G().script.filter((id) => CH.CHARACTERS[id].team === teamName && !used.has(id) && !avoid.includes(id) && id !== 'drunk');
  return opts.length ? opts[crypto.randomInt(opts.length)] : null;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const ST = {
  setEdition({ edition, script }) {
    const g = G();
    if (!CH.EDITIONS[edition]) throw new Error('Unknown edition');
    g.edition = edition;
    if (edition === 'custom') {
      g.script = (Array.isArray(script) ? script : g.script).filter((id) => CH.CHARACTERS[id] && !['traveller', 'fabled'].includes(CH.CHARACTERS[id].team));
    } else g.script = CH.editionScript(edition);
    g.pool = g.pool.filter((id) => g.script.includes(id));
  },
  addSeat({ name }) { G().seats.push(newSeat(name || `Seat ${G().seats.length + 1}`)); },
  removeSeat({ seatId }) {
    const g = G();
    if (g.vote) throw new Error('Finish the current vote first');
    g.seats = g.seats.filter((s) => s.id !== seatId);
  },
  moveSeat({ seatId, dir }) {
    const seats = G().seats; const i = seats.findIndex((s) => s.id === seatId);
    const j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= seats.length) return;
    [seats[i], seats[j]] = [seats[j], seats[i]];
  },
  shuffleSeats() { if (G().vote) throw new Error('Finish the current vote first'); shuffle(G().seats); },
  renameSeat({ seatId, name }) { requireSeat(seatId).name = String(name || '').trim().slice(0, 30) || 'Player'; },
  linkSeat({ seatId, playerId }) {
    const s = requireSeat(seatId);
    if (playerId && !db.players[playerId]) throw new Error('Unknown player');
    for (const o of G().seats) if (playerId && o.playerId === playerId) o.playerId = null;
    s.playerId = playerId || null;
    if (playerId) s.name = db.players[playerId].name;
  },
  seatPlayer({ playerId, traveller }) {
    const p = db.players[playerId];
    if (!p) throw new Error('Unknown player');
    if (G().seats.some((s) => s.playerId === playerId)) return;
    const s = newSeat(p.name, playerId);
    if (traveller) { s.isTraveller = true; s.alignment = 'good'; }
    G().seats.push(s);
  },
  kickPlayer({ playerId }) {
    for (const s of G().seats) if (s.playerId === playerId) s.playerId = null;
    delete db.players[playerId];
    delete notes[playerId];
  },
  setPool({ ids }) { G().pool = (ids || []).filter((id) => CH.CHARACTERS[id]); },
  dealPool() {
    const g = G();
    const seats = g.seats.filter((s) => !s.isTraveller);
    if (g.pool.length !== seats.length) throw new Error(`The bag has ${g.pool.length} characters but there are ${seats.length} non-Traveller seats.`);
    for (const s of seats) s.character = null;
    const bag = shuffle([...g.pool]);
    // Assign non-Drunk/Lunatic first so their "shown" characters avoid in-play ones.
    seats.forEach((s, i) => { s.character = bag[i]; });
    seats.forEach((s) => assignCharacter(s, s.character));
    seats.filter((s) => s.character === 'drunk' || s.character === 'lunatic').forEach((s) => assignCharacter(s, s.character));
    log('Characters dealt from the bag.', false);
  },
  assign({ seatId, charId }) { assignCharacter(requireSeat(seatId), charId); },
  setShown({ seatId, charId }) { requireSeat(seatId).shownChar = charId || null; },
  setAlignment({ seatId, alignment }) {
    if (!['good', 'evil'].includes(alignment)) throw new Error('Bad alignment');
    requireSeat(seatId).alignment = alignment;
  },
  setTraveller({ seatId, value }) {
    const s = requireSeat(seatId); s.isTraveller = !!value;
    if (value && !s.alignment) s.alignment = 'good';
    if (value) log(`${s.name} is a Traveller${s.character ? ` (${charName(s.character)})` : ''}.`);
  },
  setAlive({ seatId, alive }) {
    const g = G(); const s = requireSeat(seatId);
    if (s.alive === !!alive) return;
    s.alive = !!alive;
    if (!alive) s.voteToken = true;
    if (g.phase === 'day') log(alive ? `${s.name} has come back to life.` : `${s.name} has died.`);
    else log(alive ? `${s.name} revived.` : `${s.name} died${g.phase === 'night' ? ' in the night' : ''}.`, false);
  },
  setVoteToken({ seatId, value }) { requireSeat(seatId).voteToken = !!value; },
  toggleFlag({ seatId, flag }) {
    if (!['drunk', 'poisoned'].includes(flag)) throw new Error('Bad flag');
    const s = requireSeat(seatId); s[flag] = !s[flag];
  },
  addReminder({ seatId, text, charId }) {
    const s = requireSeat(seatId);
    const t = String(text || '').trim().slice(0, 40);
    if (t) s.reminders.push({ id: rid(4), text: t, charId: charId || null });
  },
  removeReminder({ seatId, reminderId }) { const s = requireSeat(seatId); s.reminders = s.reminders.filter((r) => r.id !== reminderId); },
  setStNote({ seatId, text }) { requireSeat(seatId).stNote = String(text || '').slice(0, 2000); },
  setVoteMod({ seatId, mod }) { requireSeat(seatId).voteMod = [1, 3, -1].includes(mod) ? mod : 1; },
  setBluffs({ ids }) { G().bluffs = (ids || []).filter((id) => CH.CHARACTERS[id]).slice(0, 3); },
  autoBluffs() {
    const b = [];
    const t1 = pickNotInPlay('townsfolk', [], b); if (t1) b.push(t1);
    const t2 = pickNotInPlay('townsfolk', [], b); if (t2) b.push(t2);
    const o = pickNotInPlay('outsider', [], b) || pickNotInPlay('townsfolk', [], b); if (o) b.push(o);
    G().bluffs = b;
  },
  setFabled({ ids }) {
    const before = new Set(G().fabled);
    G().fabled = (ids || []).filter((id) => CH.CHARACTERS[id] && CH.CHARACTERS[id].team === 'fabled');
    for (const id of G().fabled) if (!before.has(id)) log(`The ${charName(id)} (Fabled) is in play.`);
  },
  reveal({ seatId }) {
    const seats = seatId === 'all' ? G().seats.filter((s) => s.character) : [requireSeat(seatId)];
    for (const s of seats) {
      if (!s.character) continue;
      s.revealed = true;
      message(s, { kind: 'character', chars: [s.shownChar || s.character], align: s.alignment, text: 'You are' });
    }
  },
  sendInfo({ seatId, text, chars, seats, number, yes, align, kind }) {
    const s = requireSeat(seatId);
    const msg = {
      kind: kind || 'info',
      text: String(text || '').slice(0, 1000),
      chars: (chars || []).filter((id) => CH.CHARACTERS[id]).slice(0, 6),
      seats: (seats || []).filter((id) => seatById(id)).slice(0, 20),
    };
    if (Number.isInteger(number)) msg.number = number;
    if (typeof yes === 'boolean') msg.yes = yes;
    if (align === 'good' || align === 'evil') msg.align = align;
    if (!msg.text && !msg.chars.length && !msg.seats.length && msg.number === undefined && msg.yes === undefined && !msg.align) throw new Error('Nothing to send');
    if (msg.kind === 'character' && msg.chars[0]) { s.revealed = true; s.shownChar = s.character === msg.chars[0] ? null : msg.chars[0]; }
    message(s, msg);
  },
  sendEvilInfo() {
    const g = G();
    const demons = g.seats.filter((s) => !s.isTraveller && team(s) === 'demon');
    const minions = g.seats.filter((s) => !s.isTraveller && team(s) === 'minion');
    if (!demons.length) throw new Error('No Demon has been assigned');
    for (const m of minions) {
      message(m, { kind: 'info', text: 'THIS IS THE DEMON' + (minions.length > 1 ? ' — and your fellow Minions' : ''), seats: demons.map((d) => d.id), chars: [] });
      if (minions.length > 1) message(m, { kind: 'info', text: 'Your fellow Minions', seats: minions.filter((o) => o.id !== m.id).map((o) => o.id), chars: [] });
    }
    for (const d of demons) {
      message(d, { kind: 'info', text: 'THESE ARE YOUR MINIONS', seats: minions.map((m) => m.id), chars: [] });
      if (g.bluffs.length) message(d, { kind: 'info', text: 'THESE CHARACTERS ARE NOT IN PLAY', chars: g.bluffs, seats: [] });
    }
    g.nightDone.minioninfo = true; g.nightDone.demoninfo = true;
    log('Minion & Demon info sent to devices.', false);
  },
  nightToggle({ key }) { const d = G().nightDone; d[key] = !d[key]; },
  startNight() {
    const g = G();
    if (g.vote) { stopClock(); g.vote = null; }
    g.phase = 'night';
    g.nightNumber += 1;
    g.nightDone = {};
    g.aliveAtDusk = g.seats.filter((s) => s.alive).map((s) => s.id);
    for (const s of g.seats) s.voteMod = 1;
    log(g.nightNumber === 1 ? 'The first night begins. Everyone close your eyes.' : `Night ${g.nightNumber} begins.`);
  },
  startDay() {
    const g = G();
    if (g.phase !== 'night') throw new Error('It is not night');
    const died = (g.aliveAtDusk || []).filter((id) => { const s = seatById(id); return s && !s.alive; });
    g.phase = 'day';
    g.dayNumber = g.nightNumber;
    g.day = emptyDay();
    log(`Dawn of day ${g.dayNumber}. ` + (died.length ? `${died.map(seatName).join(', ')} died in the night.` : 'Nobody died in the night.'));
  },
  nominate({ nominator, nominee, kind }) {
    const g = G();
    if (g.phase !== 'day') throw new Error('Nominations happen during the day');
    if (g.vote) throw new Error('A vote is already in progress');
    const nr = requireSeat(nominator); const ne = requireSeat(nominee);
    kind = kind === 'exile' ? 'exile' : 'execution';
    if (kind === 'execution') { g.day.nominators.push(nr.id); g.day.nominees.push(ne.id); }
    g.vote = { id: rid(5), kind, nominator: nr.id, nominee: ne.id, order: voteOrder(ne.id), index: -1, votes: {}, hands: {}, running: false, done: false, intervalMs: 2000 };
    log(kind === 'exile' ? `${nr.name} called for the exile of ${ne.name}.` : `${nr.name} nominated ${ne.name}.`);
  },
  voteStart({ intervalMs }) { startClock(intervalMs); },
  voteStop() { stopClock(); },
  voteStep() { stopClock(); stepVote(); },
  voteSet({ seatId, yes }) {
    const v = G().vote; if (!v) throw new Error('No vote');
    v.votes[seatId] = !!yes;
    const i = v.order.indexOf(seatId);
    if (i >= v.index) { v.index = Math.max(v.index, i + 1); if (v.index >= v.order.length) { v.done = true; stopClock(); } }
  },
  voteHand({ seatId, up }) { const v = G().vote; if (v) v.hands[seatId] = !!up; },
  voteReset() { const v = G().vote; if (!v) return; stopClock(); v.index = -1; v.votes = {}; v.done = false; },
  voteCancel() {
    const g = G(); const v = g.vote; if (!v) return;
    stopClock();
    if (v.kind === 'execution') {
      // Cancelled nominations don't use up the day's nomination for either player.
      const a = g.day.nominators.lastIndexOf(v.nominator); if (a > -1) g.day.nominators.splice(a, 1);
      const b = g.day.nominees.lastIndexOf(v.nominee); if (b > -1) g.day.nominees.splice(b, 1);
    }
    g.vote = null;
    log(`The nomination of ${seatName(v.nominee)} was withdrawn.`);
  },
  voteFinish() {
    const g = G(); const v = g.vote; if (!v) throw new Error('No vote');
    stopClock();
    // Seats the clock never reached count as their current hand.
    for (let i = Math.max(v.index, 0); i < v.order.length; i++) {
      const id = v.order[i]; const s = seatById(id);
      v.votes[id] = !!(s && canVote(s, v.kind) && v.hands[id]);
    }
    const voters = v.order.filter((id) => v.votes[id]);
    const count = voteTally(v);
    const needed = voteNeeded(v.kind);
    const nom = { id: v.id, day: g.dayNumber, kind: v.kind, nominator: v.nominator, nominee: v.nominee, voters, count, needed, result: 'failed' };
    if (v.kind === 'execution') {
      for (const id of voters) { const s = seatById(id); if (s && !s.alive) s.voteToken = false; }
      if (count >= needed && count > g.day.highest) { g.day.highest = count; g.day.onBlock = v.nominee; nom.result = 'onBlock'; }
      else if (count >= needed && count === g.day.highest) { g.day.onBlock = null; nom.result = 'tie'; }
      const msg = { onBlock: `is about to die`, tie: `ties — nobody is about to die`, failed: `is not about to die` }[nom.result];
      log(`Vote on ${seatName(v.nominee)}: ${count} vote${count === 1 ? '' : 's'} (needed ${needed}${g.day.highest && nom.result !== 'onBlock' ? `, to beat ${g.day.highest}` : ''}). ${seatName(v.nominee)} ${msg}. Voted: ${voters.map(seatName).join(', ') || 'nobody'}.`);
    } else {
      const s = seatById(v.nominee);
      if (count >= needed) {
        nom.result = 'exiled'; g.day.exiled.push(v.nominee);
        if (s) s.alive = false;
      } else nom.result = 'notExiled';
      log(`Exile of ${seatName(v.nominee)}: ${count} of ${needed} needed. ${nom.result === 'exiled' ? `${seatName(v.nominee)} is exiled and dies.` : 'Not exiled.'} Supported: ${voters.map(seatName).join(', ') || 'nobody'}.`);
    }
    g.nominations.push(nom);
    g.vote = null;
  },
  setBlock({ seatId }) { const g = G(); g.day.onBlock = seatId || null; if (seatId) log(`${seatName(seatId)} is about to die.`); },
  execute({ seatId, dies }) {
    const g = G(); const s = requireSeat(seatId || g.day.onBlock);
    if (g.day.executed) throw new Error('There has already been an execution today');
    g.day.executed = s.id; g.day.onBlock = null;
    if (dies !== false) { if (s.alive) { s.alive = false; s.voteToken = true; } log(`${s.name} was executed and died.`); }
    else log(`${s.name} was executed but did not die.`);
  },
  logNote({ text, pub }) { const t = String(text || '').trim().slice(0, 500); if (t) log(t, !!pub); },
  declareWinner({ team: t }) {
    const g = G();
    if (t && !['good', 'evil'].includes(t)) throw new Error('Bad team');
    stopClock(); g.vote = null;
    g.winner = t || null;
    if (t) { g.phase = 'ended'; log(`${t === 'good' ? 'Good' : 'Evil'} wins!`); }
    else if (g.phase === 'ended') g.phase = g.dayNumber ? 'day' : 'setup';
  },
  newGame({ keepCharacters }) {
    stopClock();
    const old = G();
    const seats = old.seats.map((s) => {
      const n = newSeat(s.name, s.playerId); n.id = s.id;
      if (keepCharacters) { n.character = s.character; n.shownChar = s.shownChar; n.alignment = s.alignment; n.isTraveller = s.isTraveller; }
      else n.isTraveller = false;
      return n;
    });
    const g = freshGame(seats);
    g.edition = old.edition; g.script = old.script; g.fabled = old.fabled; g.pool = old.pool;
    db.game = g;
    log('A new game has been set up.', true);
  },
};
const NO_UNDO = new Set(['nightToggle', 'voteHand', 'setStNote']);

// ---------------------------------------------------------------- Player actions
const PLAYER = {
  hand(p, { up }) {
    const v = G().vote; const seat = G().seats.find((s) => s.playerId === p.id);
    if (!v || !seat) throw new Error('No vote to raise your hand for');
    if (v.votes[seat.id] !== undefined && v.order.indexOf(seat.id) < v.index) throw new Error('Your vote has already been counted');
    v.hands[seat.id] = !!up;
  },
  rename(p, { name }) {
    const n = String(name || '').trim().slice(0, 30); if (!n) throw new Error('Name required');
    p.name = n;
    const seat = G().seats.find((s) => s.playerId === p.id); if (seat) seat.name = n;
  },
};

// ---------------------------------------------------------------- HTTP
const failures = new Map(); // ip -> {count, until}
function rateLimited(ip) { const f = failures.get(ip); return f && f.until > Date.now(); }
function noteFailure(ip) {
  const f = failures.get(ip) || { count: 0, until: 0 };
  f.count++;
  if (f.count >= 5) { f.until = Date.now() + 60000; f.count = 0; }
  failures.set(ip, f);
}
function tokenMatches(t) {
  const a = Buffer.from(String(t || '').padEnd(8, ' ').slice(0, 8));
  const b = Buffer.from(ST_TOKEN);
  return crypto.timingSafeEqual(a, b) && String(t).length === 8;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) { reject(new Error('Body too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Bad JSON')); } });
    req.on('error', reject);
  });
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function who(key) {
  if (key && db.stKey && key === db.stKey) return { kind: 'st' };
  const p = key && playerByKey(key);
  if (p) return { kind: 'player', player: p };
  return { kind: 'spectator' };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = req.socket.remoteAddress;
  try {
    if (url.pathname === '/api/events' && req.method === 'GET') {
      const w = who(url.searchParams.get('key'));
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 2000\n\n');
      const c = { res, kind: w.kind, playerId: w.player && w.player.id, stKey: w.kind === 'st' ? db.stKey : null };
      clients.add(c);
      if (c.playerId) { onlinePlayers.set(c.playerId, (onlinePlayers.get(c.playerId) || 0) + 1); broadcast(); }
      send(c, viewFor(c));
      req.on('close', () => {
        clients.delete(c);
        if (c.playerId) {
          const n = (onlinePlayers.get(c.playerId) || 1) - 1;
          if (n <= 0) onlinePlayers.delete(c.playerId); else onlinePlayers.set(c.playerId, n);
          broadcast();
        }
      });
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
      const body = await readBody(req);
      const key = req.headers['x-key'];

      if (url.pathname === '/api/claim') {
        if (rateLimited(ip)) return json(res, 429, { error: 'Too many wrong attempts. Wait a minute.' });
        if (!tokenMatches(body.token)) { noteFailure(ip); return json(res, 403, { error: 'Wrong Storyteller token.' }); }
        failures.delete(ip);
        db.stKey = rid(24);
        persist();
        broadcast(); // kicks any previous Storyteller device
        console.log(`Storyteller control claimed from ${ip}`);
        return json(res, 200, { key: db.stKey });
      }

      if (url.pathname === '/api/join') {
        const name = String(body.name || '').trim().slice(0, 30);
        const code = String(body.code || '').trim().toUpperCase();
        if (code) {
          const p = Object.values(db.players).find((x) => x.code === code);
          if (!p) return json(res, 404, { error: 'No player has that rejoin code.' });
          return json(res, 200, { key: p.key });
        }
        if (!name) return json(res, 400, { error: 'Enter your name.' });
        const p = { id: rid(6), key: rid(18), code: rid(4).toUpperCase().replace(/[^A-Z0-9]/g, 'X').slice(0, 5), name, joined: Date.now() };
        db.players[p.id] = p;
        const g = G();
        const match = g.seats.find((s) => !s.playerId && s.name.toLowerCase() === name.toLowerCase());
        if (match) match.playerId = p.id;
        else if (g.phase === 'setup') g.seats.push(newSeat(name, p.id));
        changed();
        return json(res, 200, { key: p.key });
      }

      const w = who(key);
      if (url.pathname === '/api/action') {
        const type = String(body.type || '');
        if (w.kind === 'st') {
          const fn = Object.prototype.hasOwnProperty.call(ST, type) && ST[type];
          if (type === 'undo') {
            if (!undoStack.length) return json(res, 400, { error: 'Nothing to undo' });
            stopClock();
            db.game = JSON.parse(undoStack.pop());
            if (db.game.vote) db.game.vote.running = false;
            changed();
            return json(res, 200, { ok: true });
          }
          if (!fn) return json(res, 400, { error: 'Unknown action' });
          const snap = NO_UNDO.has(type) ? null : JSON.stringify(G());
          fn(body);
          if (snap) { undoStack.push(snap); if (undoStack.length > 60) undoStack.shift(); }
          changed();
          return json(res, 200, { ok: true });
        }
        if (w.kind === 'player') {
          const fn = Object.prototype.hasOwnProperty.call(PLAYER, type) && PLAYER[type];
          if (!fn) return json(res, 403, { error: 'Not allowed' });
          fn(w.player, body);
          changed();
          return json(res, 200, { ok: true });
        }
        return json(res, 401, { error: 'Join the game first' });
      }

      if (url.pathname === '/api/notes') {
        if (w.kind !== 'player') return json(res, 401, { error: 'Players only' });
        const n = body.notes;
        if (!n || typeof n !== 'object') return json(res, 400, { error: 'Bad notes' });
        notes[w.player.id] = { ...n, gameId: G().id, savedAt: Date.now() };
        persist(); // notes aren't broadcast; only the author ever sees them
        return json(res, 200, { ok: true });
      }

      if (url.pathname === '/api/leave') {
        if (w.kind === 'player') { ST.kickPlayer({ playerId: w.player.id }); changed(); }
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: 'Not found' });
    }
    serveStatic(req, res, url.pathname);
  } catch (e) {
    json(res, 400, { error: e.message || 'Error' });
  }
});

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
  }
  return out;
}

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log('\n  Blood on the Clocktower – Grimoire');
    console.log('  ----------------------------------');
    console.log(`  Local:    http://localhost:${PORT}`);
    for (const u of lanUrls()) console.log(`  Network:  ${u}`);
    console.log(`\n  Storyteller token: ${ST_TOKEN}${tokenGenerated ? '   (generated – change with: node server.js --set-token 12345678)' : ''}\n`);
  });
}
module.exports = { server, ST, db };
