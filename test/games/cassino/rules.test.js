const test = require('node:test');
const assert = require('node:assert');
const E = require('../../../games/cassino/rules.js');
const L = id => ({ k: 'c', id });
const B = (id, value, locked, cards) => ({ k: 'b', id, value, locked: !!locked, cards: cards || [], by: 0 });
function seeded(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const ok = (ctx, m) => assert.ok(E.validateMove(ctx, m).ok, JSON.stringify(m) + ' ' + E.validateMove(ctx, m).reason);
const no = (ctx, m) => assert.ok(!E.validateMove(ctx, m).ok, JSON.stringify(m));
function custom(cfg, over) {
  const s = E.createMatch(cfg, seeded(1));
  Object.assign(s, over);
  return s;
}

test('baralho: 52 cartas únicas e figuras sem valor', () => {
  assert.strictEqual(new Set(E.ALL_CARDS).size, 52);
  assert.strictEqual(E.VALUE.AS, 1); assert.strictEqual(E.VALUE['10D'], 10);
  assert.strictEqual(E.VALUE.JS, null); assert.strictEqual(E.VALUE.KH, null);
});

for (const [cfg, deals] of [[{ numPlayers: 2 }, 6], [{ numPlayers: 3 }, 4], [{ numPlayers: 4 }, 3], [{ numPlayers: 4, teams: true }, 3], [{ numPlayers: 6 }, 2], [{ numPlayers: 6, teams: 3 }, 2], [{ numPlayers: 6, teams: 2 }, 2]]) {
  test(`distribuição ${cfg.numPlayers}j${cfg.teams ? ' duplas' : ''}: ${deals} distribuições`, () => {
    const s = E.createMatch({ ...cfg, target: 'round' }, seeded(5));
    assert.strictEqual(s.table.length, 4);
    s.hands.forEach(h => assert.strictEqual(h.length, 4));
    assert.strictEqual(s.turn, (s.dealer + 1) % cfg.numPlayers);
    assert.strictEqual(s.deck.length, 48 - 4 * cfg.numPlayers);
    let dealsSeen = 1, plays = 0, prev = s.deck.length;
    while (s.phase === 'play') {
      const p = s.turn;
      const expectOpener = s.hands.every(h => h.length === 4);
      if (expectOpener) assert.strictEqual(p, (s.dealer + 1) % cfg.numPlayers, 'abre à esquerda do dador');
      assert.ok(E.applyMove(s, p, { type: 'trail', card: s.hands[p][0] }).ok);
      plays++;
      if (s.deck.length !== prev) { dealsSeen++; prev = s.deck.length; assert.strictEqual(s.table.length, 4 + plays, 'sem cartas novas na mesa'); }
    }
    assert.strictEqual(dealsSeen, deals);
    assert.strictEqual(plays, 48);
  });
}

test('captura: emparelhamento, somas, composta, parcial', () => {
  const ctx = { hand: ['8S', 'KH'], table: [L('8D'), L('6C'), L('2H'), L('5S'), L('3D'), L('KS'), L('KD')] };
  ok(ctx, { type: 'capture', card: '8S', take: ['8D', '6C', '2H', '5S', '3D'] }); // exemplo do manual
  ok(ctx, { type: 'capture', card: '8S', take: ['8D'] }); // parcial
  ok(ctx, { type: 'capture', card: '8S', take: ['6C', '2H'] });
  no(ctx, { type: 'capture', card: '8S', take: ['6C', '3D'] });
  no(ctx, { type: 'capture', card: '8S', take: ['6C', '2H', '5S'] });
  no(ctx, { type: 'capture', card: '8S', take: [] });
  no(ctx, { type: 'capture', card: '8S', take: ['KS'] });
  no(ctx, { type: 'capture', card: 'KH', take: ['KS', 'KD'] }); // duas figuras com uma não
  ok(ctx, { type: 'capture', card: 'KH', take: ['KS'] });
  ok({ hand: ['KH'], table: [L('KS'), L('KD'), L('KC')] }, { type: 'capture', card: 'KH', take: ['KS', 'KD', 'KC'] });
  no({ hand: ['KH'], table: [L('KS'), L('KD'), L('KC')] }, { type: 'capture', card: 'KH', take: ['KS', 'KD'] });
  ok({ hand: ['KH'], table: [L('KS'), L('KD'), L('KC')] }, { type: 'capture', card: 'KH', take: ['KS'] });
  assert.strictEqual(E.bestCapture([L('KS'), L('KD')], 'KH').length, 1);
  assert.strictEqual(E.bestCapture([L('KS'), L('KD'), L('KC')], 'KH').length, 3);
  no(ctx, { type: 'capture', card: 'KH', take: ['8D'] });
});

test('captura: cada carta só serve num grupo', () => {
  const ctx = { hand: ['6S'], table: [L('3D'), L('3C'), L('3H')] };
  ok(ctx, { type: 'capture', card: '6S', take: ['3D', '3C'] });
  no(ctx, { type: 'capture', card: '6S', take: ['3D', '3C', '3H'] });
  no(ctx, { type: 'capture', card: '6S', take: ['3D', '3D'] });
});

test('captura: partições que exigem procura', () => {
  const ctx = { hand: ['9S'], table: [L('5D'), L('4C'), L('3H'), L('3S'), L('3C'), L('AD'), L('2D')] };
  ok(ctx, { type: 'capture', card: '9S', take: ['5D', '4C', '3H', '3S', '3C'] });
  no(ctx, { type: 'capture', card: '9S', take: ['5D', '3H', '3S', 'AD'] });
  const ctx2 = { hand: ['10S'], table: [L('6D'), L('4C'), L('5H'), L('3S'), L('2C')] };
  ok(ctx2, { type: 'capture', card: '10S', take: ['6D', '4C', '5H', '3S', '2C'] });
});

test('montes: simples entra em somas, trancado não', () => {
  const ctx = { hand: ['9S', '6C', '7D'], table: [B('b1', 6), L('3H'), B('b2', 4, true), L('5D')] };
  ok(ctx, { type: 'capture', card: '9S', take: ['b1', '3H'] }); // exemplo do documento
  no(ctx, { type: 'capture', card: '9S', take: ['b2', '5D'] }); // trancado em soma
  ok(ctx, { type: 'capture', card: '6C', take: ['b1'] });
  const ctx2 = { hand: ['4S'], table: [B('b2', 4, true)] };
  ok(ctx2, { type: 'capture', card: '4S', take: ['b2'] });
});

test('figuras não capturam montes', () => {
  const ctx = { hand: ['KS'], table: [B('b1', 6)] };
  no(ctx, { type: 'capture', card: 'KS', take: ['b1'] });
});

test('monte simples: carta final na mão, máximo 10, várias soltas', () => {
  const ctx = { hand: ['4S', '7D'], table: [L('3H')] };
  ok(ctx, { type: 'build', card: '4S', take: ['3H'] });
  no({ hand: ['4S', '8D'], table: [L('3H')] }, { type: 'build', card: '4S', take: ['3H'] });
  ok({ hand: ['2S', '7D'], table: [L('3H'), L('2C')] }, { type: 'build', card: '2S', take: ['3H', '2C'] }); // decisão 5
  no({ hand: ['7S', '10D'], table: [L('5H')] }, { type: 'build', card: '7S', take: ['5H'] });
  no({ hand: ['4S', '7D'], table: [L('JH')] }, { type: 'build', card: '4S', take: ['JH'] });
  no({ hand: ['JS', '7D'], table: [L('3H')] }, { type: 'build', card: 'JS', take: ['3H'] });
  no({ hand: ['4S', '7D'], table: [] }, { type: 'build', card: '4S', take: [] }); // só cartas da mesa não
});

test('a carta que fica na mão tem de ser outra carta', () => {
  // 3 sobre 3 = monte de 6: o 6 tem de ficar; chamar 3 exige outro 3
  no({ hand: ['3S', '7D'], table: [L('3H')] }, { type: 'call', card: '3S', take: ['3H'] });
  ok({ hand: ['3S', '3D'], table: [L('3H')] }, { type: 'call', card: '3S', take: ['3H'] });
  ok({ hand: ['3S', '6D'], table: [L('3H')] }, { type: 'build', card: '3S', take: ['3H'] });
});

test('subir: só com carta da mão e monte não trancado', () => {
  const ctx = { hand: ['AS', '8D'], table: [B('b1', 7), B('b2', 7, true)] };
  ok(ctx, { type: 'raise', card: 'AS', build: 'b1' });
  no(ctx, { type: 'raise', card: 'AS', build: 'b2' });
  no({ hand: ['AS', '7D'], table: [B('b1', 7)] }, { type: 'raise', card: 'AS', build: 'b1' });
  no({ hand: ['4S', 'JD'], table: [B('b1', 7)] }, { type: 'raise', card: '4S', build: 'b1' }); // >10
});

test('monte duplo: exemplos do documento', () => {
  ok({ hand: ['5S', '7D'], table: [B('b1', 7), L('2H')] }, { type: 'double', card: '5S', build: 'b1', take: ['2H'] });
  ok({ hand: ['7S', '7D'], table: [B('b1', 7)] }, { type: 'double', card: '7S', build: 'b1', take: [] });
  no({ hand: ['7S', '8D'], table: [B('b1', 7)] }, { type: 'double', card: '7S', build: 'b1', take: [] }); // sem outro 7
  no({ hand: ['5S', '7D'], table: [B('b1', 7), L('3H')] }, { type: 'double', card: '5S', build: 'b1', take: ['3H'] });
  no({ hand: ['5S', '7D'], table: [B('b1', 7), B('b3', 2)] }, { type: 'double', card: '5S', build: 'b1', take: ['b3'] }); // decisão 4
});

test('aplicar monte duplo tranca e depois não sobe; só levanta com o valor', () => {
  const s = custom({ numPlayers: 2, target: 21 }, { turn: 0, hands: [['5S', '7D', 'AC'], ['8H', 'KD']], deck: ['2C','3C','4C','5C'], table: [B('b1', 7, false, ['4H', '3H']), L('2H')] });
  assert.ok(E.applyMove(s, 0, { type: 'double', card: '5S', build: 'b1', take: ['2H'] }).ok);
  const b = s.table.find(t => t.id === 'b1');
  assert.ok(b.locked); assert.strictEqual(b.value, 7); assert.strictEqual(b.cards.length, 4);
  assert.ok(!E.validateMove({ hand: ['AC', '8D'], table: s.table }, { type: 'raise', card: 'AC', build: 'b1' }).ok);
  assert.ok(E.validateMove({ hand: ['7D'], table: s.table }, { type: 'capture', card: '7D', take: ['b1'] }).ok);
});

test('chamar cria monte trancado com várias soltas iguais', () => {
  const s = custom({ numPlayers: 2, target: 21 }, { turn: 0, hands: [['6S', '6D', 'AC'], ['8H']], deck: ['2C','3C'], table: [L('6H'), L('6C')] });
  assert.ok(E.applyMove(s, 0, { type: 'call', card: '6S', take: ['6H', '6C'] }).ok);
  const b = s.table[0];
  assert.ok(b.locked && b.value === 6 && b.cards.length === 3);
  assert.ok(!E.validateMove({ hand: ['3S', '9D'], table: s.table }, { type: 'raise', card: '3S', build: b.id }).ok);
});

test('monte trancado aceita outro grupo do mesmo valor', () => {
  ok({ hand: ['5S', '7D'], table: [B('b1', 7, true), L('2H')] }, { type: 'double', card: '5S', build: 'b1', take: ['2H'] });
});

test('o exemplo do Francisco: 5 da mão com 3, 2 e 5 da mesa, ficando com outro 5', () => {
  const s = custom({ numPlayers: 2, target: 21 }, { turn: 0, hands: [['5S', '5D', 'AC'], ['8H']], deck: ['2C', '3C'], table: [L('3H'), L('2D'), L('5C')] });
  const acts = E.actionsFor({ hand: s.hands[0], table: s.table }, '5S', ['3H', '2D', '5C']);
  assert.ok(acts.some(a => a.move.type === 'call' && a.value === 5));
  const r = E.applyMove(s, 0, { type: 'call', card: '5S', take: ['3H', '2D', '5C'], value: 5 });
  assert.ok(r.ok, r.reason);
  const b = s.table[0];
  assert.ok(b.locked); assert.strictEqual(b.value, 5);
  assert.deepStrictEqual(b.cards.slice().sort(), ['2D', '3H', '5C', '5S']);
  assert.strictEqual(s.table.length, 1);
  // depois levanta com o outro 5
  s.hands[1].push('9C'); s.turn = 0;
  assert.ok(E.applyMove(s, 0, { type: 'capture', card: '5D', take: [b.id] }).ok);
});

test('monte trancado de uma vez: variantes e recusas', () => {
  // A carta da mão pode fazer parte de uma soma: 2 da mão + 3, mais 5 solto, ficando com um 5
  ok({ hand: ['2S', '5D'], table: [L('3H'), L('5C')] }, { type: 'call', card: '2S', take: ['3H', '5C'], value: 5 });
  // Sem o 5 na mão não dá
  no({ hand: ['5S', '9D'], table: [L('3H'), L('2C')] }, { type: 'call', card: '5S', take: ['3H', '2C'], value: 5 });
  // Sobra uma carta sem grupo
  no({ hand: ['5S', '5D'], table: [L('3H'), L('2C'), L('AC')] }, { type: 'call', card: '5S', take: ['3H', '2C', 'AC'], value: 5 });
  // Figuras e montes não entram
  no({ hand: ['5S', '5D'], table: [L('5H'), L('KC')] }, { type: 'call', card: '5S', take: ['5H', 'KC'], value: 5 });
  no({ hand: ['5S', '5D'], table: [B('b1', 5)] }, { type: 'call', card: '5S', take: ['b1'], value: 5 });
  // Um grupo só é um monte simples, não trancado
  no({ hand: ['2S', '5D'], table: [L('3H')] }, { type: 'call', card: '2S', take: ['3H'], value: 5 });
  // Chamar continua igual
  ok({ hand: ['6S', '6D'], table: [L('6H')] }, { type: 'call', card: '6S', take: ['6H'] });
  // A um monte existente também se juntam vários grupos
  ok({ hand: ['5S', '5D'], table: [B('b1', 5), L('3H'), L('2C'), L('5C')] }, { type: 'double', card: '5S', build: 'b1', take: ['3H', '2C', '5C'] });
  no({ hand: ['5S', '5D'], table: [B('b1', 5), L('3H')] }, { type: 'double', card: '5S', build: 'b1', take: ['3H'] });
  // Os bots também veem esta jogada
  const ms = E.enumerateMoves({ hand: ['5S', '5D'], table: [L('3H'), L('2C'), L('5C')] });
  assert.ok(ms.some(m => m.type === 'call' && m.value === 5 && m.take.length === 3));
});

test('com monte próprio não se larga, se houver outra jogada', () => {
  const own = B('b1', 7, false, ['4H', '3H']);
  // Só pode levantar o monte ou largar: é obrigado a levantar
  let ctx = { hand: ['7D', 'KS'], table: [own], player: 0 };
  no(ctx, { type: 'trail', card: 'KS' });
  no(ctx, { type: 'trail', card: '7D' });
  ok(ctx, { type: 'capture', card: '7D', take: ['b1'] });
  // Pode capturar outra coisa em vez do monte
  ctx = { hand: ['7D', 'KS'], table: [own, L('KC')], player: 0 };
  ok(ctx, { type: 'capture', card: 'KS', take: ['KC'] });
  no(ctx, { type: 'trail', card: 'KS' });
  // Pode preparar outro monte
  ctx = { hand: ['7D', '2S', '5C'], table: [own, L('3D')], player: 0 };
  ok(ctx, { type: 'build', card: '2S', take: ['3D'] });
  no(ctx, { type: 'trail', card: '2S' });
  // O monte de outro jogador não obriga a nada
  ok({ hand: ['7D', 'KS'], table: [own], player: 1 }, { type: 'trail', card: 'KS' });
  // Quem subir o monte passa a ser o dono
  const s = custom({ numPlayers: 2, target: 21 }, { turn: 1, hands: [['7D', 'KS', '2C'], ['AS', '8D', '3C']], deck: ['9C','9D'], table: [B('b1', 7, false, ['4H', '3H'])] });
  assert.ok(E.applyMove(s, 1, { type: 'raise', card: 'AS', build: 'b1' }).ok);
  assert.ok(E.applyMove(s, 0, { type: 'trail', card: 'KS' }).ok, 'o antigo dono já pode largar');
  assert.ok(!E.applyMove(s, 1, { type: 'trail', card: '3C' }).ok, 'o novo dono não pode');
  // Sem nenhuma alternativa (gastou a carta), pode largar: nunca há bloqueio
  ok({ hand: ['KS'], table: [own], player: 0 }, { type: 'trail', card: 'KS' });
  assert.deepStrictEqual(E.enumerateMoves({ hand: ['KS'], table: [own], player: 0 }).map(m => m.type), ['trail']);
  assert.ok(E.enumerateMoves({ hand: ['7D', 'KS'], table: [own], player: 0 }).every(m => m.type !== 'trail'));
});

test('quem joga um 7 leva os montes de 7; a carta do monte não se gasta noutra coisa', () => {
  const own = () => B('b1', 7, false, ['4H', '3H']);
  // O exemplo: 7 na mão, monte de 7 e 7 solto
  let ctx = { hand: ['7D', 'KS'], table: [own(), L('7C')], player: 0 };
  no(ctx, { type: 'capture', card: '7D', take: ['7C'] });
  ok(ctx, { type: 'capture', card: '7D', take: ['b1', '7C'] });
  ok(ctx, { type: 'capture', card: '7D', take: ['b1'] }); // a parte solta continua opcional
  assert.match(E.explainSelection(ctx, '7D', ['7C']), /levar também o monte/);
  // Vale também para montes de outros e somas
  no({ hand: ['7D'], table: [own(), L('4C'), L('3C')], player: 1 }, { type: 'capture', card: '7D', take: ['4C', '3C'] });
  ok({ hand: ['7D'], table: [own(), L('4C'), L('3C')], player: 1 }, { type: 'capture', card: '7D', take: ['4C', '3C', 'b1'] });
  // Um monte mais pequeno continua a ser opcional numa soma
  ok({ hand: ['9D'], table: [B('b2', 6), L('6C'), L('3C')], player: 0 }, { type: 'capture', card: '9D', take: ['6C', '3C'] });
  // A única carta que levanta o teu monte não pode ir para outro monte
  ctx = { hand: ['7D', '9S'], table: [own(), L('2C')], player: 0 };
  no(ctx, { type: 'build', card: '7D', take: ['2C'] });
  ok({ hand: ['7D', '7S', '9S'], table: [own(), L('2C')], player: 0 }, { type: 'build', card: '7D', take: ['2C'] }); // tem outro 7
  ok({ hand: ['7D', '9S'], table: [own(), L('2C')], player: 1 }, { type: 'build', card: '7D', take: ['2C'] }); // o monte não é dele
  assert.ok(E.enumerateMoves(ctx).every(m => m.type === 'capture'));
  // Subir o próprio monte com essa carta continua a poder ser
  ok({ hand: ['3D', '6S'], table: [B('b1', 3, false, ['AH', '2H'])], player: 0 }, { type: 'raise', card: '3D', build: 'b1' });
});

test('dois setes ficam trancados; 3 + 4 sobe para 9 com um 2', () => {
  const s = custom({ numPlayers: 2, target: 21 }, { turn: 0, hands: [['7S', '7D', 'KC'], ['2H', '9D', 'QC']], deck: ['3C', '4C'], table: [L('7C')] });
  assert.ok(E.applyMove(s, 0, { type: 'call', card: '7S', take: ['7C'] }).ok);
  const b = s.table[0];
  assert.ok(b.locked);
  assert.ok(!E.applyMove(s, 1, { type: 'raise', card: '2H', build: b.id }).ok, 'bloqueado');
  ok({ hand: ['2H', '9D'], table: [B('b2', 7, false, ['3S', '4S'])] }, { type: 'raise', card: '2H', build: 'b2' });
  no({ hand: ['2H', '9D'], table: [B('b2', 7, true, ['3S', '4S', '7S'])] }, { type: 'raise', card: '2H', build: 'b2' });
});

test('uma parceira não cria obrigação; montes de outros levantam-se', () => {
  const s = custom({ numPlayers: 4, teams: true, target: 21 }, { turn: 0, hands: [['4S', '7D'], ['7H', '2C'], ['KS', '9D'], ['QS', '8D']], deck: [], table: [L('3H')] });
  assert.ok(E.applyMove(s, 0, { type: 'build', card: '4S', take: ['3H'] }).ok);
  assert.ok(E.applyMove(s, 1, { type: 'capture', card: '7H', take: [s.table[0].id] }).ok, 'rouba');
  assert.strictEqual(s.captured[1].length, 3);
  assert.ok(E.applyMove(s, 2, { type: 'trail', card: 'KS' }).ok);
});

test('6 jogadores: equipas certas e pontos somados', () => {
  assert.deepStrictEqual([0,1,2,3,4,5].map(p => E.sideOf({ numPlayers: 6, teams: 3 }, p)), [0,1,2,0,1,2]);
  assert.deepStrictEqual([0,1,2,3,4,5].map(p => E.sideOf({ numPlayers: 6, teams: 2 }, p)), [0,1,0,1,0,1]);
  assert.strictEqual(E.numSides(E.normalizeConfig({ numPlayers: 6, teams: 3 })), 3);
  assert.strictEqual(E.numSides(E.normalizeConfig({ numPlayers: 6, teams: 2 })), 2);
  assert.strictEqual(E.numSides(E.normalizeConfig({ numPlayers: 6 })), 6);
  assert.strictEqual(E.normalizeConfig({ numPlayers: 5 }).numPlayers, 2, '5 não é aceite');
  assert.strictEqual(E.normalizeConfig({ numPlayers: 3, teams: 2 }).teams, 0);
  assert.strictEqual(E.sideOf({ numPlayers: 4, teams: true }, 3), 1, 'jogos guardados antigos');
});

test('não se pode jogar fora da vez', () => {
  const s = custom({ numPlayers: 2, target: 21 }, { turn: 0 });
  assert.ok(!E.applyMove(s, 1, { type: 'trail', card: s.hands[1][0] }).ok);
});

test('clareza conta, exceto na última jogada; sobras vão para o último a capturar', () => {
  const s = custom({ numPlayers: 2, target: 'round' }, { turn: 0, dealer: 1, hands: [['5S', '9D'], ['KH', '2C']], deck: [], table: [L('5H')] });
  assert.ok(E.applyMove(s, 0, { type: 'capture', card: '5S', take: ['5H'] }).ok);
  assert.strictEqual(s.sweeps[0], 1, 'clareza a meio');
  assert.ok(E.applyMove(s, 1, { type: 'trail', card: 'KH' }).ok);
  assert.ok(E.applyMove(s, 0, { type: 'trail', card: '9D' }).ok);
  assert.ok(E.applyMove(s, 1, { type: 'trail', card: '2C' }).ok);
  assert.strictEqual(s.phase, 'matchEnd');
  assert.ok(s.captured[0].includes('KH') && s.captured[0].includes('2C'), 'sobras');
  assert.deepStrictEqual(s.result.leftovers, ['KH', '9D', '2C']);

  const t = custom({ numPlayers: 2, target: 'round' }, { turn: 0, dealer: 1, hands: [['3S'], ['5H']], deck: [], table: [L('2H')] });
  E.applyMove(t, 0, { type: 'trail', card: '3S' });
  assert.ok(E.applyMove(t, 1, { type: 'capture', card: '5H', take: ['2H', '3S'] }).ok);
  assert.strictEqual(t.sweeps[1], 0, 'última jogada nunca é clareza');
  assert.strictEqual(t.result.score[1].pts.sweeps, 0);
});

test('montes sobrantes também vão para o último a capturar', () => {
  const s = custom({ numPlayers: 2, target: 'round' }, { turn: 0, dealer: 1, hands: [['2D'], ['3C']], deck: [], table: [B('b1', 7, false, ['4H', '3H']), L('2H')], lastCapturer: 1 });
  E.applyMove(s, 0, { type: 'capture', card: '2D', take: ['2H'] });
  E.applyMove(s, 1, { type: 'trail', card: '3C' });
  assert.ok(s.captured[0].includes('4H') && s.captured[0].includes('3C'));
});

test('pontuação: 11 pontos fixos sem empates', () => {
  const a = ['10D', '2S', 'AS', 'AH', 'AD', 'AC', '3S', '4S', '5S', '6S', '7S', '8S', '9S', '10S', 'JS'];
  const rest = E.ALL_CARDS.filter(c => !a.includes(c));
  const a2 = a.concat(rest.slice(0, 15));
  const b = rest.slice(15);
  const r = E.scoreRound([a2, b], [2, 0]);
  assert.deepStrictEqual(r[0].pts, { cards: 3, spades: 1, grande: 2, pequeno: 1, aces: 4, sweeps: 2 });
  assert.strictEqual(r[0].total, 13); assert.strictEqual(r[1].total, 0);
});

test('empates: cartas decide por espadas, espadas decide por cartas, e sem resposta ninguém leva', () => {
  const sp = n => ['2S','3S','4S','5S','6S','7S','8S','9S','10S','JS','QS','KS','AS'].slice(0, n);
  const fill = (arr, n, pool) => { while (arr.length < n) arr.push(pool.pop()); return arr; };
  const pool = E.ALL_CARDS.filter(c => E.SUIT[c] !== 'S');
  // 26-26 a dois: mais espadas leva os 3
  let a = fill(sp(8), 26, pool), b = fill(['JS','QS','KS','AS','10S'], 26, pool.slice());
  let r = E.scoreRound([a, b], [0, 0]);
  assert.strictEqual(r[0].pts.cards, 3); assert.strictEqual(r[1].pts.cards, 0);
  // três jogadores: A e B empatam em espadas, A tem mais cartas
  const p2 = E.ALL_CARDS.filter(c => E.SUIT[c] !== 'S');
  a = fill(sp(5), 20, p2); b = fill(['7S','8S','9S','10S','JS'], 15, p2); let c = fill(['QS','KS','AS'], 17, p2);
  r = E.scoreRound([a, b, c], [0, 0, 0]);
  assert.strictEqual(r[0].pts.spades, 1); assert.strictEqual(r[1].pts.spades, 0);
  // empate total entre os do topo: ninguém leva
  const p3 = E.ALL_CARDS.filter(c => E.SUIT[c] !== 'S');
  a = fill(sp(5), 18, p3); b = fill(['7S','8S','9S','10S','JS'], 18, p3); c = fill(['QS','KS','AS'], 16, p3);
  r = E.scoreRound([a, b, c], [0, 0, 0]);
  assert.deepStrictEqual(r.map(x => x.pts.cards + x.pts.spades), [0, 0, 0]);
  // empate só conta entre os do topo: C com mais espadas mas menos cartas não interfere nas cartas
  const p4 = E.ALL_CARDS.filter(c => E.SUIT[c] !== 'S');
  a = fill(sp(3), 18, p4); b = fill(['5S','6S'], 18, p4); c = fill(['7S','8S','9S','10S','JS','QS','KS','AS'], 16, p4);
  r = E.scoreRound([a, b, c], [0, 0, 0]);
  assert.strictEqual(r[0].pts.cards, 3); assert.strictEqual(r[2].pts.spades, 1);
});

function endWith(cfg, totals, result) {
  // força um fim de ronda com capturas escolhidas
  const s = custom(cfg, { turn: 0, dealer: cfg.numPlayers - 1, hands: new Array(cfg.numPlayers).fill(0).map(() => []), deck: [], table: [], totals });
  s.hands[0] = ['KS'];
  s.captured = result.captured; s.sweeps = result.sweeps; s.lastCapturer = null;
  E.applyMove(s, 0, { type: 'trail', card: 'KS' });
  return s;
}

test('fim de partida: meta, total mais alto, desempate por categorias e ronda extra', () => {
  // ninguém na meta: continua
  let s = endWith({ numPlayers: 2, target: 21 }, [3, 3], { captured: [['AS'], []], sweeps: [0, 0] });
  assert.strictEqual(s.phase, 'roundEnd');
  assert.ok(E.nextRound(s, seeded(9))); assert.strictEqual(s.phase, 'play'); assert.strictEqual(s.roundNo, 2);
  // dois passam: total mais alto
  s = endWith({ numPlayers: 2, target: 21 }, [24, 19], { captured: [['AS','AH'], ['AD','AC','2C','3C','4C','5C']], sweeps: [0, 0] });
  assert.strictEqual(s.phase, 'matchEnd');
  // total igual acima da meta: cartas decide
  const base = ['3D','4D'];
  s = custom({ numPlayers: 2, target: 21 }, { turn: 0, dealer: 1, hands: [['KS'], []], deck: [], table: [], totals: [21, 22] });
  s.captured = [['AS', 'AH', '3D', '4D', '5D'], ['10D']]; // A: 3+2 ases+1 espada=6... B: 2
  s.sweeps = [0, 3];
  E.applyMove(s, 0, { type: 'trail', card: 'KS' });
  // A: 21+ (cartas 3 + espadas 1 + ases 2)=27, B: 22+2+3=27
  assert.strictEqual(s.totals[0], 27); assert.strictEqual(s.totals[1], 27);
  assert.strictEqual(s.phase, 'matchEnd'); assert.deepStrictEqual(s.match.winners, [0]); assert.strictEqual(s.match.how, 'cards');
  // tudo igual: ronda extra
  s = custom({ numPlayers: 3, target: 'round' }, { turn: 0, dealer: 2, hands: [['KS'], [], []], deck: [], table: [], totals: [0, 0, 0] });
  s.captured = [[], [], []]; s.sweeps = [0, 0, 0];
  E.applyMove(s, 0, { type: 'trail', card: 'KS' });
  assert.strictEqual(s.phase, 'roundEnd'); assert.ok(s.match.extra);
});

test('partida curta acaba à primeira ronda e duplas somam em conjunto', () => {
  const s = E.createMatch({ numPlayers: 4, teams: true, target: 'round' }, seeded(4));
  assert.strictEqual(s.totals.length, 2);
  while (s.phase === 'play') {
    const p = s.turn;
    const moves = E.enumerateMoves({ hand: s.hands[p], table: s.table });
    const cap = moves.find(m => m.type === 'capture') || moves[0];
    assert.ok(E.applyMove(s, p, cap).ok);
  }
  assert.strictEqual(s.phase === 'matchEnd' || s.match.extra, true);
  assert.strictEqual(s.captured[0].length + s.captured[1].length, 52);
});

test('dador roda no sentido horário', () => {
  const s = E.createMatch({ numPlayers: 3, target: 21 }, seeded(2));
  const d = s.dealer; s.phase = 'roundEnd';
  E.nextRound(s, seeded(3));
  assert.strictEqual(s.dealer, (d + 1) % 3);
});

test('jogadas enumeradas são sempre legais; cartas conservam-se em 300 rondas', () => {
  const rng = seeded(77);
  for (let g = 0; g < 300; g++) {
    const n = [2, 3, 4, 6][g % 4];
    const s = E.createMatch({ numPlayers: n, teams: n >= 4 && g % 8 < 4 ? (n === 6 ? 3 : 2) : 0, target: 'round' }, rng);
    while (s.phase === 'play') {
      const p = s.turn;
      const ctx = { hand: s.hands[p], table: s.table, player: p };
      const ms = E.enumerateMoves(ctx);
      assert.ok(ms.length > 0);
      for (const m of ms) assert.ok(E.validateMove(ctx, m).ok, JSON.stringify(m) + E.validateMove(ctx, m).reason);
      const nonTrail = ms.filter(m => m.type !== 'trail');
      const m = nonTrail.length && rng() < .8 ? nonTrail[Math.floor(rng() * nonTrail.length)] : ms[0];
      assert.ok(E.applyMove(s, p, m).ok);
      const inPlay = s.hands.flat().length + s.deck.length + s.table.flatMap(t => t.k === 'b' ? t.cards : [t.id]).length + s.captured.flat().length;
      assert.strictEqual(inPlay, 52);
      for (const b of s.table) if (b.k === 'b') assert.ok(b.value >= 1 && b.value <= 10);
    }
    const pts = s.result.score.reduce((a, r) => a + r.total, 0) - s.sweeps.reduce((a, b) => a + b, 0);
    assert.ok(pts <= 11 && pts >= 7, 'pontos fixos ' + pts); // sem maioria podem faltar 3+1
  }
});

test('histórico: regista distribuições e jogadas, e recomeça em cada ronda', () => {
  const s = E.createMatch({ numPlayers: 2, target: 21 }, seeded(21));
  assert.deepStrictEqual(s.history, [{ type: 'deal', no: 1, deck: 40 }]);
  let plays = 0;
  while (s.phase === 'play') { E.applyMove(s, s.turn, { type: 'trail', card: s.hands[s.turn][0] }); plays++; }
  const deals = s.history.filter(h => h.type === 'deal');
  assert.deepStrictEqual(deals.map(d => d.no), [1, 2, 3, 4, 5, 6]);
  assert.strictEqual(deals[5].deck, 0);
  assert.strictEqual(s.history.length, 6 + plays);
  // a distribuição vem depois da jogada que esvaziou as mãos
  assert.strictEqual(s.history[9].type, 'deal');
  s.phase = 'roundEnd'; E.nextRound(s, seeded(1));
  assert.strictEqual(s.history.length, 1);
  for (const n of [3, 4]) {
    const t = E.createMatch({ numPlayers: n, target: 21 }, seeded(n));
    while (t.phase === 'play') E.applyMove(t, t.turn, { type: 'trail', card: t.hands[t.turn][0] });
    const d = t.history.filter(h => h.type === 'deal');
    assert.strictEqual(d[d.length - 1].no, n === 3 ? 4 : 3);
  }
});

test('o histórico público não revela cartas escondidas, ao longo de toda a ronda', () => {
  const s = E.createMatch({ numPlayers: 3, target: 'round' }, seeded(31));
  while (s.phase === 'play') {
    const v = E.publicView(s, s.turn);
    const txt = JSON.stringify({ h: v.history, l: v.lastMove });
    const hidden = s.hands.flat().concat(s.deck);
    for (const c of hidden) assert.ok(!txt.includes(`"${c}"`), c);
    const ms = E.enumerateMoves({ hand: s.hands[s.turn], table: s.table });
    E.applyMove(s, s.turn, ms.find(m => m.type !== 'trail') || ms[0]);
  }
});

test('jogos guardados sem histórico continuam a funcionar', () => {
  const s = E.createMatch({ numPlayers: 2, target: 21 }, seeded(5));
  delete s.history;
  assert.ok(E.applyMove(s, s.turn, { type: 'trail', card: s.hands[s.turn][0] }).ok);
  assert.strictEqual(s.history.length, 1);
  delete s.history;
  assert.deepStrictEqual(E.publicView(s, 0).history, []);
});

test('actionsFor oferece as jogadas certas para a seleção', () => {
  const ctx = { hand: ['3S', '6D', '3C'], table: [L('3H'), B('b1', 3)] };
  const types = (card, sel) => E.actionsFor(ctx, card, sel).map(a => a.move.type).sort();
  assert.deepStrictEqual(types('3S', []), ['trail']);
  assert.deepStrictEqual(types('3S', ['3H']), ['build', 'call']); // levar o 3 solto obriga a levar o monte de 3
  assert.deepStrictEqual(types('3S', ['3H', 'b1']), ['capture', 'double']);
  assert.deepStrictEqual(types('3S', ['b1']), ['capture', 'double', 'raise']);
  assert.deepStrictEqual(types('6D', ['3H', 'b1']), ['capture']);
});

test('a vista pública não revela mãos alheias nem o baralho', () => {
  const s = E.createMatch({ numPlayers: 3, target: 21 }, seeded(8));
  const v = JSON.stringify(E.publicView(s, 0));
  for (const c of s.hands[1].concat(s.hands[2], s.deck)) assert.ok(!v.includes(`"${c}"`), c);
});
