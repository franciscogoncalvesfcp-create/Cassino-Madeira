// Desenho de cartas de baralho francês, partilhado por todos os jogos de cartas.
// Uma carta é escrita como valor + naipe: 'AS' (Ás de Espadas), '10D', 'KH'.
(function (root) {
  'use strict';
  const SUIT_NAME = { S: 'Espadas', H: 'Copas', D: 'Ouros', C: 'Paus' };
  const RANK_NAME = { A: 'Ás', J: 'Valete', Q: 'Dama', K: 'Rei' };
  const PIPS = {
    1: [[50, 70, 1]],
    2: [[50, 30], [50, 110, 0, 1]],
    3: [[50, 30], [50, 70], [50, 110, 0, 1]],
    4: [[32, 30], [68, 30], [32, 110, 0, 1], [68, 110, 0, 1]],
    5: [[32, 30], [68, 30], [50, 70], [32, 110, 0, 1], [68, 110, 0, 1]],
    6: [[32, 30], [68, 30], [32, 70], [68, 70], [32, 110, 0, 1], [68, 110, 0, 1]],
    7: [[32, 30], [68, 30], [50, 50], [32, 70], [68, 70], [32, 110, 0, 1], [68, 110, 0, 1]],
    8: [[32, 30], [68, 30], [50, 50], [32, 70], [68, 70], [50, 90, 0, 1], [32, 110, 0, 1], [68, 110, 0, 1]],
    9: [[32, 28], [68, 28], [32, 55], [68, 55], [50, 70], [32, 85, 0, 1], [68, 85, 0, 1], [32, 112, 0, 1], [68, 112, 0, 1]],
    10: [[32, 28], [68, 28], [50, 42], [32, 55], [68, 55], [32, 85, 0, 1], [68, 85, 0, 1], [50, 98, 0, 1], [32, 112, 0, 1], [68, 112, 0, 1]],
  };
  function parse(id) {
    const rank = id.slice(0, -1), suit = id.slice(-1);
    const value = rank === 'A' ? 1 : /^\d+$/.test(rank) ? +rank : null;
    return { rank, suit, value };
  }

  // opts: { prefs, esc, mark(id) -> true para pôr a pinta das cartas que dão pontos }
  function create(opts) {
    const { prefs, esc } = opts;
    const mark = opts.mark || (() => false);
    const cache = {};
    function label(id) { const c = parse(id); return (RANK_NAME[c.rank] || c.rank) + ' de ' + SUIT_NAME[c.suit]; }
    function suitColor(s) {
      if (prefs.colors4) return { S: '#1b1f24', H: '#c42417', D: '#1658b8', C: '#137a3d' }[s];
      return s === 'H' || s === 'D' ? '#c42417' : '#1b1f24';
    }
    function svg(id) {
      const { rank: r, suit: s, value: v } = parse(id), col = suitColor(s);
      const use = (x, y, size, flip) => `<use href="#s-${s}" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}"${flip ? ` transform="rotate(180 ${x} ${y})"` : ''}/>`;
      const corner = `<text x="12.500" y="24" text-anchor="middle" font-family="Zilla Slab,Rockwell,Georgia,serif" font-weight="700" font-size="${r === '10' ? 19 : 22}" ${r === '10' ? 'letter-spacing="-1.500"' : ''}>${r}</text>${use(12.5, 35, 14)}`;
      let mid = '';
      if (v !== null) {
        mid = PIPS[v].map(([x, y, big, flip]) => use(x, y, big ? 44 : v >= 9 ? 19 : 22, flip)).join('');
      } else {
        mid = `<rect x="24" y="24" width="52" height="92" fill="none" stroke="${col}" stroke-width="1.500"/>
        <rect x="24" y="24" width="52" height="7" fill="#f4bc23"/><rect x="24" y="31" width="52" height="4" fill="#cf3b22"/>
        <rect x="24" y="105" width="52" height="4" fill="#cf3b22"/><rect x="24" y="109" width="52" height="7" fill="#f4bc23"/>
        <text x="50" y="82" text-anchor="middle" font-family="Alfa Slab One,Rockwell,Georgia,serif" font-size="38">${r}</text>
        ${use(50, 96, 14)}${use(50, 47, 14, true)}`;
      }
      return `<svg viewBox="0 0 100 140" fill="${col}" aria-hidden="true">${corner}<g transform="rotate(180 50 70)">${corner}</g>${mid}</svg>`;
    }
    function card(id, extra) {
      const k = id + (prefs.colors4 ? '4' : '');
      const s = cache[k] || (cache[k] = svg(id));
      return `<span class="card" data-card="${id}" ${extra || ''} role="img" aria-label="${esc(label(id))}">${s}${mark(id) ? '<i class="marca-pts"></i>' : ''}</span>`;
    }
    const back = extra => `<span class="card costas" ${extra || ''}></span>`;
    function mini(id) {
      const s = parse(id).suit;
      const cls = prefs.colors4 ? { H: 'verm', D: 'azul', C: 'verde', S: '' }[s] : (s === 'H' || s === 'D' ? 'verm' : '');
      return `<span class="mini ${cls}" aria-label="${esc(label(id))}">${parse(id).rank}<svg viewBox="0 0 24 24"><use href="#s-${s}"/></svg></span>`;
    }
    function clearCache() { for (const k in cache) delete cache[k]; }
    return { card, back, mini, label, clearCache, parse };
  }
  root.PlatformCards = { create, parse };
})(typeof globalThis !== 'undefined' ? globalThis : this);
