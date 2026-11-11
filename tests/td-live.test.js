'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const path = require('node:path');
const createTDLive = require('../td-live-server');

let server, base;
const opened = [];
before(async () => {
  const route = createTDLive();
  server = http.createServer(async (req, res) => {
    try { if (!await route(req, res, new URL(req.url, 'http://local'))) res.writeHead(404).end(); }
    catch { res.writeHead(500).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  for (const stream of opened) stream.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

function connect(id, role) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${base}/td-live/events?id=${id}&role=${role}`, res => {
      if (res.statusCode !== 200) { res.resume(); resolve({ status: res.statusCode }); return; }
      const messages = []; let buffer = '';
      res.on('data', chunk => {
        buffer += chunk;
        let i;
        while ((i = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, i); buffer = buffer.slice(i + 2);
          if (frame.startsWith('data: ')) messages.push(JSON.parse(frame.slice(6)));
        }
      });
      const stream = { status: 200, messages, close: () => { res.destroy(); req.destroy(); } };
      opened.push(stream); resolve(stream);
    });
    req.on('error', reject);
  });
}
async function post(id, data, headers = {}) {
  return fetch(`${base}/td-live/message?id=${id}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data)
  });
}
async function until(check) {
  for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(r => setTimeout(r, 10)); }
  assert.fail('condition timed out');
}

test('TD output and separate controllers exchange controls and live state in order', async () => {
  const output = await connect('output-001', 'output');
  const panel = await connect('control-001', 'control');
  const commands = [{ t: 'g', k: 'density', v: 6 }, { t: 'scene', i: 1, hold: true }, { t: 'black' }];
  for (const command of commands) assert.equal((await post('control-001', command)).status, 204);
  await until(() => output.messages.length === 3);
  assert.deepEqual(output.messages, commands);
  assert.equal(panel.messages.length, 0, 'sender must not receive its own command');
  const state = { t: 'state', w: 3840, h: 2160, fps: 42, cur: 1, G: { density: 6, dim: 0 } };
  assert.equal((await post('output-001', state)).status, 204);
  await until(() => panel.messages.length === 1);
  assert.deepEqual(panel.messages[0], state);
});

test('rejects second authoritative output and non-output state reports', async () => {
  assert.equal((await connect('output-002', 'output')).status, 409);
  assert.equal((await post('control-001', { t: 'state', G: {} })).status, 400);
});

test('rejects cross-origin, malformed, oversized and unconnected sends', async () => {
  assert.equal((await post('control-001', { t: 'black' }, { Origin: 'https://unrelated.example' })).status, 403);
  assert.equal((await post('missing-001', { t: 'black' })).status, 409);
  assert.equal((await post('control-001', { t: 'g', k: 'density', v: 'bad' })).status, 400);
  assert.equal((await post('control-001', { t: 'scene', i: 1.2 })).status, 400);
  assert.equal((await post('control-001', { t: 'rec' })).status, 400);
  assert.equal((await post('control-001', { t: 'hello', padding: 'x'.repeat(17000) })).status, 413);
});

test('output disconnect releases its slot; commands sent while disconnected are not replayed', async () => {
  opened[0].close();
  await post('control-001', { t: 'black' });
  // Wait for TCP close to reach the server before checking slot reuse.
  let output;
  for (let i = 0; i < 20; i++) {
    output = await connect('output-003', 'output');
    if (output.status === 200) break;
    await new Promise(r => setTimeout(r, 10));
  }
  assert.equal(output.status, 200);
  assert.equal(output.messages.length, 0);
  assert.equal((await post('control-001', { t: 'hello' })).status, 204);
  await until(() => output.messages.length === 1);
  assert.deepEqual(output.messages[0], { t: 'hello' });
});

test('browser bridge snapshots values, preserves commands, reconnects without replay and closes', async () => {
  let events; const sent = [];
  class FakeEvents { constructor() { events = this; } close() { this.closed = true; } }
  const context = vm.createContext({ EventSource: FakeEvents, AbortController, setTimeout, clearTimeout,
    console, fetch: async (url, options) => { sent.push(JSON.parse(options.body)); return { ok: true }; } });
  vm.runInContext(fs.readFileSync(require.resolve('../td-channel.js'), 'utf8'), context);
  const channel = vm.runInContext("new TDChannel('control')", context);
  channel.postMessage({ t: 'black' }); // Not connected: must be dropped.
  events.onopen();
  const value = { t: 'g', k: 'density', v: 3 };
  channel.postMessage(value); value.v = 10;
  channel.postMessage({ t: 'scene', i: 2 });
  channel.postMessage({ t: 'black' });
  await until(() => sent.length === 4);
  assert.deepEqual(sent, [{ t: 'hello' }, { t: 'g', k: 'density', v: 3 }, { t: 'scene', i: 2 }, { t: 'black' }]);
  events.onerror(); channel.postMessage({ t: 'black' }); events.onopen();
  await until(() => sent.length === 5);
  assert.deepEqual(sent[4], { t: 'hello' });
  channel.close(); assert.equal(events.closed, true);
});

test('inline scripts parse, TD canvas remains 4K and browser-only mode keeps BroadcastChannel', () => {
  for (const file of ['index.html', 'control.html', 'touchdesigner.html']) {
    const html = fs.readFileSync(require.resolve('../' + file), 'utf8');
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1], { filename: file });
  }
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  const resize = html.match(/function resize\(\)\{([\s\S]*?)\n\}/)[0];
  const sizes = [];
  vm.runInNewContext(resize + ';resize();', { TD: true, setSize: (w,h) => sizes.push([w,h]) });
  assert.deepEqual(sizes, [[3840,2160]]);
  assert.match(html, /TD\?new TDChannel\('output'\):new BroadcastChannel\('strings'\)/);
});

test('production server serves integration assets and routes the live connection', async t => {
  const reservation = http.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: String(port) }, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => new Promise(resolve => { child.once('close', resolve); child.kill(); }));
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('server startup timeout')), 5000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
  });
  const host = `http://127.0.0.1:${port}`;
  for (const file of ['/?td=1', '/control.html?td=1', '/touchdesigner.html', '/td-channel.js']) {
    const response = await fetch(host + file);
    assert.equal(response.status, 200, file);
    assert.ok((await response.text()).length > 100);
  }
  const stream = await fetch(`${host}/td-live/events?id=smoke-001&role=control`);
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get('content-type'), /text\/event-stream/);
  const sent = await fetch(`${host}/td-live/message?id=smoke-001`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"t":"hello"}'
  });
  assert.equal(sent.status, 204);
  await stream.body.cancel();
});
