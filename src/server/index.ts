// Servidor: entrega a tela (arquivos estáticos) e mantém as salas por WebSocket.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import { HARDCORE_LIVES, HARDCORE_ROUNDS } from '../shared/rules';
import { GameError, Room } from './room';

const PORT = Number(process.env.PORT ?? 3001);
const STATIC_DIR = join(process.cwd(), 'dist', 'client');
const ROOM_TTL_MS = 10 * 60 * 1000; // sala vazia some depois de 10 minutos
// Vidas e rodadas do Hardcore ainda estão em teste: dá para mudar sem mexer no código.
const ROOM_OPTIONS = {
  hardcoreLives: Number(process.env.HARDCORE_VIDAS) || HARDCORE_LIVES,
  hardcoreRounds: Number(process.env.HARDCORE_RODADAS) || HARDCORE_ROUNDS,
};
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I/L

const rooms = new Map<string, Room>();
const seats = new Map<WebSocket, { code: string; playerId: string }>();

function newCode(): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
}

const normCode = (raw: unknown) => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

function send(ws: WebSocket, msg: ServerMsg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room: Room) {
  room.lastActive = Date.now();
  for (const [ws, seat] of seats) {
    if (seat.code === room.code) send(ws, { t: 'state', room: room.viewFor(seat.playerId) });
  }
}

function handle(ws: WebSocket, msg: ClientMsg) {
  const seat = seats.get(ws);

  if (msg.t === 'create' || msg.t === 'join' || msg.t === 'rejoin') {
    if (seat) throw new GameError('Você já está em uma sala.');
    let room: Room;
    if (msg.t === 'create') {
      room = new Room(newCode(), Math.random, ROOM_OPTIONS);
      rooms.set(room.code, room);
    } else {
      const found = rooms.get(normCode(msg.code));
      if (!found) {
        send(ws, { t: 'error', message: 'Sala não encontrada. Confira o código.', fatal: msg.t === 'rejoin' });
        return;
      }
      room = found;
    }
    let player;
    try {
      player = msg.t === 'rejoin' ? room.reconnect(String(msg.token)) : room.addPlayer(msg.name);
    } catch (e) {
      if (msg.t === 'create') rooms.delete(room.code);
      if (msg.t === 'rejoin' && e instanceof GameError) {
        send(ws, { t: 'error', message: e.message, fatal: true });
        return;
      }
      throw e;
    }
    // Se a mesma pessoa reconectou em outra aba, a conexão antiga perde o lugar.
    for (const [other, s] of seats) if (s.code === room.code && s.playerId === player.id) seats.delete(other);
    seats.set(ws, { code: room.code, playerId: player.id });
    send(ws, { t: 'welcome', code: room.code, playerId: player.id, token: player.token });
    broadcast(room);
    return;
  }

  if (!seat) throw new GameError('Entre em uma sala primeiro.');
  const room = rooms.get(seat.code);
  if (!room) throw new GameError('A sala não existe mais.');
  const me = seat.playerId;

  switch (msg.t) {
    case 'mode': room.setMode(me, msg.mode); break;
    case 'theme': room.setTheme(me, msg.theme); break;
    case 'start': room.start(me); break;
    case 'clue': room.setClue(me, String(msg.cardId), msg.text); break;
    case 'grab': room.grab(me, msg.cardId === null ? null : String(msg.cardId)); break;
    case 'move': room.move(me, String(msg.cardId), Number(msg.to)); break;
    case 'ok': room.setOk(me, Boolean(msg.value)); break;
    case 'reveal': room.reveal(me); break;
    case 'again': room.again(me); break;
    case 'lobby': room.toLobby(me); break;
    case 'leave':
      room.leave(me);
      seats.delete(ws);
      send(ws, { t: 'left' });
      break;
    default: throw new GameError('Mensagem desconhecida.');
  }
  broadcast(room);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/saude') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, salas: rooms.size }));
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = extname(rel) ? join(STATIC_DIR, rel) : join(STATIC_DIR, 'index.html');
  if (!file.startsWith(STATIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    const cache = file.includes(`${join('dist', 'client', 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': cache }).end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Não encontrado. Rode "npm run build" antes de "npm start".');
  }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws) => {
  let alive = true;
  ws.on('pong', () => { alive = true; });
  const ping = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 30_000);

  ws.on('message', (data) => {
    try {
      handle(ws, JSON.parse(String(data)) as ClientMsg);
    } catch (e) {
      send(ws, { t: 'error', message: e instanceof GameError ? e.message : 'Algo deu errado. Tente de novo.' });
      if (!(e instanceof GameError)) console.error(e);
    }
  });

  ws.on('close', () => {
    clearInterval(ping);
    const seat = seats.get(ws);
    if (!seat) return;
    seats.delete(ws);
    const room = rooms.get(seat.code);
    if (!room) return;
    room.disconnect(seat.playerId);
    broadcast(room);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) if (room.empty && now - room.lastActive > ROOM_TTL_MS) rooms.delete(code);
}, 60_000).unref();

server.listen(PORT, () => console.log(`Pororoca no ar: http://localhost:${PORT}`));
