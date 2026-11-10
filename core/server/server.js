// Núcleo da plataforma: salas, lugares, tempo real, temporizadores e bots.
// Não conhece nenhum jogo em concreto: fala com cada um pelo contrato dos módulos (ARCHITECTURE.md, 13.2).
// Sem dependências: basta Node 20 ou mais recente.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const N = require('../shared/names.js');

const GAMES = require('./games.js');
const DEFAULT_GAME = 'cassino';

const PORT = +process.env.PORT || 3000;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const MAX_ROOMS = +process.env.MAX_ROOMS || 300;
const BOT_DELAY = +process.env.BOT_DELAY_MS || 1200;
const OFFLINE_GRACE = +process.env.OFFLINE_GRACE_MS || 30000; // quanto se espera por quem perdeu a ligação
const DEAL_PAUSE = process.env.DEAL_PAUSE_MS !== undefined ? +process.env.DEAL_PAUSE_MS : null; // tempo para a animação de distribuição
const CREATE_PER_MIN = +process.env.CREATE_PER_MIN || 10;
const HOST_GRACE = +process.env.HOST_GRACE_MS || 20000;
const NEXT_ROUND_WAIT = +process.env.NEXT_ROUND_MS || 45000;
const EMPTY_ROOM_TTL = +process.env.EMPTY_ROOM_MS || 10 * 60000;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const rng = () => crypto.randomInt(0, 2 ** 32) / 2 ** 32;
const rooms = new Map();

// --- Utilitários ---------------------------------------------------------
class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f​-‏‪-‮⁠-⁩﻿]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const newToken = () => crypto.randomBytes(24).toString('base64url');
function newCode() {
  for (let t = 0; t < 50; t++) {
    let c = '';
    for (let i = 0; i < 5; i++) c += ALPHABET[crypto.randomInt(ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
  throw new HttpError(503, 'O servidor está cheio. Tenta daqui a pouco.');
}
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return { salt, hash: crypto.scryptSync(pw, salt, 32) };
}
function checkPassword(room, pw) {
  const h = crypto.scryptSync(String(pw || ''), room.pass.salt, 32);
  return crypto.timingSafeEqual(h, room.pass.hash);
}

// Limites por endereço
const buckets = new Map();
function allow(key, perMin, burst) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) { b = { n: burst, t: now }; buckets.set(key, b); }
  b.n = Math.min(burst, b.n + (now - b.t) / 60000 * perMin);
  b.t = now;
  if (b.n < 1) return false;
  b.n--;
  return true;
}
setInterval(() => { const lim = Date.now() - 15 * 60000; for (const [k, b] of buckets) if (b.t < lim) buckets.delete(k); }, 5 * 60000).unref();
function ipOf(req) {
  if (TRUST_PROXY) { const f = req.headers['x-forwarded-for']; if (f) return String(f).split(',')[0].trim(); }
  return req.socket.remoteAddress || '?';
}

