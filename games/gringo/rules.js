// Regras do Gringo. Código puro: sem página, sem rede, sem relógio próprio (o tempo chega em ctx.now).
// Corre igual no navegador e no servidor.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GringoEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SUITS = ['S', 'H', 'D', 'C'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const ALL_CARDS = [];
  for (const s of SUITS) for (const r of RANKS) ALL_CARDS.push(r + s);
  ALL_CARDS.push('JK1', 'JK2'); // dois Jokers
  const HAND_SIZE = 4;
  const LAST_CHANCE_MS = 3000;
  const MIN_PLAYERS = 2, MAX_PLAYERS = 8;

  const rankOf = c => (c.startsWith('JK') ? 'JK' : c.slice(0, -1));
  const isRedKing = c => c === 'KH' || c === 'KD';
  // Valor de cada carta no fim.
  function points(c) {
    const r = rankOf(c);
    if (r === 'JK') return 0;
    if (r === 'K') return isRedKing(c) ? -3 : 13;
    if (r === 'Q') return 12;
    if (r === 'J') return 11;
    if (r === 'A') return 1;
    return +r;
  }
  const powerOf = c => { const r = rankOf(c); return r === 'J' || r === 'Q' || r === 'K' ? r : null; };

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  const fail = reason => ({ ok: false, reason });

  function normalizeConfig(c) {
    c = c || {};
    const n = Number.isInteger(+c.numPlayers) && +c.numPlayers >= MIN_PLAYERS && +c.numPlayers <= MAX_PLAYERS ? +c.numPlayers : 4;
    return { numPlayers: n, teams: 0 };
  }

  // --- Início ---------------------------------------------------------------------
  // Cada carta numa mão é um "lugar" com um identificador sem significado (acompanha a carta quando muda
  // de sítio, para os outros verem o movimento) e um número (1 a 4) que os jogadores usam para falar dela.
  function newSlot(s, card, label) { return { id: 'k' + s.nextId++, label, card }; }
  function event(s, e) { e.seq = ++s.seq; s.events.push(e); }

  function createGame(config, rng, opts) {
    const cfg = normalizeConfig(config);
    const n = cfg.numPlayers;
    const s = {
      config: cfg, phase: 'prep', deck: shuffle(ALL_CARDS.slice(), rng), discard: [],
      hands: [], ready: [], peeked: [], memory: [], seen: [], publicSlots: {}, shown: {},
      nextId: 1, turn: 0, starter: 0, step: 'start', drawn: null,
      powers: [], power: null, snapOpen: false, snapTaken: false,
      final: null, lastChanceAt: null, events: [], seq: 0, result: null,
    };
    for (let p = 0; p < n; p++) {
      s.hands.push([]);
      for (let k = 0; k < HAND_SIZE; k++) s.hands[p].push(newSlot(s, s.deck.pop(), k + 1));
      s.ready.push(false); s.peeked.push(null); s.memory.push({}); s.seen.push({});
    }
    const st = opts && opts.starter;
    s.starter = Number.isInteger(st) && st >= 0 && st < n ? st : Math.floor(rng() * n);
    s.turn = s.starter;
    return s;
  }

  // --- Ajudas ---------------------------------------------------------------------------
  const findSlot = (s, seat, id) => (s.hands[seat] || []).find(x => x.id === id);
  function remember(s, seat, slot) { s.memory[seat][slot.id] = slot.card; s.seen[seat][slot.card] = true; }
  function nextLabel(hand) { let l = 1; while (hand.some(x => x.label === l)) l++; return l; }
  // Baralho vazio: o lixo volta a ser baralho, menos a carta de cima.
  function refill(s, rng) {
    if (s.deck.length || s.discard.length < 2) return;
    const top = s.discard.pop();
    s.deck = shuffle(s.discard, rng);
    s.discard = [top];
    event(s, { t: 'recycle', count: s.deck.length });
  }
  function takeFromDeck(s, rng) { refill(s, rng); return s.deck.length ? s.deck.pop() : null; }
  // Uma carta cai no lixo: abre a janela da Jogada Rápida e, se tiver poder, entra na fila.
  function place(s, seat, card) {
    s.discard.push(card);
    s.shown[card] = true;
    s.snapOpen = true; s.snapTaken = false;
    const pw = powerOf(card);
    if (pw) s.powers.push({ seat, power: pw, card });
  }
  const playing = s => s.phase === 'play' || s.phase === 'lastChance';
  const isOut = (s, seat) => !!(s.final && s.final.by === seat);

  // Ordem dos jogadores a partir de um lugar, no sentido dos ponteiros do relógio.
  const around = (s, from) => Array.from({ length: s.config.numPlayers }, (_, i) => (from + i) % s.config.numPlayers);

  function startFinal(s, by, auto, currentCounts) {
    const order = around(s, currentCounts ? s.turn : (s.turn + 1) % s.config.numPlayers)
      .filter(p => p !== by && s.hands[p].length > 0);
    s.final = { by, auto, remaining: order };
    event(s, { t: 'gringo', seat: by, auto });
  }

  function endTurn(s, ctx) {
    s.step = 'start'; s.drawn = null;
    if (!s.final) { s.turn = (s.turn + 1) % s.config.numPlayers; event(s, { t: 'turn', seat: s.turn }); return; }
    const f = s.final;
    if (f.remaining[0] === s.turn) f.remaining.shift();
    f.remaining = f.remaining.filter(p => p !== f.by && s.hands[p].length > 0);
    if (!f.remaining.length) { s.phase = 'lastChance'; s.lastChanceAt = ctx.now; event(s, { t: 'lastChance' }); return; }
    s.turn = f.remaining[0];
    event(s, { t: 'turn', seat: s.turn });
  }

  // Depois de cada ação: fecha o turno quando já não há nada pendente.
  function settle(s, ctx) {
    for (let guard = 0; guard < 20; guard++) {
      if (s.phase === 'play') {
        if (s.step === 'placed' && !s.powers.length) { endTurn(s, ctx); continue; }
        // Quem já não tem cartas (ou disse Gringo) não joga: passa a vez.
        if (s.step === 'start' && !s.powers.length && (s.hands[s.turn].length === 0 || isOut(s, s.turn))) { endTurn(s, ctx); continue; }
      }
      break;
    }
  }

  function finish(s) {
    s.phase = 'over';
    s.powers = []; s.power = null; s.snapOpen = false;
    const scores = s.hands.map(h => h.reduce((a, x) => a + points(x.card), 0));
    s.result = { scores, ranking: rank(scores) };
    event(s, { t: 'over' });
  }
  // Classificação: menos pontos à frente; empate é empate (mesmo lugar).
  function rank(scores) {
    const order = scores.map((sc, p) => ({ p, sc })).sort((a, b) => a.sc - b.sc || a.p - b.p);
    let place = 0, prev = null;
    return order.map((x, i) => {
      if (x.sc !== prev) place = i + 1;
      prev = x.sc;
      return { seats: [x.p], place, score: x.sc };
    });
  }

  // --- Ações ------------------------------------------------------------------------------
  function apply(s, seat, a, ctx) {
    if (!a || typeof a !== 'object' || typeof a.type !== 'string') return fail('Jogada inválida.');
    if (!Number.isInteger(seat) || seat < 0 || seat >= s.config.numPlayers) return fail('Esse lugar não existe.');
    const r = act(s, seat, a, ctx);
    if (r.ok) settle(s, ctx);
    return r;
  }

  function act(s, seat, a, ctx) {
    const hand = s.hands[seat];
    switch (a.type) {
      // Mexer na ordem das próprias cartas: sempre, exceto enquanto se resolve um poder.
      case 'move': {
        if (s.phase === 'over') return fail('A partida já acabou.');
        if (s.powers.length) return fail('Espera que o poder acabe de ser usado.');
        const from = hand.findIndex(x => x.id === a.slot);
        const to = +a.to;
        if (from < 0) return fail('Essa carta não é tua.');
        if (!Number.isInteger(to) || to < 0 || to >= hand.length) return fail('Essa posição não existe.');
        if (from === to) return { ok: true };
        const [x] = hand.splice(from, 1);
        hand.splice(to, 0, x);
        event(s, { t: 'move', seat, slot: a.slot, label: x.label, to });
        return { ok: true };
      }

      case 'peek': {
        if (s.phase !== 'prep') return fail('Já não é altura de espreitar.');
        if (s.peeked[seat]) return fail('Já espreitaste as tuas duas cartas.');
        const ids = Array.isArray(a.slots) ? a.slots : [];
        if (ids.length !== 2 || ids[0] === ids[1]) return fail('Escolhe exatamente duas das tuas cartas.');
        const slots = ids.map(id => findSlot(s, seat, id));
        if (slots.some(x => !x)) return fail('Essa carta não é tua.');
        s.peeked[seat] = ids.slice();
        slots.forEach(x => remember(s, seat, x));
        event(s, { t: 'peek', seat });
        return { ok: true };
      }
      case 'ready': {
        if (s.phase !== 'prep') return fail('A partida já começou.');
        if (!s.peeked[seat]) return fail('Primeiro espreita duas cartas.');
        if (s.ready[seat]) return { ok: true };
        s.ready[seat] = true;
        event(s, { t: 'ready', seat });
        if (s.ready.every(Boolean)) {
          s.phase = 'play'; s.step = 'start';
          event(s, { t: 'start', seat: s.turn });
        }
        return { ok: true };
      }

      case 'draw': {
        if (s.phase !== 'play') return fail('Agora não se pode comprar.');
        if (seat !== s.turn) return fail('Não é a tua vez.');
        if (s.step !== 'start') return fail('Já compraste nesta vez.');
        if (s.powers.length) return fail('Espera que os poderes acabem de ser usados.');
        s.snapOpen = false; s.snapTaken = false; // jogar fecha a Jogada Rápida sobre a carta anterior
        const card = takeFromDeck(s, ctx.rng);
        if (!card) { event(s, { t: 'noCards', seat }); s.step = 'placed'; return { ok: true }; }
        s.drawn = card; s.seen[seat][card] = true;
        s.step = 'drawn';
        event(s, { t: 'draw', seat });
        return { ok: true };
      }
      case 'gringo': {
        if (s.phase !== 'play') return fail('Agora não se pode dizer Gringo.');
        if (seat !== s.turn) return fail('Não é a tua vez.');
        if (s.step !== 'start') return fail('Gringo só se diz no início da tua vez.');
        if (s.powers.length) return fail('Espera que os poderes acabem de ser usados.');
        if (s.final) return fail('Alguém já disse Gringo.');
        s.snapOpen = false; s.snapTaken = false;
        startFinal(s, seat, false, false);
        s.step = 'placed';
        return { ok: true };
      }
      case 'discardDrawn': {
        if (seat !== s.turn || s.step !== 'drawn') return fail('Não tens nenhuma carta comprada.');
        const card = s.drawn;
        s.drawn = null;
        place(s, seat, card);
        s.step = 'placed';
        event(s, { t: 'discard', seat, card });
        return { ok: true };
      }
      case 'swap': {
        if (seat !== s.turn || s.step !== 'drawn') return fail('Não tens nenhuma carta comprada.');
        const i = hand.findIndex(x => x.id === a.slot);
        if (i < 0) return fail('Essa carta não é tua.');
        const old = hand[i];
        const fresh = newSlot(s, s.drawn, old.label);
        hand[i] = fresh;
        remember(s, seat, fresh);
        delete s.publicSlots[old.id];
        s.drawn = null;
        place(s, seat, old.card);
        s.step = 'placed';
        event(s, { t: 'swap', seat, slot: old.id, newSlot: fresh.id, label: old.label, card: old.card });
        return { ok: true };
      }

      // Jogada Rápida: qualquer jogador, a qualquer momento, com uma carta sua igual à de cima do lixo.
      case 'snap': {
        if (!playing(s)) return fail('Agora não se pode fazer Jogada Rápida.');
        if (isOut(s, seat)) return fail('Disseste Gringo: já não jogas.');
        if (!s.discard.length) return fail('Ainda não há cartas no lixo.');
        const i = hand.findIndex(x => x.id === a.slot);
        if (i < 0) return fail('Essa carta não é tua.');
        if (!s.snapOpen && !s.snapTaken) return fail('Já não dá: o jogador seguinte já jogou.');
        const slot = hand[i];
        const top = s.discard[s.discard.length - 1];
        const same = rankOf(slot.card) === rankOf(top);
        if (same && s.snapOpen) {
          hand.splice(i, 1);
          delete s.publicSlots[slot.id];
          s.discard.push(slot.card); s.shown[slot.card] = true;
          s.snapOpen = false; s.snapTaken = true; // só a primeira conta
          const pw = powerOf(slot.card);
          if (pw) s.powers.push({ seat, power: pw, card: slot.card });
          event(s, { t: 'snap', seat, slot: slot.id, label: slot.label, card: slot.card });
          if (!hand.length && !s.final) startFinal(s, seat, true, s.phase === 'play' && s.step === 'start' && seat !== s.turn);
          else if (!hand.length && s.final) s.final.remaining = s.final.remaining.filter(p => p !== seat);
          return { ok: true };
        }
        // Falhou: a carta aparece a todos e volta para a mão, virada para baixo.
        s.shown[slot.card] = true;
        s.publicSlots[slot.id] = slot.card;
        if (same) { // igual, mas alguém foi mais rápido: sem castigo
          event(s, { t: 'snapLate', seat, slot: slot.id, label: slot.label, card: slot.card });
          return { ok: true };
        }
        const extra = takeFromDeck(s, ctx.rng);
        let penalty = null, penaltyLabel = null;
        if (extra) { const x = newSlot(s, extra, nextLabel(hand)); hand.push(x); penalty = x.id; penaltyLabel = x.label; }
        event(s, { t: 'snapFail', seat, slot: slot.id, label: slot.label, card: slot.card, penalty, penaltyLabel });
        return { ok: true };
      }

      // --- Poderes: só quem está à frente da fila -------------------------------------------
      case 'skip':
      case 'done': {
        const head = s.powers[0];
        if (!head || head.seat !== seat) return fail('Não tens nenhum poder para usar.');
        if (a.type === 'done' && !s.power) return fail('Ainda não espreitaste nenhuma carta.');
        if (!s.power) event(s, { t: 'skipPower', seat, power: head.power });
        popPower(s, ctx);
        return { ok: true };
      }
      case 'jack': {
        const head = s.powers[0];
        if (!head || head.seat !== seat || head.power !== 'J') return fail('Não tens um Conde para usar.');
        const A = a.a || {}, Bref = a.b || {};
        if (A.seat === Bref.seat) return fail('Escolhe cartas de dois jogadores diferentes.');
        const mine = (A.seat === seat) + (Bref.seat === seat);
        if (mine > 1) return fail('Escolhe cartas de dois jogadores diferentes.');
        const sa = findSlot(s, A.seat, A.slot), sb = findSlot(s, Bref.seat, Bref.slot);
        if (!sa || !sb) return fail('Escolhe duas cartas que estejam na mesa.');
        event(s, { t: 'jack', seat, a: { seat: A.seat, slot: sa.id, label: sa.label }, b: { seat: Bref.seat, slot: sb.id, label: sb.label } });
        swapSlots(s, A.seat, sa, Bref.seat, sb);
        popPower(s, ctx);
        return { ok: true };
      }
      case 'queen': {
        const head = s.powers[0];
        if (!head || head.seat !== seat || head.power !== 'Q') return fail('Não tens uma Dama para usar.');
        if (s.power) return fail('Já estás a espreitar uma carta.');
        const slot = findSlot(s, seat, a.slot);
        if (!slot) return fail('Com a Dama só espreitas uma carta tua.');
        remember(s, seat, slot);
        s.power = { kind: 'Q', seat, target: { seat, slot: slot.id } };
        event(s, { t: 'queen', seat, target: { seat, slot: slot.id, label: slot.label } });
        return { ok: true };
      }
      case 'king': {
        const head = s.powers[0];
        if (!head || head.seat !== seat || head.power !== 'K') return fail('Não tens um Rei para usar.');
        if (s.power) return fail('Já estás a espreitar uma carta.');
        const t = a.target || {};
        if (t.seat === seat) return fail('Com o Rei espreitas uma carta de um adversário.');
        const slot = findSlot(s, t.seat, t.slot);
        if (!slot) return fail('Escolhe uma carta de um adversário.');
        remember(s, seat, slot);
        s.power = { kind: 'K', seat, target: { seat: t.seat, slot: slot.id } };
        event(s, { t: 'king', seat, target: { seat: t.seat, slot: slot.id, label: slot.label } });
        return { ok: true };
      }
      case 'kingSwap': {
        const p = s.power;
        if (!p || p.kind !== 'K' || p.seat !== seat) return fail('Primeiro espreita uma carta com o Rei.');
        const mineSlot = findSlot(s, seat, a.slot);
        const theirs = findSlot(s, p.target.seat, p.target.slot);
        if (!mineSlot) return fail('Escolhe uma carta tua para trocar.');
        if (!theirs) { popPower(s, ctx); return { ok: true }; } // a carta saiu entretanto
        event(s, { t: 'kingSwap', seat, a: { seat, slot: mineSlot.id, label: mineSlot.label }, b: { seat: p.target.seat, slot: theirs.id, label: theirs.label } });
        swapSlots(s, seat, mineSlot, p.target.seat, theirs);
        popPower(s, ctx);
        return { ok: true };
      }
      default:
        return fail('Jogada desconhecida.');
    }
  }

  // As cartas trocam de lugar com o seu identificador; o número fica no lugar.
  function swapSlots(s, seatA, a, seatB, b) {
    const ha = s.hands[seatA], hb = s.hands[seatB];
    const ia = ha.indexOf(a), ib = hb.indexOf(b);
    ha[ia] = { id: b.id, label: a.label, card: b.card };
    hb[ib] = { id: a.id, label: b.label, card: a.card };
  }
  function popPower(s, ctx) {
    s.powers.shift();
    s.power = null;
    if (s.phase === 'lastChance') s.lastChanceAt = ctx.now; // depois de um poder, mais 3 segundos
  }

  // --- O que o núcleo pergunta --------------------------------------------------------
  function waitingFor(s) {
    if (s.phase === 'prep') return s.ready.map((r, p) => (r ? null : { seat: p, kind: 'turn' })).filter(Boolean);
    if (s.phase === 'play') {
      if (s.step === 'drawn') return [{ seat: s.turn, kind: 'turn' }];
      if (s.powers.length) return [{ seat: s.powers[0].seat, kind: 'turn' }];
      return [{ seat: s.turn, kind: 'turn' }];
    }
    if (s.phase === 'lastChance' && s.powers.length) return [{ seat: s.powers[0].seat, kind: 'turn' }];
    return [];
  }
  function nextDeadline(s) {
    if (s.phase === 'lastChance' && !s.powers.length) return s.lastChanceAt + LAST_CHANCE_MS;
    return null;
  }
  function tick(s, now) {
    if (s.phase === 'lastChance' && !s.powers.length && now >= s.lastChanceAt + LAST_CHANCE_MS) finish(s);
  }

  // --- Vistas -------------------------------------------------------------------------
  function visibleTo(s, seat, owner, slot) {
    if (s.phase === 'over') return true;
    if (s.phase === 'prep' && owner === seat && s.peeked[seat] && !s.ready[seat] && s.peeked[seat].includes(slot.id)) return true;
    return !!(s.power && s.power.seat === seat && s.power.target.slot === slot.id);
  }
  function publicView(s, seat) {
    const top = s.discard.length ? s.discard[s.discard.length - 1] : null;
    return {
      me: seat, config: s.config, phase: s.phase, turn: s.turn, starter: s.starter, step: s.step,
      deckCount: s.deck.length, discardTop: top, discardCount: s.discard.length,
      snapOpen: s.snapOpen, snapTaken: s.snapTaken,
      hands: s.hands.map((h, p) => h.map(x => ({ id: x.id, label: x.label, card: visibleTo(s, seat, p, x) ? x.card : null }))),
      drawn: seat === s.turn && s.step === 'drawn' ? s.drawn : null,
      holding: s.step === 'drawn' ? s.turn : null,
      ready: s.ready.slice(), peeked: s.peeked.map(Boolean),
      powers: s.powers.map(x => ({ seat: x.seat, power: x.power })),
      power: s.power && { kind: s.power.kind, seat: s.power.seat, target: s.power.target },
      final: s.final && { by: s.final.by, auto: s.final.auto, remaining: s.final.remaining.slice() },
      lastChanceAt: s.lastChanceAt,
      events: s.events.slice(),
      result: s.result,
    };
  }
  // O que um bot sabe: o mesmo que a pessoa no seu lugar, mais o que já viu e se lembra.
  function botView(s, seat) {
    const v = publicView(s, seat);
    const known = {};
    s.hands.forEach(h => h.forEach(x => {
      if (s.memory[seat][x.id] === x.card || s.publicSlots[x.id] === x.card) known[x.id] = x.card;
    }));
    v.known = known;
    return v;
  }
  // Para os testes: cartas que este lugar não pode saber.
  function hidden(s, seat) {
    const out = [];
    const check = c => { if (c && !s.shown[c] && !s.seen[seat][c]) out.push(c); };
    s.hands.forEach((h, p) => h.forEach(x => { if (!visibleTo(s, seat, p, x)) check(x.card); }));
    s.deck.forEach(check);
    if (s.turn !== seat) check(s.drawn);
    return out;
  }

  // Quem começa a partida seguinte: quem ganhou; se houve empate, o empatado que deixa os outros empatados
  // jogarem o mais cedo possível.
  function nextStarter(ranking, n) {
    if (!ranking || !ranking.length) return undefined;
    const winners = ranking.filter(x => x.place === 1).flatMap(x => x.seats);
    if (winners.length === 1) return winners[0];
    let best = null, bestCost = Infinity;
    for (const s of winners.slice().sort((a, b) => a - b)) {
      const cost = winners.reduce((acc, o) => acc + ((o - s + n) % n), 0);
      if (cost < bestCost) { bestCost = cost; best = s; }
    }
    return best;
  }

  return {
    ALL_CARDS, HAND_SIZE, LAST_CHANCE_MS, MIN_PLAYERS, MAX_PLAYERS,
    rankOf, points, powerOf, isRedKing, shuffle, normalizeConfig,
    createGame, apply, waitingFor, nextDeadline, tick, publicView, botView, hidden, nextStarter, rank,
  };
});
