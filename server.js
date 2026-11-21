#!/usr/bin/env node
/**
 * Resolume Column Controller
 *
 * Alternates between two columns in Resolume Avenue (default 1 and 2):
 *
 *   QUEUE -> the *next* column is triggered, every clip in it is set to
 *            "Play Once and Hold", paused, and parked on frame 1.
 *   PLAY  -> the clips in the live column start playing forward. Because of
 *            "Play Once and Hold" they freeze on their last frame when done.
 *   QUEUE (again) -> switches to the other column, frozen on frame 1, etc.
 *
 * No dependencies; requires Node 18+ (uses global fetch).
 *
 * Config (env vars or --flags):
 *   RESOLUME_HOST / --resolume-host   default 127.0.0.1
 *   RESOLUME_PORT / --resolume-port   default 8080  (Resolume > Preferences > Webserver)
 *   PORT          / --port            default 3000  (this controller's web UI)
 *   COLUMNS       / --columns         default "1,2"
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------- config
function arg(name, envName, fallback) {
  const flag = `--${name}`;
  const i = process.argv.indexOf(flag);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(flag + '='));
  if (eq) return eq.slice(flag.length + 1);
  return process.env[envName] || fallback;
}

const config = {
  resolumeHost: arg('resolume-host', 'RESOLUME_HOST', '127.0.0.1'),
  resolumePort: Number(arg('resolume-port', 'RESOLUME_PORT', '8080')),
  port: Number(arg('port', 'PORT', '3000')),
  columns: arg('columns', 'COLUMNS', '1,2')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0),
};
if (config.columns.length !== 2) {
  console.error('COLUMNS must list exactly two column numbers, e.g. "1,2"');
  process.exit(1);
}

const API = () => `http://${config.resolumeHost}:${config.resolumePort}/api/v1`;

// ---------------------------------------------------------------- state
const state = {
  liveColumn: null, // column currently connected by this controller
  nextColumn: config.columns[0],
  phase: 'idle', // idle | armed (frozen on frame 1) | playing | held (on last frame)
  clips: [], // [{layer, column, name}] clips in the live column
  busy: false,
  lastAction: null,
  lastError: null,
  log: [],
};

function log(msg, level = 'info') {
  const entry = { t: new Date().toISOString(), level, msg };
  state.log.unshift(entry);
  state.log.length = Math.min(state.log.length, 50);
  (level === 'error' ? console.error : console.log)(`[${entry.t}] ${msg}`);
}

// ---------------------------------------------------------------- Resolume REST helpers
async function resolume(method, urlPath, body) {
  const res = await fetch(API() + urlPath, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${urlPath} -> HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const clipPath = (layer, column) => `/composition/layers/${layer}/clips/${column}`;
const setClip = (layer, column, patch) => resolume('PUT', clipPath(layer, column), patch);

function clipIsLoaded(clip) {
  if (!clip) return false;
  const connected = clip.connected && clip.connected.value;
  if (connected === 'Empty') return false;
  return Boolean(clip.video || clip.audio || (clip.name && clip.name.value));
}

/** Returns the loaded clips that live in `column`, one per layer. */
async function clipsInColumn(column) {
  const comp = await resolume('GET', '/composition');
  const layers = (comp && comp.layers) || [];
  const found = [];
  layers.forEach((layer, i) => {
    const clip = (layer.clips || [])[column - 1];
    if (clipIsLoaded(clip)) {
      found.push({ layer: i + 1, column, name: (clip.name && clip.name.value) || `Layer ${i + 1}` });
    }
  });
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- actions
async function queueNext() {
  const target = state.nextColumn;
  const clips = await clipsInColumn(target);
  if (clips.length === 0) log(`Column ${target} has no clips loaded - triggering anyway`, 'warn');

  // 1. Pre-arm: play once & hold, paused, parked at frame 1 (before it goes live).
  const arm = {
    transport: {
      position: { value: 0 },
      controls: { playmode: { value: 'Play Once and Hold' }, playdirection: { value: '||' } },
    },
  };
  await Promise.all(clips.map((c) => setClip(c.layer, c.column, arm)));

  // 2. Trigger the column.
  await resolume('POST', `/composition/columns/${target}/connect`);

  // 3. Re-assert pause + frame 1 after the trigger, in case Resolume's
  //    trigger behaviour moved the playhead.
  await sleep(40);
  const park = { transport: { position: { value: 0 }, controls: { playdirection: { value: '||' } } } };
  await Promise.all(clips.map((c) => setClip(c.layer, c.column, park)));

  state.liveColumn = target;
  state.nextColumn = otherColumn(target);
  state.clips = clips;
  state.phase = 'armed';
  log(`QUEUE: column ${target} live, frozen on frame 1 (${clips.length} clip${clips.length === 1 ? '' : 's'})`);
}

async function play() {
  if (state.liveColumn == null) throw new Error('Nothing queued yet - press QUEUE first');
  const fwd = { transport: { controls: { playmode: { value: 'Play Once and Hold' }, playdirection: { value: '>' } } } };
  await Promise.all(state.clips.map((c) => setClip(c.layer, c.column, fwd)));
  state.phase = 'playing';
  log(`PLAY: column ${state.liveColumn} playing (will hold on last frame)`);
}

const otherColumn = (c) => (c === config.columns[0] ? config.columns[1] : config.columns[0]);

async function runExclusive(name, fn) {
  if (state.busy) throw Object.assign(new Error('Busy - previous command still running'), { status: 409 });
  state.busy = true;
  try {
    await fn();
    state.lastAction = { name, t: new Date().toISOString() };
    state.lastError = null;
  } catch (err) {
    state.lastError = err.message;
    log(`${name} failed: ${err.message}`, 'error');
    throw err;
  } finally {
    state.busy = false;
  }
}

// ---------------------------------------------------------------- live status from Resolume
let connection = { ok: false, product: null, checkedAt: 0, error: null };

async function checkConnection() {
  try {
    const p = await resolume('GET', '/product');
    connection = { ok: true, product: p, checkedAt: Date.now(), error: null };
  } catch (err) {
    connection = { ok: false, product: null, checkedAt: Date.now(), error: err.message };
  }
}
setInterval(checkConnection, 2000).unref();
checkConnection();

async function clipProgress() {
  return Promise.all(
    state.clips.map(async (c) => {
      try {
        const clip = await resolume('GET', clipPath(c.layer, c.column));
        const pos = clip.transport && clip.transport.position;
        const dir = clip.transport && clip.transport.controls && clip.transport.controls.playdirection;
        const value = pos ? Number(pos.value) : null;
        const max = pos ? Number(pos.max) : null;
        return { ...c, position: value, max, direction: dir ? dir.value : null };
      } catch (err) {
        return { ...c, error: err.message };
      }
    })
  );
}

async function buildStatus() {
  const clips = connection.ok && state.clips.length ? await clipProgress() : state.clips;
  if (state.phase === 'playing' && clips.length && clips.every((c) => c.max > 0 && c.position >= c.max * 0.999)) {
    state.phase = 'held';
    log(`Column ${state.liveColumn} reached last frame - holding`);
  }
  return {
    phase: state.phase,
    liveColumn: state.liveColumn,
    nextColumn: state.nextColumn,
    columns: config.columns,
    busy: state.busy,
    clips,
    lastAction: state.lastAction,
    lastError: state.lastError,
    log: state.log.slice(0, 15),
    resolume: {
      url: API(),
      connected: connection.ok,
      product: connection.product,
      error: connection.error,
    },
  };
}

// ---------------------------------------------------------------- HTTP server
const PUBLIC = path.join(__dirname, 'public');

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

async function readJson(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  try {
    // Commands accept GET or POST so simple show-control systems can fire them.
    if (route === '/api/queue') {
      await runExclusive('QUEUE', queueNext);
      return send(res, 200, await buildStatus());
    }
    if (route === '/api/play') {
      await runExclusive('PLAY', play);
      return send(res, 200, await buildStatus());
    }
    if (route === '/api/next' && req.method === 'POST') {
      // Override which column the next QUEUE will trigger: {"column": 1}
      const { column } = await readJson(req);
      if (!config.columns.includes(Number(column))) return send(res, 400, { error: `column must be one of ${config.columns}` });
      state.nextColumn = Number(column);
      log(`Next column set to ${column}`);
      return send(res, 200, await buildStatus());
    }
    if (route === '/api/reset' && req.method === 'POST') {
      Object.assign(state, { liveColumn: null, nextColumn: config.columns[0], phase: 'idle', clips: [], lastError: null });
      log('Controller state reset');
      return send(res, 200, await buildStatus());
    }
    if (route === '/api/status') return send(res, 200, await buildStatus());

    // Static UI
    if (req.method === 'GET' && (route === '/' || route === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return fs.createReadStream(path.join(PUBLIC, 'index.html')).pipe(res);
    }
    send(res, 404, { error: 'not found' });
  } catch (err) {
    send(res, err.status || 502, { error: err.message, status: await buildStatus().catch(() => null) });
  }
});

server.listen(config.port, () => {
  log(`Controller UI:  http://localhost:${config.port}`);
  log(`Resolume API:   ${API()}   columns ${config.columns.join(' <-> ')}`);
});
