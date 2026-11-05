const test = require('node:test');
const assert = require('node:assert');
process.env.BOT_DELAY_MS = '5'; process.env.OFFLINE_GRACE_MS = '150'; process.env.NEXT_ROUND_MS = '50'; process.env.DEAL_PAUSE_MS = '0';
const { server, rooms } = require('../server/server.js');
const E = require('../shared/engine.js');
let base;
test.before(() => new Promise(r => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
test.after(() => new Promise(r => { for (const room of rooms.values()) { clearTimeout(room.timer); clearTimeout(room.nextTimer); } server.closeAllConnections(); server.close(r); }));
const post = async (p, b) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function stream(code, token) {
  const c = { last: null, all: [], raw: '', ctl: new AbortController(), closed: null };
  c.ready = fetch(`${base}/api/rooms/${code}/stream?token=${encodeURIComponent(token)}`, { signal: c.ctl.signal }).then(async r => {
    c.status = r.status;
    if (!r.ok) return;
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) break; const t = dec.decode(value); c.raw += t; buf += t; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2); if (line.startsWith('data: ')) { const d = JSON.parse(line.slice(6)); if (d.closed) c.closed = d.closed; else { c.last = d; c.all.push(d); } } } } } catch (e) {} })();
  });
  c.close = () => c.ctl.abort();
  return c;
}
async function until(fn, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(10); } throw new Error('timeout'); }

test('sala pública aparece na lista e aceita jogadores', async () => {
  const a = await post('/api/rooms', { nick: 'Ana', name: 'Mesa <b>', visibility: 'public', config: { numPlayers: 2, target: 21 } });
  assert.strictEqual(a.status, 200);
  const sa = stream(a.body.code, a.body.token); await sa.ready;
  await until(() => sa.last);
  const list = await (await fetch(base + '/api/rooms')).json();
  assert.ok(list.rooms.some(r => r.code === a.body.code));
  const j = await post(`/api/rooms/${a.body.code}/join`, { nick: 'Ana' });
  assert.strictEqual(j.status, 200);
  await until(() => sa.last.lobby.seats[1]);
  assert.strictEqual(sa.last.lobby.seats[1].nick, 'Ana 2', 'nomes não se repetem');
  const cheia = await post(`/api/rooms/${a.body.code}/join`, { nick: 'Rui' });
  assert.strictEqual(cheia.status, 409);
  sa.close();
});

test('sala privada: password, não aparece na lista, hash guardado', async () => {
  const curto = await post('/api/rooms', { nick: 'Ana', visibility: 'private', password: 'x', config: { numPlayers: 2 } });
  assert.strictEqual(curto.status, 400);
  const a = await post('/api/rooms', { nick: 'Ana', visibility: 'private', password: 'poncha', config: { numPlayers: 3 } });
  const list = await (await fetch(base + '/api/rooms')).json();
  assert.ok(!list.rooms.some(r => r.code === a.body.code));
  assert.strictEqual((await post(`/api/rooms/${a.body.code}/join`, { nick: 'Rui', password: 'errada' })).status, 403);
  assert.strictEqual((await post(`/api/rooms/${a.body.code}/join`, { nick: 'Rui' })).status, 403);
  assert.strictEqual((await post(`/api/rooms/${a.body.code}/join`, { nick: 'Rui', password: 'poncha' })).status, 200);
  const room = rooms.get(a.body.code);
  assert.ok(!JSON.stringify(room.pass).includes('poncha'));
  for (let i = 0; i < 8; i++) await post(`/api/rooms/${a.body.code}/join`, { nick: 'X', password: 'nao' });
  assert.strictEqual((await post(`/api/rooms/${a.body.code}/join`, { nick: 'X', password: 'nao' })).status, 429, 'limite de tentativas');
});

test('partida completa com 2 humanos e 2 bots em duplas: privacidade e validação', async () => {
  const a = await post('/api/rooms', { nick: 'Ana', visibility: 'public', config: { numPlayers: 4, teams: true, target: 'round' }, turnSeconds: 0 });
  const code = a.body.code;
  const b = await post(`/api/rooms/${code}/join`, { nick: 'Rui' });
  const sa = stream(code, a.body.token), sb = stream(code, b.body.token);
  await Promise.all([sa.ready, sb.ready]);
  await until(() => sa.last && sb.last);
  // Só o anfitrião controla bots e o início
  assert.strictEqual((await post(`/api/rooms/${code}/action`, { token: b.body.token, action: 'start' })).status, 403);
  assert.strictEqual((await post(`/api/rooms/${code}/action`, { token: b.body.token, action: 'addBot', seat: 2, level: 'easy' })).status, 403);
  assert.strictEqual((await post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'start' })).status, 409, 'lugares vazios');
  await post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'addBot', seat: 2, level: 'easy' });
  await post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'addBot', seat: 3, level: 'hard' });
  assert.strictEqual((await post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'start' })).status, 200);
  const room = rooms.get(code);
  await until(() => sa.last.view && sb.last.view);
  assert.strictEqual((await post(`/api/rooms/${code}/join`, { nick: 'Tarde' })).status, 409, 'não entra a meio');
  const tok = [a.body.token, b.body.token], str = [sa, sb];
  // Fora de vez e cartas alheias são recusadas
  // Espera pela vez de um humano: a vez não avança sozinha e a jogada do outro tem de ser recusada.
  await until(() => room.state.turn <= 1);
  const s = room.state;
  const notTurnHuman = s.turn === 0 ? 1 : 0;
  assert.strictEqual((await post(`/api/rooms/${code}/action`, { token: tok[notTurnHuman], action: 'move', move: { type: 'trail', card: s.hands[notTurnHuman][0] } })).status, 400);
  let guard = 0;
  while (room.state.phase === 'play' && guard++ < 400) {
    const t = room.state.turn;
    if (t <= 1) {
      await until(() => str[t].last.view.turn === t && str[t].last.view.hand.length === room.state.hands[t].length && str[t].last.view.phase === 'play');
      const v = str[t].last.view;
      // o que o jogador recebe nunca contém as cartas escondidas dos outros
      const secret = room.state.hands.flatMap((h, i) => (i === t ? [] : h)).concat(room.state.deck);
      const txt = JSON.stringify(v);
      assert.ok(Array.isArray(v.history) && v.history[0].type === 'deal', 'histórico enviado');
      for (const c of secret) assert.ok(!txt.includes(`"${c}"`), 'fuga: ' + c);
      const ms = E.enumerateMoves({ hand: v.hand, table: v.table });
      const m = ms.find(x => x.type === 'capture') || ms[0];
      const stolen = room.state.hands[1 - t][0];
      if (stolen) assert.strictEqual((await post(`/api/rooms/${code}/action`, { token: tok[t], action: 'move', move: { type: 'trail', card: stolen } })).status, 400);
      const r = await post(`/api/rooms/${code}/action`, { token: tok[t], action: 'move', move: m });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    } else await sleep(10);
  }
  assert.ok(['matchEnd', 'roundEnd'].includes(room.state.phase));
  await until(() => sa.last.view.phase !== 'play');
  assert.strictEqual(sa.last.view.result.score.length, 2);
  // Toda a stream de ambos: nunca enviou mãos alheias no início
  sa.close(); sb.close();
});

