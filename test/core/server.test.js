const test = require('node:test');
const assert = require('node:assert');
process.env.BOT_DELAY_MS = '5'; process.env.OFFLINE_GRACE_MS = '150'; process.env.NEXT_ROUND_MS = '50'; process.env.DEAL_PAUSE_MS = '0'; process.env.CREATE_PER_MIN = '100'; process.env.BOT_REACT_SCALE = '0.005';
const { server, rooms } = require('../../core/server/server.js');
const E = require('../../games/cassino/rules.js');
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

test('equipas: mudar livremente, trocar com bots, regras para equipas cheias', async () => {
  const act = (token, action, extra) => post(`/api/rooms/${code}/action`, { token, action, ...extra });
  const a = await post('/api/rooms', { nick: 'Ana', config: { numPlayers: 4, teams: true, target: 21 } });
  const code = a.body.code;
  const b = await post(`/api/rooms/${code}/join`, { nick: 'Rui' });
  const room = rooms.get(code);
  const names = () => room.seats.map(x => x && x.nick);
  assert.deepStrictEqual(names(), ['Ana', 'Rui', null, null]);
  // Rui (equipa 2) passa para a equipa da Ana
  assert.strictEqual((await act(b.body.token, 'changeTeam', { team: 0 })).status, 200);
  assert.deepStrictEqual(names(), ['Ana', null, 'Rui', null]);
  // E volta
  assert.strictEqual((await act(b.body.token, 'changeTeam', { team: 1 })).status, 200);
  assert.deepStrictEqual(names().filter(Boolean), ['Ana', 'Rui']);
  assert.strictEqual(room.seats.indexOf(room.seats.find(x => x && x.nick === 'Rui')) % 2, 1);
  // Com um bot na equipa de destino, troca com ele
  await act(a.body.token, 'addBot', { seat: 2, level: 'easy' });
  const c = await post(`/api/rooms/${code}/join`, { nick: 'Eva' });
  const bot = room.seats[2];
  assert.strictEqual(room.seats.filter(Boolean).length, 4);
  assert.strictEqual((await act(b.body.token, 'changeTeam', { team: 0 })).status, 200);
  assert.strictEqual(room.seats[2].nick, 'Rui'); assert.ok(room.seats.includes(bot));
  // Só quem criou a sala move os outros
  assert.strictEqual((await act(c.body.token, 'changeTeam', { seat: 0, team: 1 })).status, 403);
  // Equipa só com pessoas: quem não é anfitrião não entra; o anfitrião troca
  await act(a.body.token, 'removeSeat', { seat: room.seats.indexOf(bot) });
  const d = await post(`/api/rooms/${code}/join`, { nick: 'Tó' });
  assert.strictEqual(room.seats.filter(Boolean).length, 4);
  const eva = room.seats.findIndex(x => x.nick === 'Eva');
  assert.strictEqual((await act(c.body.token, 'changeTeam', { team: (eva + 1) % 2 })).status, 409);
  assert.strictEqual((await act(a.body.token, 'changeTeam', { seat: eva, team: (eva + 1) % 2 })).status, 200);
  assert.strictEqual(room.seats.filter(Boolean).length, 4);
  assert.strictEqual(room.seats.findIndex(x => x.nick === 'Eva') % 2, (eva + 1) % 2);
  assert.ok(d.status === 200);
  // Sem equipas, a ação é recusada
  const sem = await post('/api/rooms', { nick: 'Ana', config: { numPlayers: 3 } });
  assert.strictEqual((await post(`/api/rooms/${sem.body.code}/action`, { token: sem.body.token, action: 'changeTeam', team: 0 })).status, 400);
});

test('6 jogadores online e o valor da jogada chega ao motor', async () => {
  const a = await post('/api/rooms', { nick: 'Ana', config: { numPlayers: 6, teams: 3, target: 'round' }, turnSeconds: 0 });
  const code = a.body.code, room = rooms.get(code);
  assert.strictEqual(room.seats.length, 6);
  for (let i = 1; i < 6; i++) await post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'addBot', seat: i, level: 'easy' });
  assert.strictEqual((await post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'start' })).status, 200);
  await until(() => room.state.turn === 0);
  room.state.hands[0] = ['5S', '5D', 'AC', 'KH'];
  room.state.table = [{ k: 'c', id: '3H' }, { k: 'c', id: '2D' }, { k: 'c', id: '5C' }];
  const r = await post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'move', move: { type: 'call', card: '5S', take: ['3H', '2D', '5C'], value: 5 } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(room.state.table.find(t => t.k === 'b').value, 5);
  await post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'leave' });
});

