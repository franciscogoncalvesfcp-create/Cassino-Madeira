// Ficheiros do cliente, pela ordem em que a página os carrega.
// O servidor só serve estes, e a versão offline junta-os por esta ordem.
module.exports = {
  styles: ['core/client/styles.css'],
  scripts: [
    'core/shared/names.js',
    'core/client/cards.js',
    'games/cassino/rules.js',
    'games/cassino/bots.js',
    'games/cassino/module.js',
    'games/cassino/instructions.js',
    'games/cassino/table.js',
    'games/gringo/rules.js',
    'games/gringo/bots.js',
    'games/gringo/module.js',
    'games/gringo/instructions.js',
    'games/gringo/table.js',
    'core/client/platform.js',
  ],
};
