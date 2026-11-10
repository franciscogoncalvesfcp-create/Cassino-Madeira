// Partidas de referência: as mesmas sementes têm de dar sempre o mesmo jogo.
'use strict';
function seeded(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const CONFIGS = [
  { numPlayers: 2, target: '21' }, { numPlayers: 3, target: 'round' }, { numPlayers: 4, target: 'round' },
  { numPlayers: 4, teams: 2, target: '21' }, { numPlayers: 6, target: 'round' }, { numPlayers: 6, teams: 3, target: 'round' },
  { numPlayers: 6, teams: 2, target: 'round' }, { numPlayers: 2, target: '32' },
];
const GOLDEN_CASES = [];
CONFIGS.forEach((config, i) => {
  for (let k = 0; k < 3; k++) GOLDEN_CASES.push({ seed: 1000 + i * 10 + k, config, levels: k === 0 ? ['easy'] : k === 1 ? ['medium'] : ['easy', 'medium'] });
});
// O que tem de bater certo no fim de cada partida.
function summary(s) {
  return {
    phase: s.phase, roundNo: s.roundNo, dealer: s.dealer, totals: s.totals, match: s.match,
    captured: s.captured, sweeps: s.sweeps, score: s.result && s.result.score, leftovers: s.result && s.result.leftovers,
    historyLength: (s.history || []).length,
  };
}
module.exports = { seeded, GOLDEN_CASES, summary };
