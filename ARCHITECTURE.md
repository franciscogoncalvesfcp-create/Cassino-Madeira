# Arquitetura

Documento vivo com o que existe e com as decisões da plataforma de jogos. Quem retomar o projeto deve ler isto primeiro.

- **Estado:** Etapa 3 aprovada e no site oficial (10/11/2026). A versão anterior está no branch `cassino-v1`. Próxima: Etapa 4 (Gringo).
- **Última atualização:** 10/11/2026, a partir do commit `4423447` do `main`.

## 1. Resumo

O site do Cassino da Madeira já tem a maior parte do que a plataforma precisa:

- salas com código, link de convite e password;
- ligação em tempo real e reconexão;
- conversa;
- bots;
- validação de todas as jogadas no servidor, sem revelar as cartas de ninguém.

As regras do jogo já estão em código puro e testado. O que falta é separar o que é "do Cassino" do que é "da plataforma": hoje essa separação existe nas regras, só em parte no servidor e quase nada na interface.

**Decisão:** reaproveitar esta base. O núcleo sai do código atual e o Cassino passa a ser o primeiro módulo (ver secção 9).

## 2. Tecnologia e alojamento

| Parte | O que se usa |
|---|---|
| Servidor | Node 20 ou mais recente, só com o módulo `http` nativo. Não tem dependências nem `npm install`. |
| Tempo real | Server-Sent Events (`EventSource`): o servidor envia o estado ao cliente. O cliente envia as jogadas por pedidos `POST`. Não usa WebSockets. |
| Cliente | HTML, CSS e JavaScript simples, sem framework nem passo de compilação. É o próprio servidor que serve os ficheiros. As letras vêm do Google Fonts. |
| Versão offline | `scripts/build-offline.js` junta tudo num só HTML, publicado como página no Claude. Só tem o modo contra bots. |
| Alojamento | Render, plano gratuito, configurado pelo Blueprint em `render.yaml`. Cada push para o `main` publica sozinho (Auto-Deploy). |
| Testes | `node:test`, com `npm test` (59 testes). `npm run tournament` mede a força dos bots. |

Limites do plano gratuito do Render que afetam o desenho:

- o serviço adormece ao fim de 15 minutos sem pedidos e demora cerca de 1 minuto a acordar;
- há 750 horas grátis por mês, partilhadas por todos os serviços da conta (um serviço adormecido não as gasta);
- não há disco permanente: cada reinício, adormecimento ou publicação apaga as salas.

## 3. Ficheiros

| Ficheiro | Linhas | Papel | Específico do Cassino? |
|---|---|---|---|
| `shared/engine.js` | 627 | Regras, pontuação, fim de partida e vistas por jogador | Sim, todo |
| `shared/bots.js` | 193 | Níveis Fácil, Médio e Difícil, e nomes dos bots | Sim, exceto os nomes |
| `server/server.js` | 506 | Salas, lugares, equipas, tokens, tempo real, temporizadores e limites | Cerca de 80% genérico |
| `client/app.js` | 1227 | Toda a interface | Cerca de metade |
| `client/rules.js` | 112 | Texto das instruções | Sim |
| `client/styles.css` | 381 | Aspeto, incluindo cartas e mesa | Misturado |
| `client/index.html` | 27 | Esqueleto da página | Não |
| `test/*.js` | 810 | Testes das regras, dos bots e do servidor | Sobretudo do Cassino |
| `scripts/build-offline.js` | 24 | Gera a página offline | Do Cassino |

## 4. Salas e tempo real

**Entrar numa sala**

1. `POST /api/rooms` cria a sala e devolve um código de 5 letras e um token secreto para quem a criou.
2. `POST /api/rooms/CÓDIGO/join` deixa entrar outro jogador, com a password se a sala for privada. A password fica guardada com `scrypt` e há limite de tentativas.
3. `GET /api/rooms/CÓDIGO/stream?token=…` abre a ligação em tempo real. O servidor envia a cada jogador o lobby e a sua vista do jogo sempre que algo muda.
4. `POST /api/rooms/CÓDIGO/action` recebe todas as ações: jogada, conversa, mudar de lugar ou de equipa, bots, começar, sair e definições.

