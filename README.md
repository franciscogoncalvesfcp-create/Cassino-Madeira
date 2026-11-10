# Cassino da Madeira (plataforma de jogos)

Jogos de cartas com modo offline contra bots e modo online com lobbies públicos e privados.
Por agora tem o Cassino da Madeira; os próximos jogos entram como módulos (ver `ARCHITECTURE.md`).
Não tem dependências: basta Node 20 ou mais recente.

## Experimentar no teu computador

```
npm start
```

Abre http://localhost:3000. Para testar o online sozinho, abre uma janela normal e outra anónima.

## Pôr online no Render

1. Cria um repositório no GitHub e envia para lá todos os ficheiros desta pasta.
2. Cria uma conta em https://render.com e liga-a ao GitHub.
3. Em New, escolhe Blueprint e seleciona o repositório. O Render lê o ficheiro `render.yaml`.
4. Confirma a criação e espera pelo fim do deploy.
5. Abre o endereço `https://...onrender.com` que aparece no painel. É esse o link do jogo.

No plano gratuito, o servidor adormece ao fim de 15 minutos sem pedidos e demora cerca de um minuto a acordar.
As salas ficam na memória, por isso desaparecem quando o servidor adormece, reinicia ou recebe uma nova versão.
As partidas a decorrer enviam um sinal periódico para o manter acordado.

## Testes

```
npm test
npm run tournament
```

## Ficheiros

- `core/server/`: núcleo no servidor (salas, lugares, tempo real, temporizadores, bots) e a lista de jogos (`games.js`).
- `core/client/`: plataforma no navegador (menu, lobby, conversa, definições), desenho das cartas e a lista de ficheiros do cliente (`files.js`).
- `core/shared/names.js`: nomes dos bots e regra das equipas.
- `games/cassino/`: o Cassino como módulo: regras (`rules.js`), bots, ligação ao contrato (`module.js`), mesa (`table.js`) e instruções.
- `test/core/`, `test/contract/`, `test/games/`: testes do núcleo, o teste de contrato que todos os jogos têm de passar, e os testes de cada jogo.
- `test/fixtures/cassino-golden.json`: partidas de referência do Cassino (`npm run record:golden` volta a gravá-las, só quando as regras mudam de propósito).
- `scripts/build-offline.js`: gera a versão offline num só ficheiro HTML.

## Definições do servidor

| Variável | O que faz | Predefinição |
|---|---|---|
| `PORT` | Porta do servidor | 3000 |
| `TRUST_PROXY` | Usa `1` atrás de um alojamento como o Render, para os limites por endereço funcionarem | desligado |
| `MAX_ROOMS` | Número máximo de salas | 300 |
| `BOT_DELAY_MS` | Tempo de reação dos bots | 1200 |
| `OFFLINE_GRACE_MS` | Tempo de espera por um jogador sem ligação antes de um bot jogar por ele | 30000 |
| `NEXT_ROUND_MS` | Tempo até a ronda seguinte começar sozinha | 45000 |