test('anfitrião muda o modo dentro da sala, sem perder ninguém', async () => {
  const a = await post('/api/rooms', { nick: 'Ana', config: { numPlayers: 4, teams: true, target: 21 } });
  const code = a.body.code, room = rooms.get(code);
  const act = (token, action, extra) => post(`/api/rooms/${code}/action`, { token, action, ...extra });
  const b = await post(`/api/rooms/${code}/join`, { nick: 'Rui' });
  const c = await post(`/api/rooms/${code}/join`, { nick: 'Eva' });
  await act(a.body.token, 'addBot', { seat: 3, level: 'easy' });
  const ppl = () => room.seats.filter(x => x && !x.isBot).map(x => x.nick).sort();
  assert.strictEqual((await act(b.body.token, 'setConfig', { config: { numPlayers: 6, teams: 3 } })).status, 403, 'só o anfitrião');
  // 2 contra 2 -> 3 duplas
  assert.strictEqual((await act(a.body.token, 'setConfig', { config: { numPlayers: 6, teams: 3 } })).status, 200);
  assert.strictEqual(room.seats.length, 6); assert.strictEqual(room.config.teams, 3);
  assert.deepStrictEqual(ppl(), ['Ana', 'Eva', 'Rui']); assert.strictEqual(room.seats.filter(Boolean).length, 4);
  // -> todos contra todos a 3: as pessoas ficam, o bot sai
  const r3 = await act(a.body.token, 'setConfig', { config: { numPlayers: 3, teams: 0 } });
  assert.strictEqual(r3.status, 200, JSON.stringify(r3.body));
  assert.deepStrictEqual(ppl(), ['Ana', 'Eva', 'Rui']); assert.strictEqual(room.seats.length, 3); assert.ok(!room.seats.some(x => x.isBot));
  // -> 2 jogadores com 3 pessoas: recusado e nada muda
  assert.strictEqual((await act(a.body.token, 'setConfig', { config: { numPlayers: 2 } })).status, 409);
  assert.strictEqual(room.seats.length, 3); assert.strictEqual(room.config.numPlayers, 3);
  // duração, tempo e opções
  await act(a.body.token, 'setConfig', { config: { target: '32' }, turnSeconds: 0, options: { hints: false, log: false, x: 1 } });
  assert.strictEqual(room.config.target, '32'); assert.strictEqual(room.turnSeconds, 0);
  assert.deepStrictEqual(room.options, { hints: true && false, log: false, alerts: true });
  assert.strictEqual(room.config.numPlayers, 3, 'mudar a duração não mexe no modo');
  // modo 2 vs 2 a 2 vs 2 vs 2 com 4 pessoas cheio
  assert.ok(c.status === 200);
});

test('baralhar equipas muda as equipas e mantém todos', async () => {
  const a = await post('/api/rooms', { nick: 'Ana', config: { numPlayers: 4, teams: true, target: 21 } });
  const code = a.body.code, room = rooms.get(code);
  const act = (token, action, extra) => post(`/api/rooms/${code}/action`, { token, action, ...extra });
  for (const n of ['Rui', 'Eva', 'Tó']) await post(`/api/rooms/${code}/join`, { nick: n });
  const b = [...room.tokens.values()].find(x => x.nick === 'Rui');
  assert.strictEqual((await act(b.token, 'shuffleTeams')).status, 403);
  const teamOf = () => Object.fromEntries(room.seats.map((x, i) => [x.nick, i % 2]));
  const partnersOfAna = () => room.seats.filter((x, i) => i % 2 === teamOf().Ana && x.nick !== 'Ana').map(x => x.nick)[0];
  const seen = new Set();
  for (let i = 0; i < 12; i++) {
    const before = partnersOfAna();
    assert.strictEqual((await act(a.body.token, 'shuffleTeams')).status, 200);
    assert.notStrictEqual(partnersOfAna(), before, 'as equipas mudam sempre');
    assert.deepStrictEqual(room.seats.map(x => x.nick).sort(), ['Ana', 'Eva', 'Rui', 'Tó']);
    seen.add(partnersOfAna());
  }
  assert.strictEqual(seen.size, 3, 'todas as combinações aparecem');
});

