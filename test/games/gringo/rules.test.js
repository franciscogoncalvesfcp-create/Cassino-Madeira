const test = require('node:test');
const assert = require('node:assert');
const G = require('../../../games/gringo/rules.js');

function seeded(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const ctx = (now = 0) => ({ now, rng: seeded(99) });
const ok = (s, seat, a, now) => { const r = G.apply(s, seat, a, ctx(now)); assert.ok(r.ok, `${a.type}: ${r.reason}`); return r; };
const no = (s, seat, a) => { const r = G.apply(s, seat, a, ctx()); assert.ok(!r.ok, `${a.type} devia ser recusada`); return r; };
// Partida já a jogar, com mãos escolhidas: hands = [['7H','2S'], ...], deck do fim para o início (pop).
function game(hands, { deck = ['3C', '4C', '5C', '6C', '8C', '9C'], discard = [], turn = 0 } = {}) {
  const s = G.createGame({ numPlayers: hands.length }, seeded(1), { starter: turn });
  let id = 1;
  s.hands = hands.map(h => h.map((card, i) => ({ id: 'k' + id++, label: i + 1, card })));
  s.nextId = id;
  s.deck = deck.slice(); s.discard = discard.slice();
  s.phase = 'play'; s.step = 'start'; s.turn = turn;
  s.ready = hands.map(() => true); s.peeked = hands.map(() => []);
  return s;
}
const ids = (s, p) => s.hands[p].map(x => x.id);
const cards = (s, p) => s.hands[p].map(x => x.card);

test('baralho de 54 cartas, 4 para cada um, números de 1 a 4', () => {
  assert.strictEqual(new Set(G.ALL_CARDS).size, 54);
  for (const n of [2, 5, 8]) {
    const s = G.createGame({ numPlayers: n }, seeded(n));
    assert.strictEqual(s.phase, 'prep');
    assert.strictEqual(s.deck.length, 54 - 4 * n);
    s.hands.forEach(h => assert.deepStrictEqual(h.map(x => x.label), [1, 2, 3, 4]));
    assert.strictEqual(new Set(s.hands.flat().map(x => x.id)).size, 4 * n);
    assert.ok(s.turn >= 0 && s.turn < n);
  }
  assert.strictEqual(G.createGame({ numPlayers: 4 }, seeded(1), { starter: 2 }).turn, 2);
  assert.strictEqual(G.normalizeConfig({ numPlayers: 9 }).numPlayers, 4);
  assert.strictEqual(G.normalizeConfig({ numPlayers: 1 }).numPlayers, 4);
  assert.strictEqual(G.normalizeConfig({ numPlayers: 8 }).numPlayers, 8);
});

test('valores das cartas', () => {
  const v = c => G.points(c);
  assert.deepStrictEqual(['KH', 'KD', 'KS', 'KC', 'JK1', 'JK2', 'AS', '7D', '10C', 'JH', 'QS'].map(v), [-3, -3, 13, 13, 0, 0, 1, 7, 10, 11, 12]);
  assert.deepStrictEqual(['JS', 'QH', 'KD', 'JK1', '10H'].map(G.powerOf), ['J', 'Q', 'K', null, null]);
});

test('espreitar: exatamente duas cartas, só o próprio vê, até dizer pronto', () => {
  const s = G.createGame({ numPlayers: 3 }, seeded(4));
  const [a, b, c] = ids(s, 0);
  no(s, 0, { type: 'ready' });
  no(s, 0, { type: 'peek', slots: [a] });
  no(s, 0, { type: 'peek', slots: [a, a] });
  no(s, 0, { type: 'peek', slots: [a, ids(s, 1)[0]] });
  ok(s, 0, { type: 'peek', slots: [a, b] });
  no(s, 0, { type: 'peek', slots: [b, c] });
  let v = G.publicView(s, 0);
  assert.deepStrictEqual(v.hands[0].map(x => !!x.card), [true, true, false, false]);
  assert.ok(G.publicView(s, 1).hands[0].every(x => !x.card), 'os outros não veem');
  assert.deepStrictEqual(G.waitingFor(s).map(w => w.seat), [0, 1, 2]);
  ok(s, 0, { type: 'ready' });
  v = G.publicView(s, 0);
  assert.ok(v.hands[0].every(x => !x.card), 'depois de pronto já não se vê');
  assert.deepStrictEqual(G.waitingFor(s).map(w => w.seat), [1, 2]);
  no(s, 1, { type: 'draw' });
  for (const p of [1, 2]) { ok(s, p, { type: 'peek', slots: ids(s, p).slice(2) }); ok(s, p, { type: 'ready' }); }
  assert.strictEqual(s.phase, 'play');
  assert.deepStrictEqual(G.waitingFor(s), [{ seat: s.turn, kind: 'turn' }]);
});

test('comprar: só na vez; a carta comprada só a vê quem comprou', () => {
  const s = game([['2S', '3S', '4S', '5S'], ['2H', '3H', '4H', '5H']], { deck: ['9D', '7C'] });
  no(s, 1, { type: 'draw' });
  ok(s, 0, { type: 'draw' });
  no(s, 0, { type: 'draw' });
  assert.strictEqual(G.publicView(s, 0).drawn, '7C');
  assert.strictEqual(G.publicView(s, 1).drawn, null);
  assert.strictEqual(G.publicView(s, 1).holding, 0);
  no(s, 0, { type: 'gringo' });
});

test('deitar fora a comprada passa a vez; trocar põe a carta da mão no lixo e mantém o número', () => {
  const s = game([['2S', '3S', '4S', '5S'], ['2H', '3H', '4H', '5H']], { deck: ['9D', '6C', '7C'] });
  ok(s, 0, { type: 'draw' });
  ok(s, 0, { type: 'discardDrawn' });
  assert.deepStrictEqual(s.discard, ['7C']);
  assert.strictEqual(s.turn, 1);
  ok(s, 1, { type: 'draw' }); // 6C
  const old = s.hands[1][2];
  ok(s, 1, { type: 'swap', slot: old.id });
  assert.strictEqual(s.hands[1][2].card, '6C');
  assert.strictEqual(s.hands[1][2].label, 3);
  assert.notStrictEqual(s.hands[1][2].id, old.id, 'carta nova, identificador novo');
  assert.strictEqual(s.discard[s.discard.length - 1], '4H');
  assert.strictEqual(s.turn, 0);
  no(s, 0, { type: 'swap', slot: s.hands[0][0].id });
});

test('Jogada Rápida certa: sai da mão, mesmo fora da vez; só a primeira conta', () => {
  const s = game([['2S', '7D', '4S', '5S'], ['7H', '3H', '4H', '5H'], ['7S', '9H', '9C', '9D']], { deck: ['9S', '7C'] });
  ok(s, 0, { type: 'draw' });
  ok(s, 0, { type: 'discardDrawn' }); // 7C no lixo
  ok(s, 2, { type: 'snap', slot: s.hands[2][0].id }); // 7S, fora da vez
  assert.deepStrictEqual(cards(s, 2), ['9H', '9C', '9D']);
  assert.strictEqual(s.discard[s.discard.length - 1], '7S');
  // O seguinte também tinha um 7, mas chegou tarde: volta para a mão, sem castigo, e fica à vista de todos
  const late = s.hands[1][0];
  ok(s, 1, { type: 'snap', slot: late.id });
  assert.deepStrictEqual(cards(s, 1), ['7H', '3H', '4H', '5H']);
  assert.strictEqual(s.events[s.events.length - 1].t, 'snapLate');
  assert.ok(G.botView(s, 0).known[late.id] === '7H', 'todos sabem onde está');
  // Uma carta diferente depois disso é castigada
  ok(s, 0, { type: 'snap', slot: s.hands[0][3].id }); // 5S sobre 7S
  assert.strictEqual(s.hands[0].length, 5);
});

test('Jogada Rápida errada: a carta mostra-se e volta, e leva uma carta extra sem a ver', () => {
  const s = game([['2S', '3S', '4S', '5S'], ['2H', '3H', '4H', '5H']], { deck: ['QD', '7C'] });
  ok(s, 0, { type: 'draw' }); ok(s, 0, { type: 'discardDrawn' });
  const wrong = s.hands[1][3];
  ok(s, 1, { type: 'snap', slot: wrong.id });
  assert.deepStrictEqual(cards(s, 1), ['2H', '3H', '4H', '5H', 'QD']);
  assert.strictEqual(s.hands[1][4].label, 5);
  assert.strictEqual(s.hands[1][3].id, wrong.id, 'volta para o mesmo lugar');
  const e = s.events[s.events.length - 1];
  assert.strictEqual(e.t, 'snapFail'); assert.strictEqual(e.card, '5H');
  assert.ok(!JSON.stringify(G.publicView(s, 1)).includes('"QD"'), 'não vê a carta extra');
  assert.ok(s.snapOpen, 'continua aberta para os outros');
});

test('a janela fecha quando o jogador seguinte joga; Gringo também conta como jogar', () => {
  const s = game([['7S', '3S', '4S', '5S'], ['2H', '3H', '4H', '5H']], { deck: ['9D', '8C', '7C'] });
  ok(s, 0, { type: 'draw' }); ok(s, 0, { type: 'discardDrawn' });
  ok(s, 1, { type: 'draw' });
  no(s, 0, { type: 'snap', slot: s.hands[0][0].id });
  assert.strictEqual(s.hands[0].length, 4, 'recusada, sem castigo');
});

test('figuras: conta a figura, não a cor; Joker sobre Joker', () => {
  let s = game([['KH', '3S'], ['2H', '3H']], { discard: ['KS'], turn: 1 });
  s.snapOpen = true;
  ok(s, 0, { type: 'snap', slot: s.hands[0][0].id });
  assert.deepStrictEqual(cards(s, 0), ['3S']);
  s = game([['JK2', '3S'], ['2H', '3H']], { discard: ['JK1'], turn: 1 });
  s.snapOpen = true;
  ok(s, 0, { type: 'snap', slot: s.hands[0][0].id });
  assert.deepStrictEqual(cards(s, 0), ['3S']);
});

test('Conde: troca cega entre mim e um adversário, ou entre dois adversários', () => {
  const s = game([['2S', '3S'], ['2H', '3H'], ['2D', '3D']], { deck: ['9C', 'JC'] });
  ok(s, 0, { type: 'draw' }); ok(s, 0, { type: 'discardDrawn' });
  assert.deepStrictEqual(G.waitingFor(s), [{ seat: 0, kind: 'turn' }]);
  no(s, 1, { type: 'jack', a: { seat: 1, slot: 'k3' }, b: { seat: 2, slot: 'k5' } });
  no(s, 0, { type: 'jack', a: { seat: 0, slot: 'k1' }, b: { seat: 0, slot: 'k2' } });
  no(s, 0, { type: 'jack', a: { seat: 1, slot: 'k3' }, b: { seat: 1, slot: 'k4' } });
  no(s, 1, { type: 'draw' });
  ok(s, 0, { type: 'jack', a: { seat: 1, slot: 'k3' }, b: { seat: 2, slot: 'k6' } });
  assert.deepStrictEqual(cards(s, 1), ['3D', '3H']);
  assert.deepStrictEqual(cards(s, 2), ['2D', '2H']);
  assert.deepStrictEqual(ids(s, 1), ['k6', 'k4'], 'o identificador acompanha a carta');
  assert.deepStrictEqual(s.hands[1].map(x => x.label), [1, 2], 'o número fica no lugar');
  assert.strictEqual(s.turn, 1);
});

test('Dama: espreito uma carta minha, só eu a vejo, até dizer que já vi', () => {
  const s = game([['2S', '3S'], ['2H', '3H']], { deck: ['9C', 'QC'] });
  ok(s, 0, { type: 'draw' }); ok(s, 0, { type: 'discardDrawn' });
  no(s, 0, { type: 'queen', slot: 'k3' });
  no(s, 0, { type: 'done' });
  ok(s, 0, { type: 'queen', slot: 'k2' });
  assert.strictEqual(G.publicView(s, 0).hands[0][1].card, '3S');
  assert.strictEqual(G.publicView(s, 1).hands[0][1].card, null);
  assert.strictEqual(G.publicView(s, 1).power.target.slot, 'k2', 'os outros veem qual carta foi');
  no(s, 0, { type: 'move', slot: 'k1', to: 1 });
  ok(s, 0, { type: 'done' });
  assert.strictEqual(G.publicView(s, 0).hands[0][1].card, null);
  assert.strictEqual(s.turn, 1);
});

test('Rei: espreito uma carta de um adversário e posso trocá-la por uma minha', () => {
  let s = game([['QS', '3S'], ['2H', 'KC']], { deck: ['9C', 'KD'] });
  ok(s, 0, { type: 'draw' }); ok(s, 0, { type: 'discardDrawn' }); // Rei vermelho também tem poder
  no(s, 0, { type: 'king', target: { seat: 0, slot: 'k1' } });
  no(s, 0, { type: 'kingSwap', slot: 'k1' });
  ok(s, 0, { type: 'king', target: { seat: 1, slot: 'k3' } });
  assert.strictEqual(G.publicView(s, 0).hands[1][0].card, '2H');
  ok(s, 0, { type: 'kingSwap', slot: 'k1' });
  assert.deepStrictEqual(cards(s, 0), ['2H', '3S']);
  assert.deepStrictEqual(cards(s, 1), ['QS', 'KC']);
  assert.strictEqual(s.turn, 1);
  // ou não trocar
  s = game([['QS', '3S'], ['2H', 'KC']], { deck: ['9C', 'KS'] });
  ok(s, 0, { type: 'draw' }); ok(s, 0, { type: 'discardDrawn' });
  ok(s, 0, { type: 'king', target: { seat: 1, slot: 'k4' } });
  ok(s, 0, { type: 'done' });
  assert.deepStrictEqual(cards(s, 1), ['2H', 'KC']);
});

test('fila de poderes: pela ordem das cartas no lixo; a carta tirada da mão também tem poder', () => {
  const s = game([['JS', '3S', '4S'], ['JH', '3H', '4H'], ['2D', '3D', '4D']], { deck: ['9C', 'JC'] });
  ok(s, 0, { type: 'draw' });
  ok(s, 0, { type: 'swap', slot: 'k1' }); // tira o JS da mão para o lixo
  assert.deepStrictEqual(s.powers.map(x => [x.seat, x.power]), [[0, 'J']]);
  ok(s, 1, { type: 'snap', slot: 'k4' }); // JH por cima
  assert.deepStrictEqual(s.powers.map(x => [x.seat, x.power]), [[0, 'J'], [1, 'J']]);
  no(s, 1, { type: 'skip' });
  ok(s, 0, { type: 'skip' });
  assert.deepStrictEqual(G.waitingFor(s), [{ seat: 1, kind: 'turn' }]);
  ok(s, 1, { type: 'jack', a: { seat: 1, slot: 'k5' }, b: { seat: 2, slot: 'k7' } });
  assert.strictEqual(s.turn, 1);
  assert.strictEqual(s.step, 'start');
});

test('Jogada Rápida com poder no início da vez de outro: o poder resolve-se antes de ele comprar', () => {
  const s = game([['2S', '3S'], ['QH', '3H'], ['2D', '3D']], { deck: ['9C', 'QC'] });
  ok(s, 0, { type: 'draw' }); ok(s, 0, { type: 'discardDrawn' }); // QC: poder do 0
  ok(s, 0, { type: 'skip' });
  assert.strictEqual(s.turn, 1);
  ok(s, 1, { type: 'snap', slot: 'k3' }); // QH antes de o 1 comprar? é o próprio 1
  assert.deepStrictEqual(G.waitingFor(s), [{ seat: 1, kind: 'turn' }]);
  no(s, 1, { type: 'draw' });
  ok(s, 1, { type: 'queen', slot: 'k4' });
  ok(s, 1, { type: 'done' });
  ok(s, 1, { type: 'draw' });
});

test('mexer nas cartas: o número vai com a carta; não durante um poder', () => {
  const s = game([['2S', '3S', '4S', '5S'], ['2H', '3H', '4H', '5H']]);
  ok(s, 1, { type: 'move', slot: 'k5', to: 3 });
  assert.deepStrictEqual(cards(s, 1), ['3H', '4H', '5H', '2H']);
  assert.deepStrictEqual(s.hands[1].map(x => x.label), [2, 3, 4, 1]);
  no(s, 1, { type: 'move', slot: 'k1', to: 0 });
  no(s, 1, { type: 'move', slot: 'k5', to: 9 });
  assert.strictEqual(s.events[s.events.length - 1].t, 'move');
});

test('baralho vazio: o lixo volta a ser baralho, menos a última carta', () => {
  const s = game([['2S', '3S'], ['2H', '3H']], { deck: [], discard: ['4C', '5C', '6C', '7C'] });
  s.snapOpen = true;
  ok(s, 0, { type: 'draw' });
  assert.deepStrictEqual(s.discard, ['7C']);
  assert.strictEqual(s.deck.length, 2);
  assert.ok(['4C', '5C', '6C'].includes(G.publicView(s, 0).drawn));
  // sem nada para comprar, a vez passa
  const t = game([['2S'], ['2H']], { deck: [], discard: ['7C'] });
  ok(t, 0, { type: 'draw' });
  assert.strictEqual(t.turn, 1);
});

test('Gringo: cada um dos outros joga mais uma vez, depois 3 segundos de última oportunidade', () => {
  const s = game([['2S', '3S'], ['2H', '3H'], ['KD', 'AC']], { deck: ['9C', '8C', '7C', '6C'], turn: 0 });
  ok(s, 0, { type: 'gringo' });
  assert.deepStrictEqual(s.final, { by: 0, auto: false, remaining: [1, 2] });
  assert.strictEqual(s.turn, 1);
  no(s, 1, { type: 'gringo' });
  ok(s, 1, { type: 'draw' }); ok(s, 1, { type: 'discardDrawn' });
  assert.strictEqual(s.turn, 2);
  no(s, 0, { type: 'snap', slot: 'k1' });
  ok(s, 2, { type: 'draw' }); ok(s, 2, { type: 'discardDrawn' }, 5000);
  assert.strictEqual(s.phase, 'lastChance');
  assert.strictEqual(G.nextDeadline(s), 5000 + G.LAST_CHANCE_MS);
  assert.deepStrictEqual(G.waitingFor(s), []);
  G.tick(s, 7000); assert.strictEqual(s.phase, 'lastChance');
  G.tick(s, 8000); assert.strictEqual(s.phase, 'over');
  assert.deepStrictEqual(s.result.scores, [5, 5, -2]);
  assert.deepStrictEqual(s.result.ranking, [{ seats: [2], place: 1, score: -2 }, { seats: [0], place: 2, score: 5 }, { seats: [1], place: 2, score: 5 }]);
  assert.ok(G.publicView(s, 1).hands.flat().every(x => x.card), 'no fim vê-se tudo');
});

test('última oportunidade: Jogada Rápida com poder dá mais 3 segundos depois de usado', () => {
  const s = game([['2S'], ['JH', '3H'], ['2D']], { deck: ['9C', 'JC', '7C'], turn: 0 });
  ok(s, 0, { type: 'gringo' }, 0);
  ok(s, 1, { type: 'draw' }); ok(s, 1, { type: 'discardDrawn' });
  ok(s, 2, { type: 'draw' }); ok(s, 2, { type: 'discardDrawn' }); // o 2 deita fora o JC
  assert.strictEqual(s.phase, 'play', 'o poder do último ainda está por usar');
  ok(s, 2, { type: 'skip' }, 1000);
  assert.strictEqual(s.phase, 'lastChance');
  ok(s, 1, { type: 'snap', slot: 'k2' }, 2000);
  assert.deepStrictEqual(G.waitingFor(s), [{ seat: 1, kind: 'turn' }]);
  assert.strictEqual(G.nextDeadline(s), null);
  ok(s, 1, { type: 'skip' }, 3500);
  assert.strictEqual(G.nextDeadline(s), 6500);
});

test('Gringo automático, exemplo do Francisco: A fica sem cartas depois da jogada de C; jogam D, B e por fim C', () => {
  // A=0, B=1, C=2, D=3
  const s = game([['7S'], ['2H', '3H'], ['2D', '3D'], ['2C', '3C']], { deck: ['9H', '8H', '6H', '5H', '4H', '7C'], turn: 2 });
  ok(s, 2, { type: 'draw' }); ok(s, 2, { type: 'discardDrawn' }); // C deita fora o 7C
  assert.strictEqual(s.turn, 3);
  ok(s, 0, { type: 'snap', slot: 'k1' }); // A atira o 7S e fica sem cartas
  assert.deepStrictEqual(s.final, { by: 0, auto: true, remaining: [3, 1, 2] });
  for (const p of [3, 1, 2]) { assert.strictEqual(s.turn, p); ok(s, p, { type: 'draw' }); ok(s, p, { type: 'discardDrawn' }); }
  assert.strictEqual(s.phase, 'lastChance');
});

test('Gringo automático na vez de quem fica sem cartas: passa logo a vez', () => {
  const s = game([['7S'], ['2H', '3H'], ['2D']], { discard: ['7C'], turn: 0 });
  s.snapOpen = true;
  ok(s, 0, { type: 'snap', slot: 'k1' });
  assert.deepStrictEqual(s.final.remaining, [1, 2]);
  assert.strictEqual(s.turn, 1);
});

test('as cartas de quem disse Gringo podem ser trocadas', () => {
  const s = game([['2S', '3S'], ['2H', '3H']], { deck: ['9C', 'JC'], turn: 0 });
  ok(s, 0, { type: 'gringo' });
  ok(s, 1, { type: 'draw' }); ok(s, 1, { type: 'discardDrawn' });
  ok(s, 1, { type: 'jack', a: { seat: 1, slot: 'k3' }, b: { seat: 0, slot: 'k1' } });
  assert.deepStrictEqual(cards(s, 0), ['2H', '3S']);
});

test('quem começa a seguir: quem ganhou; num empate, o que deixa o outro jogar mais cedo', () => {
  const r = (places) => places.map((pl, p) => ({ seats: [p], place: pl, score: pl }));
  assert.strictEqual(G.nextStarter(r([2, 1, 3, 4]), 4), 1);
  assert.strictEqual(G.nextStarter(r([1, 1, 3, 4]), 4), 0); // lado a lado: o 0 e logo a seguir o 1
  assert.strictEqual(G.nextStarter(r([1, 3, 4, 1]), 4), 3); // 3 e depois 0
  assert.strictEqual(G.nextStarter(r([1, 3, 1, 4, 5, 6]), 6), 0); // 0 → 2 a 2 lugares; 2 → 0 a 4
});

test('partidas ao acaso com jogadas legais: cartas conservam-se e ninguém vê o que não deve', () => {
  const rng = seeded(7);
  for (let g = 0; g < 120; g++) {
    const n = 2 + (g % 7);
    const s = G.createGame({ numPlayers: n }, rng);
    let now = 0, steps = 0;
    while (s.phase !== 'over') {
      assert.ok(++steps < 5000);
      const total = s.hands.flat().length + s.deck.length + s.discard.length + (s.drawn ? 1 : 0);
      assert.strictEqual(total, 54);
      if (steps % 5 === 0) for (let p = 0; p < n; p++) {
        const hid = G.hidden(s, p);
        const txt = JSON.stringify(G.publicView(s, p));
        for (const c of hid) assert.ok(!txt.includes(`"${c}"`), `fuga de ${c} para ${p}`);
      }
      // jogadas rápidas ao acaso
      if (s.phase !== 'prep' && rng() < 0.15) {
        const p = Math.floor(rng() * n);
        if (s.hands[p].length) G.apply(s, p, { type: 'snap', slot: s.hands[p][Math.floor(rng() * s.hands[p].length)].id }, { now, rng });
      }
      const w = G.waitingFor(s);
      if (!w.length) { now = G.nextDeadline(s); G.tick(s, now); continue; }
      const { seat } = w[0];
      const h = s.hands[seat];
      const opp = (seat + 1) % n;
      const tries = [
        { type: 'peek', slots: h.slice(0, 2).map(x => x.id) }, { type: 'ready' },
        ...(s.final || rng() < 0.97 ? [] : [{ type: 'gringo' }]),
        { type: 'draw' },
        ...(h.length && rng() < 0.5 ? [{ type: 'swap', slot: h[Math.floor(rng() * h.length)].id }] : []),
        { type: 'discardDrawn' },
        ...(h.length && s.hands[opp].length ? [{ type: 'jack', a: { seat, slot: h[0].id }, b: { seat: opp, slot: s.hands[opp][0].id } }] : []),
        ...(h.length ? [{ type: 'queen', slot: h[0].id }] : []),
        ...(s.hands[opp].length ? [{ type: 'king', target: { seat: opp, slot: s.hands[opp][0].id } }] : []),
        ...(h.length ? [{ type: 'kingSwap', slot: h[0].id }] : []),
        { type: 'done' }, { type: 'skip' },
      ];
      let done = false;
      for (const a of tries) if (G.apply(s, seat, a, { now, rng }).ok) { done = true; break; }
      assert.ok(done, 'há sempre uma jogada possível: ' + JSON.stringify({ phase: s.phase, step: s.step, powers: s.powers, power: s.power }));
      now += 500;
    }
    assert.strictEqual(s.result.scores.length, n);
    assert.deepStrictEqual(s.result.ranking.flatMap(x => x.seats).sort((a, b) => a - b), Array.from({ length: n }, (_, i) => i));
  }
});
