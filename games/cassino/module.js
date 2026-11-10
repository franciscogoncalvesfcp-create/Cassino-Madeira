// Cassino da Madeira ligado ao contrato dos módulos (ver ARCHITECTURE.md, secção 13.2).
// As regras continuam em rules.js e os bots em bots.js; aqui só se traduz para a linguagem do núcleo.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'), require('./bots.js'));
  else root.CassinoModule = factory(root.CassinoEngine, root.CassinoBots);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E, B) {
  'use strict';
  const fail = reason => ({ ok: false, reason });
  const ctxOf = (state, seat) => ({ hand: state.hands[seat], table: state.table, player: seat });

  // Tempo para a animação da distribuição antes de contar a vez de quem joga.
  function dealPause(state) {
    const h = state.history || [];
    const tail = h[h.length - 1];
    if (!tail || tail.type !== 'deal') return 0;
    const set = state.settings && state.settings.dealPauseMs;
    return set === undefined || set === null ? (state.config.numPlayers * 4 + 4) * 90 + 900 : set;
  }

  function fallback(state, seat, rng) {
    let m = B.choose('medium', E.botView(state, seat), rng);
    if (!m || !E.validateMove(ctxOf(state, seat), m).ok) m = E.enumerateMoves(ctxOf(state, seat))[0];
    return m;
  }

  return {
    id: 'cassino',
    name: 'Cassino da Madeira',
    players: [2, 3, 4, 6],
    teams: [{ players: 4, teams: 2 }, { players: 6, teams: 3 }, { players: 6, teams: 2 }],
    botLevels: ['easy', 'medium', 'hard'],
    defaultBotLevel: 'medium',
    hostActions: ['next'], // passar à ronda seguinte

    normalizeConfig: c => E.normalizeConfig(c || {}),

    // settings vem do núcleo: { dealPauseMs, nextRoundMs }. Fora do servidor fica vazio.
    setup(config, rng, settings) {
      const s = E.createMatch(config, rng);
      s.settings = settings || {};
      return s;
    },

    sanitizeAction(m) {
      if (!m || typeof m !== 'object') return null;
      if (m.type === 'next') return { type: 'next' };
      const take = Array.isArray(m.take) ? m.take.slice(0, 60).map(String) : [];
      return { type: String(m.type), card: String(m.card), take, build: m.build == null ? undefined : String(m.build), value: m.value == null ? undefined : +m.value };
    },

    apply(state, seat, action, ctx) {
      if (action && action.type === 'next') {
        if (state.phase !== 'roundEnd') return fail('A ronda ainda não terminou.');
        E.nextRound(state, ctx.rng);
        return { ok: true };
      }
      const r = E.applyMove(state, seat, action);
      if (r.ok && state.phase === 'roundEnd') state.roundEndAt = ctx.now;
      return r;
    },

    waitingFor(state) {
      if (state.phase !== 'play') return [];
      return [{ seat: state.turn, kind: 'turn', delayMs: dealPause(state) }];
    },

    // No servidor, a ronda seguinte começa sozinha passado algum tempo.
    nextDeadline(state) {
      const wait = state.settings && state.settings.nextRoundMs;
      if (state.phase !== 'roundEnd' || wait === undefined || wait === null || state.roundEndAt === undefined) return null;
      return state.roundEndAt + wait;
    },
    tick(state, now, rng) {
      if (state.phase === 'roundEnd') E.nextRound(state, rng);
    },

    view(state, seat, ctx) {
      const v = E.publicView(state, seat);
      // Sem histórico, só segue o último acontecimento, que já está à vista na mesa.
      if (ctx && ctx.options && ctx.options.log === false) v.history = v.history.slice(-1);
      return v;
    },

    over: state => state.phase === 'matchEnd',

    // Classificação final por equipa ou jogador: o vencedor primeiro, depois por pontos.
    result(state) {
      const n = E.numSides(state.config), w = state.match.winners[0];
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => (b === w) - (a === w) || state.totals[b] - state.totals[a]);
      let place = 0, prev = null;
      return order.map((side, i) => {
        if (state.totals[side] !== prev || i === 1) place = i + 1;
        prev = state.totals[side];
        const seats = [];
        for (let p = 0; p < state.config.numPlayers; p++) if (E.sideOf(state.config, p) === side) seats.push(p);
        return { side, seats, place, score: state.totals[side] };
      });
    },

    fallback,

    // Só para testes: o que este lugar nunca pode ver.
    hidden(state, seat) {
      const out = [];
      state.hands.forEach((h, i) => { if (i !== seat) out.push(...h); });
      return out.concat(state.deck);
    },

    bots: {
      view: E.botView,
      choose: (level, view, rng) => B.choose(level, view, rng),
      react: () => null, // no Cassino não há jogadas fora da vez
    },
  };
});
