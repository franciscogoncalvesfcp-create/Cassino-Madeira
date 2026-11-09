// Texto das instruções do jogo. c('10D') desenha uma carta de exemplo.
window.CassinoRules = function (c, monte) {
  const ex = (cards, text) => `<div class="exemplo"><div class="exemplo-cartas">${cards}</div><p>${text}</p></div>`;
  const seta = '<span aria-hidden="true">+</span>';
  const igual = '<span aria-hidden="true">=</span>';
  return `
<nav class="indice" aria-label="Secções">
  <a class="btn peq" href="#r-objetivo">Objetivo</a>
  <a class="btn peq" href="#r-jogada">A jogada</a>
  <a class="btn peq" href="#r-montes">Montes</a>
  <a class="btn peq" href="#r-fim">Fim da ronda</a>
  <a class="btn peq" href="#r-pontos">Pontos</a>
  <a class="btn peq" href="#r-vitoria">Vitória</a>
  <a class="btn peq" href="#r-interface">Como jogar aqui</a>
</nav>

<section id="r-objetivo">
<h3>Objetivo</h3>
<p>O Cassino joga-se com 52 cartas, sem jokers. Capturas cartas da mesa para ganhar pontos. Podes jogar a 2, 3, 4 ou 6, todos contra todos. Em equipas, joga-se a 4 em duplas, ou a 6 em duplas ou em trios.</p>
<p>A partida pode durar uma só ronda, ou ir até 21 ou 32 pontos.</p>
<ul>
  <li>O Ás vale 1 e as cartas de 2 a 10 valem o seu número.</li>
  <li>Valete, Dama e Rei não têm valor. Só apanham figuras iguais e nunca entram em somas nem em montes.</li>
</ul>
<p>Cada jogador recebe 4 cartas e 4 ficam viradas na mesa. Quando todos ficam sem cartas, recebem mais 4, mas a mesa não recebe mais nenhuma. Abre o jogador à esquerda do dador, e o dador muda a cada ronda.</p>
</section>

<section id="r-jogada">
<h3>A jogada</h3>
<p>Na tua vez, jogas exatamente uma carta. Com ela podes capturar, empilhar ou largar.</p>
<h4>Capturar</h4>
<p>A carta jogada leva as cartas do mesmo valor, os grupos de cartas soltas que somem esse valor, e os montes desse valor. Cada carta só serve num grupo. Podes levar só uma parte, e capturar não é obrigatório, mas se jogares uma carta para capturar, tens de levar todos os montes desse valor.</p>
${ex(c('8S') + seta + c('8D') + c('6C') + c('2H') + c('5S') + c('3D'), 'O 8 leva tudo: o 8, o grupo 6 + 2 e o grupo 5 + 3.')}
<p>Um monte não trancado conta como uma carta do seu valor nas somas.</p>
${ex(c('9S') + seta + monte(6, false, ['4H', '2D']) + c('3C'), 'O 9 levanta o monte de 6 e o 3 solto.')}
<p>As figuras só apanham figuras iguais: uma de cada vez, ou as três se estiverem todas na mesa. Nunca duas, para não ficar uma figura sozinha até ao fim. Não apanham montes.</p>
<h4>Largar</h4>
<p>Podes pousar uma carta solta na mesa, mesmo que pudesses capturar. A exceção é teres um monte teu na mesa: aí não podes largar enquanto houver outra jogada.</p>
<ul>
  <li>Podes levantar o monte, capturar outras cartas ou preparar outro monte.</li>
  <li>Se a única alternativa a largar for levantar o monte, és obrigado a levantá-lo.</li>
</ul>
</section>

<section id="r-montes">
<h3>Montes</h3>
<p>Para fazer ou alterar um monte, tens de ficar na mão, depois de jogar, com outra carta do valor final. Um monte usa sempre uma carta da tua mão, e nunca passa de 10.</p>
<p>Até ser levantado, qualquer jogador pode levar, subir ou duplicar um monte, por isso quem empilha arrisca-se a ficar sem ele. Um monte é teu se foste o último a fazê-lo, subi-lo ou duplicá-lo. Se alguém o subir ou duplicar, deixa de ser teu. A última carta que levanta um monte teu só serve para o levantar.</p>
<h4>Monte simples</h4>
<p>Jogas uma carta sobre uma ou mais cartas soltas.</p>
${ex(c('4S') + seta + c('3H') + igual + monte(7, false, ['3H', '4S']), 'Tens de ter um 7 na mão. O monte fica a valer 7.')}
<h4>Subir</h4>
<p>Juntas uma carta da mão a um monte não trancado, e tens de ter uma carta do novo valor. Só se usa a carta da mão, sem cartas soltas.</p>
${ex(monte(7, false, ['3H', '4S']) + seta + c('AC') + igual + monte(8, false, ['3H', '4S', 'AC']), 'Tens de ter um 8 na mão, mesmo que o monte tenha sido feito por outro jogador.')}
<h4>Monte duplo</h4>
<p>Juntas a um monte outro grupo do mesmo valor, feito com a tua carta mais zero ou mais cartas soltas. O monte fica trancado, e precisas de ter outra carta desse valor na mão.</p>
${ex(monte(7, false, ['3H', '4S']) + seta + c('5D') + c('2C') + igual + monte(7, true, ['3H', '4S', '2C', '5D']), 'O 5 da mão e o 2 solto valem 7. Também podias jogar um 7 diretamente sobre o monte, se tivesses outro.')}
<h4>Monte trancado de uma só vez</h4>
<p>Na mesma jogada, podes juntar a tua carta a vários grupos soltos do mesmo valor. Precisas de ficar com outra carta desse valor na mão.</p>
${ex(c('5S') + seta + c('3H') + c('2D') + c('5C') + igual + monte(5, true, ['3H', '2D', '5C', '5S']), 'Tens dois 5 na mão: jogas um e levantas o monte com o outro na próxima vez. Também podes juntar assim vários grupos a um monte que já esteja na mesa.')}
<h4>Chamar</h4>
<p>Jogas uma carta sobre cartas soltas do mesmo valor, e tens de ficar com outra igual na mão. Cria um monte trancado.</p>
${ex(c('6S') + seta + c('6H') + igual + monte(6, true, ['6H', '6S']), 'Tens de ter outro 6 na mão.')}
<h4>Monte trancado</h4>
<p>Não pode ser subido, nem entra em somas: dois 7 empilhados ficam sempre 7, enquanto um monte de 3 + 4 ainda pode subir para 9 com um 2. Só se levanta com uma carta do valor do monte. Pode continuar a receber grupos do mesmo valor.</p>
</section>

<section id="r-fim">
<h3>Fim da ronda</h3>
<ul>
  <li>A ronda fecha com a última carta da última distribuição.</li>
  <li><b>Sobras:</b> tudo o que ficar na mesa, incluindo montes, vai para o último jogador ou equipa que capturou.</li>
  <li><b>Clareza:</b> uma captura que deixa a mesa totalmente vazia vale 1 ponto. A última jogada da ronda nunca conta como clareza.</li>
</ul>
</section>

<section id="r-pontos">
<h3>Pontos de cada ronda</h3>
<div class="quadro-wrap"><table class="quadro">
<thead><tr><th>Categoria</th><th>Pontos</th></tr></thead>
<tbody>
<tr><td>Mais cartas</td><td>3</td></tr>
<tr><td>Mais espadas</td><td>1</td></tr>
<tr><td>Cassino Grande (10 de Ouros)</td><td>2</td></tr>
<tr><td>Cassino Pequeno (2 de Espadas)</td><td>1</td></tr>
<tr><td>Cada Ás</td><td>1</td></tr>
<tr><td>Cada clareza</td><td>1</td></tr>
</tbody></table></div>
${ex(c('10D') + c('2S') + c('AH'), 'As cartas que dão pontos diretamente têm uma pinta amarela no canto, se tiveres as ajudas ligadas.')}
<p>Se houver empate em cartas, os 3 pontos vão para quem, entre os empatados, tiver mais espadas. Se houver empate em espadas, o ponto vai para quem, entre os empatados, tiver mais cartas. Se continuarem empatados, ninguém leva esse ponto.</p>
</section>

<section id="r-vitoria">
<h3>Quem ganha</h3>
<p>A partida acaba na ronda em que alguém chega à meta, ou na primeira ronda, na partida curta. Se mais do que um passar a meta, ganha o total mais alto.</p>
<p>Se os totais forem iguais, compara-se a última ronda por esta ordem: cartas, espadas, Cassino Grande, Cassino Pequeno, ases e clarezas. Ganha quem tiver mais pontos na primeira categoria em que houver diferença. Se tudo for igual, joga-se mais uma ronda, com todos, e os pontos somam ao total.</p>
</section>

<section id="r-interface">
<h3>Como jogar aqui</h3>
<ul>
  <li>No lobby online, cada um pode mudar de equipa, e quem criou a sala pode baralhar as equipas, mudar o modo de jogo e desligar as ajudas, o histórico ou os avisos para todos.</li>
  <li>Toca numa carta da tua mão. As cartas da mesa que podes levar ficam com um contorno tracejado.</li>
  <li>Usa <b>Levar tudo</b> para levar o máximo de uma vez, ou toca nas cartas da mesa que queres usar.</li>
  <li>Os botões mudam conforme a seleção: levar, empilhar, chamar, subir ou duplicar. Se nada servir, é dito porquê.</li>
  <li>Sem cartas da mesa selecionadas, o botão é <b>Largar</b>.</li>
  <li>Um monte tem um selo com o seu valor. O cadeado indica que está trancado.</li>
  <li>O botão <b>Histórico</b> mostra todas as jogadas da ronda.</li>
  <li>Junto ao baralho aparece um aviso quando falta só uma distribuição e outro quando saem as últimas cartas, com o nome de quem fica com as sobras nesse momento.</li>
</ul>
</section>`;
};