test('nomes dos bots: sorteados, sem repetir', async () => {
  const B = require('../../core/shared/names.js');
  assert.strictEqual(new Set(B.NAMES).size, 30);
  const firsts = new Set();
  for (let r = 0; r < 8; r++) {
    const a = await post('/api/rooms', { nick: 'Ana', config: { numPlayers: 6 } });
    const room = rooms.get(a.body.code);
    for (let i = 1; i < 6; i++) await post(`/api/rooms/${a.body.code}/action`, { token: a.body.token, action: 'addBot', seat: i, level: 'easy' });
    const names = room.seats.slice(1).map(x => x.nick);
    assert.strictEqual(new Set(names).size, 5);
    names.forEach(n => assert.ok(B.NAMES.includes(n)));
    firsts.add(names[0]);
    await post(`/api/rooms/${a.body.code}/action`, { token: a.body.token, action: 'leave' });
  }
  assert.ok(firsts.size > 1, 'o primeiro bot não é sempre o mesmo');
});

test('sem histórico, o servidor só envia o último acontecimento', async () => {
  const a = await post('/api/rooms', { nick: 'Ana', config: { numPlayers: 2, target: 'round' }, turnSeconds: 0 });
  const code = a.body.code, room = rooms.get(code);
  await post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'addBot', seat: 1, level: 'easy' });
  await post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'setConfig', options: { log: false } });
  const sa = stream(code, a.body.token); await sa.ready;
  await post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'start' });
  await until(() => room.state && room.state.turn === 0);
  await post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'move', move: { type: 'trail', card: room.state.hands[0][0] } });
  await until(() => room.state.history.length >= 3 && sa.last && sa.last.view && sa.last.view.lastMove);
  await sleep(50);
  assert.strictEqual(sa.last.view.history.length, 1);
  assert.strictEqual(sa.last.lobby.options.log, false);
  sa.close();
  await post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'leave' });
});

test('núcleo: a ronda seguinte começa sozinha quando o módulo o pede', async () => {
  const a = await post('/api/rooms', { nick: 'Ana', config: { numPlayers: 2, target: 21 }, turnSeconds: 0 });
  const code = a.body.code, room = rooms.get(code);
  await post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'addBot', seat: 1, level: 'easy' });
  await post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'start' });
  assert.strictEqual(room.game, 'cassino');
  Object.assign(room.state, { turn: 0, hands: [['KS'], []], deck: [], table: [], totals: [0, 0], history: [] });
  const r = await post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'move', move: { type: 'trail', card: 'KS' } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(room.state.phase, 'roundEnd');
  await until(() => room.state.roundNo === 2 && room.state.phase === 'play', 2000);
  await post(`/api/rooms/${code}/action`, { token: a.body.token, action: 'leave' });
});

test('núcleo: salas pedem um jogo; jogo desconhecido fica Cassino', async () => {
  const a = await post('/api/rooms', { nick: 'Ana', game: 'xadrez', config: { numPlayers: 3 } });
  assert.strictEqual(rooms.get(a.body.code).game, 'cassino');
  const h = await (await fetch(base + '/api/health')).json();
  assert.deepStrictEqual(h.games, ['cassino', 'gringo']);
  const page = await (await fetch(base + '/')).text();
  assert.match(page, /<script src="games\/cassino\/module.js"><\/script>/);
  assert.strictEqual((await fetch(base + '/games/cassino/table.js')).status, 200);
  await post(`/api/rooms/${a.body.code}/action`, { token: a.body.token, action: 'leave' });
});

