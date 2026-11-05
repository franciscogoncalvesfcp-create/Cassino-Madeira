// Bots do Cassino. Recebem só o que o jogador pode saber (engine.botView).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.CassinoBots = factory(root.CassinoEngine);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';
  const { VALUE, RANK, SUIT, ALL_CARDS } = E;

  // Quanto vale levar esta carta.
  function cardWorth(c, k) {
    let w = 0.14;
    if (SUIT[c] === 'S') w += 0.14 * k;
    if (RANK[c] === 'A') w += 1 * k;
    if (c === '10D') w += 2 * k;
    if (c === '2S') w += 1 * k;
    return w;
  }
  const itemCards = it => (it.k === 'b' ? it.cards : [it.id]);
  const itemWorth = k => it => itemCards(it).reduce((a, c) => a + cardWorth(c, k), 0) + 0.001;

  function takenCards(view, m) {
    const ids = m.take || [];
    return view.table.filter(t => ids.includes(t.id)).flatMap(itemCards);
  }

  // Heurística que o Médio usa, e que o Difícil usa para escolher candidatas e simular.
  function scoreMove(view, m, k) {
    const worth = c => cardWorth(c, k);
    const played = worth(m.card);
    if (m.type === 'trail') {
      let s = -played - 0.05;
      if (VALUE[m.card] === null) s += 0.04; // figuras são o descarte mais barato
      return s;
    }
    if (m.type === 'capture') {
      const got = takenCards(view, m);
      let s = played + got.reduce((a, c) => a + worth(c), 0);
      if ((m.take.length === view.table.length)) s += 1;
      return s + 0.1;
    }
    const b = m.build && view.table.find(t => t.id === m.build);
    const inside = (b ? b.cards : []).concat(takenCards(view, m), [m.card]);
    const pot = inside.reduce((a, c) => a + worth(c), 0);
    if (m.type === 'build') return 0.55 * pot + 0.02;
    if (m.type === 'call') return 0.75 * pot + 0.05;
    if (m.type === 'double') return 0.7 * pot + 0.03;
    return 0.5 * pot; // subir
  }

  // --- Fácil: captura o óbvio, raramente monta, às vezes erra ---------------
  function easy(view, rng) {
    const ctx = { hand: view.hand, table: view.table };
    const hand = E.shuffle(view.hand.slice(), rng);
    const distracted = rng() < 0.18;
    if (!distracted) {
      for (const c of hand) {
        const pair = view.table.filter(t => (t.k === 'c' ? RANK[t.id] === RANK[c] : VALUE[c] !== null && t.value === VALUE[c]));
        if (pair.length) return { type: 'capture', card: c, take: [pair[0].id] };
      }
      for (const c of hand) {
        if (VALUE[c] === null) continue;
        for (let i = 0; i < view.table.length; i++) for (let j = i + 1; j < view.table.length; j++) {
          const a = view.table[i], b = view.table[j];
          if (a.k === 'c' && b.k === 'c' && VALUE[a.id] !== null && VALUE[b.id] !== null && VALUE[a.id] + VALUE[b.id] === VALUE[c])
            return { type: 'capture', card: c, take: [a.id, b.id] };
        }
      }
      if (rng() < 0.08) {
        const builds = E.enumerateMoves(ctx).filter(m => m.type === 'build');
        if (builds.length) return builds[Math.floor(rng() * builds.length)];
      }
    }
    return { type: 'trail', card: hand[0] };
  }

  // --- Médio: dá algum valor às cartas que pontuam e monta -------------------
  function medium(view, rng) {
    const ms = E.enumerateMoves({ hand: view.hand, table: view.table }, itemWorth(0.6));
    let best = ms[0], bs = -Infinity;
    for (const m of ms) {
      const s = scoreMove(view, m, 0.6) + (rng() - 0.5) * 0.25;
      if (s > bs) { bs = s; best = m; }
    }
    return best;
  }

  // --- Difícil: lembra-se das cartas saídas e simula o resto da ronda ---------
  function determinize(view, rng) {
    const known = new Set(view.seen.concat(view.hand));
    const unknown = E.shuffle(ALL_CARDS.filter(c => !known.has(c)), rng);
    const n = view.config.numPlayers;
    const hands = [];
    let i = 0;
    for (let p = 0; p < n; p++) {
      if (p === view.me) { hands.push(view.hand.slice()); continue; }
      hands.push(unknown.slice(i, i + view.handCounts[p]));
      i += view.handCounts[p];
    }
    return {
      config: view.config, roundNo: 0, dealer: view.dealer, totals: view.totals.slice(),
      hands, deck: unknown.slice(i), table: view.table.map(t => (t.k === 'b' ? { ...t, cards: t.cards.slice() } : t)),
      captured: view.captured.map(c => c.slice()), sweeps: view.sweeps.slice(), seen: view.seen.slice(),
      turn: view.turn, lastCapturer: view.lastCapturer, nextBuild: view.nextBuild, lastMove: null,
      phase: 'play', result: null, match: { over: false, winners: [], how: null, extra: false },
    };
  }

  // Política rápida das simulações: captura o que vale mais; senão larga o mais barato.
  function rollout(s) {
    while (s.phase === 'play') {
      const p = s.turn, hand = s.hands[p];
      let best = null, bs = -Infinity;
      for (const c of hand) {
        const take = E.bestCapture(s.table, c, FAST_W);
        if (take.length) {
          let g = cardWorth(c, 1);
          for (const it of s.table) if (take.includes(it.id)) g += FAST_W(it);
          if (take.length === s.table.length) g += 1;
          if (g > bs) { bs = g; best = { type: 'capture', card: c, take }; }
        } else {
          const g = -cardWorth(c, 1) - 0.05;
          if (g > bs) { bs = g; best = { type: 'trail', card: c }; }
        }
      }
      E.applyMove(s, p, best);
    }
  }
  const FAST_W = itemWorth(1);

  function evaluate(s, side) {
    const sc = s.result.score;
    let other = -Infinity, otherCards = 0;
    sc.forEach((r, i) => { if (i !== side && r.total > other) { other = r.total; otherCards = r.numCards; } });
    return sc[side].total - other + 0.02 * (sc[side].numCards - otherCards);
  }

  function hard(view, rng, opts) {
    const o = Object.assign({ sims: 200, candidates: 8, mistake: 0.05, budgetMs: 300 }, opts);
    const ms = E.enumerateMoves({ hand: view.hand, table: view.table }, FAST_W);
    if (ms.length === 1) return ms[0];
    const ranked = ms.map(m => ({ m, h: scoreMove(view, m, 1), sum: 0, n: 0 })).sort((a, b) => b.h - a.h);
    // Garante pelo menos um largar e uma montagem entre as candidatas.
    const cand = ranked.slice(0, o.candidates);
    for (const type of ['trail', 'build', 'raise', 'double', 'call']) {
      if (!cand.some(c => c.m.type === type)) {
        const extra = ranked.find(c => c.m.type === type);
        if (extra) cand.push(extra);
      }
    }
    const side = E.sideOf(view.config, view.me);
    const start = Date.now();
    for (let k = 0; k < o.sims; k++) {
      if (k >= 4 && Date.now() - start > o.budgetMs) break;
      const base = determinize(view, rng);
      for (const c of cand) {
        const s = E.cloneState(base);
        E.applyMove(s, view.me, c.m);
        rollout(s);
        c.sum += evaluate(s, side);
        c.n++;
      }
    }
    cand.forEach(c => { c.avg = c.sum / Math.max(1, c.n) + 0.05 * c.h; });
    cand.sort((a, b) => b.avg - a.avg);
    if (rng() < o.mistake) return cand[Math.min(1 + Math.floor(rng() * 2), cand.length - 1)].m;
    return cand[0].m;
  }

  function choose(level, view, rng, opts) {
    if (level === 'easy') return easy(view, rng);
    if (level === 'hard') return hard(view, rng, opts);
    return medium(view, rng);
  }
  return { choose, easy, medium, hard };
});