**Onde vive o estado:** num `Map` em memória no servidor. Uma sala apaga-se ao fim de 10 minutos sem pessoas ligadas, e todas se perdem quando o servidor reinicia.

**Reconexão**

- O token fica guardado no navegador. Ao recarregar a página, o jogo volta sozinho à sala.
- O `EventSource` volta a ligar sozinho. Se o navegador desistir, o cliente confirma com `/check` e tenta de novo de 2 em 2 segundos.
- Se um jogador perder a ligação na sua vez, espera-se 30 segundos e depois um bot Médio joga por ele até voltar.
- Se alguém sair a meio da partida, um bot fica com o lugar até ao fim.
- Se o anfitrião estiver desligado mais de 20 segundos, a função passa a outro jogador.

**Outros temporizadores:** tempo por jogada (30 s, 60 s ou sem limite), pausa para a animação da distribuição e passagem automática para a ronda seguinte ao fim de 45 segundos.

## 5. Regras e interface: quão misturadas estão

**Regras (bem separadas).** `shared/engine.js` é código puro, sem página nem rede, e corre igual no navegador e no servidor. O ciclo é:

- `createMatch(config, rng)` começa uma partida;
- `applyMove(estado, jogador, jogada)` valida e aplica uma jogada;
- `publicView(estado, jogador)` devolve o que esse jogador pode ver;
- `botView(estado, jogador)` devolve o que um bot pode saber;
- `nextRound(estado, rng)` passa à ronda seguinte.

Os bots só recebem a `botView` e escolhem com `choose(nível, vista, rng)`.

**Servidor (quase genérico).** Conhece alguns pormenores do Cassino que vão ter de passar para o módulo:

- os modos de jogo (2, 3, 4 ou 6 jogadores, duplas e trios);
- as fases `play`, `roundEnd` e `matchEnd`, e o campo `turn`;
- o histórico com entradas `deal`, que decide a pausa da animação;
- o bot que joga por quem está desligado;
- o corte do histórico quando o anfitrião o desliga.

**Interface (muito misturada).** `client/app.js` junta num só ficheiro:

- coisas da plataforma: navegação, menu, definições, som, lobby, conversa, ligação e reconexão;
- coisas do Cassino: desenho das cartas, mesa e montes, seleção, botões de jogada, animações de captura e de distribuição, histórico, quadro de pontos e pódio.

## 6. O servidor valida e esconde?

**Sim, em tudo.**

- Todas as jogadas passam por `applyMove` no servidor. O cliente só propõe; se a jogada for ilegal, o servidor recusa e explica porquê.
- `publicView` só inclui a mão do próprio jogador. Do baralho segue só a contagem, e o histórico só tem cartas que estiveram à vista. Os testes percorrem rondas inteiras e confirmam que nenhuma carta escondida sai do servidor.
- Os bots também não veem cartas escondidas. Há um teste que muda as cartas escondidas e confirma que o bot Difícil decide igual.
- Há ainda limites de pedidos por endereço, de tamanho dos pedidos e de tentativas de password, além de política de segurança no navegador (CSP) e limpeza de nomes e mensagens.

Pontos fracos conhecidos:

- o estado em memória perde-se num reinício;
- o token vai no endereço da ligação em tempo real, porque o `EventSource` não aceita cabeçalhos, e por isso aparece nos registos do Render. O risco é baixo, mas há solução se for preciso.

## 7. O que se reaproveita e o que dificulta

**Reaproveita-se quase tal e qual**

- O padrão do motor: regras puras, uma vista por jogador, uma vista para os bots e um `rng` passado de fora para os testes poderem ser repetidos.
- Salas, códigos, passwords, tokens, reconexão, conversa, anfitrião, lugares, equipas, baralhar equipas, limites e segurança.
- O bot que substitui quem se desliga, que serve para qualquer jogo se o módulo souber escolher uma jogada.
- O estilo de testes do servidor, que simula vários jogadores ligados.
- A identidade visual e os componentes da interface (botões, escolhas, folhas, lobby).

