// Nomes dos bots, partilhados por todos os jogos. Cada partida sorteia os seus.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PlatformNames = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const NAMES = ['Zita', 'Agostinho', 'Conceição', 'Mestre Gil', 'Lurdes', 'Nélio', 'Gorete', 'Firmino', 'Rosário', 'Bernardete',
    'Duarte', 'Ilídio', 'Odete', 'Jacinto', 'Fátima', 'Tó Zé', 'Albertina', 'Gualberto', 'Natércia', 'Silvino',
    'Manuela', 'Abel', 'Graça', 'Teodoro', 'Celeste', 'Martinho', 'Dulce', 'Ezequiel', 'Aurora', 'Leonel'];
  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function pickNames(n, rng, taken) {
    const used = new Set(taken || []);
    return shuffle(NAMES.filter(x => !used.has(x)), rng || Math.random).slice(0, n);
  }
  // Equipas: o lugar i pertence à equipa i % número de equipas. `true` vem de salas antigas (2 equipas).
  function numTeams(config) { return config.teams === true ? 2 : (config.teams || 0); }
  return { NAMES, pickNames, shuffle, numTeams };
});
