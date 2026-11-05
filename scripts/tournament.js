// Torneio entre níveis: node scripts/tournament.js [rondas]
const E = require('../shared/engine.js'), B = require('../shared/bots.js');
function seeded(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const N = +process.argv[2] || 400;
function duel(A, Bb, n) {
  const rng = seeded(A.length * 91 + Bb.length * 7 + n);
  let wa = 0, wb = 0, pa = 0, pb = 0, maxMs = 0, moves = 0, tms = 0;
  for (let g = 0; g < n; g++) {
    const s = E.createMatch({ numPlayers: 2, target: 'round' }, rng);
    const seat = g % 2 ? [Bb, A] : [A, Bb];
    while (s.phase === 'play') {
      const p = s.turn, t0 = Date.now();
      const m = B.choose(seat[p], E.botView(s, p), rng);
      const d = Date.now() - t0; if (seat[p] === 'hard') { maxMs = Math.max(maxMs, d); tms += d; moves++; }
      const r = E.applyMove(s, p, m);
      if (!r.ok) throw new Error(seat[p] + ' jogada ilegal ' + JSON.stringify(m) + r.reason);
    }
    const ia = g % 2 ? 1 : 0;
    const ta = s.result.score[ia].total, tb = s.result.score[1 - ia].total;
    pa += ta; pb += tb; if (ta > tb) wa++; else if (tb > ta) wb++;
  }
  console.log(`${A} vs ${Bb}: vitórias ${wa}-${wb} (${(100 * wa / (wa + wb)).toFixed(0)}%), pontos/ronda ${(pa / n).toFixed(2)}-${(pb / n).toFixed(2)}` + (moves ? `, difícil: média ${(tms / moves).toFixed(0)}ms, máx ${maxMs}ms` : ''));
}
duel('medium', 'easy', N);
duel('hard', 'medium', Math.min(N, 200));
duel('hard', 'easy', Math.min(N, 100));
