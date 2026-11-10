// Texto das instruções do Gringo. c('KH') desenha uma carta de exemplo.
window.GringoRules = function (c) {
  const ex = (cards, text) => `<div class="exemplo"><div class="exemplo-cartas">${cards}</div><p>${text}</p></div>`;
  return `
<nav class="indice" aria-label="Secções">
  <a class="btn peq" href="#g-objetivo">Objetivo</a>
  <a class="btn peq" href="#g-inicio">Início</a>
  <a class="btn peq" href="#g-valores">Valores</a>
  <a class="btn peq" href="#g-vez">A tua vez</a>
  <a class="btn peq" href="#g-poderes">Poderes</a>
  <a class="btn peq" href="#g-rapida">Jogada Rápida</a>
  <a class="btn peq" href="#g-fim">Fim</a>
  <a class="btn peq" href="#g-aqui">Como jogar aqui</a>
</nav>

<section id="g-objetivo">
<h3>Objetivo</h3>
<p>Acabar a partida com o menor número de pontos. O Gringo é um jogo de memória, dedução, rapidez e alguma sorte.</p>
<p>Joga-se de 2 a 8 jogadores, com 52 cartas e 2 Jokers. A vez passa no sentido dos ponteiros do relógio.</p>
</section>

<section id="g-inicio">
<h3>Início</h3>
<ul>
  <li>Cada jogador recebe 4 cartas viradas para baixo, numeradas de 1 a 4.</li>
  <li>Antes de começar, cada um espreita exatamente duas das suas cartas e tem de as memorizar. Depois não as volta a ver sem usar poderes.</li>
  <li>A partida começa quando todos disserem que estão prontos. Na primeira partida começa alguém à sorte; nas seguintes, quem ganhou.</li>
  <li>Podes mudar as tuas cartas de lugar quando quiseres, exceto enquanto alguém usa um poder. O número vai com a carta, e os outros veem o movimento.</li>
</ul>
</section>

<section id="g-valores">
<h3>Valores das cartas</h3>
<div class="quadro-wrap"><table class="quadro">
<thead><tr><th>Carta</th><th>Pontos</th></tr></thead>
<tbody>
<tr><td>Rei vermelho (Copas ou Ouros)</td><td>-3</td></tr>
<tr><td>Joker</td><td>0</td></tr>
<tr><td>Ás</td><td>1</td></tr>
<tr><td>2 a 10</td><td>o número</td></tr>
<tr><td>Conde (Valete)</td><td>11</td></tr>
<tr><td>Dama</td><td>12</td></tr>
<tr><td>Rei preto (Espadas ou Paus)</td><td>13</td></tr>
</tbody></table></div>
${ex(c('KH') + c('JK1') + c('AS'), 'Estas três cartas somam -2 pontos.')}
</section>

<section id="g-vez">
<h3>A tua vez</h3>
<p>No início da tua vez escolhes uma de duas coisas: comprar uma carta do baralho, ou dizer Gringo.</p>
<p>A carta comprada só tu a vês. Depois:</p>
<ul>
  <li><b>Trocar:</b> pões a carta comprada no lugar de uma das tuas, mesmo sem saberes qual é. A tua vai para o lixo, virada para cima.</li>
  <li><b>Deitar fora:</b> pões a carta comprada diretamente no lixo.</li>
</ul>
<p>Quando o baralho acaba, as cartas do lixo são baralhadas e voltam a ser baralho. A última carta posta no lixo fica na mesa.</p>
</section>

<section id="g-poderes">
<h3>Poderes</h3>
<p>Quando uma carta com poder vai para o lixo, quem a pôs lá pode usar o poder. Vale para a carta comprada, para a carta tirada da mão e para a Jogada Rápida. Usar é opcional.</p>
<h4>Conde (Valete): troca cega</h4>
<p>Trocas uma carta tua com uma de um adversário, ou duas cartas de dois adversários. Ninguém vê as cartas trocadas.</p>
<h4>Dama: espreitar</h4>
<p>Vês uma das tuas cartas, sem os outros saberem qual é.</p>
<h4>Rei: inspecionar e trocar</h4>
<p>Vês uma carta de um adversário. Depois podes trocá-la por uma tua, se quiseres. Os Reis vermelhos também têm este poder.</p>
<p>Se houver vários poderes, usam-se pela ordem em que as cartas caíram no lixo.</p>
</section>

<section id="g-rapida">
<h3>Jogada Rápida</h3>
<p>Quando cai uma carta no lixo, qualquer jogador, mesmo fora da vez, pode atirar para cima uma carta sua igual (o mesmo número ou figura; a cor não conta). Pode fazê-lo até o jogador seguinte jogar, mesmo enquanto alguém usa um poder.</p>
<ul>
  <li><b>Certa:</b> a carta sai da tua mão. Se tiver poder, podes usá-lo.</li>
  <li><b>Tarde:</b> se a tua carta era igual mas alguém foi mais rápido, ela mostra-se e volta para a tua mão, sem castigo. Ganha quem chega primeiro ao servidor.</li>
  <li><b>Errada:</b> a carta mostra-se a todos e volta para a tua mão, e ainda recebes uma carta extra do baralho, sem a veres.</li>
</ul>
${ex(c('7C') + c('7H'), 'Saiu um 7 de Paus. Se tiveres a certeza de que a tua carta 2 é um 7, atira-a.')}
</section>

<section id="g-fim">
<h3>Fim da partida</h3>
<ul>
  <li><b>Gringo:</b> no início da tua vez, em vez de comprar, dizes Gringo. Cada um dos outros joga mais uma vez, e tu já não jogas.</li>
  <li><b>Gringo automático:</b> se ficares sem cartas com Jogadas Rápidas, é Gringo logo. A última volta começa no jogador seguinte, e cada um dos outros joga mais uma vez.</li>
  <li>As cartas de quem disse Gringo podem continuar a ser trocadas pelos outros.</li>
  <li>No fim da última volta há 3 segundos de última oportunidade para Jogadas Rápidas. Depois, todas as cartas são reveladas.</li>
  <li>Ganha quem tiver menos pontos. Empate é empate. Não há castigo para quem diz Gringo e não ganha.</li>
</ul>
</section>

<section id="g-aqui">
<h3>Como jogar aqui</h3>
<ul>
  <li>No início, toca em duas cartas tuas e em <b>Espreitar</b>. Memoriza-as e carrega em <b>Estou pronto</b>.</li>
  <li>Na tua vez, carrega em <b>Comprar</b> ou <b>Gringo</b>. Com a carta comprada, toca numa carta tua para trocar, ou carrega em <b>Deitar fora</b>.</li>
  <li>Para fazer uma Jogada Rápida, toca numa carta tua e carrega em <b>Jogada Rápida</b>.</li>
  <li>Para mudar uma carta de lugar, toca nela e usa as setas.</li>
  <li>Nos poderes, toca nas cartas que queres usar, tuas ou dos adversários, e confirma.</li>
  <li>O botão <b>Histórico</b> mostra tudo o que aconteceu, com os números das cartas.</li>
</ul>
</section>`;
};
