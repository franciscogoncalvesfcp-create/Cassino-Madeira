# Arquitetura

Documento vivo com o que existe e com as decisões da plataforma de jogos. Quem retomar o projeto deve ler isto primeiro.

- **Estado:** Etapa 1 concluída (levantamento do que existe, sem alterar código).
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
| `client/index.html` | 30 | Esqueleto da página | Não |
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

## 11. Perguntas em aberto para a Etapa 2

1. **Torneio com jogos de formatos diferentes.** A Sueca é a 4 em duplas e o Cassino pode ser individual. Os pontos do torneio são sempre por pessoa (cada um da dupla recebe os pontos da dupla)?
2. **Uma ronda do torneio** é uma partida completa (por exemplo, o Cassino até 21) ou uma só mão?
3. **Quem joga o torneio.** São sempre os mesmos jogadores do princípio ao fim? Os bots podem ocupar lugares? Alguém pode entrar a meio?
4. **Retomar depois de um reinício.** Sem contas, chega cada jogador voltar pelo link e escolher o seu nome numa lista, com o anfitrião a confirmar?
5. **Versão offline.** Mantém-se para todos os jogos, só para o Cassino, ou deixa de existir?
6. **Endereço do site.** Mantém-se `cassino-da-madeira.onrender.com` ou muda para um nome da plataforma? Mudar o nome do serviço no Render muda o link.
