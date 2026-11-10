// Gringo ligado ao contrato dos módulos (ARCHITECTURE.md, secção 13.2).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'), require('./bots.js'));
  else root.GringoModule = factory(root.GringoEngine, root.GringoBots);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (G, B) {
  'use strict';
  const str = x => (typeof x === 'string' ? x.slice(0, 20) : undefined);
  const ref = r => (r && typeof r === 'object' ? { seat: Number.isInteger(+r.seat) ? +r.seat : -1, slot: str(r.slot) } : undefined);

  function fallback(s, seat) {
    if (s.phase === 'prep') {
      if (!s.peeked[seat]) return { type: 'peek', slots: s.hands[seat].slice(0, 2).map(x => x.id) };
      return { type: 'ready' };
    }
    if (s.step === 'drawn' && s.turn === seat) return { type: 'discardDrawn' };
    if (s.powers.length && s.powers[0].seat === seat) return { type: s.power ? 'done' : 'skip' };
    if (s.phase === 'play' && s.turn === seat && s.step === 'start') return { type: 'draw' };
    return null;
  }

  return {
    id: 'gringo',
    name: 'Gringo',
    players: [2, 3, 4, 5, 6, 7, 8],
    teams: [],
    botLevels: ['normal'],
    defaultBotLevel: 'normal',
    hostActions: [],

    normalizeConfig: c => G.normalizeConfig(c),
    // settings.starter: quem começa (quem ganhou a partida anterior); sem isso, é à sorte.
    setup: (config, rng, settings) => G.createGame(config, rng, { starter: settings && settings.starter }),
    sanitizeAction(m) {
      if (!m || typeof m !== 'object' || typeof m.type !== 'string') return null;
      return {
        type: m.type.slice(0, 20), slot: str(m.slot), to: m.to === undefined ? undefined : +m.to,
        slots: Array.isArray(m.slots) ? m.slots.slice(0, 2).map(str) : undefined,
        a: ref(m.a), b: ref(m.b), target: ref(m.target),
      };
    },
    apply: (s, seat, a, ctx) => G.apply(s, seat, a, ctx),
    waitingFor: s => G.waitingFor(s),
    nextDeadline: s => G.nextDeadline(s),
    tick: (s, now) => G.tick(s, now),
    view(s, seat, ctx) {
      const v = G.publicView(s, seat);
      if (ctx && ctx.options && ctx.options.log === false) v.events = v.events.slice(-3);
      return v;
    },
    over: s => s.phase === 'over',
    result: s => s.result.ranking,
    fallback,
    hidden: (s, seat) => G.hidden(s, seat),
    nextStarter: (ranking, config) => G.nextStarter(ranking, config.numPlayers),
    bots: {
      view: (s, seat) => G.botView(s, seat),
      choose: (level, v, rng) => B.choose(level, v, rng),
      react: (level, v, rng) => B.react(level, v, rng),
    },
  };
});