// --- Salas ------------------------------------------------------------------
function makePlayer(nick) {
  return { id: crypto.randomUUID(), token: newToken(), nick, isBot: false, level: null, stream: null, connected: false, lastSeen: Date.now(), left: false };
}
function makeBot(level, room) {
  const used = new Set(room.seats.filter(Boolean).map(p => p.nick));
  const nick = N.pickNames(1, rng, used)[0] || 'Bot';
  const levels = room.mod.botLevels;
  return { id: crypto.randomUUID(), token: null, nick, isBot: true, level: levels.includes(level) ? level : room.mod.defaultBotLevel, connected: true };
}
const numTeams = N.numTeams;
// Opções que o anfitrião controla. Tudo ligado por omissão.
const OPTION_KEYS = ['hints', 'log', 'alerts'];
function validOptions(o, base) {
  const out = Object.assign({ hints: true, log: true, alerts: true }, base);
  if (o && typeof o === 'object') for (const k of OPTION_KEYS) if (typeof o[k] === 'boolean') out[k] = o[k];
  return out;
}
// Muda o número de lugares mantendo quem já está sentado. Os bots saem primeiro se faltar espaço.
function resizeSeats(room, n) {
  const old = room.seats;
  if (old.length === n) return;
  const people = old.filter(x => x && !x.isBot).length;
  if (people > n) throw new HttpError(409, `Há ${people} pessoas na sala. Para passar para ${n} jogadores, alguém tem de sair primeiro.`);
  const seats = new Array(n).fill(null);
  const overflow = [];
  old.forEach((x, i) => { if (!x) return; if (i < n) seats[i] = x; else overflow.push(x); });
  overflow.sort((a, b) => a.isBot - b.isBot);
  for (const x of overflow) {
    let free = seats.indexOf(null);
    if (free < 0 && !x.isBot) free = seats.findIndex(y => y.isBot); // a pessoa fica com o lugar de um bot
    if (free >= 0) seats[free] = x;
  }
  room.seats = seats;
}
// Assinatura de quem joga com quem (os números das equipas não contam).
function teamSig(room, t) {
  const groups = Array.from({ length: t }, () => []);
  room.seats.forEach((x, i) => { if (x) groups[i % t].push(x.id); });
  return groups.map(g => g.sort().join(',')).sort().join('|');
}
function createRoom(body) {
  if (rooms.size >= MAX_ROOMS) throw new HttpError(503, 'O servidor está cheio. Tenta daqui a pouco.');
  const nick = clean(body.nick, 20);
  if (!nick) throw new HttpError(400, 'Escreve o teu nome.');
  const visibility = body.visibility === 'private' ? 'private' : 'public';
  const password = typeof body.password === 'string' ? body.password : '';
  if (visibility === 'private' && (password.length < 3 || password.length > 40)) throw new HttpError(400, 'A password tem de ter entre 3 e 40 caracteres.');
  const game = typeof body.game === 'string' && GAMES[body.game] ? body.game : DEFAULT_GAME;
  const mod = GAMES[game];
  const config = mod.normalizeConfig(body.config);
  const turnSeconds = [0, 30, 60].includes(+body.turnSeconds) ? +body.turnSeconds : 60;
  const room = {
    code: newCode(), name: clean(body.name, 30) || `Mesa de ${nick}`, visibility, game, mod, version: 0, waitKey: -1, waitStart: 0,
    pass: visibility === 'private' ? hashPassword(password) : null,
    config, turnSeconds, options: validOptions(body.options), seats: new Array(config.numPlayers).fill(null),
    tokens: new Map(), hostId: null, phase: 'lobby', state: null, chat: [], deadline: null, timer: null,
    created: Date.now(), emptySince: Date.now(),
  };
  const p = makePlayer(nick);
  room.seats[0] = p; room.tokens.set(p.token, p); room.hostId = p.id;
  rooms.set(room.code, room);
  return { room, player: p };
}
const seatOf = (room, p) => room.seats.indexOf(p);
const getRoom = code => {
  const r = rooms.get(String(code).toUpperCase());
  if (!r) throw new HttpError(404, 'Essa sala já não existe. Confirma o código.', 'gone');
  return r;
};
function auth(room, token) {
  const p = room.tokens.get(token);
  if (!p) throw new HttpError(403, 'Já não estás nesta sala.', 'gone');
  return p;
}
function joinRoom(room, nickIn, password) {
  const nick = clean(nickIn, 20);
  if (!nick) throw new HttpError(400, 'Escreve o teu nome.');
  if (room.pass && !checkPassword(room, password)) throw new HttpError(403, 'A password está errada.');
  if (room.phase !== 'lobby') throw new HttpError(409, 'Esta sala já está a jogar.');
  const free = room.seats.indexOf(null);
  if (free < 0) throw new HttpError(409, 'Esta sala está cheia.');
  let final = nick, k = 2;
  const used = new Set(room.seats.filter(Boolean).map(p => p.nick));
  while (used.has(final)) final = `${nick.slice(0, 17)} ${k++}`;
  const p = makePlayer(final);
  room.seats[free] = p; room.tokens.set(p.token, p);
  return p;
}
function humans(room) { return room.seats.filter(p => p && !p.isBot); }
function ensureHost(room) {
  const hostP = room.seats.find(p => p && p.id === room.hostId);
  // Uma falha breve de rede não tira o lugar de anfitrião.
  if (hostP && !hostP.isBot && !hostP.left && (hostP.connected || Date.now() - hostP.lastSeen < HOST_GRACE)) return;
  const next = humans(room).find(p => p.connected) || humans(room)[0];
  if (next) room.hostId = next.id;
}
function deleteRoom(room, msg) {
  clearTimeout(room.timer);
  for (const p of room.tokens.values()) if (p.stream) { send(p.stream, { closed: msg || 'A sala foi fechada.' }); p.stream.end(); p.stream = null; }
  rooms.delete(room.code);
}
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const anyone = humans(room).some(p => p.connected);
    if (anyone) room.emptySince = null;
    else if (!room.emptySince) room.emptySince = now;
    else if (now - room.emptySince > EMPTY_ROOM_TTL) deleteRoom(room);
  }
}, Math.min(30000, Math.max(1000, EMPTY_ROOM_TTL / 2))).unref();