test('Gringo online: partida completa com bots que fazem Jogadas Rápidas, sem fugas de cartas', async () => {
  const GR = require('../../games/gringo/rules.js');
  const a = await post('/api/rooms', { nick: 'Ana', game: 'gringo', config: { numPlayers: 4 }, turnSeconds: 0 });
  const code = a.body.code, room = rooms.get(code);
  assert.strictEqual(room.game, 'gringo');
  const act = (action, extra) => post(`/api/rooms/${code}/action`, { token: a.body.token, action, ...extra });
  for (let i = 1; i < 4; i++) await act('addBot', { seat: i, level: 'hard' }); // nível que não existe no Gringo: fica Normal
  assert.ok(room.seats.slice(1).every(x => x.level === 'normal'));
  const sa = stream(code, a.body.token); await sa.ready;
  assert.strictEqual((await act('start')).status, 200);
  await until(() => sa.last && sa.last.view);
  const me = () => room.state;
  const mv = move => act('move', { move });
  const h0 = () => me().hands[0];
  assert.strictEqual((await mv({ type: 'peek', slots: [h0()[0].id, h0()[1].id] })).status, 200);
  assert.strictEqual((await mv({ type: 'ready' })).status, 200);
  await until(() => me().phase === 'play', 4000);
  let guard = 0;
  while (me().phase !== 'over' && guard++ < 400) {
    const w = GR.waitingFor(me());
    if (w.length && w[0].seat === 0) {
      const s = me();
      let m;
      if (s.powers.length) m = { type: s.power ? 'done' : 'skip' };
      else if (s.step === 'drawn') m = { type: 'discardDrawn' };
      else m = guard > 25 && !s.final ? { type: 'gringo' } : { type: 'draw' };
      const r = await mv(m);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      await sleep(5);
      continue;
    }
    // O que a Ana recebe nunca mostra cartas que ela não pode saber.
    if (sa.last && sa.last.view) {
      const hid = GR.hidden(me(), 0);
      const txt = JSON.stringify(sa.last.view);
      for (const c of hid) assert.ok(!txt.includes(`"${c}"`), 'fuga: ' + c);
    }
    await sleep(15);
  }
  assert.strictEqual(me().phase, 'over');
  await until(() => sa.last.view.phase === 'over');
  assert.ok(me().events.some(e => e.t === 'ready' && e.seat === 3));
  // Voltar ao lobby e jogar outra vez: começa quem ganhou
  const winner = GR.nextStarter(me().result.ranking, 4);
  assert.strictEqual((await act('lobby')).status, 200);
  assert.strictEqual((await act('start')).status, 200);
  assert.strictEqual(room.state.turn, winner);
  sa.close();
  await act('leave');
});

test('mudar de jogo no lobby: lugares, níveis dos bots e regras de cada jogo', async () => {
  const a = await post('/api/rooms', { nick: 'Ana', config: { numPlayers: 4, teams: 2 } });
  const code = a.body.code, room = rooms.get(code);
  const act = (action, extra) => post(`/api/rooms/${code}/action`, { token: a.body.token, action, ...extra });
  await post(`/api/rooms/${code}/join`, { nick: 'Rui' });
  await act('addBot', { seat: 2, level: 'hard' });
  assert.strictEqual((await act('setConfig', { game: 'xadrez' })).status, 400);
  assert.strictEqual((await act('setConfig', { game: 'gringo' })).status, 200);
  assert.strictEqual(room.game, 'gringo'); assert.strictEqual(room.config.teams, 0); assert.strictEqual(room.seats.length, 4);
  assert.strictEqual(room.seats[2].level, 'normal');
  assert.strictEqual((await act('setConfig', { config: { numPlayers: 7 } })).status, 200);
  assert.strictEqual(room.seats.length, 7);
  for (let i = 0; i < 4; i++) await post(`/api/rooms/${code}/join`, { nick: 'P' + i });
  // 6 pessoas no Gringo e muda para Cassino: fica a 6
  assert.strictEqual((await act('setConfig', { game: 'cassino' })).status, 200);
  assert.strictEqual(room.config.numPlayers, 6);
  assert.strictEqual(room.seats.filter(x => x && !x.isBot).length, 6);
  const list = await (await fetch(base + '/api/rooms')).json();
  await act('leave');
  assert.ok(list.rooms.every(r => typeof r.game === 'string'));
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
  for (const p of ['/server/server.js', '/core/server/server.js', '/core/client/files.js', '/test/fixtures/cassino-golden.json', '/../package.json', '/%2e%2e/package.json', '/.env']) {
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