**Dificulta**

- `client/app.js` é um ficheiro só, com o Cassino espalhado por ele.
- O servidor lê diretamente partes do estado do Cassino (`turn`, `phase`, `history`).
- O fim de partida, com metas de 21 ou 32 pontos e desempates, está dentro do motor do Cassino. Num torneio, cada jogo tem de devolver uma classificação simples.
- A configuração da sala mistura opções da plataforma (tempo, ajudas, histórico) com opções do jogo (número de jogadores, equipas, meta).
- A página offline só sabe montar o Cassino.

## 8. Riscos de passar para uma plataforma multi-jogo

1. **Regressões no Cassino ao extrair o núcleo.** Para os evitar, há os 59 testes atuais, testes novos que fixem o comportamento antes de mexer, e um serviço de teste no Render ligado ao branch, sem tocar no site.
2. **Jogos de vazas pedem coisas que o Cassino não tem:** a vez passa para quem ganha a vaza, pode haver licitação ou escolha de trunfo, e regras de "assistir ao naipe". A interface de módulos tem de permitir fases e jogadas diferentes por jogo, sem o núcleo as conhecer.
3. **Bots em todos os jogos.** Cada jogo novo precisa de pelo menos um nível de bot, o que aumenta o trabalho por jogo.
4. **Torneios e reinícios.** Sem guardar nada fora da memória, um reinício ou uma publicação a meio de um torneio perde-o (ver secção 10).
5. **Publicar a meio de um jogo** fecha todas as salas. A regra continua a ser só publicar quando ninguém está a jogar.
6. **Plano gratuito:** dois serviços (site e teste) partilham as 750 horas por mês. Como só gastam horas acordados, chega com folga para um grupo de amigos.
7. **Tamanho da interface.** Com vários jogos, o cliente cresce. Por agora não é um problema; o carregamento sob demanda fica para mais tarde.

## 9. Decisões

| Data | Decisão |
|---|---|
| 10/11/2026 | Reaproveitar esta base: extrair o núcleo em vez de o refazer. |
| 10/11/2026 | O Cassino é o primeiro módulo. O Gringo é o segundo e serve para validar a interface comum, por isso não se faz um jogo de teste. |
| 10/11/2026 | A seguir vêm os jogos de vazas (Sueca, King). Jogos de tabuleiro e carregamento sob demanda ficam para mais tarde. |
| 10/11/2026 | Todos os jogos têm bots. A interface de módulos inclui como o bot escolhe a jogada. Cada jogo novo começa com um nível simples. O Cassino mantém os seus três níveis. |
| 10/11/2026 | Torneios: retomar quando alguém perde a ligação é obrigatório. Sobreviver a um reinício do servidor é desejável, mas só com uma solução gratuita. |
| 10/11/2026 | Custo zero. |
| 10/11/2026 | Um branch por etapa. O `main`, que publica o site, só recebe etapas aprovadas. Um segundo serviço no Render serve para testar branches. |
| 10/11/2026 | Português de Portugal na interface e nas mensagens. |
| 10/11/2026 | Desenho da Etapa 2 aprovado, incluindo torneio: várias mesas com bots quando há pessoas a mais, bots a completar quando há a menos, pontos por lugar (1.º recebe pessoas na mesa menos 1, último 0, bots sem pontos) e desempate por vitórias, segundos lugares e última ronda. |

## 10. Guardar a classificação de graça: opções e limites

**O que é preciso guardar:** só a classificação do torneio no fim de cada ronda. São alguns kilobytes por torneio e poucas escritas por hora. Confirmei os limites a 10/11/2026 nas páginas oficiais, e podem mudar.

