// Mesa do Gringo: cartas viradas para baixo, poderes, Jogada Rápida e fim da partida.
// Recebe da plataforma (P) o que é comum a todos os jogos: sessão, preferências, cartas, som e navegação.
(function (root) {
  'use strict';
  root.PlatformGames = root.PlatformGames || {};
  root.PlatformGames.gringo = function (P) {
    const GR = root.GringoEngine;
    const { esc, prefs, sfx, roomOpt, reducedMotion, chosenName } = P;
    const card = id => P.cards.card(id);
    const back = () => P.cards.back();
    const mini = id => P.cards.mini(id);

    // --- Opções do jogo, mostradas pela plataforma -------------------------------
    const MODES = [2, 3, 4, 5, 6, 7, 8].map(n => ({ v: String(n), t: n + ' jogadores' }));
    const LEVELS = [{ v: 'normal', t: 'Normal', d: 'Lembra-se das cartas que viu, faz Jogadas Rápidas quando tem a certeza e diz Gringo quando acha que tem poucos pontos.' }];
    const POWER_NAME = { J: 'Conde', Q: 'Dama', K: 'Rei' };

    const ui = {
      sel: [], lastSeq: 0, flash: {}, logDrawer: false, logStick: true, countdown: null,
      reset() { this.sel = []; this.lastSeq = 0; this.flash = {}; this.logDrawer = false; this.logStick = true; clearInterval(this.countdown); clearTimeout(this.flashTimer); },
    };

    // --- Quem é quem ---------------------------------------------------------------
    function nameOf(p, v) {
      if (p === v.me) return 'Tu';
      const x = P.session && P.session.seats && P.session.seats[p];
      return x ? x.nick : 'Jogador ' + (p + 1);
    }
    const whose = (p, v) => (p === v.me ? 'tua' : 'de ' + nameOf(p, v));
    const others = v => Array.from({ length: v.config.numPlayers - 1 }, (_, i) => (v.me + 1 + i) % v.config.numPlayers);

    // O que o jogador deste lugar tem de fazer agora.
    function modeOf(v) {
      const me = v.me;
      if (v.phase === 'prep') return !v.peeked[me] ? 'prep-pick' : !v.ready[me] ? 'prep-ready' : 'prep-wait';
      if (v.phase === 'over') return 'over';
      const head = v.powers[0];
      if (v.phase === 'play' && v.step === 'drawn' && v.turn === me) return 'drawn';
      if (head && head.seat === me && !(v.phase === 'play' && v.step === 'drawn')) {
        if (head.power === 'J') return 'J';
        if (head.power === 'Q') return v.power ? 'Q-seen' : 'Q';
        return v.power ? 'K-seen' : 'K';
      }
      if (v.phase === 'play' && v.turn === me && v.step === 'start' && !head) return 'start';
      return v.phase === 'lastChance' ? 'lastChance' : 'idle';
    }
    // Que cartas se podem escolher, e quantas.
    function picking(mode) {
      switch (mode) {
        case 'prep-pick': return { own: true, opp: false, max: 2 };
        case 'J': return { own: true, opp: true, max: 2 };
        case 'K': return { own: false, opp: true, max: 1 };
        default: return { own: mode !== 'over', opp: false, max: 1 };
      }
    }
    const mySel = v => ui.sel.filter(x => x.seat === v.me);
    const outOfGame = v => !!(v.final && v.final.by === v.me);
    const canSnap = v => (v.phase === 'play' || v.phase === 'lastChance') && v.snapOpen && v.discardTop && !outOfGame(v);
    const canMove = v => v.phase !== 'over' && !v.powers.length;
    const labelOf = (v, seat, id) => { const x = (v.hands[seat] || []).find(y => y.id === id); return x ? x.label : '?'; };

    // --- Texto dos acontecimentos ----------------------------------------------------
    function eventText(e, v) {
      const n = e.seat !== undefined ? esc(nameOf(e.seat, v)) : '';
      const me = e.seat === v.me;
      const cardOf = r => `a carta ${r.label} ${r.seat === v.me ? 'tua' : 'de ' + esc(nameOf(r.seat, v))}`;
      switch (e.t) {
        case 'peek': return me ? 'Espreitaste duas cartas.' : `${n} espreitou duas cartas.`;
        case 'ready': return me ? 'Estás pronto.' : `${n} está pronto.`;
        case 'start': return `Começa a partida. Joga primeiro ${esc(nameOf(e.seat, v))}.`;
        case 'turn': return `Vez de ${esc(nameOf(e.seat, v))}.`;
        case 'draw': return me ? 'Compraste uma carta.' : `${n} comprou uma carta.`;
        case 'discard': return (me ? 'Deitaste fora ' : `${n} deitou fora `) + mini(e.card) + '.';
        case 'swap': return (me ? `Trocaste a tua carta ${e.label} e deitaste fora ` : `${n} trocou a carta ${e.label} e deitou fora `) + mini(e.card) + '.';
        case 'snap': return (me ? `Jogada Rápida certa com a tua carta ${e.label}: ` : `${n} fez Jogada Rápida com a carta ${e.label}: `) + mini(e.card) + '.';
        case 'snapLate': return (me ? `Chegaste tarde com a carta ${e.label} (` : `${n} chegou tarde com a carta ${e.label} (`) + mini(e.card) + '). Voltou para a mão, sem castigo.';
        case 'snapFail': return (me ? `Falhaste a Jogada Rápida com a carta ${e.label} (` : `${n} falhou a Jogada Rápida com a carta ${e.label} (`) + mini(e.card) + ')' + (e.penalty ? `, e ${me ? 'levaste' : 'levou'} a carta extra ${e.penaltyLabel}.` : '.');
        case 'jack': return `${me ? 'Usaste' : n + ' usou'} o Conde: trocou ${cardOf(e.a)} com ${cardOf(e.b)}.`;
        case 'queen': return me ? `Espreitaste a tua carta ${e.target.label}.` : `${n} espreitou a sua carta ${e.target.label}.`;
        case 'king': return `${me ? 'Espreitaste' : n + ' espreitou'} ${cardOf(e.target)}.`;
        case 'kingSwap': return `${me ? 'Trocaste' : n + ' trocou'} ${cardOf(e.a)} com ${cardOf(e.b)}.`;
        case 'skipPower': return `${me ? 'Não usaste' : n + ' não usou'} o poder ${e.power === 'Q' ? 'da Dama' : e.power === 'J' ? 'do Conde' : 'do Rei'}.`;
        case 'move': return me ? `Mudaste a tua carta ${e.label} de lugar.` : `${n} mudou a carta ${e.label} de lugar.`;
        case 'gringo': return e.auto ? `${me ? 'Ficaste' : n + ' ficou'} sem cartas: Gringo! Os outros jogam mais uma vez.` : `${me ? 'Disseste' : n + ' disse'} Gringo! Os outros jogam mais uma vez.`;
        case 'lastChance': return 'Última oportunidade: 3 segundos para Jogadas Rápidas.';
        case 'recycle': return 'O lixo foi baralhado e voltou a ser baralho.';
        case 'noCards': return me ? 'Não havia cartas para comprares.' : `${n} não tinha cartas para comprar.`;
        case 'over': return 'Fim da partida.';
      }
      return '';
    }

    // --- Acontecimentos novos: destaques, sons e anúncios -----------------------------
    function digest(v) {
      const fresh = v.events.filter(e => e.seq > ui.lastSeq);
      const first = ui.lastSeq === 0;
      if (v.events.length) ui.lastSeq = v.events[v.events.length - 1].seq;
      if (first || !fresh.length) return;
      const until = Date.now() + 1400;
      const mark = (id, cls) => { if (id) ui.flash[id] = { cls, until }; };
      for (const e of fresh) {
        switch (e.t) {
          case 'jack': case 'kingSwap': mark(e.a.slot, 'g-troca'); mark(e.b.slot, 'g-troca'); sfx.card(); break;
          case 'queen': case 'king': mark(e.target.slot, 'g-espreita'); break;
          case 'swap': mark(e.newSlot, 'g-novo'); sfx.card(); break;
          case 'move': mark(e.slot, 'g-novo'); break;
          case 'draw': case 'discard': sfx.card(); break;
          case 'snap': sfx.capture(); break;
          case 'snapFail': case 'snapLate': mark(e.penalty, 'g-novo'); showCard(e, v); break;
          case 'gringo': announce(e.auto ? 'Gringo automático' : 'Gringo!', eventText(e, v)); sfx.last(); break;
          case 'lastChance': announce('Última oportunidade', '3 segundos para Jogadas Rápidas.'); break;
          case 'over': if (v.result && v.result.ranking.some(x => x.place === 1 && x.seats.includes(v.me))) { sfx.win(); P.confetti(); } break;
        }
      }
      const mine = v.phase !== 'over' && v.powers.length === 0 && v.phase === 'play' && v.turn === v.me && v.step === 'start';
      if (mine && fresh.some(e => e.t === 'turn' || e.t === 'start')) sfx.turn();
    }
    function announce(title, text) {
      if (!roomOpt('alerts')) return;
      const a = document.createElement('div');
      a.className = 'anuncio';
      a.setAttribute('role', 'status');
      a.innerHTML = `<b>${esc(title)}</b><span>${text}</span>`;
      document.body.appendChild(a);
      setTimeout(() => a.remove(), 2500);
    }
    // A carta de uma Jogada Rápida falhada ou tardia mostra-se a todos.
    function showCard(e, v) {
      const a = document.createElement('div');
      a.className = 'g-flash';
      a.setAttribute('role', 'status');
      a.innerHTML = `${card(e.card)}<span>${eventText(e, v)}</span>`;
      document.body.appendChild(a);
      setTimeout(() => a.remove(), 2200);
      if (e.t === 'snapFail') P.beep(180, 0.25, 'sawtooth', 0.03);
    }

    // --- Desenho ---------------------------------------------------------------------
    function slotHtml(v, seat, x, big, mode) {
      const pk = picking(mode);
      const selectable = seat === v.me ? pk.own : pk.opp;
      const sel = ui.sel.some(s => s.id === x.id);
      const f = ui.flash[x.id];
      const cls = ['g-slot', big ? 'grande' : '', sel ? 'sel' : '', f && f.until > Date.now() ? f.cls : ''].filter(Boolean).join(' ');
      return `<button class="${cls}" data-act="g-pick" data-seat="${seat}" data-id="${esc(x.id)}" ${selectable ? '' : 'disabled'} aria-pressed="${sel}" aria-label="Carta ${x.label} ${esc(whose(seat, v))}${x.card ? ': ' + esc(P.cards.label(x.card)) : ''}">${x.card ? card(x.card) : back()}<span class="g-num">${x.label}</span></button>`;
    }
    function badges(p, v) {
      const b = [];
      if (v.phase === 'prep') b.push(v.ready[p] ? 'Pronto' : v.peeked[p] ? 'A memorizar' : 'A espreitar');
      if (v.final && v.final.by === p) b.push('Gringo');
      if (v.holding === p) b.push('A pensar');
      if (v.powers[0] && v.powers[0].seat === p && v.phase !== 'over') b.push(POWER_NAME[v.powers[0].power]);
      return b.map(t => `<span class="etiqueta">${esc(t)}</span>`).join('');
    }
    function seatHtml(p, v, mode) {
      const turn = v.phase === 'play' && v.turn === p && !v.powers.length;
      const x = P.session.seats && P.session.seats[p];
      const off = x && !x.isBot && x.connected === false;
      return `<div class="assento g-assento ${turn ? 'vez' : ''} ${off ? 'fora' : ''}" data-seat="${p}">
        <div class="assento-nome">${esc(nameOf(p, v))}${badges(p, v)}</div>
        <div class="g-mao-op">${v.hands[p].map(x => slotHtml(v, p, x, false, mode)).join('') || '<span class="nota">Sem cartas</span>'}</div>
        ${v.phase === 'over' ? `<div class="assento-dados">${v.result.scores[p]} pontos</div>` : off ? '<div class="assento-dados">Sem ligação</div>' : ''}
      </div>`;
    }

    function renderGame() {
      const v = P.session && P.session.view();
      if (!v) { P.app.innerHTML = `<div class="pagina tabuas"><div class="pagina-corpo"><p>A carregar a mesa.</p></div></div>`; return; }
      digest(v);
      const mode = modeOf(v);
      // Seleções que deixaram de fazer sentido.
      const pk = picking(mode);
      ui.sel = ui.sel.filter(s => v.hands[s.seat] && v.hands[s.seat].some(x => x.id === s.id) && (s.seat === v.me ? pk.own : pk.opp));
      if (mode === 'prep-ready' || mode === 'prep-wait') ui.sel = ui.sel.filter(s => s.seat === v.me);
      const draft = document.getElementById('chat-txt');
      const draftVal = draft ? draft.value : null;
      const draftFocus = !!draft && document.activeElement === draft;
      const top = v.discardTop;
      const holder = v.holding;
      P.app.innerHTML = `<div class="jogo tabuas g-jogo">
        <div class="barra">
          <span class="info">Gringo${v.final ? '. Última volta' : ''}</span>
          <div class="placar"><span>Baralho <b>${v.deckCount}</b></span></div>
          <div class="barra-acoes">${roomOpt('log') ? '<button class="icon" data-act="toggle-log" aria-controls="historico">Histórico</button>' : ''}${P.session.kind === 'online' ? '<button class="icon" data-act="toggle-chat">Conversa</button>' : ''}<button class="icon" data-act="toggle-menu">Menu</button></div>
        </div>
        <div class="faixa"></div>
        <div class="jogo-corpo">
          <div class="jogo-main">
            <div class="oponentes g-op">${others(v).map(p => seatHtml(p, v, mode)).join('')}</div>
            <div class="g-centro">
              <div class="g-pilha"><span class="card costas"></span><span>Baralho: ${v.deckCount}</span></div>
              <div class="g-pilha g-lixo">${top ? card(top) : '<span class="g-vazio"></span>'}<span>Lixo${v.snapOpen ? ' <b class="g-aberta">aberta</b>' : ''}</span></div>
              ${v.drawn ? `<div class="g-pilha g-comprada">${card(v.drawn)}<span>A tua compra</span></div>`
                : holder !== null ? `<div class="g-pilha g-comprada g-outro"><span class="card costas"></span><span>${esc(nameOf(holder, v))} a pensar</span></div>` : ''}
            </div>
            <div class="relato g-relato" id="relato">${statusLine(v, mode)}</div>
            <div class="painel">
              <div class="acoes" id="acoes">${actionsHtml(v, mode)}</div>
              <div class="g-mao" aria-label="As tuas cartas">${v.hands[v.me].map(x => slotHtml(v, v.me, x, true, mode)).join('') || '<p class="nota">Não tens cartas.</p>'}</div>
            </div>
          </div>
          <aside class="historico" id="historico" aria-label="Histórico da partida">
            <div class="historico-topo"><h3>Histórico</h3><button class="icon" data-act="toggle-log">Fechar</button></div>
            <ol class="historico-lista" id="historico-lista"></ol>
          </aside>
        </div>
      </div><div class="historico-fundo" id="historico-fundo" data-act="toggle-log"></div><div id="sobre"></div>`;
      paintLog(v);
      paintOverlay(v);
      if (draftVal !== null) { const n = document.getElementById('chat-txt'); if (n) { n.value = draftVal; if (draftFocus) n.focus(); } }
      const lista = document.getElementById('historico-lista');
      lista.addEventListener('scroll', () => { ui.logStick = lista.scrollTop + lista.clientHeight >= lista.scrollHeight - 12; });
      P.tickClock();
      // Os destaques duram pouco: volta a pintar quando o último acabar.
      const now = Date.now();
      for (const k in ui.flash) if (ui.flash[k].until <= now) delete ui.flash[k];
      const ends = Object.values(ui.flash).map(f => f.until);
      clearTimeout(ui.flashTimer);
      if (ends.length) ui.flashTimer = setTimeout(() => { if (P.screen === 'game' && P.session) renderGame(); }, Math.max(...ends) - now + 30);
      clearInterval(ui.countdown);
      if (v.phase === 'lastChance' && !v.powers.length) ui.countdown = setInterval(() => {
        const el = document.querySelector('.g-conta');
        if (!el) { clearInterval(ui.countdown); return; }
        el.textContent = Math.max(0, Math.ceil((v.lastChanceAt + GR.LAST_CHANCE_MS - P.serverNow()) / 1000)) + ' s';
      }, 200);
    }

    function statusLine(v, mode) {
      const last = v.events.filter(e => e.t !== 'turn').slice(-1)[0];
      let s = last ? eventText(last, v) : '';
      if (v.power && v.power.seat !== v.me && v.phase !== 'over') s = `${esc(nameOf(v.power.seat, v))} está a espreitar ${v.power.target.seat === v.me ? 'a tua carta ' + labelOf(v, v.me, v.power.target.slot) : v.power.target.seat === v.power.seat ? 'uma carta sua' : 'a carta ' + labelOf(v, v.power.target.seat, v.power.target.slot) + ' de ' + esc(nameOf(v.power.target.seat, v))}.`;
      return s || 'Começa a partida.';
    }

    function clock() {
      const L = P.session.kind === 'online' && P.session.lobby;
      return L && L.deadline ? ` <span class="relogio" data-deadline="${L.deadline}"></span>` : '';
    }
    const btn = (act, text, opts) => `<button class="btn ${opts && opts.prim ? 'prim' : ''}" data-act="${act}" ${opts && opts.disabled ? 'disabled' : ''}>${text}</button>`;

    function actionsHtml(v, mode) {
      const parts = [];
      const own = mySel(v);
      const one = own.length === 1 ? own[0] : null;
      const lab = one ? labelOf(v, v.me, one.id) : null;
      const head = v.powers[0];
      switch (mode) {
        case 'prep-pick':
          parts.push(`<p>Escolhe duas cartas tuas para espreitar.</p>`, btn('g-peek', 'Espreitar', { prim: true, disabled: own.length !== 2 }));
          break;
        case 'prep-ready':
          parts.push(`<p>Memoriza estas duas cartas. Depois de dizeres que estás pronto, não as voltas a ver.</p>`, btn('g-ready', 'Estou pronto', { prim: true }));
          break;
        case 'prep-wait':
          parts.push(`<p>À espera dos outros: ${v.ready.filter(Boolean).length} de ${v.ready.length} prontos.</p>`);
          break;
        case 'start':
          parts.push(`<p>É a tua vez.${clock()}</p>`, btn('g-draw', 'Comprar', { prim: true }));
          if (!v.final) parts.push(btn('g-gringo', 'Gringo!'));
          break;
        case 'drawn':
          parts.push(`<p>Deita fora a carta comprada, ou toca numa carta tua para trocar.${clock()}</p>`);
          if (one) parts.push(btn('g-swap', `Trocar com a carta ${lab}`, { prim: true }));
          parts.push(btn('g-discard', 'Deitar fora', { prim: !one }));
          break;
        case 'J': {
          const valid = jackValid(v);
          parts.push(`<p>Conde: escolhe duas cartas para trocar sem as ver, uma tua e uma de um adversário, ou de dois adversários.${clock()}</p>`,
            btn('g-jack', 'Trocar', { prim: true, disabled: !valid }), btn('g-skip', 'Não usar'));
          break;
        }
        case 'Q':
          parts.push(`<p>Dama: escolhe uma carta tua para espreitar.${clock()}</p>`, btn('g-queen', one ? `Espreitar a carta ${lab}` : 'Espreitar', { prim: true, disabled: !one }), btn('g-skip', 'Não usar'));
          break;
        case 'Q-seen':
          parts.push(`<p>Esta é a tua carta ${labelOf(v, v.me, v.power.target.slot)}. Memoriza-a.</p>`, btn('g-done', 'Já vi', { prim: true }));
          break;
        case 'K': {
          const t = ui.sel.find(s => s.seat !== v.me);
          parts.push(`<p>Rei: escolhe uma carta de um adversário para espreitar.${clock()}</p>`, btn('g-king', t ? `Espreitar a carta ${labelOf(v, t.seat, t.id)} de ${esc(nameOf(t.seat, v))}` : 'Espreitar', { prim: true, disabled: !t }), btn('g-skip', 'Não usar'));
          break;
        }
        case 'K-seen':
          parts.push(`<p>Viste a carta ${labelOf(v, v.power.target.seat, v.power.target.slot)} de ${esc(nameOf(v.power.target.seat, v))}. Podes trocá-la por uma carta tua.</p>`);
          if (one) parts.push(btn('g-kingswap', `Trocar pela minha carta ${lab}`, { prim: true }));
          parts.push(btn('g-done', 'Não trocar', { prim: !one }));
          break;
        case 'lastChance':
          parts.push(`<p>Última oportunidade: <span class="g-conta">3 s</span></p>`);
          break;
        case 'over':
          parts.push('<p>Fim da partida.</p>');
          break;
        default: {
          const who = head ? `${esc(nameOf(head.seat, v))} pode usar o poder ${head.power === 'Q' ? 'da Dama' : head.power === 'J' ? 'do Conde' : 'do Rei'}` : v.phase === 'play' ? `Vez de ${esc(nameOf(v.turn, v))}` : '';
          parts.push(`<p>${outOfGame(v) ? 'Disseste Gringo: já não jogas. ' : ''}${who}.${clock()}</p>`);
        }
      }
      // Sempre que dá: Jogada Rápida e mudar a carta de lugar.
      if (one && canSnap(v) && mode !== 'prep-pick') parts.push(btn('g-snap', `Jogada Rápida com a carta ${lab}`, { prim: true }));
      if (one && canMove(v) && !['prep-pick', 'J', 'K', 'over'].includes(mode)) {
        const hand = v.hands[v.me], i = hand.findIndex(x => x.id === one.id);
        parts.push(`<span class="g-setas"><button class="icon" data-act="g-move" data-dir="-1" ${i <= 0 ? 'disabled' : ''} aria-label="Mover a carta ${lab} para a esquerda">◀</button><button class="icon" data-act="g-move" data-dir="1" ${i >= hand.length - 1 ? 'disabled' : ''} aria-label="Mover a carta ${lab} para a direita">▶</button></span>`);
      }
      return parts.join('');
    }
    function jackValid(v) {
      if (ui.sel.length !== 2) return false;
      const [a, b] = ui.sel;
      if (a.seat === b.seat) return false;
      return !(a.seat === v.me && b.seat === v.me);
    }

    // --- Histórico -----------------------------------------------------------------
    const isWide = () => !window.matchMedia || matchMedia('(min-width: 1000px)').matches;
    function paintLog(v) {
      const aside = document.getElementById('historico'), lista = document.getElementById('historico-lista');
      if (!aside) return;
      const open = roomOpt('log') && (isWide() ? prefs.logOpen : ui.logDrawer);
      aside.classList.toggle('aberto', open);
      document.getElementById('historico-fundo').classList.toggle('aberto', open && !isWide());
      lista.innerHTML = v.events.filter(e => e.t !== 'turn' && e.t !== 'peek' && e.t !== 'ready').map(e => {
        const div = ['start', 'gringo', 'lastChance', 'over', 'recycle'].includes(e.t);
        return `<li class="${div ? 'log-div' : e.seat === v.me ? 'meu' : ''}">${eventText(e, v)}</li>`;
      }).join('');
      if (ui.logStick) lista.scrollTop = lista.scrollHeight;
    }

    // --- Fim da partida ---------------------------------------------------------------
    function paintOverlay(v) {
      const box = document.getElementById('sobre');
      if (!box) return;
      let html = P.baseOverlay();
      if (!html && v.phase === 'over') {
        const R = v.result.ranking;
        const winners = R.filter(x => x.place === 1).flatMap(x => x.seats);
        const iWon = winners.includes(v.me);
        const title = winners.length > 1 ? (iWon ? 'Empataste em primeiro!' : 'Empate em primeiro') : iWon ? 'Ganhaste!' : `${nameOf(winners[0], v)} ganhou`;
        const top3 = R.slice(0, 3);
        const order = top3.length === 3 ? [[top3[1], 2], [top3[0], 1], [top3[2], 3]] : top3.length === 2 ? [[top3[1], 2], [top3[0], 1]] : [[top3[0], 1]];
        const podium = `<div class="podio">${order.map(([r, i]) => `<div class="degrau-col pos-${i}" ${r.seats.includes(v.me) ? 'data-eu="1"' : ''}><div class="degrau-nome"><b>${esc(nameOf(r.seats[0], v))}</b><span>${r.score} ${Math.abs(r.score) === 1 ? 'ponto' : 'pontos'}</span></div><div class="degrau"><span>${r.place}</span></div></div>`).join('')}</div>`;
        const rows = R.map(r => {
          const p = r.seats[0];
          return `<tr><td>${r.place}.º ${esc(nameOf(p, v))}</td><td class="g-cartas-fim">${v.hands[p].map(x => mini(x.card)).join(' ') || 'Sem cartas'}</td><td>${r.score}</td></tr>`;
        }).join('');
        const online = P.session.kind === 'online';
        const host = !online || (P.session.lobby && P.session.lobby.you.isHost);
        const actions = online
          ? (host ? '<button class="btn prim" data-act="back-lobby">Voltar ao lobby</button>' : '<p class="nota">Quem criou a sala escolhe o que fazer a seguir.</p>') + '<button class="btn" data-act="quit">Sair da sala</button>'
          : '<button class="btn prim" data-act="again">Jogar outra vez</button><button class="btn" data-act="quit">Sair para o menu</button>';
        const by = v.final ? `<p class="nota">${esc(nameOf(v.final.by, v))} ${v.final.auto ? 'ficou sem cartas' : 'disse Gringo'}. Na próxima partida começa quem ganhou.</p>` : '';
        html = `<div class="sobre"><div class="folha ${iWon ? 'ganhou' : 'perdeu'}"><h2>${esc(title)}</h2>${podium}${by}
          <div class="quadro-wrap"><table class="quadro g-quadro"><thead><tr><th>Lugar</th><th>Cartas</th><th>Pontos</th></tr></thead><tbody>${rows}</tbody></table></div>
          <div class="folha-acoes">${actions}</div>${roomOpt('log') ? '<button class="link" data-act="toggle-log">Ver o histórico</button>' : ''}</div></div>`;
      }
      box.innerHTML = html;
      if (P.ui.chatOpen) { const l = box.querySelector('.chat-lista'); if (l) l.scrollTop = l.scrollHeight; }
    }

    // --- Ações ---------------------------------------------------------------------
    function play(m) { ui.sel = []; P.session.play(m); }
    function onAct(act, t) {
      const v = P.session && P.session.view();
      if (!v) return false;
      const own = mySel(v);
      switch (act) {
        case 'g-pick': {
          const seat = +t.dataset.seat, id = t.dataset.id;
          const pk = picking(modeOf(v));
          const i = ui.sel.findIndex(s => s.id === id);
          if (i >= 0) ui.sel.splice(i, 1);
          else {
            // No Rei e na troca da compra, uma carta de cada vez; no Conde, uma por jogador.
            ui.sel = ui.sel.filter(s => s.seat !== seat || pk.max > 1 && modeOf(v) === 'prep-pick');
            ui.sel.push({ seat, id });
            while (ui.sel.length > pk.max) ui.sel.shift();
          }
          P.beep(500, 0.03, 'triangle', 0.02);
          renderGame(); return true;
        }
        case 'g-peek': play({ type: 'peek', slots: own.map(s => s.id) }); return true;
        case 'g-ready': play({ type: 'ready' }); return true;
        case 'g-draw': play({ type: 'draw' }); return true;
        case 'g-gringo': play({ type: 'gringo' }); return true;
        case 'g-discard': play({ type: 'discardDrawn' }); return true;
        case 'g-swap': if (own[0]) play({ type: 'swap', slot: own[0].id }); return true;
        case 'g-snap': if (own[0]) play({ type: 'snap', slot: own[0].id }); return true;
        case 'g-skip': play({ type: 'skip' }); return true;
        case 'g-done': play({ type: 'done' }); return true;
        case 'g-queen': if (own[0]) play({ type: 'queen', slot: own[0].id }); return true;
        case 'g-king': { const x = ui.sel.find(s => s.seat !== v.me); if (x) play({ type: 'king', target: { seat: x.seat, slot: x.id } }); return true; }
        case 'g-kingswap': if (own[0]) play({ type: 'kingSwap', slot: own[0].id }); return true;
        case 'g-jack': { const [a, b] = ui.sel; if (a && b) play({ type: 'jack', a: { seat: a.seat, slot: a.id }, b: { seat: b.seat, slot: b.id } }); return true; }
        case 'g-move': {
          const x = own[0]; if (!x) return true;
          const hand = v.hands[v.me], i = hand.findIndex(y => y.id === x.id);
          const to = i + +t.dataset.dir;
          if (to >= 0 && to < hand.length) P.session.play({ type: 'move', slot: x.id, to });
          return true;
        }
        case 'toggle-log':
          if (isWide()) { prefs.logOpen = !prefs.logOpen; P.applyPrefs(); } else ui.logDrawer = !ui.logDrawer;
          ui.logStick = true;
          paintLog(v);
          return true;
      }
      return false;
    }

    return {
      id: 'gringo', name: 'Gringo', module: root.GringoModule,
      tagline: 'Memória, poderes e Jogadas Rápidas; ganha quem tiver menos pontos',
      modes: MODES,
      modeToCfg: mode => ({ numPlayers: parseInt(mode, 10), teams: 0 }),
      modeOf: c => String(c.numPlayers),
      modeName: c => c.numPlayers + ' jogadores',
      targets: [], targetText: () => 'uma partida',
      levels: LEVELS, levelName: { normal: 'Normal' },
      defaults: { mode: '4', level: 'normal', target: '' },
      roomOptions: [
        ['log', 'Histórico', 'Lista de tudo o que aconteceu, com os números das cartas'],
        ['alerts', 'Anúncios', 'Avisos grandes quando alguém diz Gringo e na última oportunidade'],
      ],
      markCard: () => false,
      menuArt: () => card('KH') + card('JK1'),
      instructions: () => root.GringoRules(id => card(id)),
      render: renderGame,
      update: renderGame,
      reset: () => ui.reset(),
      repaintOverlay: () => { const v = P.session && P.session.view(); if (v) paintOverlay(v); },
      busyUntil: () => 0,
      onAct,
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
