#!/usr/bin/env node
/**
 * Minimal stand-in for Resolume's REST API (only what the controller uses),
 * for testing without Resolume. Simulates 2 layers x 2 columns of 10 s clips.
 *   node tools/mock-resolume.js [port]     (default 8080)
 */
'use strict';
const http = require('http');

const PORT = Number(process.argv[2] || 8080);
const LAYERS = 2, COLUMNS = 2, DURATION = 10000; // ms

const mkClip = (l, c) => ({
  id: l * 100 + c,
  name: { value: `L${l} C${c} clip` },
  connected: { value: 'Disconnected' },
  video: { width: 1920, height: 1080 },
  transport: {
    position: { value: 0, min: 0, max: DURATION },
    controls: { playdirection: { value: '>' }, playmode: { value: 'Loop' } },
  },
});
const layers = Array.from({ length: LAYERS }, (_, li) => ({
  name: { value: `Layer ${li + 1}` },
  clips: Array.from({ length: COLUMNS }, (_, ci) => mkClip(li + 1, ci + 1)),
}));

function merge(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') merge(target[k], v);
    else target[k] = v;
  }
}

// Playback simulation
let last = Date.now();
setInterval(() => {
  const now = Date.now(), dt = now - last; last = now;
  for (const layer of layers) for (const clip of layer.clips) {
    if (!clip.connected.value.startsWith('Connected')) continue;
    const t = clip.transport, dir = t.controls.playdirection.value, mode = t.controls.playmode.value;
    if (dir === '||') continue;
    let p = t.position.value + (dir === '>' ? dt : -dt);
    if (p >= DURATION) p = mode === 'Play Once and Hold' ? DURATION : mode === 'Loop' ? p % DURATION : DURATION;
    if (p < 0) p = 0;
    t.position.value = p;
  }
}, 30);

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(obj === undefined ? '' : JSON.stringify(obj));
}

http.createServer(async (req, res) => {
  let body = '';
  for await (const ch of req) body += ch;
  const p = req.url.replace(/^\/api\/v1/, '');
  console.log(req.method, p, body);
  let m;
  if (p === '/product') return send(res, 200, { name: 'Avenue (mock)', major: 7, minor: 0, micro: 0, revision: 0 });
  if (p === '/composition' && req.method === 'GET') return send(res, 200, { layers });
  if ((m = p.match(/^\/composition\/columns\/(\d+)\/connect$/)) && req.method === 'POST') {
    const c = Number(m[1]);
    for (const layer of layers) layer.clips.forEach((clip, i) => {
      clip.connected.value = i + 1 === c ? 'Connected' : 'Disconnected';
      if (i + 1 === c) clip.transport.position.value = 0; // trigger restarts the clip
    });
    return send(res, 204);
  }
  if ((m = p.match(/^\/composition\/layers\/(\d+)\/clips\/(\d+)$/))) {
    const clip = layers[m[1] - 1] && layers[m[1] - 1].clips[m[2] - 1];
    if (!clip) return send(res, 404, { error: 'no such clip' });
    if (req.method === 'GET') return send(res, 200, clip);
    if (req.method === 'PUT') { merge(clip, JSON.parse(body || '{}')); return send(res, 204); }
  }
  send(res, 404, { error: 'not found' });
}).listen(PORT, () => console.log(`Mock Resolume API on http://localhost:${PORT}/api/v1`));