| Opção | Limites gratuitos | Serve? |
|---|---|---|
| Render Postgres gratuito | 1 GB. A base expira 30 dias depois de criada e é apagada 14 dias depois. Só uma por conta. | Não: os dados desaparecem. |
| Render Key Value gratuito | Só em memória, perde os dados ao reiniciar. | Não. |
| Supabase gratuito | 500 MB por projeto, 2 projetos. Pausa ao fim de 1 semana sem uso. | Arriscado: se o grupo não jogar uma semana, alguém tem de a reativar à mão. |
| Upstash Redis gratuito | 250 MB, 500 mil comandos por mês, 1 base e sem cartão. Funciona por pedidos HTTP, sem dependências. | Serve à vontade em capacidade. As páginas não dizem o que acontece a bases paradas, nem confirmam a persistência no plano gratuito. |
| **Neon (Postgres) gratuito** | 1 GB por projeto e 100 horas de computação por mês. Adormece ao fim de 5 minutos sem uso. Ultrapassar os limites suspende o serviço, mas não apaga dados. A página não fala de expiração. | **Recomendado.** |

**Recomendação: Neon.** As horas de computação só se gastam enquanto a base está acordada. Guardar uma classificação acorda-a por uns minutos, por isso 100 horas por mês chegam para muitos torneios.

Os custos de escolher o Neon:

- passa a haver uma dependência (`pg` ou o controlador do Neon);
- a primeira escrita depois de a base adormecer demora um pouco mais;
- é preciso pôr a ligação à base como variável secreta no Render.

**Mesmo com base de dados, um reinício a meio de uma ronda perde essa ronda.** O torneio recomeça a partir da última ronda terminada. Se a base falhar, o torneio continua em memória como hoje.

Fontes:

