// Teste de contrato: corre igual para todos os jogos da plataforma.
// Um jogo novo só entra em core/server/games.js depois de passar aqui.
const test = require('node:test');
const assert = require('node:assert');
const GAMES = require('../../core/server/games.js');

function seeded(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const MATCHES_PER_FORMAT = +process.env.CONTRACT_MATCHES || 4;

function formats(M) {
  const out = M.players.map(n => ({ numPlayers: n, teams: 0 }));
  for (const t of M.teams) out.push({ numPlayers: t.players, teams: t.teams });
  return out;
}
function leaks(obj, hidden) {
  const txt = JSON.stringify(obj);
  return hidden.filter(id => txt.includes(JSON.stringify(id)));
}

for (const [id, M] of Object.entries(GAMES)) {
  test(`${id}: tem todas as peças do contrato`, () => {
    for (const k of ['id', 'name', 'players', 'teams', 'botLevels', 'defaultBotLevel', 'hostActions']) assert.ok(M[k] !== undefined, k);
    for (const k of ['normalizeConfig', 'setup', 'sanitizeAction', 'apply', 'waitingFor', 'nextDeadline', 'tick', 'view', 'over', 'result', 'fallback', 'hidden'])
      assert.strictEqual(typeof M[k], 'function', k);
    for (const k of ['view', 'choose', 'react']) assert.strictEqual(typeof M.bots[k], 'function', 'bots.' + k);
    assert.strictEqual(M.id, id);
    assert.ok(M.botLevels.includes(M.defaultBotLevel));
  });

  test(`${id}: configurações estranhas ficam válidas`, () => {
    for (const c of [{}, { numPlayers: 99 }, { numPlayers: -1, teams: 7 }, null]) {
      const n = M.normalizeConfig(c);
      assert.ok(M.players.includes(n.numPlayers) || M.teams.some(t => t.players === n.numPlayers));
    }
  });

  test(`${id}: jogadas estranhas são recusadas sem partir nada`, () => {
    const rng = seeded(3);
    const s = M.setup(M.normalizeConfig({ numPlayers: M.players[0] }), rng, { nextRoundMs: 0, dealPauseMs: 0 });
    const seat = M.waitingFor(s, 0)[0].seat;
    for (const raw of [null, 42, 'x', {}, { type: 'nada' }, { type: 'capture', card: 'ZZ', take: ['??'] }]) {
      const a = M.sanitizeAction(raw);
      const r = M.apply(s, seat, a, { now: 0, rng });
      assert.strictEqual(r.ok, false, JSON.stringify(raw));
      assert.ok(typeof r.reason === 'string' && r.reason.length > 0);
    }
  });

  for (const fmt of formats(M)) {
    const label = `${fmt.numPlayers} jogadores${fmt.teams ? `, ${fmt.teams} equipas` : ''}`;
    test(`${id}, ${label}: partidas completas com bots, sem fugas de informação`, () => {
      for (let g = 0; g < MATCHES_PER_FORMAT; g++) {
        const rng = seeded(1 + g * 31 + fmt.numPlayers * 7 + fmt.teams);
        const cfg = M.normalizeConfig(fmt);
        const s = M.setup(cfg, rng, { nextRoundMs: 0, dealPauseMs: 0 });
        let now = 0, steps = 0;
        while (!M.over(s)) {
          assert.ok(++steps < 50000, 'a partida não acaba');
          const waiting = M.waitingFor(s, now);
          for (const w of waiting) assert.ok(Number.isInteger(w.seat) && w.seat >= 0 && w.seat < cfg.numPlayers, 'lugar inválido');
          if (!waiting.length) {
            const d = M.nextDeadline(s, now);
            assert.ok(d !== null && d !== undefined, 'ninguém joga e não há prazo: o jogo ficava parado');
            now = Math.max(now, d);
            M.tick(s, now, rng);
            continue;
          }
          // Cada lugar só vê o que pode ver, e o bot também.
          if (steps % 3 === 0) {
            for (let seat = 0; seat < cfg.numPlayers; seat++) {
              const hidden = M.hidden(s, seat);
              assert.deepStrictEqual(leaks(M.view(s, seat, { now, options: {} }), hidden), [], `a vista do lugar ${seat} mostra cartas escondidas`);
              assert.deepStrictEqual(leaks(M.bots.view(s, seat), hidden), [], `o bot do lugar ${seat} vê cartas escondidas`);
            }
          }
          const w = waiting[0];
          const level = M.botLevels[(steps + g) % M.botLevels.length] === 'hard' ? M.defaultBotLevel : M.botLevels[(steps + g) % M.botLevels.length];
          const useFallback = steps % 7 === 0;
          const a = useFallback ? M.fallback(s, w.seat, rng) : M.bots.choose(level, M.bots.view(s, w.seat), rng);
          const r = M.apply(s, w.seat, a, { now, rng });
          assert.ok(r.ok, `${useFallback ? 'jogada de recurso' : 'bot ' + level} ilegal: ${r.reason}`);
          now += 1000;
        }
        // Classificação final: cada lugar aparece uma vez, lugares a começar em 1 e sem saltos para trás.
        const res = M.result(s);
        const seats = res.flatMap(x => x.seats).sort((a, b) => a - b);
        assert.deepStrictEqual(seats, Array.from({ length: cfg.numPlayers }, (_, i) => i));
        assert.strictEqual(res[0].place, 1);
        res.forEach((x, i) => {
          assert.ok(x.place >= 1 && x.place <= i + 1, 'lugar fora de ordem');
          if (i) assert.ok(x.place >= res[i - 1].place);
        });
      }
    });
  }
}
