'use strict';

// Parameter transport only. Web Render TOP renders the image on its own GPU.
// Ordinary browser output keeps using BroadcastChannel and is isolated from TD.
module.exports = function createTDLive() {
  const clients = new Map();
  const types = new Set(['g', 'scene', 'black', 'camreset', 'hello', 'state', 'padraw']);
  const write = (client, message) => {
    if (!client.res.write(`data: ${JSON.stringify(message)}\n\n`)) client.res.destroy();
  };
  return async function tdLive(req, res, url) {
    if (!url.pathname.startsWith('/td-live/')) return false;
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    // No CORS: only the page served by this local server may send commands.
    if (origin && origin !== `http://${req.headers.host}`) {
      res.writeHead(403).end('same origin required'); return true;
    }
    const id = url.searchParams.get('id');
    if (!id || !/^[a-zA-Z0-9-]{8,80}$/.test(id)) {
      res.writeHead(400).end('invalid client id'); return true;
    }
    if (url.pathname === '/td-live/events' && req.method === 'GET') {
      const role = url.searchParams.get('role');
      if (!['output', 'control'].includes(role)) { res.writeHead(400).end('invalid role'); return true; }
      if (clients.size >= 16 && !clients.has(id)) { res.writeHead(503).end('too many clients'); return true; }
      // One authoritative TD renderer prevents competing state reports.
      if (role === 'output' && [...clients.values()].some(c => c.role === 'output' && c.id !== id)) {
        res.writeHead(409).end('a TD output is already connected'); return true;
      }
      const previous = clients.get(id);
      if (previous) previous.res.destroy();
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Connection': 'keep-alive' });
      res.write('retry: 1000\n: connected\n\n');
      const client = { id, role, res };
      clients.set(id, client);
      const timer = setInterval(() => { if (!res.write(': heartbeat\n\n')) res.destroy(); }, 5000);
      res.on('close', () => { clearInterval(timer); if (clients.get(id) === client) clients.delete(id); });
      return true;
    }
    if (url.pathname === '/td-live/message' && req.method === 'POST') {
      const client = clients.get(id);
      if (!client) { res.writeHead(409).end('connect events first'); return true; }
      if (!(req.headers['content-type'] || '').startsWith('application/json')) {
        res.writeHead(415).end('JSON required'); return true;
      }
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16384) { res.writeHead(413).end('message too large'); return true; }
        chunks.push(chunk);
      }
      let message;
      try { message = JSON.parse(Buffer.concat(chunks).toString()); }
      catch { res.writeHead(400).end('invalid JSON'); return true; }
      if (!message || !types.has(message.t) ||
          (message.t === 'state' && client.role !== 'output') ||
          (message.t === 'g' && (typeof message.k !== 'string' ||
            !(typeof message.v === 'boolean' || (typeof message.v === 'number' && Number.isFinite(message.v))))) ||
          (message.t === 'scene' && !Number.isInteger(message.i))) {
        res.writeHead(400).end('invalid message'); return true;
      }
      for (const peer of clients.values()) if (peer.id !== id) write(peer, message);
      res.writeHead(204).end(); return true;
    }
    res.writeHead(404).end('not found'); return true;
  };
};