// --- Envio de estado --------------------------------------------------------
function send(res, obj) { res.write(`data: ${JSON.stringify(obj)}\n\n`); }
function lobbyFor(room, p) {
  ensureHost(room);
  return {
    code: room.code, name: room.name, visibility: room.visibility, game: room.game, config: room.config, turnSeconds: room.turnSeconds, options: room.options, phase: room.phase,
    deadline: room.deadline, now: Date.now(),
    seats: room.seats.map(x => x && { nick: x.nick, isBot: x.isBot, level: x.level, connected: x.isBot ? true : x.connected, isHost: x.id === room.hostId }),
    you: { seat: seatOf(room, p), isHost: p.id === room.hostId },
    chat: room.chat,
  };
}
function viewFor(room, seat) {
  if (!room.state || seat < 0) return null;
  return room.mod.view(room.state, seat, { now: Date.now(), options: room.options });
}
function broadcast(room) {
  for (const p of room.tokens.values()) {
    if (!p.stream) continue;
    send(p.stream, { lobby: lobbyFor(room, p), view: viewFor(room, seatOf(room, p)) });
  }
}

// --- Ciclo de jogo -----------------------------------------------------------
const ctxNow = () => ({ now: Date.now(), rng });
// Depois de cada mudança no jogo: nova versão, novos temporizadores, todos atualizados.
function changed(room) {
  room.version++;
  schedule(room);
  broadcast(room);
}
// Jogada de um bot. Se o bot falhar, usa a jogada de recurso do módulo.
function botAct(room, seat, level) {
  const M = room.mod, s = room.state;
  const a = M.bots.choose(level, M.bots.view(s, seat), rng);
  const r = a ? M.apply(s, seat, a, ctxNow()) : { ok: false };
  if (!r.ok) M.apply(s, seat, M.fallback(s, seat, rng), ctxNow());
  changed(room);
}
// Acabou o tempo, ou o jogador caiu: o módulo joga por ele.
function fallbackAct(room, seat) {
  const M = room.mod, s = room.state;
  M.apply(s, seat, M.fallback(s, seat, rng), ctxNow());
  changed(room);
}
// Decide o que acontece a seguir e quando: bots, tempo por jogada, quem caiu e prazos do próprio jogo.
function schedule(room) {
  clearTimeout(room.timer); room.timer = null;
  room.deadline = null;
  const s = room.state, M = room.mod;
  if (room.phase !== 'game' || !s) return;
  const now = Date.now();
  // Os prazos contam desde a última mudança no jogo, não desde a última vez que alguém se ligou.
  if (room.waitKey !== room.version) { room.waitKey = room.version; room.waitStart = now; }
  const start = room.waitStart;
  const due = [];
  for (const w of M.waitingFor(s, now)) {
    const p = room.seats[w.seat];
    const delay = w.delayMs || 0;
    if (p.isBot) { due.push({ at: start + BOT_DELAY + delay, run: () => botAct(room, w.seat, p.level) }); continue; }
    const limits = [];
    if (room.turnSeconds && w.kind === 'turn') limits.push(start + room.turnSeconds * 1000 + delay);
    if (!p.connected) limits.push(now + Math.max(1000, OFFLINE_GRACE - (now - p.lastSeen)));
    if (!limits.length) continue;
    const at = Math.min(...limits);
    if (w.kind === 'turn' && (room.deadline === null || at < room.deadline)) room.deadline = at;
    due.push({ at, run: () => fallbackAct(room, w.seat) });
  }
  const own = M.nextDeadline(s, now);
  if (own !== null && own !== undefined) due.push({ at: own, run: () => { M.tick(s, Date.now(), rng); changed(room); } });
  if (!due.length) return;
  due.sort((a, b) => a.at - b.at);
  const version = room.version, first = due[0];
  room.timer = setTimeout(() => {
    if (!rooms.has(room.code) || room.phase !== 'game' || room.state !== s || room.version !== version) return;
    first.run();
  }, Math.max(0, first.at - Date.now()));
}
const waitsFor = (room, seat) => room.phase === 'game' && room.state && room.mod.waitingFor(room.state, Date.now()).some(w => w.seat === seat);

