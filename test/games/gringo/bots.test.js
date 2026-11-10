const test = require('node:test');
const assert = require('node:assert');
const M = require('../../../games/gringo/module.js');
const G = require('../../../games/gringo/rules.js');
function seeded(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Joga uma partida só com bots, com as Jogadas Rápidas que eles quiserem fazer.
function play(n, seed) {
  const rng = seeded(seed);
  const s = M.setup({ numPlayers: n }, rng, {});
  let now = 0, snaps = 0, gringos = 0;
  for (let steps = 0; !M.over(s); steps++) {
    assert.ok(steps < 4000, 'a partida não acaba');
    for (let p = 0; p < n; p++) {
      const r = M.bots.react('normal', M.bots.view(s, p), rng);
      if (r) { assert.ok(M.apply(s, p, r.action, { now, rng }).ok); snaps++; }
    }
    const w = M.waitingFor(s, now);
    if (!w.length) { const d = M.nextDeadline(s, now); if (d === null) continue; now = d; M.tick(s, now, rng); continue; }
    const a = M.bots.choose('normal', M.bots.view(s, w[0].seat), rng);
    if (a.type === 'gringo') gringos++;
    const r = M.apply(s, w[0].seat, a, { now, rng });
    assert.ok(r.ok, `${JSON.stringify(a)}: ${r.reason}`);
    now += 700;
  }
  return { s, snaps, gringos };
}

test('bots jogam partidas completas de 2 a 8 jogadores, só com jogadas legais', () => {
  let snaps = 0, gringos = 0;
  for (let n = 2; n <= 8; n++) for (let k = 0; k < 6; k++) { const r = play(n, n * 100 + k); snaps += r.snaps; gringos += r.gringos; }
  assert.ok(snaps > 20, 'os bots fazem Jogadas Rápidas: ' + snaps);
  assert.ok(gringos > 20, 'os bots dizem Gringo: ' + gringos);
});

test('o bot nunca faz Jogada Rápida com uma carta que não conhece', () => {
  const s = M.setup({ numPlayers: 2 }, seeded(5), {});
  s.phase = 'play'; s.ready = [true, true]; s.discard = ['7C']; s.snapOpen = true;
  s.hands[1][0].card = '7H';
  assert.strictEqual(M.bots.react('normal', M.bots.view(s, 1), seeded(1)), null, 'não sabe que tem um 7');
  s.memory[1][s.hands[1][0].id] = '7H';
  const r = M.bots.react('normal', M.bots.view(s, 1), seeded(1));
  assert.deepStrictEqual(r.action, { type: 'snap', slot: s.hands[1][0].id });
  assert.ok(r.delayMs >= 800 && r.delayMs < 1800);
});

test('o bot não vê as cartas escondidas: decide igual, sejam elas quais forem', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const { s } = (() => { const rng = seeded(seed); const s = M.setup({ numPlayers: 3 }, rng, {}); for (let p = 0; p < 3; p++) { M.apply(s, p, M.bots.choose('normal', M.bots.view(s, p), rng), { now: 0, rng }); M.apply(s, p, { type: 'ready' }, { now: 0, rng }); } return { s }; })();
    const me = s.turn;
    const a = JSON.stringify(M.bots.view(s, me));
    // baralhar o que o bot não pode saber
    const hid = new Set(G.hidden(s, me));
    const pool = G.shuffle([...hid], seeded(seed * 3));
    let k = 0;
    s.hands.forEach(h => h.forEach(x => { if (hid.has(x.card)) x.card = pool[k++]; }));
    s.deck = s.deck.map(c => (hid.has(c) ? pool[k++] : c));
    assert.strictEqual(JSON.stringify(M.bots.view(s, me)), a);
  }
});
