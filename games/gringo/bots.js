// Bot do Gringo, nível Normal. Só sabe o que um jogador no seu lugar saberia: as cartas que viu
// (espreitar, Dama, Rei, a que comprou) e as que todos viram voltar para uma mão.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.GringoBots = factory(root.GringoEngine);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (G) {
  'use strict';
  const UNKNOWN = 6.5; // valor médio de uma carta que não se conhece

  const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
  function mine(v) {
    const hand = v.hands[v.me];
    const known = hand.filter(x => v.known[x.id] !== undefined).map(x => ({ id: x.id, val: G.points(v.known[x.id]) }));
    const unknown = hand.filter(x => v.known[x.id] === undefined).map(x => x.id);
    const worst = known.slice().sort((a, b) => b.val - a.val)[0] || null;
    const estimate = known.reduce((a, x) => a + x.val, 0) + unknown.length * UNKNOWN;
    return { hand, known, unknown, worst, estimate };
  }
  const opponents = v => v.hands.map((h, p) => p).filter(p => p !== v.me && v.hands[p].length);

  function usePower(v, rng) {
    const head = v.powers[0];
    const m = mine(v);
    if (head.power === 'J') {
      if (!m.worst || m.worst.val < 7) return { type: 'skip' };
      // Dá a sua pior carta a um adversário e fica com uma carta dele (de preferência uma que sabe ser baixa).
      const opp = [];
      for (const p of opponents(v)) for (const x of v.hands[p]) opp.push({ seat: p, slot: x.id, val: v.known[x.id] !== undefined ? G.points(v.known[x.id]) : UNKNOWN });
      if (!opp.length) return { type: 'skip' };
      opp.sort((a, b) => a.val - b.val);
      const t = opp[0].val < m.worst.val ? opp[0] : null;
      if (!t) return { type: 'skip' };
      return { type: 'jack', a: { seat: v.me, slot: m.worst.id }, b: { seat: t.seat, slot: t.slot } };
    }
    if (head.power === 'Q') {
      if (v.power) return { type: 'done' };
      if (!m.unknown.length) return { type: 'skip' };
      return { type: 'queen', slot: pick(m.unknown, rng) };
    }
    // Rei
    if (v.power) {
      const seen = v.known[v.power.target.slot];
      const val = seen === undefined ? UNKNOWN : G.points(seen);
      if (m.worst && val < m.worst.val - 1) return { type: 'kingSwap', slot: m.worst.id };
      if (val <= 2 && m.unknown.length) return { type: 'kingSwap', slot: pick(m.unknown, rng) };
      return { type: 'done' };
    }
    const targets = [];
    for (const p of opponents(v)) for (const x of v.hands[p]) if (v.known[x.id] === undefined) targets.push({ seat: p, slot: x.id });
    if (!targets.length) return { type: 'skip' };
    return { type: 'king', target: pick(targets, rng) };
  }

  function choose(level, v, rng) {
    const me = v.me;
    if (v.phase === 'prep') {
      if (!v.peeked[me]) {
        const ids = v.hands[me].map(x => x.id);
        const a = pick(ids, rng);
        return { type: 'peek', slots: [a, pick(ids.filter(x => x !== a), rng)] };
      }
      return { type: 'ready' };
    }
    if (v.phase !== 'play' && v.phase !== 'lastChance') return null;
    if (v.step !== 'drawn' && v.powers.length && v.powers[0].seat === me) return usePower(v, rng);
    if (v.phase !== 'play' || v.turn !== me) return null;
    const m = mine(v);
    if (v.step === 'drawn') {
      const d = G.points(v.drawn);
      if (m.worst && d < m.worst.val) return { type: 'swap', slot: m.worst.id };
      if (m.unknown.length && d <= 4) return { type: 'swap', slot: pick(m.unknown, rng) };
      return { type: 'discardDrawn' };
    }
    // Início da vez: diz Gringo quando acha que tem muito poucos pontos.
    if (!v.final && (!m.hand.length || (!m.unknown.length && m.estimate <= 6) || m.estimate <= 3)) return { type: 'gringo' };
    return { type: 'draw' };
  }

  // Fora da vez: Jogada Rápida só quando tem a certeza (sabe que a carta é igual). Guarda os Reis vermelhos.
  function react(level, v, rng) {
    if ((v.phase !== 'play' && v.phase !== 'lastChance') || !v.snapOpen || !v.discardTop) return null;
    if (v.final && v.final.by === v.me) return null;
    const top = G.rankOf(v.discardTop);
    const slot = v.hands[v.me].find(x => v.known[x.id] !== undefined && G.rankOf(v.known[x.id]) === top && !G.isRedKing(v.known[x.id]));
    if (!slot) return null;
    return { action: { type: 'snap', slot: slot.id }, delayMs: 800 + Math.floor(rng() * 1000) };
  }

  return { choose, react };
});
