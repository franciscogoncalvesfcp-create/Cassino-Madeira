const test = require('node:test');
const assert = require('node:assert');
const E = require('../shared/engine.js'), B = require('../shared/bots.js');
function seeded(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

for (const level of ['easy', 'medium', 'hard']) {
  test(`${level}: joga rondas completas só com jogadas legais em todos os formatos`, () => {
    const rng = seeded(11);
    for (const cfg of [{ numPlayers: 2 }, { numPlayers: 3 }, { numPlayers: 4 }, { numPlayers: 4, teams: true }, { numPlayers: 6 }, { numPlayers: 6, teams: 3 }, { numPlayers: 6, teams: 2 }]) {
      const s = E.createMatch({ ...cfg, target: 'round' }, rng);
      while (s.phase === 'play') {
        const p = s.turn;
        const m = B.choose(level, E.botView(s, p), rng, { sims: 8, budgetMs: 1e4 });
        assert.ok(E.applyMove(s, p, m).ok, JSON.stringify(m));
      }
    }
  });
}

test('o bot não vê mãos alheias nem o baralho', () => {
  const s = E.createMatch({ numPlayers: 3, target: 21 }, seeded(3));
  const v = E.botView(s, s.turn);
  const hidden = [];
  s.hands.forEach((h, i) => { if (i !== s.turn) hidden.push(...h); });
  hidden.push(...s.deck);
  const txt = JSON.stringify(v);
  for (const c of hidden) assert.ok(!txt.includes(`"${c}"`), c);
});

test('o difícil decide igual, sejam quais forem as cartas escondidas', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const s = E.createMatch({ numPlayers: 2, target: 21 }, seeded(seed));
    const me = s.turn, other = 1 - me;
    const a = E.botView(s, me);
    // Baralha o que o bot não pode saber: mão do outro e baralho.
    const pool = E.shuffle(s.hands[other].concat(s.deck), seeded(seed * 31));
    const t = E.cloneState(s);
    t.hands[other] = pool.slice(0, 4); t.deck = pool.slice(4);
    const b = E.botView(t, me);
    assert.deepStrictEqual(b, a);
    const opts = { sims: 10, mistake: 0, budgetMs: 1e4 };
    assert.deepStrictEqual(B.hard(b, seeded(seed), opts), B.hard(a, seeded(seed), opts));
  }
});
