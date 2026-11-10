// Partidas de referência gravadas antes de o Cassino passar a módulo da plataforma.
// O módulo tem de reproduzir exatamente as mesmas partidas.
const test = require('node:test');
const assert = require('node:assert');
const M = require('../../../games/cassino/module.js');
const { seeded, summary } = require('./golden-helpers.js');
const GOLDEN = require('../../fixtures/cassino-golden.json');

test(`há ${GOLDEN.length} partidas de referência`, () => assert.ok(GOLDEN.length >= 20));

for (const c of GOLDEN) {
  const label = `${c.config.numPlayers}j${c.config.teams ? ' ' + c.config.teams + ' equipas' : ''}, meta ${c.config.target}, semente ${c.seed}`;

  test(`repetir as jogadas gravadas dá o mesmo fim (${label})`, () => {
    const deckRng = seeded(c.seed);
    const s = M.setup(c.config, deckRng, {});
    for (const entry of c.log) {
      if (entry === 'next') {
        assert.ok(M.apply(s, 0, { type: 'next' }, { now: 0, rng: deckRng }).ok);
        continue;
      }
      const [p, m] = entry;
      assert.deepStrictEqual(M.waitingFor(s).map(w => w.seat), [p], 'é a vez de quem estava gravado');
      const r = M.apply(s, p, m, { now: 0, rng: deckRng });
      assert.ok(r.ok, r.reason);
    }
    assert.ok(M.over(s));
    assert.deepStrictEqual(summary(s), c.end);
  });

  test(`os bots, pelo contrato, escolhem as mesmas jogadas (${label})`, () => {
    const deckRng = seeded(c.seed), botRng = seeded(c.seed * 7919 + 1);
    const s = M.setup(c.config, deckRng, {});
    const log = [];
    while (!M.over(s) && log.length < 5000) {
      if (s.phase === 'roundEnd') { M.apply(s, 0, { type: 'next' }, { now: 0, rng: deckRng }); log.push('next'); continue; }
      const p = M.waitingFor(s)[0].seat;
      const m = M.bots.choose(c.levels[p % c.levels.length], M.bots.view(s, p), botRng);
      assert.ok(M.apply(s, p, m, { now: 0, rng: deckRng }).ok);
      log.push([p, m]);
    }
    assert.deepStrictEqual(JSON.parse(JSON.stringify(log)), c.log);
    assert.deepStrictEqual(summary(s), c.end);
  });
}
