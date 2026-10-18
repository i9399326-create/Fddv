// Blockverse multiplayer server (Node.js + ws)
const http = require('http');
const { WebSocketServer } = require('ws');

const ORIGIN = process.env.ORIGIN || ''; // например https://username.github.io (необязательно)
const MAX_PER_ROOM = 20;
const rooms = new Map();
let nextId = 1;

const server = http.createServer((req, res) => { res.writeHead(200); res.end('Blockverse server OK'); });
const wss = new WebSocketServer({ server });

const clean = (s, n) => String(s || '').replace(/[<>&"'`]/g, '').slice(0, n);
const color = c => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : '#F5CD30');
const num = v => (Number.isFinite(+v) ? Math.max(-5000, Math.min(5000, +v)) : 0);

function bc(from, obj) {
  const set = rooms.get(from.room);
  if (!set) return;
  const data = JSON.stringify(obj);
  set.forEach(c => { if (c !== from && c.readyState === 1) c.send(data); });
}

wss.on('connection', (ws, req) => {
  if (ORIGIN && req.headers.origin !== ORIGIN) return ws.close();
  ws.id = nextId++; ws.room = null; ws.alive = true; ws.cnt = 0;
  ws.on('pong', () => { ws.alive = true; });

  ws.on('message', raw => {
    if (raw.length > 400 || ++ws.cnt > 40) return; // защита от спама
    let m; try { m = JSON.parse(raw); } catch (e) { return; }

    if (m.t === 'join' && !ws.room) {
      const room = clean(m.room, 20).replace(/[^\w-]/g, '');
      if (!room) return;
      let set = rooms.get(room);
      if (!set) rooms.set(room, set = new Set());
      if (set.size >= MAX_PER_ROOM) return ws.close();
      const a = m.a || {};
      ws.room = room;
      ws.n = clean(m.n, 16) || 'Noob';
      ws.a = { h: color(a.h), t: color(a.t), l: color(a.l), hat: (a.hat | 0) % 5 };
      ws.send(JSON.stringify({ t: 'init', id: ws.id, ps: [...set].map(c => ({ id: c.id, n: c.n, a: c.a })) }));
      set.add(ws);
      bc(ws, { t: 'j', id: ws.id, n: ws.n, a: ws.a });
    } else if (m.t === 's' && ws.room) {
      bc(ws, { t: 's', id: ws.id, x: num(m.x), y: num(m.y), z: num(m.z), r: num(m.r), w: m.w ? 1 : 0 });
    }
  });

  ws.on('close', () => {
    if (!ws.room) return;
    const set = rooms.get(ws.room);
    if (!set) return;
    set.delete(ws);
    bc(ws, { t: 'l', id: ws.id });
    if (!set.size) rooms.delete(ws.room);
  });
});

setInterval(() => wss.clients.forEach(c => { c.cnt = 0; }), 1000);
setInterval(() => wss.clients.forEach(c => {
  if (!c.alive) return c.terminate();
  c.alive = false; c.ping();
}), 20000);

server.listen(process.env.PORT || 8080, () => console.log('Blockverse server started'));