- [Render: Deploy for Free](https://render.com/docs/free)
- [Neon: planos](https://neon.com/docs/introduction/free-tier)
- [Neon: limites do plano gratuito](https://neon.com/faqs/free-plan-limits-and-quotas)
- [Upstash: preços do Redis](https://upstash.com/docs/redis/overall/pricing)
- [Upstash: faturação](https://upstash.com/docs/redis/overall/billing)
- [Supabase: preços](https://supabase.com/pricing)

## 11. Respostas para a Etapa 2 (10/11/2026)

1. **Equipas no torneio:** cada pessoa da equipa recebe os pontos da equipa.
2. **Ronda do torneio:** por omissão, é uma partida completa. Quem organiza pode limitá-la a um número fixo de mãos.
3. **Jogadores:** as mesmas pessoas do início ao fim, sem entradas a meio. Os bots podem completar lugares vazios e substituir quem desapareça. O desenho tem de resolver jogos com números de jogadores diferentes (por exemplo, a Sueca é a 4).
4. **Retomar depois de um reinício:** cada um volta pelo link e escolhe o seu nome numa lista.
5. **Versão offline:** todos os jogos têm versão offline contra bots, como o Cassino.
6. **Endereço:** mantém-se `cassino-da-madeira.onrender.com` por agora. O nome da plataforma decide-se quando estiver estável.

## 12. Gringo: o que muda no desenho

As regras do Gringo chegaram a 10/11/2026 (documento do Francisco). Têm coisas que o Cassino não tem, e que a interface comum tem de prever:

- **Jogadas fora da vez:** a Jogada Rápida pode ser feita por qualquer jogador a qualquer momento. O núcleo não pode assumir que só joga quem tem a vez, e o servidor decide pela ordem de chegada.
- **Janelas de tempo:** os 3 segundos de "Última Oportunidade" e a confirmação de "pronto" de todos antes de começar.
- **Cartas escondidas do próprio dono:** cada jogador só vê as suas cartas quando as espreita. O servidor revela uma carta só a um jogador e só naquele momento.
- **Fila de poderes:** vários jogadores podem ter poderes pendentes, resolvidos pela ordem em que as cartas caíram.
- **Bots que reagem:** além de escolher a jogada na sua vez, os bots têm de decidir se fazem uma Jogada Rápida quando cai uma carta, com um tempo de reação. A memória do bot (do que viu) é o que distingue os níveis.
- **Pontuação ao contrário:** ganha quem tem menos pontos. O torneio usa a classificação que cada jogo devolve, por isso isto não o afeta.

### Respostas do Francisco sobre o Gringo (10/11/2026)

- **Jogadores:** de 2 a 8. O baralho chegava para mais, mas não cabem num ecrã de telemóvel.
- **Quem começa:** na primeira mão é à sorte; nas seguintes começa quem ganhou a anterior.
- **Sentido:** no dos ponteiros do relógio.
- **Empate:** é empate, e os empatados ficam na mesma posição. Na partida seguinte, começa o empatado que deixa os outros empatados jogarem o mais cedo possível.
- **Uma partida é uma só mão.** Acaba de duas formas:
  - alguém diz Gringo no início do seu turno; cada um dos outros joga mais uma vez, revelam-se as cartas e ganha quem tiver menos pontos;
  - alguém fica sem cartas (com Jogadas Rápidas). A última volta começa logo no jogador seguinte, e cada um dos outros joga mais uma vez. Exemplo do Francisco: com A, B, C e D, se A fica sem cartas depois da jogada de C, jogam D, B e por fim C. Quem ficou sem cartas tem 0 pontos e pode perder, por exemplo para quem tenha só um Rei vermelho (-3).
- **Gringo falhado:** não há penalização. Quem diz Gringo e não fica com menos pontos empata ou perde.
- **Compra:** só do baralho. O lixo começa vazio.
- **Reciclagem:** a última carta posta no lixo fica na mesa, para ainda se poder fazer uma Jogada Rápida sobre ela. As outras voltam ao baralho.
- **Jogada Rápida:**
  - só com as próprias cartas;
  - vale enquanto essa carta estiver no topo: inclui o tempo em que alguém usa um poder (antes ou depois de fazer a troca) e acaba quando o jogador seguinte joga;
  - se duas pessoas a fizerem ao mesmo tempo, ganha quem chega primeiro ao servidor.
- **Jogada Rápida falhada:** a carta aparece a todos numa animação e volta virada para baixo para a mão de quem a atirou, que recebe ainda uma carta extra do baralho sem a ver.
- **Jogada Rápida com figuras:** conta a figura, não a cor. Um Rei vermelho pode ir sobre um Rei preto, e Joker sobre Joker.
- **Poderes:** os Reis vermelhos também têm o poder do Rei. As cartas de quem disse Gringo não ficam protegidas. Os poderes valem na última volta.
- **Mexer nas cartas:** os outros veem o movimento.

- **Tempo por turno:** quem cria a sala escolhe, como no Cassino.

## 13. Etapa 2: desenho da plataforma (aprovado a 10/11/2026)

### 13.1 As três peças

1. **Núcleo, no servidor.** Salas, códigos, convites, passwords, lugares e equipas, anfitrião, conversa, ligação em tempo real, reconexão, temporizadores, bots que substituem quem sai, torneios e a gravação dos torneios. Não conhece nenhum jogo em concreto.
2. **Módulos de jogo.** Um por jogo, cada um na sua pasta:
   - regras em código puro, sem rede nem página;
   - bots;
   - mesa (a interface do jogo);
   - instruções.
3. **Cliente da plataforma.** Menu, lobby, conversa, definições e ligação. Abre a mesa do jogo escolhido.

Tudo o que é igual em todos os jogos (lobby, reconexão, temporizadores, torneio) fica feito uma vez, no núcleo.

### 13.2 O contrato de um módulo

Cada jogo entrega um objeto com estas peças. Foi pensado para servir o Cassino (turnos, cartas escondidas) e o Gringo (jogadas fora da vez, janelas de tempo, cartas que nem o dono vê, fila de poderes).

```js
{
  id: 'gringo', name: 'Gringo',
  players: [2, 3, 4, 5, 6, 7, 8],        // quantidades permitidas
  teams: [],                               // formatos de equipa possíveis, ex.: { players: 4, teams: 2 }
  options: [...],                          // opções do jogo (ex.: meta 21/32 no Cassino), com valores por omissão

  setup(config, rng) -> state             // começa uma partida
  apply(state, seat, action, ctx) -> { ok, reason }   // valida e aplica; ctx = { now, rng }
  waitingFor(state, now) -> [{ seat, kind }]          // de quem se espera ação (turno, "pronto", poder)
  nextDeadline(state) -> instante | null              // próxima janela de tempo do próprio jogo (ex.: 3 s finais)
  tick(state, now, rng)                                // o que acontece quando essa janela fecha
  view(state, seat, now) -> objeto                     // só o que esse lugar pode ver nesse momento
  over(state) -> boolean
  result(state) -> [{ seats: [...], place, score }]    // classificação final, com empates no mesmo lugar
  fallback(state, seat, rng) -> action                 // jogada quando o tempo acaba ou o jogador caiu
  nextStarter(previousResult, config) -> seat          // quem começa a partida seguinte

  bots: {
    levels: ['facil', 'medio', 'dificil'],             // começa com 1 nível nos jogos novos
    view(state, seat) -> o que o bot pode saber         // nunca cartas escondidas
    choose(level, botView, rng) -> action | null        // na sua vez
    react(level, botView, rng) -> { action, delayMs } | null   // fora da vez (ex.: Jogada Rápida), com tempo de reação
  }
}
```

**Regras do contrato**

- **O tempo entra de fora.** O tempo chega como `now`, e a sorte como `rng`. Assim, as regras continuam puras e os testes repetem-se sempre igual.
- **O núcleo serializa as ações.** Recebe as ações uma a uma, pela ordem de chegada. Numa Jogada Rápida disputada, ganha quem chega primeiro.
- **O tempo por turno é do núcleo.** É a opção da sala (30 s, 60 s ou sem limite). Quando acaba, o núcleo pede ao módulo uma jogada de recurso (`fallback`).
- **As janelas do próprio jogo são do módulo.** Por exemplo, os 3 segundos finais do Gringo: o módulo diz quando fecham (`nextDeadline`) e o que acontece a seguir (`tick`).
- **Informação privada sai sempre de `view`.** No Gringo, enquanto um jogador espreita uma carta, só a vista dele a mostra, e só durante esse momento. As cartas viradas para baixo levam um identificador sem significado, que acompanha a carta quando muda de sítio, para os outros verem o movimento como numa mesa a sério.
- **Animações.** Cada vista leva os acontecimentos públicos recentes, numerados, para a mesa saber o que animar: Jogada Rápida falhada, troca do Valete, distribuição.

### 13.3 Torneio

**O que se configura**

- a sequência de rondas: o jogo de cada ronda, as opções desse jogo e, opcionalmente, um número fixo de mãos;
- os pontos por posição;
- o desempate.

**Jogadores:** são as mesmas pessoas do princípio ao fim. Os bots completam lugares e substituem quem desaparece. Nas equipas, cada pessoa recebe os pontos da equipa.

**Números de jogadores diferentes em cada jogo**

1. Se o jogo aceita o número de pessoas do torneio, joga-se numa só mesa.
2. Se não aceita esse número mas aceita um maior, os bots completam até ao número seguinte permitido. Por exemplo, 5 pessoas no Cassino jogam a 6 com 1 bot.
3. Se há mais pessoas do que o jogo aceita, abrem-se várias mesas ao mesmo tempo, com as pessoas espalhadas por igual e bots a completar. Por exemplo, 6 pessoas na Sueca dão 2 mesas de 4, cada uma com 3 pessoas e 1 bot.
4. Nos jogos de equipas, as equipas sorteiam-se em cada ronda. O organizador pode acertá-las antes de começar.

**Pontos (proposta por omissão)**

- Em cada mesa, ordenam-se só as pessoas; os bots não recebem pontos.
- O 1.º recebe tantos pontos quantas pessoas há na mesa menos 1, e o último recebe 0.
- Quem empata partilha o lugar e recebe os mesmos pontos.
- O organizador pode trocar esta tabela por outra.

**Desempate (proposta por omissão):** mais vitórias; depois mais segundos lugares; depois o melhor resultado na última ronda. Se continuar igual, fica empatado.

**Retomar**

- Se alguém perde a ligação, retoma como hoje: com o mesmo token, e um bot joga por ele enquanto não volta.
- No fim de cada ronda, grava-se no Neon a configuração do torneio, os nomes, os tokens cifrados e a classificação.
- Depois de um reinício do servidor, o link do torneio mostra a lista de nomes, e cada um escolhe o seu. A ronda que ia a meio recomeça.
- Se o Neon falhar, o torneio continua só em memória, como hoje.

### 13.4 Pastas

```
core/server/    salas, tempo real, temporizadores, torneio, gravação (store)
core/client/    menu, lobby, conversa, definições, ligação, componentes visuais
shared/cards/   baralho, desenho das cartas (o SVG atual, mais Jokers)
games/cassino/  rules.js (o motor atual), bots.js, table.js (mesa), instructions.js, styles.css
games/gringo/   o mesmo
test/core/      testes do núcleo e do torneio
test/contract/  teste de contrato: corre igual para todos os jogos
test/games/     testes de regras de cada jogo
scripts/        página offline e torneio de bots
```

Para já, todos os jogos carregam juntos, porque são poucos e pequenos. A pasta de cada jogo fica isolada, e o carregamento sob demanda pode juntar-se mais tarde sem mudar o contrato.

**Versão offline:** uma só página com todos os jogos contra bots, gerada como hoje.

### 13.5 Passar o Cassino para o novo sistema sem o partir

1. **Fixar o comportamento.** Antes de mexer, gravo partidas completas com sorte fixa: cada jogada e o estado final. Juntam-se aos 59 testes atuais. Depois da mudança, as mesmas partidas têm de dar exatamente o mesmo resultado.
2. **Mudar num branch.** O motor atual passa para `games/cassino` quase sem mudanças, com uma camada que o liga ao contrato. O servidor e o cliente são partidos em núcleo e mesa do Cassino.
3. **Testar lado a lado.** O branch vai para um segundo serviço no Render (por exemplo, `cassino-teste`). O site atual continua igual, e vocês jogam nos dois e comparam.
4. **Juntar ao `main`** só quando aprovarem. Fica um branch `cassino-v1` com a versão antiga, para voltar atrás num minuto se for preciso.

### 13.6 Como se testa

- **Teste de contrato.** O mesmo teste corre para todos os jogos:
  - joga milhares de partidas com jogadas legais e bots até ao fim;
  - confirma que nenhuma vista mostra cartas que esse lugar não pode ver;
  - confirma que os bots só fazem jogadas legais;
  - confirma que a classificação final faz sentido.

  Um jogo novo só entra se passar.
- **Testes de regras** de cada jogo, um por regra e por caso especial combinado convosco.
- **Testes do núcleo:** salas, reconexão, temporizadores, Jogadas Rápidas simultâneas e torneio (pontos, desempates, retomar depois de um reinício).
- **Testes no navegador** com 2 a 4 jogadores simulados.
- **Testes com amigos** no serviço de teste, no fim de cada etapa.

### 13.7 Decisões com alternativas

| Decisão | Recomendo | Alternativa | Porquê |
|---|---|---|---|
| Tempo real | Manter o atual (Server-Sent Events e pedidos) | WebSockets | Já funciona, não precisa de dependências, e a diferença de rapidez nas Jogadas Rápidas é pequena. Muda-se se no Gringo se notar atraso. |
| Contrato | Ações a qualquer momento, com prazos | Só turnos | Só turnos não serve para o Gringo. |
| Mais pessoas que lugares | Várias mesas com bots a completar | Rodar quem fica de fora | Ninguém fica parado. |
| Gravar torneios | Neon gratuito | Não gravar | Custa zero e aguenta reinícios. |
| Interface | Continuar sem framework | React ou parecido | Mantém tudo igual ao que funciona e permite a página offline num só ficheiro. |

### 13.8 Ordem das próximas etapas

1. **Etapa 3:** extrair o núcleo, com o Cassino como primeiro módulo. Inclui o teste de contrato e o serviço de teste.
2. **Etapa 4:** Gringo (regras e testes; depois bots e mesa).
3. **Etapa 5:** torneio, com gravação no Neon.
4. **Depois:** Sueca e King, um de cada vez.

## 14. Etapa 3: núcleo extraído, Cassino como primeiro módulo

**Onde está cada coisa agora**

```
core/server/server.js   núcleo: salas, lugares, equipas, tempo real, temporizadores, bots, segurança
core/server/games.js    lista de jogos disponíveis
core/shared/names.js    nomes dos bots e regra das equipas (lugar i é da equipa i % equipas)
core/client/platform.js menu, definições, partida offline, salas online, lobby, conversa, menu e conversa por cima da mesa
core/client/cards.js    desenho das cartas (baralho francês), para todos os jogos de cartas
core/client/files.js    ficheiros do cliente, pela ordem; o servidor e a versão offline usam esta lista
core/client/index.html  esqueleto da página; o servidor junta os ficheiros de files.js
games/cassino/rules.js  regras (o antigo shared/engine.js, sem mudanças)
games/cassino/bots.js   bots (o antigo shared/bots.js, sem os nomes)
games/cassino/module.js o Cassino a cumprir o contrato da secção 13.2
games/cassino/table.js  mesa do Cassino
games/cassino/instructions.js  instruções
```

**Como o núcleo trata qualquer jogo**

- Recebe as jogadas pela ordem de chegada e passa-as ao módulo (`apply`).
- Depois de cada mudança, sobe a versão da partida e volta a calcular os temporizadores:
  - bots;
  - tempo por jogada;
  - quem caiu;
  - prazos do próprio jogo (`nextDeadline` e `tick`).

  Os prazos contam desde a última mudança, por isso voltar a ligar já não dá tempo extra.
- As ações que só o anfitrião pode fazer vêm do módulo (`hostActions`, no Cassino a passagem de ronda).
- A ação antiga `next` continua a funcionar.
- A partida offline usa o mesmo contrato que o servidor.

**Como se confirmou que o Cassino não mudou**

- Antes de mexer, gravaram-se 24 partidas completas com sorte fixa (`test/fixtures/cassino-golden.json`): 8 formatos, 2230 jogadas.
- O módulo repete as jogadas gravadas e chega exatamente ao mesmo fim.
- Os bots, chamados pelo contrato, escolhem exatamente as mesmas jogadas.
- O teste de contrato (`test/contract/`) joga partidas completas em todos os formatos e confirma que ninguém, nem os bots, vê cartas escondidas.
- Os testes antigos (regras, bots, servidor) passam sem mudanças, só com caminhos novos.
- Os testes no navegador também passam:
  - partida offline;
  - montes;
  - figuras;
  - pódio;
  - 6 jogadores;
  - distribuição animada;
  - histórico;
  - partida online com convite, password, equipas, conversa e recarregar a página;
  - definições da sala.

**O que fica para a Etapa 4 (Gringo), de propósito**

- **Jogadas de bots fora da vez (`bots.react`).** O contrato já as prevê, mas o núcleo ainda não as chama, porque só o Gringo as usa e é com ele que se testam.
- **Mesa base comum.** Barra de cima, assentos, histórico e animações ainda vivem na mesa do Cassino. Quando a mesa do Gringo existir, o que for igual passa para o núcleo.
- **Folha de estilos.** Ainda é uma só (`core/client/styles.css`). Separa-se quando se souber o que o Gringo partilha.
- **Escolha do jogo.** Com um só jogo, os menus não mostram a escolha. Aparece quando houver dois.

**Site de teste:** um segundo serviço no Render, ligado ao branch da etapa, com o comando de arranque `node core/server/server.js`. O site oficial continua no `main` até à aprovação.