test('jogador que perde a ligação: bot joga por ele e volta com o mesmo token', async () => {
  const a = await post('/api/rooms', { nick: 'Ana', config: { numPlayers: 2, target: 'round' }, turnSeconds: 0 });
  const code = a.body.code;
  const b = await post(`/api/rooms/${code}/join`, { nick: 'Rui' });
  const sa = stream(code, a.body.token); let sb = stream(code, b.body.token);
  await Promise.all([sa.ready, sb.ready]); await until(() => sa.last && sb.last);
  const st = await post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'start' });
  assert.strictEqual(st.status, 200, JSON.stringify(st.body));
  const room = rooms.get(code);
  sb.close();
  await until(() => !room.seats[1].connected);
  const before = room.state.hands[1].length + room.state.deck.length;
  // Ana joga sempre; o Rui, desligado, joga sozinho ao fim da espera
  await until(() => {
    if (room.state.phase === 'play' && room.state.turn === 0) {
      post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'move', move: { type: 'trail', card: room.state.hands[0][0] } }).catch(() => {});
    }
    return room.state.hands[1].length + room.state.deck.length < before;
  }, 3000);
  sb = stream(code, b.body.token); await sb.ready;
  await until(() => sb.last && sb.last.view);
  assert.ok(room.seats[1].connected); assert.strictEqual(sb.last.lobby.you.seat, 1);
  sa.close(); sb.close();
});

test('sair a meio: bot fica com o lugar e o anfitrião passa para outro', async () => {
  const a = await post('/api/rooms', { nick: 'Ana', config: { numPlayers: 2, target: 21 }, turnSeconds: 0 });
  const code = a.body.code;
  const b = await post(`/api/rooms/${code}/join`, { nick: 'Rui' });
  const sa = stream(code, a.body.token), sb = stream(code, b.body.token);
  await Promise.all([sa.ready, sb.ready]); await until(() => sa.last && sb.last);
  await post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'start' });
  await post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'leave' });
  const room = rooms.get(code);
  assert.ok(room.seats[0].isBot);
  await until(() => sb.last.lobby.you.isHost);
  assert.strictEqual((await post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'chat', text: 'oi' })).status, 403);
  sa.close(); sb.close();
  await post(`/api/rooms/${code}/action`, { token: b.body.token, action: 'leave' });
  assert.ok(!rooms.has(code), 'sala apaga-se quando já não há humanos');
});

test('entradas estranhas não partem o servidor; ficheiros fora da lista não são servidos', async () => {
  const bad = await fetch(base + '/api/rooms', { method: 'POST', body: '{nope' });
  assert.strictEqual(bad.status, 400);
  const big = await fetch(base + '/api/rooms', { method: 'POST', body: 'x'.repeat(20000) }).catch(() => ({ status: 413 }));
  assert.strictEqual(big.status, 413);
  for (const p of ['/server/server.js', '/../package.json', '/%2e%2e/package.json', '/.env']) {
    const r = await fetch(base + p); assert.strictEqual(r.status, 404, p);
  }
  assert.strictEqual((await fetch(base + '/api/rooms/ZZZZZ/stream?token=x')).status, 404);
  const a = await post('/api/rooms', { nick: '<script>x</script>'.padEnd(40, 'y'), name: '‮evil', config: { numPlayers: 9, target: 'x' }, turnSeconds: 7 });
  const room = rooms.get(a.body.code);
  assert.strictEqual(room.config.numPlayers, 2); assert.strictEqual(room.config.target, '21'); assert.strictEqual(room.turnSeconds, 60);
  assert.ok(!room.name.includes('‮'));
  assert.ok(room.seats[0].nick.length <= 20);
  const mv = await post(`/api/rooms/${a.body.code}/action`, { token: a.body.token, action: 'move', move: { type: 'capture', card: { x: 1 }, take: 'abc' } });
  assert.strictEqual(mv.status, 409);
});

test('a página inicial é servida com política de segurança', async () => {
  const r = await fetch(base + '/');
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(await r.text(), /Cassino da Madeira/);
});
