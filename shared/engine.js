// Motor de regras do Cassino da Madeira (regras v1). Corre no browser e no servidor.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CassinoEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SUITS = ['S', 'H', 'D', 'C'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const ALL_CARDS = [];
  const VALUE = {}; // valor aritmético (null para figuras)
  const RANK = {};
  const SUIT = {};
  for (const s of SUITS) for (let i = 0; i < RANKS.length; i++) {
    const id = RANKS[i] + s;
    ALL_CARDS.push(id);
    VALUE[id] = i < 10 ? i + 1 : null;
    RANK[id] = RANKS[i];
    SUIT[id] = s;
  }
  const HAND_SIZE = 4;
  const TARGETS = { round: null, 21: 21, 32: 32 };
  const CATEGORY_ORDER = ['cards', 'spades', 'grande', 'pequeno', 'aces', 'sweeps'];

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function itemValue(it) { return it.k === 'b' ? it.value : VALUE[it.id]; }
  function isLoose(it) { return it.k === 'c'; }

  // --- Configuração e início ---------------------------------------------
  function normalizeConfig(c) {
    const numPlayers = [2, 3, 4].includes(+c.numPlayers) ? +c.numPlayers : 2;
    const teams = numPlayers === 4 && !!c.teams;
    const target = String(c.target) in TARGETS ? String(c.target) : '21';
    return { numPlayers, teams, target };
  }
  function sideOf(cfg, p) { return cfg.teams ? p % 2 : p; }
  function numSides(cfg) { return cfg.teams ? 2 : cfg.numPlayers; }

  function createMatch(config, rng) {
    const cfg = normalizeConfig(config);
    const n = numSides(cfg);
    const s = {
      config: cfg,
      roundNo: 0,
      dealer: Math.floor(rng() * cfg.numPlayers),
      totals: new Array(n).fill(0),
      hands: [], deck: [], table: [], captured: [], sweeps: [], seen: [],
      turn: 0, lastCapturer: null, nextBuild: 1, lastMove: null,
      phase: 'play', result: null, match: { over: false, winners: [], how: null, extra: false },
    };
    beginRound(s, rng, true);
    return s;
  }

  function beginRound(s, rng, first) {
    const cfg = s.config, n = numSides(cfg);
    if (!first) s.dealer = (s.dealer + 1) % cfg.numPlayers;
    s.roundNo++;
    s.deck = shuffle(ALL_CARDS.slice(), rng);
    s.hands = [];
    for (let p = 0; p < cfg.numPlayers; p++) s.hands.push([]);
    s.captured = []; s.sweeps = [];
    for (let i = 0; i < n; i++) { s.captured.push([]); s.sweeps.push(0); }
    s.table = [];
    s.seen = [];
    s.lastCapturer = null; s.lastMove = null; s.result = null; s.nextBuild = 1;
    for (let i = 0; i < 4; i++) {
      const c = s.deck.pop();
      s.table.push({ k: 'c', id: c });
      s.seen.push(c);
    }
    deal(s);
    s.turn = (s.dealer + 1) % cfg.numPlayers;
    s.phase = 'play';
  }

  function deal(s) {
    for (let k = 0; k < HAND_SIZE; k++)
      for (let i = 1; i <= s.config.numPlayers; i++)
        s.hands[(s.dealer + i) % s.config.numPlayers].push(s.deck.pop());
  }

  // --- Validação ----------------------------------------------------------
  // ctx = { hand: [ids], table: [items] }
  function fail(reason) { return { ok: false, reason }; }

  function holdsAfter(hand, card, value) {
    let skipped = false;
    for (const c of hand) {
      if (c === card && !skipped) { skipped = true; continue; }
      if (VALUE[c] === value) return true;
    }
    return false;
  }

  // Divide 'values' em grupos que somem exatamente v, cada carta num só grupo.
  function canPartition(values, v) {
    const rest = [];
    for (const x of values) {
      if (x > v) return false;
      if (x < v) rest.push(x);
    }
    const total = rest.reduce((a, b) => a + b, 0);
    if (total % v !== 0) return false;
    rest.sort((a, b) => b - a);
    const used = new Array(rest.length).fill(false);
    function fill(remaining, from) {
      if (remaining === 0) return nextGroup();
      for (let i = from; i < rest.length; i++) {
        if (used[i] || rest[i] > remaining) continue;
        used[i] = true;
        if (fill(remaining - rest[i], i + 1)) return true;
        used[i] = false;
      }
      return false;
    }
    function nextGroup() {
      const i = used.indexOf(false);
      if (i < 0) return true;
      used[i] = true;
      if (fill(v - rest[i], i + 1)) return true;
      used[i] = false;
      return false;
    }
    return nextGroup();
  }

  function lookup(ctx, ids) {
    const out = [], seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) return null;
      seen.add(id);
      const it = ctx.table.find(t => t.id === id);
      if (!it) return null;
      out.push(it);
    }
    return out;
  }

  function validateMove(ctx, m) {
    if (!m || typeof m !== 'object') return fail('Jogada inválida.');
    if (!ctx.hand.includes(m.card)) return fail('Essa carta não está na tua mão.');
    const v = VALUE[m.card];
    const take = Array.isArray(m.take) ? m.take : [];
    const items = lookup(ctx, take);
    if (!items) return fail('Essa carta já não está na mesa.');
    switch (m.type) {
      case 'trail':
        if (take.length) return fail('Para largar, não escolhas cartas da mesa.');
        return { ok: true };
      case 'capture': {
        if (!take.length) return fail('Escolhe as cartas que queres levar.');
        if (v === null) {
          for (const it of items)
            if (!isLoose(it) || RANK[it.id] !== RANK[m.card])
              return fail('Uma figura só leva figuras iguais soltas.');
          return { ok: true };
        }
        const values = [];
        for (const it of items) {
          const iv = itemValue(it);
          if (iv === null) return fail('As figuras não entram em somas.');
          if (it.k === 'b' && it.locked && iv !== v)
            return fail('Um monte trancado só se levanta com uma carta do seu valor.');
          values.push(iv);
        }
        if (!canPartition(values, v))
          return fail('Essas cartas não formam grupos de ' + v + '.');
        return { ok: true };
      }
      case 'build': {
        if (v === null) return fail('As figuras não entram em montes.');
        if (!take.length) return fail('Escolhe as cartas soltas onde queres montar.');
        let total = v;
        for (const it of items) {
          if (!isLoose(it)) return fail('Num monte novo só entram cartas soltas.');
          if (VALUE[it.id] === null) return fail('As figuras não entram em montes.');
          total += VALUE[it.id];
        }
        if (total > 10) return fail('Um monte não pode passar de 10.');
        if (!holdsAfter(ctx.hand, m.card, total))
          return fail('Para montar ' + total + ' precisas de ficar com um ' + total + ' na mão.');
        return { ok: true, value: total };
      }
      case 'raise': {
        if (v === null) return fail('As figuras não entram em montes.');
        const b = ctx.table.find(t => t.id === m.build && t.k === 'b');
        if (!b) return fail('Esse monte já não está na mesa.');
        if (b.locked) return fail('Um monte trancado não pode ser subido.');
        const total = b.value + v;
        if (total > 10) return fail('Um monte não pode passar de 10.');
        if (!holdsAfter(ctx.hand, m.card, total))
          return fail('Para subir para ' + total + ' precisas de ficar com um ' + total + ' na mão.');
        return { ok: true, value: total };
      }
      case 'double': {
        if (v === null) return fail('As figuras não entram em montes.');
        const b = ctx.table.find(t => t.id === m.build && t.k === 'b');
        if (!b) return fail('Esse monte já não está na mesa.');
        let sum = v;
        for (const it of items) {
          if (!isLoose(it)) return fail('Só podes juntar cartas soltas a um monte.');
          if (VALUE[it.id] === null) return fail('As figuras não entram em montes.');
          sum += VALUE[it.id];
        }
        if (sum !== b.value) return fail('O grupo novo tem de valer ' + b.value + ', e vale ' + sum + '.');
        if (!holdsAfter(ctx.hand, m.card, b.value))
          return fail('Para duplicar precisas de ficar com um ' + b.value + ' na mão.');
        return { ok: true, value: b.value };
      }
      case 'call': {
        if (v === null) return fail('As figuras não entram em montes.');
        if (!take.length) return fail('Escolhe a carta solta igual à tua.');
        for (const it of items)
          if (!isLoose(it) || VALUE[it.id] !== v) return fail('Só podes chamar sobre cartas soltas do mesmo valor.');
        if (!holdsAfter(ctx.hand, m.card, v))
          return fail('Para chamar ' + v + ' precisas de ficar com outro ' + v + ' na mão.');
        return { ok: true, value: v };
      }
      default:
        return fail('Jogada desconhecida.');
    }
  }

  // --- Aplicar jogadas ----------------------------------------------------
  function applyMove(s, player, m) {
    if (s.phase !== 'play') return fail('A ronda já terminou.');
    if (s.turn !== player) return fail('Não é a tua vez.');
    const hand = s.hands[player];
    const check = validateMove({ hand, table: s.table }, m);
    if (!check.ok) return check;

    const side = sideOf(s.config, player);
    hand.splice(hand.indexOf(m.card), 1);
    s.seen.push(m.card);
    const take = m.take || [];
    const taken = s.table.filter(t => take.includes(t.id));
    const looseCards = taken.flatMap(t => (t.k === 'b' ? t.cards : [t.id]));
    const allEmpty = () => s.hands.every(h => h.length === 0);
    const move = { player, type: m.type, card: m.card, take: looseCards, value: check.value, sweep: false, items: taken.length };

    switch (m.type) {
      case 'trail':
        s.table.push({ k: 'c', id: m.card });
        break;
      case 'capture': {
        s.table = s.table.filter(t => !take.includes(t.id));
        s.captured[side].push(m.card, ...looseCards);
        s.lastCapturer = player;
        const lastPlay = s.deck.length === 0 && allEmpty();
        if (s.table.length === 0 && !lastPlay) { s.sweeps[side]++; move.sweep = true; }
        break;
      }
      case 'build': case 'call': {
        s.table = s.table.filter(t => !take.includes(t.id));
        const b = { k: 'b', id: 'b' + s.nextBuild++, value: check.value, locked: m.type === 'call', cards: [...looseCards, m.card], by: player };
        s.table.push(b);
        move.build = b.id;
        break;
      }
      case 'raise': {
        const b = s.table.find(t => t.id === m.build);
        b.value = check.value; b.cards.push(m.card); b.by = player;
        move.build = b.id; move.take = [];
        break;
      }
      case 'double': {
        const b = s.table.find(t => t.id === m.build);
        s.table = s.table.filter(t => !take.includes(t.id));
        b.locked = true; b.cards.push(...looseCards, m.card); b.by = player;
        move.build = b.id;
        break;
      }
    }
    s.lastMove = move;
    s.turn = (player + 1) % s.config.numPlayers;
    if (allEmpty()) {
      if (s.deck.length > 0) deal(s);
      else endRound(s);
    }
    return { ok: true, move };
  }

  // --- Fim de ronda -------------------------------------------------------
  function majority(stat, tieStat) {
    let top = Math.max(...stat);
    let tied = [];
    stat.forEach((x, i) => { if (x === top) tied.push(i); });
    if (tied.length === 1) return tied[0];
    top = Math.max(...tied.map(i => tieStat[i]));
    tied = tied.filter(i => tieStat[i] === top);
    return tied.length === 1 ? tied[0] : -1;
  }

  function scoreRound(captured, sweeps) {
    const cards = captured.map(c => c.length);
    const spades = captured.map(c => c.filter(x => SUIT[x] === 'S').length);
    const cardsWinner = majority(cards, spades);
    const spadesWinner = majority(spades, cards);
    return captured.map((c, i) => {
      const pts = {
        cards: i === cardsWinner ? 3 : 0,
        spades: i === spadesWinner ? 1 : 0,
        grande: c.includes('10D') ? 2 : 0,
        pequeno: c.includes('2S') ? 1 : 0,
        aces: c.filter(x => RANK[x] === 'A').length,
        sweeps: sweeps[i],
      };
      return { numCards: cards[i], numSpades: spades[i], pts, total: Object.values(pts).reduce((a, b) => a + b, 0) };
    });
  }

  function endRound(s) {
    let leftovers = [];
    if (s.lastCapturer !== null) {
      leftovers = s.table.flatMap(t => (t.k === 'b' ? t.cards : [t.id]));
      s.captured[sideOf(s.config, s.lastCapturer)].push(...leftovers);
      s.table = [];
    }
    const score = scoreRound(s.captured, s.sweeps);
    score.forEach((r, i) => { s.totals[i] += r.total; });
    s.result = { score, leftovers, leftoversTo: s.lastCapturer };
    s.match = resolveMatch(s);
    s.phase = s.match.over ? 'matchEnd' : 'roundEnd';
  }

  function resolveMatch(s) {
    const t = TARGETS[s.config.target];
    const contenders = [];
    s.totals.forEach((x, i) => { if (t === null || x >= t) contenders.push(i); });
    if (!contenders.length) return { over: false, winners: [], how: null, extra: false };
    const best = Math.max(...contenders.map(i => s.totals[i]));
    let tied = contenders.filter(i => s.totals[i] === best);
    if (tied.length === 1) return { over: true, winners: tied, how: 'score', extra: false };
    for (const cat of CATEGORY_ORDER) {
      const top = Math.max(...tied.map(i => s.result.score[i].pts[cat]));
      const next = tied.filter(i => s.result.score[i].pts[cat] === top);
      if (next.length < tied.length) tied = next;
      if (tied.length === 1) return { over: true, winners: tied, how: cat, extra: false };
    }
    return { over: false, winners: [], how: null, extra: true };
  }

  function nextRound(s, rng) {
    if (s.phase !== 'roundEnd') return false;
    beginRound(s, rng, false);
    return true;
  }

  // --- Vistas: o que cada jogador pode saber --------------------------------
  function publicView(s, player) {
    return {
      me: player,
      config: s.config,
      hand: player === null ? [] : s.hands[player].slice(),
      handCounts: s.hands.map(h => h.length),
      deckCount: s.deck.length,
      table: s.table,
      totals: s.totals,
      captureCounts: s.captured.map(c => c.length),
      sweeps: s.sweeps,
      turn: s.turn,
      dealer: s.dealer,
      roundNo: s.roundNo,
      phase: s.phase,
      lastMove: s.lastMove,
      result: s.result,
      match: s.match,
    };
  }

  // O que um bot sabe: a sua mão e tudo o que já esteve virado para cima.
  function botView(s, player) {
    return {
      me: player,
      config: s.config,
      hand: s.hands[player].slice(),
      handCounts: s.hands.map(h => h.length),
      deckCount: s.deck.length,
      table: s.table,
      seen: s.seen.slice(),
      captured: s.captured.map(c => c.slice()),
      sweeps: s.sweeps.slice(),
      totals: s.totals.slice(),
      lastCapturer: s.lastCapturer,
      nextBuild: s.nextBuild,
      turn: s.turn,
      dealer: s.dealer,
    };
  }

  function cloneState(s) {
    return {
      config: s.config, roundNo: s.roundNo, dealer: s.dealer, totals: s.totals.slice(),
      hands: s.hands.map(h => h.slice()), deck: s.deck.slice(),
      table: s.table.map(t => (t.k === 'b' ? { k: 'b', id: t.id, value: t.value, locked: t.locked, cards: t.cards.slice(), by: t.by } : t)),
      captured: s.captured.map(c => c.slice()), sweeps: s.sweeps.slice(), seen: s.seen.slice(),
      turn: s.turn, lastCapturer: s.lastCapturer, nextBuild: s.nextBuild, lastMove: null,
      phase: s.phase, result: null, match: s.match,
    };
  }

  // --- Opções para jogadores e bots ---------------------------------------
  // Grupos (máscaras) de itens com valor < v que somam v.
  function sumSubsets(values, v) {
    const n = Math.min(values.length, 16);
    const out = [];
    (function rec(i, sum, mask) {
      if (sum === v) { out.push(mask); return; }
      for (let j = i; j < n; j++) if (sum + values[j] <= v) rec(j + 1, sum + values[j], mask | (1 << j));
    })(0, 0, 0);
    return out;
  }

  // Melhor captura possível com a carta, segundo weight(item).
  function bestCapture(table, card, weight) {
    const v = VALUE[card];
    if (v === null) {
      const same = table.filter(t => isLoose(t) && RANK[t.id] === RANK[card]);
      return same.map(t => t.id);
    }
    const direct = [], parts = [];
    for (const t of table) {
      const iv = itemValue(t);
      if (iv === null) continue;
      if (iv === v) direct.push(t.id);
      else if (iv < v && !(t.k === 'b' && t.locked)) parts.push(t);
    }
    if (!parts.length) return direct;
    const values = parts.map(itemValue);
    const subsets = sumSubsets(values, v);
    if (!subsets.length) return direct;
    const w = parts.map(weight || (() => 1));
    const maskW = subsets.map(m => { let x = 0; for (let i = 0; i < parts.length; i++) if (m & (1 << i)) x += w[i]; return x; });
    let best = 0, bestMask = 0;
    (function rec(i, used, score, chosen) {
      if (score > best) { best = score; bestMask = chosen; }
      for (let j = i; j < subsets.length; j++)
        if (!(subsets[j] & used)) rec(j + 1, used | subsets[j], score + maskW[j], chosen | subsets[j]);
    })(0, 0, 0, 0);
    const ids = direct.slice();
    parts.forEach((t, i) => { if (bestMask & (1 << i)) ids.push(t.id); });
    return ids;
  }

  // Itens da mesa que podem ser levados com esta carta (para realçar na interface).
  function captureHints(table, card) {
    const v = VALUE[card];
    const out = new Set();
    if (v === null) {
      for (const t of table) if (isLoose(t) && RANK[t.id] === RANK[card]) out.add(t.id);
      return out;
    }
    const parts = [];
    for (const t of table) {
      const iv = itemValue(t);
      if (iv === null) continue;
      if (iv === v) out.add(t.id);
      else if (iv < v && !(t.k === 'b' && t.locked)) parts.push(t);
    }
    for (const m of sumSubsets(parts.map(itemValue), v))
      parts.forEach((t, i) => { if (m & (1 << i)) out.add(t.id); });
    return out;
  }

  // O que se pode fazer com a carta e a seleção atual (botões da interface).
  function actionsFor(ctx, card, selection) {
    const sel = selection || [];
    const items = lookup(ctx, sel);
    if (!items) return [];
    const out = [];
    const tryMove = m => { const r = validateMove(ctx, m); if (r.ok) out.push({ move: m, value: r.value }); };
    if (!sel.length) { tryMove({ type: 'trail', card }); return out; }
    tryMove({ type: 'capture', card, take: sel });
    const builds = items.filter(i => i.k === 'b');
    if (!builds.length) {
      tryMove({ type: 'build', card, take: sel });
      tryMove({ type: 'call', card, take: sel });
    } else if (builds.length === 1) {
      const b = builds[0];
      const loose = sel.filter(id => id !== b.id);
      if (!loose.length) tryMove({ type: 'raise', card, build: b.id });
      tryMove({ type: 'double', card, build: b.id, take: loose });
    }
    return out;
  }

  // Porque é que a seleção não dá nenhuma jogada (texto de ajuda).
  function explainSelection(ctx, card, selection) {
    const items = lookup(ctx, selection) || [];
    const builds = items.filter(i => i.k === 'b');
    const attempts = [];
    if (builds.length === 1) {
      const b = builds[0], loose = selection.filter(id => id !== b.id);
      if (!loose.length && !b.locked) attempts.push({ type: 'raise', card, build: b.id });
      attempts.push({ type: 'double', card, build: b.id, take: loose });
    } else if (!builds.length) {
      if (items.length && items.every(i => VALUE[i.id] === VALUE[card])) attempts.push({ type: 'call', card, take: selection });
      attempts.push({ type: 'build', card, take: selection });
    }
    attempts.unshift({ type: 'capture', card, take: selection });
    const last = attempts.map(m => validateMove(ctx, m)).filter(r => !r.ok).map(r => r.reason);
    return last.length ? last[last.length - 1] : '';
  }

  // Todas as jogadas que os bots consideram (a captura é a melhor de cada carta).
  function enumerateMoves(ctx, weight, opts) {
    const moves = [];
    const seenCards = new Set();
    const noBuild = opts && opts.noBuild;
    for (const card of ctx.hand) {
      if (seenCards.has(card)) continue;
      seenCards.add(card);
      moves.push({ type: 'trail', card });
      const take = bestCapture(ctx.table, card, weight);
      if (take.length) moves.push({ type: 'capture', card, take });
      const v = VALUE[card];
      if (v === null || noBuild) continue;
      const looseNum = ctx.table.filter(t => isLoose(t) && VALUE[t.id] !== null);
      const looseVals = looseNum.map(t => VALUE[t.id]);
      const heldValues = new Set(ctx.hand.filter(c => c !== card).map(c => VALUE[c]).filter(x => x !== null));
      for (const V of heldValues) {
        if (V > v) for (const m of sumSubsets(looseVals, V - v))
          moves.push({ type: 'build', card, take: looseNum.filter((_, i) => m & (1 << i)).map(t => t.id) });
      }
      if (heldValues.has(v)) {
        const same = looseNum.filter(t => VALUE[t.id] === v);
        if (same.length) moves.push({ type: 'call', card, take: same.map(t => t.id) });
      }
      for (const b of ctx.table) {
        if (b.k !== 'b') continue;
        if (!b.locked && b.value + v <= 10 && heldValues.has(b.value + v)) moves.push({ type: 'raise', card, build: b.id });
        if (v <= b.value && heldValues.has(b.value)) {
          if (v === b.value) moves.push({ type: 'double', card, build: b.id, take: [] });
          else for (const m of sumSubsets(looseVals, b.value - v))
            moves.push({ type: 'double', card, build: b.id, take: looseNum.filter((_, i) => m & (1 << i)).map(t => t.id) });
        }
      }
    }
    return moves;
  }

  return {
    SUITS, RANKS, ALL_CARDS, VALUE, RANK, SUIT, CATEGORY_ORDER,
    shuffle, normalizeConfig, sideOf, numSides, createMatch, nextRound, applyMove, validateMove,
    actionsFor, explainSelection, captureHints, bestCapture, enumerateMoves, scoreRound, publicView, botView,
    cloneState, itemValue, deal,
  };
});
