// Mesa do Cassino da Madeira: desenho da mesa, seleção de cartas, animações e fim de ronda.
// Recebe da plataforma (P) o que é comum a todos os jogos: sessão, preferências, cartas, som e navegação.
(function (root) {
  'use strict';
  root.PlatformGames = root.PlatformGames || {};
  root.PlatformGames.cassino = function (P) {
    const E = root.CassinoEngine, N = root.PlatformNames;
    const { esc, prefs, sfx, roomOpt, hintsOn, reducedMotion, chosenName } = P;
    const cardHtml = (id, extra) => P.cards.card(id, extra);
    const back = extra => P.cards.back(extra);
    const mini = id => P.cards.mini(id);

    // --- Opções do jogo, mostradas pela plataforma -------------------------------
    const MODES = [
      { v: '2', t: '2 jogadores', d: 'Um contra um' },
      { v: '3', t: '3 jogadores', d: 'Todos contra todos' },
      { v: '4', t: '4 jogadores', d: 'Todos contra todos' },
      { v: '6', t: '6 jogadores', d: 'Todos contra todos' },
      { v: '4t', t: '4 em duplas', d: '2 equipas de 2' },
      { v: '6d', t: '6 em duplas', d: '3 equipas de 2' },
      { v: '6t', t: '6 em trios', d: '2 equipas de 3' },
    ];
    const MODE_TEAMS = { '4t': 2, '6d': 3, '6t': 2 };
    function modeName(c) {
      const t = N.numTeams(c);
      if (!t) return c.numPlayers + ' jogadores';
      return c.numPlayers / t === 2 ? `${c.numPlayers} em duplas` : `${c.numPlayers} em trios`;
    }
    const TARGETS = [
      { v: 'round', t: 'Uma ronda', d: 'Partida rápida' },
      { v: '21', t: '21 pontos', d: 'Partida padrão' },
      { v: '32', t: '32 pontos', d: 'Partida longa' },
    ];
    const LEVELS = [
      { v: 'easy', t: 'Fácil', d: 'Apanha o óbvio, raramente empilha e às vezes distrai-se.' },
      { v: 'medium', t: 'Médio', d: 'Dá valor ao 10 de Ouros, ao 2 de Espadas, aos ases e às espadas, e empilha.' },
      { v: 'hard', t: 'Difícil', d: 'Lembra-se das cartas que saíram e simula jogadas futuras. Às vezes também erra.' },
    ];
    const LEVEL_NAME = { easy: 'Fácil', medium: 'Médio', hard: 'Difícil' };
    const modeToCfg = (mode, target) => ({ numPlayers: parseInt(mode, 10), teams: MODE_TEAMS[mode] || 0, target });


    function modeOf(c) {
      const t = N.numTeams(c);
      if (!t) return String(c.numPlayers);
      if (c.numPlayers === 4) return '4t';
      return t === 3 ? '6d' : '6t';
    }

    const targetText = c => (c.target === 'round' ? 'uma ronda' : c.target + ' pontos');
    // Opções que o anfitrião pode desligar para toda a sala: [chave, título, descrição].
    const ROOM_OPTIONS = [
      ['hints', 'Ajudas na mesa', 'Mostra o que se pode levar, marca as cartas com pontos e o botão Levar tudo'],
      ['log', 'Histórico da ronda', 'Lista de todas as jogadas'],
      ['alerts', 'Avisos do baralho', 'Avisa quando faltam poucas cartas e quando saem as últimas'],
    ];

    // --- Cartas e montes ---------------------------------------------------------
    const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3h1.500A1.500 1.500 0 0 1 20 11.500v9a1.500 1.500 0 0 1-1.500 1.500h-13A1.500 1.500 0 0 1 4 20.500v-9A1.500 1.500 0 0 1 5.500 10zm2.500 0h5V7a2.500 2.500 0 0 0-5 0z"/></svg>';
    function monteHtml(value, locked, cards) {
      const shown = cards.slice(-3);
      const pad = 16 / Math.max(1, shown.length - 1 || 1);
      const parts = shown.map((c, i) => cardHtml(c, `style="left:${i * pad}px;top:${i * pad}px"`));
      const hidden = cards.slice(0, -3).map(c => `<span data-card="${c}" hidden></span>`).join('');
      return `<span class="monte" role="img" aria-label="Monte de ${value}${locked ? ', trancado' : ''}, ${cards.length} cartas">${hidden}${parts.join('')}<span class="selo">${locked ? LOCK : ''}${value}</span></span>`;
    }

    // --- Mesa de jogo -----------------------------------------------------------
    const ui = {
      card: null, sel: new Set(), chatOpen: false, menuOpen: false, logDrawer: false, logStick: true,
      deal: null, dealSig: '', dealToken: 0, dealingUntil: 0,
      reset() { this.card = null; this.sel = new Set(); this.chatOpen = false; this.menuOpen = false; this.logDrawer = false; this.logStick = true; this.podiumKey = null; this.deal = null; this.dealSig = ''; this.dealToken++; this.dealingUntil = 0; lastMoveSig = ''; },
    };
    let lastMoveSig = '';

    function nameOf(seat, v) {
      if (seat === v.me) return 'Tu';
      const x = P.session.seats && P.session.seats[seat];
      return x ? x.nick : 'Jogador';
    }
    function sideName(side, v) {
      const cfg = v.config;
      const t = E.numTeams(cfg);
      if (!t) return nameOf(side, v);
      if (side === E.sideOf(cfg, v.me)) return 'A tua equipa';
      return t === 2 ? 'Adversários' : `Equipa ${side + 1}`;
    }
    function isPureCall(m) {
      const V = m.value === undefined ? E.VALUE[m.card] : m.value;
      return E.VALUE[m.card] === V && (m.take || []).every(c => E.VALUE[c] === V);
    }
    function moveText(m, v, detail) {
      if (!m) return '';
      const me = m.player === v.me;
      const n = esc(nameOf(m.player, v));
      const list = arr => arr.map(mini).join(' ');
      switch (m.type) {
        case 'trail': return me ? `Largaste ${mini(m.card)}` : `${n} largou ${mini(m.card)}`;
        case 'capture': {
          const cl = m.sweep ? ' <span class="clareza">Clareza!</span>' : '';
          return (me ? `Levaste ${list(m.take)} com ${mini(m.card)}` : `${n} levou ${list(m.take)} com ${mini(m.card)}`) + cl;
        }
        case 'build': return (me ? `Empilhaste ${m.value}` : `${n} empilhou ${m.value}`) + (detail ? ` com ${mini(m.card)} sobre ${list(m.take)}` : '');
        case 'call': return (isPureCall(m) ? (me ? `Chamaste ${m.value}` : `${n} chamou ${m.value}`) : (me ? `Empilhaste ${m.value} trancado` : `${n} empilhou ${m.value} trancado`)) + (detail ? ` com ${mini(m.card)} sobre ${list(m.take)}` : '');
        case 'raise': return (me ? `Subiste o monte para ${m.value}` : `${n} subiu o monte para ${m.value}`) + (detail ? ` com ${mini(m.card)}` : '');
        case 'double': return (me ? `Duplicaste o monte de ${m.value}` : `${n} duplicou o monte de ${m.value}`) + (detail ? ` com ${list([m.card].concat(m.take))}` : '');
      }
      return '';
    }

    function capText(v, side) {
      const n = v.captureCounts[side], c = v.sweeps[side];
      return `${n} ${n === 1 ? 'carta' : 'cartas'}${c ? `, ${c} ${c === 1 ? 'clareza' : 'clarezas'}` : ''}`;
    }
    function seatHtml(p, v) {
      const cfg = v.config, side = E.sideOf(cfg, p);
      const x = P.session.seats && P.session.seats[p];
      const partner = cfg.teams && p !== v.me && side === E.sideOf(cfg, v.me);
      const backs = Array.from({ length: Math.max(0, v.handCounts[p] - (ui.deal ? ui.deal.seats[p] || 0 : 0)) }, () => back()).join('');
      const off = x && !x.isBot && x.connected === false;
      return `<div class="assento ${v.turn === p && v.phase === 'play' ? 'vez' : ''} ${off ? 'fora' : ''}" data-seat="${p}">
        <div class="assento-nome">${esc(nameOf(p, v))}${v.dealer === p ? '<span class="etiqueta" title="Dador">Dá</span>' : ''}${partner ? '<span class="etiqueta parceiro">Equipa</span>' : ''}</div>
        <div class="costas-fila" aria-label="${v.handCounts[p]} cartas na mão">${backs}</div>
        <div class="assento-dados">${capText(v, side)}${off ? ', sem ligação' : ''}</div>
      </div>`;
    }

    function placar(v) {
      const n = E.numSides(v.config);
      const parts = [];
      for (let i = 0; i < n; i++) parts.push(`<span>${esc(sideName(i, v))} <b>${v.totals[i]}</b></span>`);
      return parts.join('');
    }

    function renderGame() {
      if (!P.session) { P.go('menu'); return; }
      const v = P.session.view();
      if (!v) { P.app.innerHTML = `<div class="pagina tabuas"><div class="pagina-corpo"><p>A carregar a mesa.</p></div></div>`; return; }
      checkDeal(v); // antes de desenhar, para as cartas a caminho não aparecerem já na mão de ninguém
      const metaTxt = v.config.target === 'round' ? 'Partida de uma ronda' : `Meta ${v.config.target}`;
      const others = [];
      for (let i = 1; i < v.config.numPlayers; i++) others.push((v.me + i) % v.config.numPlayers);
      const myDeal = v.dealer === v.me ? '<span class="etiqueta">Dá</span>' : '';
      P.app.innerHTML = `<div class="jogo tabuas">
        <div class="barra">
          <span class="info">Ronda ${v.roundNo}. ${esc(metaTxt)}</span>
          <div class="placar">${placar(v)}</div>
          <div class="barra-acoes">${roomOpt('log') ? '<button class="icon" data-act="toggle-log" aria-controls="historico">Histórico</button>' : ''}${P.session.kind === 'online' ? `<button class="icon" data-act="toggle-chat">Conversa</button>` : ''}<button class="icon" data-act="toggle-menu">Menu</button></div>
        </div>
        <div class="faixa"></div>
        <div class="jogo-corpo">
        <div class="jogo-main">
        <div class="oponentes">${others.map(p => seatHtml(p, v)).join('')}</div>
        <div class="relato" id="relato">
          <div class="baralho" id="baralho" aria-label="Cartas no baralho"><span class="card costas"></span><b id="baralho-n"></b></div>
          <div class="relato-texto"><div id="relato-txt">${moveText(v.lastMove, v) || 'Começa a ronda.'}</div><div class="alerta-baralho" id="alerta" role="status"></div></div>
        </div>
        <div class="mesa" id="mesa"></div>
        <div class="painel">
          <div class="acoes" id="acoes"></div>
          <div class="mao-zona">
            <div class="assento eu ${v.turn === v.me && v.phase === 'play' ? 'vez' : ''}" data-seat="${v.me}" id="eu">
              <div class="assento-nome">${esc(P.session.kind === 'local' ? (chosenName() || 'Tu') : 'Tu')}${myDeal}</div>
              <div class="assento-dados" id="eu-dados"></div>
            </div>
            <div class="mao" id="mao"></div>
          </div>
          <div class="eu-linha" id="eu-linha"></div>
        </div>
        </div>
        <aside class="historico" id="historico" aria-label="Histórico da ronda">
          <div class="historico-topo"><h3>Histórico da ronda</h3><button class="icon" data-act="toggle-log">Fechar</button></div>
          <ol class="historico-lista" id="historico-lista"></ol>
        </aside>
        </div>
      </div><div class="historico-fundo" id="historico-fundo" data-act="toggle-log"></div><div id="sobre"></div>`;
      paintDynamic(v);
      runDeal(v);
      const lista = document.getElementById('historico-lista');
      lista.addEventListener('scroll', () => { ui.logStick = lista.scrollTop + lista.clientHeight >= lista.scrollHeight - 12; });
    }

    // --- Histórico ------------------------------------------------------------
    const isWide = () => !window.matchMedia || matchMedia('(min-width: 1000px)').matches;
    function paintLog(v) {
      const aside = document.getElementById('historico'), lista = document.getElementById('historico-lista');
      if (!aside) return;
      const open = roomOpt('log') && (isWide() ? prefs.logOpen : ui.logDrawer);
      aside.classList.toggle('aberto', open);
      document.getElementById('historico-fundo').classList.toggle('aberto', open && !isWide());
      const items = (v.history || []).map(h => {
        if (h.type === 'deal') return `<li class="log-div">Distribuição ${h.no}${h.deck === 0 ? ': últimas cartas' : ''}</li>`;
        return `<li class="${h.player === v.me ? 'meu' : ''}">${moveText(h, v, true)}</li>`;
      });
      if (v.result && v.result.leftovers.length && v.result.leftoversTo !== null)
        items.push(`<li class="log-div">Sobras: ${v.result.leftovers.map(mini).join(' ')} para ${esc(sideNameOfPlayer(v.result.leftoversTo, v))}</li>`);
      lista.innerHTML = items.join('');
      if (ui.logStick) lista.scrollTop = lista.scrollHeight;
    }

    // --- Distribuição ---------------------------------------------------------
    const STAGGER = { lenta: 110, normal: 80, rapida: 45 };
    function checkDeal(v) {
      const sig = v.roundNo + ':' + v.deckCount;
      if (sig === ui.dealSig) return;
      ui.dealSig = sig;
      const h = v.history || [];
      const tail = h[h.length - 1];
      if (!tail || tail.type !== 'deal') return; // ao voltar a meio de uma mão, não se distribui de novo
      if (reducedMotion()) { if (tail.deck === 0) announceLast(v); return; }
      const n = v.config.numPlayers, seats = {};
      const flights = [];
      for (let k = 0; k < 4; k++) for (let i = 1; i <= n; i++) {
        const p = (v.dealer + i) % n;
        flights.push(p === v.me ? { hand: v.hand[k] } : { seat: p });
        if (p !== v.me) seats[p] = (seats[p] || 0) + 1;
      }
      const first = tail.no === 1;
      if (first) v.table.forEach(t => flights.push({ table: t.id }));
      const stagger = STAGGER[prefs.speed] || 80, dur = 280, wait = first ? 150 : 450;
      ui.deal = { hand: new Set(v.hand), table: new Set(first ? v.table.map(t => t.id) : []), seats, deck: n * 4, flights, stagger, dur, wait, last: tail.deck === 0, started: false };
      ui.dealingUntil = Date.now() + wait + flights.length * stagger + dur + 60;
    }
    function runDeal(v) {
      const d = ui.deal;
      if (!d || d.started) return;
      d.started = true;
      const token = ui.dealToken;
      d.flights.forEach((f, i) => setTimeout(() => {
        if (token !== ui.dealToken || ui.deal !== d) return;
        dealOne(f, d, token);
      }, d.wait + i * d.stagger));
      setTimeout(() => {
        if (token !== ui.dealToken || ui.deal !== d) return;
        ui.deal = null;
        if (P.screen === 'game' && P.session) {
          const now = P.session.view();
          if (document.getElementById('mesa')) paintDynamic(now);
          if (d.last) announceLast(now);
        }
      }, ui.dealingUntil - Date.now());
    }
    function dealOne(f, d, token) {
      const pile = document.querySelector('#baralho .card');
      let target = null;
      if (f.hand) target = document.querySelector(`[data-card-btn="${f.hand}"]`);
      else if (f.table) target = document.querySelector(`[data-act="pick-table"][data-id="${f.table}"]`);
      else target = document.querySelector(`.assento[data-seat="${f.seat}"] .costas-fila`);
      if (target && !target.getClientRects().length || target && !target.getBoundingClientRect().height) target = null;
      if (!target && f.seat !== undefined) target = document.querySelector(`.assento[data-seat="${f.seat}"]`);
      const arrive = () => {
        if (token !== ui.dealToken || ui.deal !== d) return;
        sfx.deal();
        if (f.hand) {
          d.hand.delete(f.hand);
          const el = document.querySelector(`[data-card-btn="${f.hand}"]`);
          if (el) { el.style.visibility = ''; }
        } else if (f.table) {
          d.table.delete(f.table);
          const el = document.querySelector(`[data-act="pick-table"][data-id="${f.table}"]`);
          if (el) el.style.visibility = '';
        } else {
          d.seats[f.seat]--;
          const row = document.querySelector(`.assento[data-seat="${f.seat}"] .costas-fila`);
          if (row) row.insertAdjacentHTML('beforeend', back());
        }
      };
      d.deck--;
      const nEl = document.getElementById('baralho-n');
      if (nEl && P.session) nEl.textContent = P.session.view().deckCount + d.deck;
      if (!pile || !target) { arrive(); return; }
      const a = pile.getBoundingClientRect(), b = target.getBoundingClientRect();
      const g = document.createElement('div');
      g.className = 'voo';
      g.innerHTML = back();
      g.style.left = a.left + 'px'; g.style.top = a.top + 'px'; g.style.width = a.width + 'px'; g.style.setProperty('--w', a.width + 'px');
      document.body.appendChild(g);
      const w = f.seat !== undefined ? 18 : b.width;
      const dx = b.left + (f.seat !== undefined ? 18 : b.width / 2) - a.left - a.width / 2, dy = b.top + b.height / 2 - a.top - a.height / 2;
      g.animate([{ transform: 'none' }, { transform: `translate(${dx}px,${dy}px) scale(${w / a.width})` }], { duration: d.dur, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' });
      setTimeout(() => { g.remove(); arrive(); }, d.dur);
    }
    function announceLast(v) {
      if (!roomOpt('alerts')) return;
      sfx.last();
      const a = document.createElement('div');
      a.className = 'anuncio';
      a.innerHTML = '<b>Últimas cartas</b><span>O baralho acabou. As sobras vão para quem capturar por último.</span>';
      a.setAttribute('role', 'status');
      document.body.appendChild(a);
      setTimeout(() => a.remove(), 2500);
    }

    function paintDynamic(v) {
      const side = E.sideOf(v.config, v.me);
      const myTurn = v.phase === 'play' && v.turn === v.me;
      const dealing = !!ui.deal;
      const canAct = myTurn && !dealing;
      const ctx = { hand: v.hand, table: v.table, player: v.me };
      // Limpa seleções que deixaram de fazer sentido.
      if (ui.card && !v.hand.includes(ui.card)) { ui.card = null; ui.sel.clear(); }
      for (const id of [...ui.sel]) if (!v.table.some(t => t.id === id)) ui.sel.delete(id);
      if (!canAct) { ui.card = null; ui.sel.clear(); }

      // Mesa
      const hints = ui.card && hintsOn() ? E.captureHints(v.table, ui.card) : new Set();
      const lastIds = new Set();
      if (v.lastMove) {
        if (v.lastMove.build) lastIds.add(v.lastMove.build);
        if (v.lastMove.type === 'trail') lastIds.add(v.lastMove.card);
      }
      const mesa = document.getElementById('mesa');
      mesa.classList.toggle('cheia', v.table.length > 8);
      mesa.innerHTML = v.table.length ? v.table.map(it => {
        const cls = ['item'];
        if (hints.has(it.id)) cls.push('possivel');
        if (ui.sel.has(it.id)) cls.push('selecionado');
        if (lastIds.has(it.id)) cls.push('ultimo');
        const inner = it.k === 'b' ? monteHtml(it.value, it.locked, it.cards) : cardHtml(it.id);
        const hide = dealing && ui.deal.table.has(it.id) ? 'style="visibility:hidden"' : '';
        return `<button class="${cls.join(' ')}" data-act="pick-table" data-id="${esc(it.id)}" ${canAct && ui.card ? '' : 'disabled'} ${hide} aria-pressed="${ui.sel.has(it.id)}">${inner}</button>`;
      }).join('') : '<p class="mesa-vazia">A mesa está vazia.</p>';

      // Mão
      document.getElementById('mao').innerHTML = v.hand.map(c =>
        `<button class="mao-carta ${ui.card === c ? 'escolhida' : ''}" data-act="pick-hand" data-card-btn="${c}" ${canAct ? '' : 'disabled'} ${dealing && ui.deal.hand.has(c) ? 'style="visibility:hidden"' : ''} aria-pressed="${ui.card === c}">${cardHtml(c)}</button>`).join('');

      // Dados do próprio
      document.getElementById('eu-dados').textContent = capText(v, side);
      const linha = document.getElementById('eu-linha');
      linha.textContent = (E.numTeams(v.config) ? 'A tua equipa: ' : 'Tu: ') + capText(v, side);
      linha.classList.toggle('vez', myTurn);
      paintDeck(v);
      paintActions(v, ctx, myTurn);
      paintLog(v);
      paintOverlay(v);
    }

    function paintDeck(v) {
      const pending = ui.deal ? ui.deal.deck : 0;
      const left = v.deckCount + pending;
      const pile = document.getElementById('baralho');
      document.getElementById('baralho-n').textContent = left;
      pile.classList.toggle('sem-cartas', left === 0);
      const perDeal = v.config.numPlayers * 4;
      const al = document.getElementById('alerta');
      al.className = 'alerta-baralho';
      if (v.phase !== 'play' || ui.deal || !roomOpt('alerts')) { al.textContent = ''; return; }
      if (v.deckCount === 0) {
        al.classList.add('fim');
        const who = v.lastCapturer === null || v.lastCapturer === undefined ? null : v.lastCapturer === v.me ? 'ti' : nameOf(v.lastCapturer, v);
        al.textContent = 'Últimas cartas.' + (who ? ` As sobras vão para ${who}.` : '');
      } else if (v.deckCount === perDeal) {
        al.classList.add('quase');
        al.textContent = 'Falta só 1 distribuição.';
      } else al.textContent = '';
    }

    function actionLabel(a, nSel, table, ids) {
      const m = a.move;
      switch (m.type) {
        case 'capture': {
          const n = table.filter(t => ids.has(t.id)).reduce((x, t) => x + (t.k === 'b' ? t.cards.length : 1), 0);
          return `Levar ${n} ${n === 1 ? 'carta' : 'cartas'}`;
        }
        case 'build': return `Empilhar ${a.value}`;
        case 'call': {
          const cards = table.filter(t => ids.has(t.id)).map(t => t.id);
          return isPureCall({ card: m.card, value: a.value, take: cards }) ? `Chamar ${a.value}` : `Empilhar ${a.value} trancado`;
        }
        case 'raise': return `Subir para ${a.value}`;
        case 'double': return `Duplicar o monte de ${a.value}`;
        case 'trail': return 'Largar';
      }
      return '';
    }

    function paintActions(v, ctx, myTurn) {
      const box = document.getElementById('acoes');
      ui.actions = [];
      if (v.phase !== 'play') { box.innerHTML = '<p>A ronda terminou.</p>'; return; }
      if (ui.deal) { box.innerHTML = '<p>A distribuir as cartas.</p>'; return; }
      if (!myTurn) {
        const deadline = P.session.kind === 'online' && P.session.lobby && P.session.lobby.deadline;
        box.innerHTML = `<p>Vez de ${esc(nameOf(v.turn, v))}.${deadline ? ` <span class="relogio" data-deadline="${deadline}"></span>` : ''}</p>`;
        P.tickClock(); return;
      }
      const deadline = P.session.kind === 'online' && P.session.lobby && P.session.lobby.deadline;
      const clock = deadline ? ` <span class="relogio" data-deadline="${deadline}"></span>` : '';
      if (!ui.card) {
        const blocked = v.hand.length && !E.validateMove(ctx, { type: 'trail', card: v.hand[0] }).ok;
        box.innerHTML = `<p>É a tua vez. ${blocked ? 'Tens um monte teu na mesa, por isso não podes largar.' : 'Escolhe uma carta da mão.'}${clock}</p>`;
        P.tickClock(); return;
      }
      const sel = [...ui.sel];
      const acts = E.actionsFor(ctx, ui.card, sel);
      const parts = [];
      if (!sel.length) {
        const best = E.bestCapture(v.table, ui.card, it => (it.k === 'b' ? it.cards.length : 1));
        // Com duas figuras iguais na mesa, cada jogador escolhe qual leva.
        const choose = E.VALUE[ui.card] === null && v.table.filter(t => t.k === 'c' && E.RANK[t.id] === E.RANK[ui.card]).length === 2;
        if (choose) parts.push(`<p>Toca na figura que queres levar.</p>`);
        else if (best.length && hintsOn()) {
          ui.actions.push({ type: 'capture', card: ui.card, take: best });
          const n = v.table.filter(t => best.includes(t.id)).reduce((x, t) => x + (t.k === 'b' ? t.cards.length : 1), 0);
          parts.push(`<button class="btn prim" data-act="do-action" data-i="${ui.actions.length - 1}">Levar tudo (${n})</button>`);
        }
      }
      const idSet = new Set(sel);
      acts.forEach((a, idx) => {
        ui.actions.push(a.move);
        const primary = (a.move.type !== 'trail' && idx === 0) || (a.move.type === 'trail' && !parts.length);
        parts.push(`<button class="btn ${primary ? 'prim' : ''}" data-act="do-action" data-i="${ui.actions.length - 1}">${esc(actionLabel(a, sel.length, v.table, idSet))}</button>`);
      });
      let msg = '';
      if (sel.length && !acts.length) msg = `<p class="aviso">${esc(E.explainSelection(ctx, ui.card, sel))}</p>`;
      else if (!sel.length && !parts.length) msg = E.VALUE[ui.card] === null ? '<p>Tens um monte teu na mesa, por isso não podes largar. Escolhe outra carta.</p>' : '<p>Tens um monte teu na mesa, por isso não podes largar. Escolhe outra carta, ou toca nas cartas da mesa para empilhar.</p>';
      box.innerHTML = parts.join('') + msg + clock;
      P.tickClock();
    }

    function scoreTable(v) {
      const n = E.numSides(v.config);
      const R = v.result.score;
      const heads = Array.from({ length: n }, (_, i) => `<th scope="col">${esc(sideName(i, v))}</th>`).join('');
      const rows = [
        ['Cartas', 'cards', i => `<small>${R[i].numCards}</small> `],
        ['Espadas', 'spades', i => `<small>${R[i].numSpades}</small> `],
        ['Cassino Grande', 'grande'], ['Cassino Pequeno', 'pequeno'], ['Ases', 'aces'], ['Clarezas', 'sweeps'],
      ];
      const body = rows.map(([t, k, pre]) => `<tr><td>${t}</td>${R.map((r, i) => `<td>${pre ? pre(i) + '<span aria-hidden="true">→</span> ' : ''}${r.pts[k]}</td>`).join('')}</tr>`).join('');
      return `<div class="quadro-wrap"><table class="quadro"><thead><tr><th>Nesta ronda</th>${heads}</tr></thead><tbody>${body}
        <tr class="total"><td>Pontos da ronda</td>${R.map(r => `<td>${r.total}</td>`).join('')}</tr>
        <tr class="acumulado"><td>Total</td>${v.totals.map(t => `<td>${t}</td>`).join('')}</tr></tbody></table></div>`;
    }

    function podiumHtml(v) {
      const n = E.numSides(v.config), w = v.match.winners[0];
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => (b === w) - (a === w) || v.totals[b] - v.totals[a]);
      let place = 0, prev = null;
      const ranked = order.map((side, i) => {
        if (v.totals[side] !== prev || i === 1) place = i + 1;
        prev = v.totals[side];
        return { side, place, total: v.totals[side] };
      });
      const step = (r, idx) => `<div class="degrau-col pos-${idx}" ${r.side === E.sideOf(v.config, v.me) ? 'data-eu="1"' : ''}>
          <div class="degrau-nome"><b>${esc(sideName(r.side, v))}</b><span>${r.total} ${r.total === 1 ? 'ponto' : 'pontos'}</span></div>
          <div class="degrau"><span>${r.place}</span></div></div>`;
      const top = ranked.slice(0, 3);
      const visual = top.length === 3 ? [[top[1], 2], [top[0], 1], [top[2], 3]] : top.length === 2 ? [[top[1], 2], [top[0], 1]] : [[top[0], 1]];
      const rest = ranked.slice(3).map(r => `<li>${r.place}.º ${esc(sideName(r.side, v))}: ${r.total}</li>`).join('');
      const play = ui.podiumKey !== v.roundNo && !reducedMotion();
      ui.podiumKey = v.roundNo;
      return { html: `<div class="podio ${play ? 'anima' : ''}">${visual.map(([r, i]) => step(r, i)).join('')}</div>${rest ? `<ol class="podio-resto">${rest}</ol>` : ''}`, play };
    }
    function confetti() {
      const box = document.createElement('div');
      box.className = 'confetes';
      box.setAttribute('aria-hidden', 'true');
      const cols = ['#f4bc23', '#cf3b22', '#fbfaf4', '#1b6a93'];
      for (let i = 0; i < 70; i++) {
        const c = document.createElement('i');
        c.style.left = Math.random() * 100 + '%';
        c.style.background = cols[i % 4];
        c.style.animationDelay = 500 + Math.random() * 900 + 'ms';
        c.style.animationDuration = 1600 + Math.random() * 1400 + 'ms';
        c.style.setProperty('--x', (Math.random() * 120 - 60) + 'px');
        c.style.setProperty('--r', Math.random() * 720 + 'deg');
        box.appendChild(c);
      }
      document.body.appendChild(box);
      setTimeout(() => box.remove(), 4400);
    }

    const HOW = { cards: 'pelas cartas', spades: 'pelas espadas', grande: 'pelo Cassino Grande', pequeno: 'pelo Cassino Pequeno', aces: 'pelos ases', sweeps: 'pelas clarezas' };
    function paintOverlay(v) {
      const box = document.getElementById('sobre');
      let html = '';
      const base = P.baseOverlay();
      if (base) html = base;
      else if (v.phase === 'roundEnd' || v.phase === 'matchEnd') {
        const end = v.phase === 'matchEnd';
        const left = v.result.leftovers.length && v.result.leftoversTo !== null ? `<p class="nota">${v.result.leftovers.length} ${v.result.leftovers.length === 1 ? 'carta que sobrou foi' : 'cartas que sobraram foram'} para ${esc(sideNameOfPlayer(v.result.leftoversTo, v))}.</p>` : '';
        let title = `Fim da ronda ${v.roundNo}`, cls = '', note = '';
        if (end) {
          const w = v.match.winners[0];
          const mine = w === E.sideOf(v.config, v.me);
          const t = E.numTeams(v.config);
          title = mine ? (t ? 'A tua equipa ganhou!' : 'Ganhaste!') : `${sideName(w, v)} ${t === 2 ? 'ganharam' : 'ganhou'}`;
          cls = mine ? 'ganhou' : 'perdeu';
          if (v.match.how && v.match.how !== 'score') note = `<p class="nota">Empate no total, decidido ${HOW[v.match.how]} da última ronda.</p>`;
        } else if (v.match.extra) note = '<p>Empate total. Joga-se mais uma ronda e os pontos somam ao total.</p>';
        else note = v.config.target !== 'round' ? `<p class="nota">A partida continua até ${v.config.target} pontos.</p>` : '';
        const isHost = P.session.kind !== 'online' || (P.session.lobby && P.session.lobby.you.isHost);
        let actions = '';
        if (end) {
          actions = P.session.kind === 'online'
            ? (isHost ? '<button class="btn prim" data-act="back-lobby">Voltar ao lobby</button>' : '<p class="nota">Quem criou a sala escolhe o que fazer a seguir.</p>') + '<button class="btn" data-act="quit">Sair da sala</button>'
            : '<button class="btn prim" data-act="again">Jogar outra vez</button><button class="btn" data-act="quit">Sair para o menu</button>';
        } else {
          actions = isHost ? '<button class="btn prim" data-act="next-round">Próxima ronda</button>' : '<p class="nota">A próxima ronda começa quando quem criou a sala avançar.</p>';
        }
        let podium = '';
        if (end) {
          const pd = podiumHtml(v);
          podium = pd.html;
          if (pd.play && v.match.winners[0] === E.sideOf(v.config, v.me)) confetti();
        }
        html = `<div class="sobre"><div class="folha ${cls}"><h2>${esc(title)}</h2>${podium}${note}${scoreTable(v)}${left}<div class="folha-acoes">${actions}</div>${roomOpt('log') ? '<button class="link" data-act="toggle-log">Ver o histórico da ronda</button>' : ''}</div></div>`;
      }
      box.innerHTML = html;
      if (P.ui.chatOpen) { const l = box.querySelector('.chat-lista'); if (l) l.scrollTop = l.scrollHeight; }
    }
    function sideNameOfPlayer(p, v) { return v.config.teams ? sideName(E.sideOf(v.config, p), v) : (p === v.me ? 'ti' : nameOf(p, v)); }

    // Atualiza a mesa com animações: cada carta voa da posição antiga para a nova.
    function updateGame() {
      if (P.screen !== 'game') return;
      const v = P.session.view();
      if (!v) return;
      if (!document.getElementById('mesa')) { const before = snapshot(); renderGame(); animate(before, v); soundFor(v); return; }
      const before = snapshot();
      // Se a conversa estiver aberta com texto, não apagar.
      const draft = document.getElementById('chat-txt');
      const draftVal = draft ? draft.value : null;
      renderGame();
      if (draftVal !== null) { const n = document.getElementById('chat-txt'); if (n) { n.value = draftVal; n.focus(); } }
      animate(before, v);
      soundFor(v);
    }
    function snapshot() {
      const m = new Map();
      document.querySelectorAll('#app .jogo [data-card]').forEach(el => {
        if (el.hidden) return;
        const r = el.getBoundingClientRect();
        m.set(el.dataset.card, { rect: r, el });
      });
      return m;
    }
    function seatEl(p) { return document.querySelector(`[data-seat="${p}"]`) || document.getElementById('mao'); }
    function fly(id, from, to, dur, delay, opts) {
      const o = opts || {};
      const g = document.createElement('div');
      g.className = 'voo';
      g.innerHTML = o.back ? back() : cardHtml(id);
      g.style.left = from.left + 'px'; g.style.top = from.top + 'px';
      g.style.width = from.width + 'px';
      g.style.setProperty('--w', from.width + 'px');
      document.body.appendChild(g);
      const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
      const scale = o.scale || 1;
      const an = g.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(${scale})`, opacity: o.fade ? 0.15 : 1 }], { duration: dur, delay, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'both' });
      an.onfinish = () => g.remove();
      setTimeout(() => g.remove(), dur + delay + 300);
    }
    function animate(before, v) {
      if (reducedMotion() || !before.size && !v.lastMove) return;
      const sig = JSON.stringify([v.roundNo, v.lastMove, v.deckCount, v.table.length, v.phase]);
      if (sig === lastMoveSig) return; // só a seleção mudou
      lastMoveSig = sig;
      const dur = prefs.speed === 'rapida' ? 240 : 360;
      const after = new Map();
      document.querySelectorAll('#app .jogo [data-card]').forEach(el => { if (!el.hidden) after.set(el.dataset.card, el); });
      const m = v.lastMove;
      const moverSeat = m ? seatEl(m.player) : null;
      after.forEach((el, id) => {
        const old = before.get(id);
        const now = el.getBoundingClientRect();
        if (old) {
          const dx = old.rect.left - now.left, dy = old.rect.top - now.top;
          if (Math.abs(dx) + Math.abs(dy) > 1) el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: dur, easing: 'cubic-bezier(.25,.8,.3,1)' });
        } else if (m && m.card === id && moverSeat) {
          const r = moverSeat.getBoundingClientRect();
          const dx = r.left + r.width / 2 - now.left - now.width / 2, dy = r.top + r.height / 2 - now.top - now.height / 2;
          el.animate([{ transform: `translate(${dx}px,${dy}px) scale(.6)` }, { transform: 'none' }], { duration: dur, easing: 'cubic-bezier(.25,.8,.3,1)' });
        }
      });
      // Cartas que saíram da mesa voam para o monte de quem capturou.
      if (m && m.type === 'capture') {
        const pile = seatEl(m.player).getBoundingClientRect();
        before.forEach((b, id) => {
          if (after.has(id)) return;
          fly(id, b.rect, pile, dur + 120, 120, { fade: true, scale: .45 });
        });
        if (!before.has(m.card) && m.player !== v.me) {
          const mesa = document.getElementById('mesa').getBoundingClientRect();
          const w = before.size ? [...before.values()][0].rect.width : 60;
          const r = moverSeat.getBoundingClientRect();
          fly(m.card, { left: r.left, top: r.top, width: w }, { left: mesa.left + mesa.width / 2 - w / 2, top: mesa.top + mesa.height / 2 - w * .7, width: w, height: w * 1.4 }, dur, 0, {});
        }
      }
    }
    function soundFor(v) {
      const m = v.lastMove;
      const sig = JSON.stringify([v.roundNo, m]);
      if (sig !== soundFor.sig) {
        soundFor.sig = sig;
        if (m) {
          if (m.sweep) sfx.sweep();
          else if (m.type === 'capture') sfx.capture();
          else sfx.card();
        }
      }
      if (v.phase === 'play' && v.turn === v.me && soundFor.turn !== sig) { soundFor.turn = sig; sfx.turn(); }
      if (v.phase === 'matchEnd' && soundFor.end !== v.roundNo) {
        soundFor.end = v.roundNo;
        if (v.match.winners[0] === E.sideOf(v.config, v.me)) sfx.win();
      }
    }


    // --- Ações da mesa -------------------------------------------------------------
    function onAct(act, t) {
      switch (act) {
          case 'pick-hand': {
            const c = t.dataset.cardBtn;
            if (ui.card === c) { ui.card = null; ui.sel.clear(); }
            else { ui.card = c; ui.sel.clear(); }
            P.beep(500, 0.03, 'triangle', 0.02);
            paintDynamic(P.session.view()); return true;
          }
          case 'pick-table': {
            const id = t.dataset.id;
            if (ui.sel.has(id)) ui.sel.delete(id); else ui.sel.add(id);
            paintDynamic(P.session.view()); return true;
          }
          case 'do-action': {
            const m = ui.actions[+t.dataset.i];
            if (m) { ui.card = null; ui.sel.clear(); P.session.play(m); }
            return true;
          }
          case 'toggle-log':
            if (isWide()) { prefs.logOpen = !prefs.logOpen; P.applyPrefs(); } else ui.logDrawer = !ui.logDrawer;
            ui.logStick = true;
            paintLog(P.session.view());
            return true;
      }
      return false;
    }

    return {
      id: 'cassino', name: 'Cassino da Madeira', module: root.CassinoModule,
      modes: MODES, modeToCfg, modeOf, modeName, targets: TARGETS, targetText, levels: LEVELS, levelName: LEVEL_NAME,
      defaults: { mode: '2', level: 'medium', target: '21' },
      roomOptions: ROOM_OPTIONS,
      // Pinta amarela nas cartas que dão pontos diretamente.
      markCard: id => hintsOn() && (id === '10D' || id === '2S' || E.RANK[id] === 'A'),
      menuArt: () => cardHtml('10D') + cardHtml('2S'),
      instructions: () => root.CassinoRules(id => cardHtml(id), (v, l, cards) => monteHtml(v, l, cards)),
      render: renderGame,
      update: updateGame,
      reset: () => ui.reset(),
      repaintOverlay: () => paintOverlay(P.session.view()),
      busyUntil: () => ui.dealingUntil,
      onAct,
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
