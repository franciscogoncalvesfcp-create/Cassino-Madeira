// Grava partidas de referência do Cassino com sorte fixa.
// Uso: node scripts/record-golden.js   (só se deve correr quando as regras mudam de propósito)
'use strict';
const fs = require('fs'), path = require('path');
const E = require(process.env.CASSINO_RULES || '../games/cassino/rules.js');
const B = require(process.env.CASSINO_BOTS || '../games/cassino/bots.js');
const { seeded, GOLDEN_CASES, summary } = require('../test/games/cassino/golden-helpers.js');

const out = GOLDEN_CASES.map(c => {
  const deckRng = seeded(c.seed), botRng = seeded(c.seed * 7919 + 1);
  const s = E.createMatch(c.config, deckRng);
  const log = [];
  let guard = 0;
  while (s.phase !== 'matchEnd' && guard++ < 5000) {
    if (s.phase === 'roundEnd') { E.nextRound(s, deckRng); log.push('next'); continue; }
    const p = s.turn;
    const m = B.choose(c.levels[p % c.levels.length], E.botView(s, p), botRng);
    const r = E.applyMove(s, p, m);
    if (!r.ok) throw new Error('jogada ilegal na gravação: ' + r.reason);
    log.push([p, m]);
  }
  return { ...c, log, end: summary(s) };
});
const file = path.join(__dirname, '..', 'test', 'fixtures', 'cassino-golden.json');
fs.writeFileSync(file, JSON.stringify(out));
console.log(file, out.length, 'partidas,', out.reduce((a, c) => a + c.log.length, 0), 'jogadas,', fs.statSync(file).size, 'bytes');