// --- Ações --------------------------------------------------------------------
function requireHost(room, p) { ensureHost(room); if (p.id !== room.hostId) throw new HttpError(403, 'Só quem criou a sala pode fazer isso.'); }
function requireLobby(room) { if (room.phase !== 'lobby') throw new HttpError(409, 'A partida já começou.'); }
function dropFromSeat(room, seat, p) {
  // Durante o jogo, um bot fica com o lugar; no lobby, o lugar fica livre.
  if (room.phase === 'game') {
    const nick = p.nick;
    const bot = makeBot('medium', room); bot.nick = `${nick} (bot)`.slice(0, 26);
    room.seats[seat] = bot;
    if (room.state) schedule(room);
  } else room.seats[seat] = null;
}
function doAction(room, p, b) {
  const seat = seatOf(room, p);
  switch (b.action) {
    case 'chat': {
      const text = clean(b.text, 200);
      if (!text) return;
      if (!allow('chat:' + p.id, 30, 8)) throw new HttpError(429, 'Estás a enviar mensagens demasiado depressa.');
      room.chat.push({ nick: p.nick, text });
      if (room.chat.length > 60) room.chat.shift();
      break;
    }
    case 'seat': {
      requireLobby(room);
      const to = +b.seat;
      if (!Number.isInteger(to) || to < 0 || to >= room.seats.length) throw new HttpError(400, 'Esse lugar não existe.');
      const there = room.seats[to];
      if (there && !there.isBot) throw new HttpError(409, 'Esse lugar já está ocupado.');
      room.seats[seat] = there || null; room.seats[to] = p;
      break;
    }
    case 'changeTeam': {
      requireLobby(room);
      const t = numTeams(room.config);
      if (!t) throw new HttpError(400, 'Esta sala não joga em equipas.');
      const from = b.seat === undefined ? seat : +b.seat;
      const who = room.seats[from];
      if (!who) throw new HttpError(409, 'Esse lugar está vazio.');
      if (from !== seat) requireHost(room, p);
      const team = +b.team;
      if (!Number.isInteger(team) || team < 0 || team >= t) throw new HttpError(400, 'Essa equipa não existe.');
      if (from % t === team) break;
      const targets = room.seats.map((_, i) => i).filter(i => i % t === team);
      let to = targets.find(i => !room.seats[i]);
      if (to === undefined) to = targets.find(i => room.seats[i].isBot);
      if (to === undefined) {
        // Equipa só com pessoas: só quem criou a sala pode trocar alguém de lugar.
        ensureHost(room);
        if (p.id !== room.hostId) throw new HttpError(409, 'Essa equipa está cheia. Pede a quem criou a sala para fazer a troca.');
        to = targets[0];
      }
      room.seats[from] = room.seats[to] || null;
      room.seats[to] = who;
      break;
    }
    case 'addBot': {
      requireHost(room, p); requireLobby(room);
      const to = +b.seat;
      if (!Number.isInteger(to) || to < 0 || to >= room.seats.length || room.seats[to]) throw new HttpError(409, 'Esse lugar não está livre.');
      room.seats[to] = makeBot(b.level, room);
      break;
    }
    case 'removeSeat': {
      requireHost(room, p);
      const to = +b.seat, x = room.seats[to];
      if (!x) throw new HttpError(409, 'Esse lugar já está livre.');
      if (x === p) throw new HttpError(400, 'Usa o botão para sair da sala.');
      if (x.isBot) { requireLobby(room); room.seats[to] = null; break; }
      room.tokens.delete(x.token);
      if (x.stream) { send(x.stream, { closed: 'Foste retirado da sala.' }); x.stream.end(); x.stream = null; }
      dropFromSeat(room, to, x);
      break;
    }
    case 'setConfig': {
      requireHost(room, p); requireLobby(room);
      const cfg = room.mod.normalizeConfig(Object.assign({}, room.config, b.config || {}));
      resizeSeats(room, cfg.numPlayers);
      room.config = cfg;
      if (b.turnSeconds !== undefined && [0, 30, 60].includes(+b.turnSeconds)) room.turnSeconds = +b.turnSeconds;
      room.options = validOptions(b.options, room.options);
      break;
    }
    case 'shuffleTeams': {
      requireHost(room, p); requireLobby(room);
      const t = numTeams(room.config);
      const before = t ? teamSig(room, t) : room.seats.map(x => x && x.id).join('|');
      const occupied = room.seats.filter(Boolean).length;
      // Repete até as equipas mudarem mesmo (se houver mais do que uma maneira de as formar).
      for (let k = 0; k < 20; k++) {
        room.seats = N.shuffle(room.seats.slice(), rng);
        const now = t ? teamSig(room, t) : room.seats.map(x => x && x.id).join('|');
        if (now !== before || occupied < 2) break;
      }
      break;
    }
    case 'start': {
      requireHost(room, p); requireLobby(room);
      if (room.seats.some(x => !x)) throw new HttpError(409, 'Há lugares vazios. Espera por amigos ou adiciona bots.');
      room.state = room.mod.setup(room.config, rng, { dealPauseMs: DEAL_PAUSE, nextRoundMs: NEXT_ROUND_WAIT });
      room.phase = 'game';
      changed(room);
      return;
    }
    case 'next': // atalho antigo para { type: 'next' }
    case 'move': {
      if (room.phase !== 'game') throw new HttpError(409, 'A partida ainda não começou.');
      const action = b.action === 'next' ? { type: 'next' } : room.mod.sanitizeAction(b.move);
      if (action && room.mod.hostActions.includes(action.type)) requireHost(room, p);
      const r = room.mod.apply(room.state, seat, action, ctxNow());
      if (!r.ok) {
        if (b.action === 'next') return; // como antes: sem ronda acabada, não faz nada
        throw new HttpError(400, r.reason);
      }
      changed(room);
      return;
    }
    case 'lobby': {
      requireHost(room, p);
      if (room.phase !== 'game' || (!room.mod.over(room.state) && room.mod.waitingFor(room.state, Date.now()).length)) throw new HttpError(409, 'A partida ainda está a decorrer.');
      clearTimeout(room.timer);
      room.phase = 'lobby'; room.state = null; room.deadline = null;
      break;
    }
    case 'leave': {
      room.tokens.delete(p.token);
      if (p.stream) { p.stream.end(); p.stream = null; }
      p.left = true; p.connected = false;
      dropFromSeat(room, seat, p);
      ensureHost(room);
      if (!humans(room).length) { deleteRoom(room); return; }
      break;
    }
    default:
      throw new HttpError(400, 'Ação desconhecida.');
  }
  broadcast(room);
}
// --- HTTP ------------------------------------------------------------------------
const ROOT = path.join(__dirname, '..', '..');
// Só estes ficheiros são servidos. A página inicial lista os scripts pela mesma ordem (CLIENT_FILES).
const CLIENT_FILES = require('../client/files.js');
const TYPES = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8' };
const STATIC = {
  '/': ['core/client/index.html', TYPES['.html']],
  '/index.html': ['core/client/index.html', TYPES['.html']],
};
for (const f of CLIENT_FILES.styles.concat(CLIENT_FILES.scripts)) STATIC['/' + f] = [f, TYPES[path.extname(f)]];
const fileCache = {};
function indexPage() {
  return fs.readFileSync(path.join(ROOT, 'core/client/index.html'), 'utf8')
    .replace('<!--STYLES-->', CLIENT_FILES.styles.map(f => `<link rel="stylesheet" href="${f}">`).join('\n'))
    .replace('<!--SCRIPTS-->', CLIENT_FILES.scripts.map(f => `<script src="${f}"></script>`).join('\n'));
}
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};
function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > 16384) { reject(new HttpError(413, 'Pedido demasiado grande.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new HttpError(400, 'Pedido mal formado.')); }
    });
    req.on('error', reject);
  });
}
function openStream(req, res, room, token) {
  const p = room.tokens.get(token);
  if (!p) { json(res, 403, { error: 'Já não estás nesta sala.', code: 'gone' }); return; }
  if (p.stream) { try { p.stream.end(); } catch (e) {} }
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive', ...SECURITY });
  res.write('retry: 2000\n\n');
  p.stream = res; p.connected = true; p.lastSeen = Date.now();
  room.emptySince = null;
  ensureHost(room);
  if (waitsFor(room, seatOf(room, p))) schedule(room);
  broadcast(room);
  const beat = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 20000);
  req.on('close', () => {
    clearInterval(beat);
    if (p.stream !== res) return; // já ligou de novo
    p.stream = null; p.connected = false; p.lastSeen = Date.now();
    if (!rooms.has(room.code)) return;
    if (waitsFor(room, seatOf(room, p))) schedule(room);
    broadcast(room);
  });
}
async function route(req, res) {
  const url = new URL(req.url, 'http://x');
  const pathname = url.pathname;
  const ip = ipOf(req);
  if (req.method === 'GET' && STATIC[pathname]) {
    const [file, type] = STATIC[pathname];
    const body = fileCache[file] || (fileCache[file] = file.endsWith('index.html') ? indexPage() : fs.readFileSync(path.join(ROOT, file)));
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': pathname === '/' ? 'no-cache' : 'public, max-age=300', ...SECURITY });
    res.end(body);
    return;
  }
  if (!pathname.startsWith('/api/')) throw new HttpError(404, 'Página não encontrada.');
  if (!allow('ip:' + ip, 1500, 300)) throw new HttpError(429, 'Demasiados pedidos. Espera um pouco.');
  if (pathname === '/api/health') return json(res, 200, { ok: true, game: 'cassino', games: Object.keys(GAMES), rooms: rooms.size });
  if (pathname === '/api/rooms' && req.method === 'GET') {
    const list = [...rooms.values()].filter(r => r.visibility === 'public' && r.phase === 'lobby' && r.seats.some(x => !x) && humans(r).some(p => p.connected))
      .sort((a, b) => b.created - a.created).slice(0, 50)
      .map(r => ({ code: r.code, name: r.name, game: r.game, players: r.seats.filter(Boolean).length, capacity: r.seats.length, config: r.config }));
    return json(res, 200, { rooms: list });
  }
  if (pathname === '/api/rooms' && req.method === 'POST') {
    if (!allow('create:' + ip, CREATE_PER_MIN, CREATE_PER_MIN)) throw new HttpError(429, 'Criaste muitas salas seguidas. Espera um minuto.');
    const { room, player } = createRoom(await readBody(req));
    return json(res, 200, { code: room.code, token: player.token });
  }
  const m = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]{5})\/(join|check|action|stream)$/);
  if (!m) throw new HttpError(404, 'Pedido desconhecido.');
  const room = getRoom(m[1]), verb = m[2];
  if (verb === 'stream' && req.method === 'GET') return openStream(req, res, room, url.searchParams.get('token'));
  if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
  const body = await readBody(req);
  if (verb === 'join') {
    if (room.pass && !allow('pw:' + ip + ':' + room.code, 6, 6)) throw new HttpError(429, 'Demasiadas tentativas de password. Espera um minuto.');
    const p = joinRoom(room, body.nick, body.password);
    broadcast(room);
    return json(res, 200, { token: p.token });
  }
  const p = auth(room, body.token);
  if (verb === 'check') return json(res, 200, { ok: true });
  if (!allow('act:' + p.id, 240, 40)) throw new HttpError(429, 'Demasiados pedidos. Espera um pouco.');
  doAction(room, p, body);
  return json(res, 200, { ok: true });
}
const server = http.createServer((req, res) => {
  route(req, res).catch(err => {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    if (res.headersSent) { res.end(); return; }
    json(res, status, { error: status === 500 ? 'O servidor teve um problema. Tenta outra vez.' : err.message, code: err.code });
  });
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;
if (require.main === module) {
  server.listen(PORT, () => console.log(`Plataforma a correr em http://localhost:${PORT}`));
}
module.exports = { server, rooms, GAMES };
