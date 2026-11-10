// Jogos disponíveis na plataforma. Um jogo novo só entra depois de passar o teste de contrato
// (test/contract/contract.test.js).
module.exports = {
  cassino: require('../../games/cassino/module.js'),
  gringo: require('../../games/gringo/module.js'),
};
