(function () {
  'use strict';
  const E = window.CassinoEngine, B = window.CassinoBots;
  const app = document.getElementById('app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // --- Definições e armazenamento -------------------------------------------
  function load(k, d) { try { const v = localStorage.getItem('cassino.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save(k, v) { try { if (v === null) localStorage.removeItem('cassino.' + k); else localStorage.setItem('cassino.' + k, JSON.stringify(v)); } catch (e) {} }
  const prefs = Object.assign({ name: '', speed: 'normal', hints: true, sound: true, table: 'azul', back: 'riscas', colors4: false, motion: true, logOpen: true }, load('prefs', {}));
  const reducedMotion = () => !prefs.motion || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SPEEDS = { lenta: 1900, normal: 1150, rapida: 550 };
  function applyPrefs() {
    document.body.dataset.table = prefs.table;
    document.body.dataset.back = prefs.back;
    save('prefs', prefs);
  }
  const offlineCfg = Object.assign({ mode: '2', level: 'medium', target: '21' }, load('offline', {}));

  // --- Som ------------------------------------------------------------------
  let audio = null;
  function beep(freq, dur, type, vol, when) {
    if (!prefs.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime + (when || 0);
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type || 'triangle'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur);
    } catch (e) {}
  }
  const sfx = {
    card: () => beep(320, 0.07, 'triangle', 0.05),
    capture: () => { beep(420, 0.08); beep(560, 0.1, 'triangle', 0.05, 0.06); },
    sweep: () => { beep(520, 0.12); beep(660, 0.12, 'triangle', 0.05, 0.1); beep(880, 0.2, 'triangle', 0.05, 0.2); },
    turn: () => beep(700, 0.09, 'sine', 0.03),
    deal: () => beep(260, 0.04, 'triangle', 0.025),
    last: () => { beep(392, 0.16, 'triangle', 0.05); beep(330, 0.26, 'triangle', 0.05, 0.14); },
    win: () => { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, 'triangle', 0.06, i * 0.13)); },
  };

  // --- Desenho das cartas ---------------------------------------------------
  const PIPS = {
    1: [[50, 70, 1]],
    2: [[50, 30], [50, 110, 0, 1]],
    3: [[50, 30], [50, 70], [50, 110, 0, 1]],
    4: [[32, 30], [68, 30], [32, 110, 0, 1], [68, 110, 0, 1]],
    5: [[32, 30], [68, 30], [50, 70], [32, 110, 0, 1], [68, 110, 0, 1]],
    6: [[32, 30], [68, 30], [32, 70], [68, 70], [32, 110, 0, 1], [68, 110, 0, 1]],
    7: [[32, 30], [68, 30], [50, 50], [32, 70], [68, 70], [32, 110, 0, 1], [68, 110, 0, 1]],
    8: [[32, 30], [68, 30], [50, 50], [32, 70], [68, 70], [50, 90, 0, 1], [32, 110, 0, 1], [68, 110, 0, 1]],
    9: [[32, 28], [68, 28], [32, 55], [68, 55], [50, 70], [32, 85, 0, 1], [68, 85, 0, 1], [32, 112, 0, 1], [68, 112, 0, 1]],
    10: [[32, 28], [68, 28], [50, 42], [32, 55], [68, 55], [32, 85, 0, 1], [68, 85, 0, 1], [50, 98, 0, 1], [32, 112, 0, 1], [68, 112, 0, 1]],
  };
  const SUIT_NAME = { S: 'Espadas', H: 'Copas', D: 'Ouros', C: 'Paus' };
  const RANK_NAME = { A: 'Ás', J: 'Valete', Q: 'Dama', K: 'Rei' };
  function cardLabel(id) { const r = E.RANK[id]; return (RANK_NAME[r] || r) + ' de ' + SUIT_NAME[E.SUIT[id]]; }
  function suitColor(s) {
    if (prefs.colors4) return { S: '#1b1f24', H: '#c42417', D: '#1658b8', C: '#137a3d' }[s];
    return s === 'H' || s === 'D' ? '#c42417' : '#1b1f24';
  }
  function scoring(id) { return prefs.hints && (id === '10D' || id === '2S' || E.RANK[id] === 'A'); }
  function cardSvg(id) {
    const r = E.RANK[id], s = E.SUIT[id], col = suitColor(s), v = E.VALUE[id];
    const use = (x, y, size, flip) => `<use href="#s-${s}" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}"${flip ? ` transform="rotate(180 ${x} ${y})"` : ''}/>`;
    const corner = `<text x="12.500" y="24" text-anchor="middle" font-family="Zilla Slab,Rockwell,Georgia,serif" font-weight="700" font-size="${r === '10' ? 19 : 22}" ${r === '10' ? 'letter-spacing="-1.500"' : ''}>${r}</text>${use(12.5, 35, 14)}`;
    let mid = '';
    if (v !== null) {
      mid = PIPS[v].map(([x, y, big, flip]) => use(x, y, big ? 44 : v >= 9 ? 19 : 22, flip)).join('');
    } else {
      mid = `<rect x="24" y="24" width="52" height="92" fill="none" stroke="${col}" stroke-width="1.500"/>
        <rect x="24" y="24" width="52" height="7" fill="#f4bc23"/><rect x="24" y="31" width="52" height="4" fill="#cf3b22"/>
        <rect x="24" y="105" width="52" height="4" fill="#cf3b22"/><rect x="24" y="109" width="52" height="7" fill="#f4bc23"/>
        <text x="50" y="82" text-anchor="middle" font-family="Alfa Slab One,Rockwell,Georgia,serif" font-size="38">${r}</text>
        ${use(50, 96, 14)}${use(50, 47, 14, true)}`;
    }
    return `<svg viewBox="0 0 100 140" fill="${col}" aria-hidden="true">${corner}<g transform="rotate(180 50 70)">${corner}</g>${mid}</svg>`;
  }
  const cardCache = {};
  function cardHtml(id, extra) {
    const k = id + (prefs.colors4 ? '4' : '');
    const svg = cardCache[k] || (cardCache[k] = cardSvg(id));
    return `<span class="card" data-card="${id}" ${extra || ''} role="img" aria-label="${esc(cardLabel(id))}">${svg}${scoring(id) ? '<i class="marca-pts"></i>' : ''}</span>`;
  }
  const back = (extra) => `<span class="card costas" ${extra || ''}></span>`;
  const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3h1.500A1.500 1.500 0 0 1 20 11.500v9a1.500 1.500 0 0 1-1.500 1.500h-13A1.500 1.500 0 0 1 4 20.500v-9A1.500 1.500 0 0 1 5.500 10zm2.500 0h5V7a2.500 2.500 0 0 0-5 0z"/></svg>';
  function monteHtml(value, locked, cards) {
    const shown = cards.slice(-3);
    const pad = 16 / Math.max(1, shown.length - 1 || 1);
    const parts = shown.map((c, i) => cardHtml(c, `style="left:${i * pad}px;top:${i * pad}px"`));
    const hidden = cards.slice(0, -3).map(c => `<span data-card="${c}" hidden></span>`).join('');
    return `<span class="monte" role="img" aria-label="Monte de ${value}${locked ? ', trancado' : ''}, ${cards.length} cartas">${hidden}${parts.join('')}<span class="selo">${locked ? LOCK : ''}${value}</span></span>`;
  }
  function mini(id) {
    const s = E.SUIT[id];
    const cls = prefs.colors4 ? { H: 'verm', D: 'azul', C: 'verde', S: '' }[s] : (s === 'H' || s === 'D' ? 'verm' : '');
    return `<span class="mini ${cls}" aria-label="${esc(cardLabel(id))}">${E.RANK[id]}<svg viewBox="0 0 24 24"><use href="#s-${s}"/></svg></span>`;
  }

  // --- Navegação ------------------------------------------------------------
  let screen = 'menu', session = null, returnTo = 'menu';
  function go(s, opts) {
    screen = s;
    if (opts && opts.from) returnTo = opts.from;
    render();
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  function toast(msg, ms) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, ms || 3200);
  }
  function chosenName() { return (prefs.name || '').trim(); }

  function render() {
    if (screen === 'menu') renderMenu();
    else if (screen === 'offline') renderOffline();
    else if (screen === 'rules') renderRules();
    else if (screen === 'settings') renderSettings();
    else if (screen === 'online') renderOnline();
    else if (screen === 'create') renderCreate();
    else if (screen === 'lobby') renderLobby();
    else if (screen === 'game') renderGame();
  }

  // --- Menu ------------------------------------------------------------------
  function renderMenu() {
    const saved = load('save', null);
    app.innerHTML = `<div class="menu tabuas">
      <div class="menu-corpo">
        <div class="marca">
          <div class="leque" aria-hidden="true">${cardHtml('10D')}${cardHtml('2S')}</div>
          <h1>Cassino</h1>
          <p>O jogo de cartas da Madeira. Joga contra bots ou com amigos.</p>
        </div>
        <nav class="menu-lista" aria-label="Menu principal">
          ${saved ? '<button class="btn prim" data-act="resume">Continuar partida</button>' : ''}
          <button class="btn ${saved ? '' : 'prim'}" data-act="go" data-to="offline">Jogar contra bots</button>
          <button class="btn" data-act="go" data-to="online">Jogar online</button>
          <button class="btn" data-act="go" data-to="rules">Instruções</button>
          <button class="btn" data-act="go" data-to="settings">Definições</button>
        </nav>
      </div>
      <div class="linha-agua"></div>
    </div>`;
  }

  function topo(title, backTo) {
    return `<header class="pagina-topo"><button class="btn peq" data-act="back" data-to="${backTo}">Voltar</button><h2>${esc(title)}</h2></header>`;
  }
  function options(field, list, current) {
    return `<div class="escolhas" role="group">${list.map(o => `<button type="button" class="escolha" data-act="opt" data-field="${field}" data-val="${esc(o.v)}" aria-pressed="${String(o.v) === String(current)}"><b>${esc(o.t)}</b>${o.d ? `<small>${esc(o.d)}</small>` : ''}</button>`).join('')}</div>`;
  }
  const MODES = [
    { v: '2', t: '2 jogadores', d: 'Um contra um' },
    { v: '3', t: '3 jogadores', d: 'Todos contra todos' },
    { v: '4', t: '4 jogadores', d: 'Todos contra todos' },
    { v: '4t', t: '4 em duplas', d: 'Tu e o jogador à frente' },
  ];
  const TARGETS = [
    { v: 'round', t: 'Uma ronda', d: 'Partida rápida' },
    { v: '21', t: '21 pontos', d: 'Partida padrão' },
    { v: '32', t: '32 pontos', d: 'Partida longa' },
  ];
  const LEVELS = [
    { v: 'easy', t: 'Fácil', d: 'Apanha o óbvio, raramente monta e às vezes distrai-se.' },
    { v: 'medium', t: 'Médio', d: 'Dá valor ao 10 de Ouros, ao 2 de Espadas, aos ases e às espadas, e monta.' },
    { v: 'hard', t: 'Difícil', d: 'Lembra-se das cartas que saíram e simula jogadas futuras. Às vezes também erra.' },
  ];
  const LEVEL_NAME = { easy: 'Fácil', medium: 'Médio', hard: 'Difícil' };
  const modeToCfg = (mode, target) => ({ numPlayers: parseInt(mode, 10), teams: mode === '4t', target });

  function renderOffline() {
    app.innerHTML = `<div class="pagina tabuas">${topo('Jogar contra bots', 'menu')}
      <div class="pagina-corpo">
        <div class="campo"><span class="rotulo">Nível dos bots</span>${options('level', LEVELS, offlineCfg.level)}
          <p class="nota">Nenhum bot vê as tuas cartas nem o baralho.</p></div>
        <div class="campo"><span class="rotulo">Jogadores</span>${options('mode', MODES, offlineCfg.mode)}</div>
        <div class="campo"><span class="rotulo">Duração</span>${options('target', TARGETS, offlineCfg.target)}</div>
        <div class="acoes-fim"><button class="btn prim" data-act="start-offline">Começar partida</button></div>
      </div></div>`;
  }

  function renderSettings() {
    app.innerHTML = `<div class="pagina tabuas">${topo('Definições', session ? 'game' : 'menu')}
      <div class="pagina-corpo">
        <div class="campo"><label for="nome">O teu nome</label><input id="nome" type="text" maxlength="20" value="${esc(prefs.name)}" autocomplete="nickname" placeholder="Ex.: Mestre Zé"><p class="nota">É o nome que os outros veem nas partidas online.</p></div>
        <div class="campo"><span class="rotulo">Velocidade dos bots</span>${options('p-speed', [{ v: 'lenta', t: 'Lenta' }, { v: 'normal', t: 'Normal' }, { v: 'rapida', t: 'Rápida' }], prefs.speed)}</div>
        <div class="campo"><span class="rotulo">Ajudas na mesa</span>${options('p-hints', [{ v: true, t: 'Ligadas', d: 'Mostra o que podes levar e marca as cartas com pontos' }, { v: false, t: 'Desligadas', d: 'Só as regras, como numa mesa a sério' }], prefs.hints)}</div>
        <div class="campo"><span class="rotulo">Cor da mesa</span>${options('p-table', [{ v: 'azul', t: 'Azul do casco' }, { v: 'verde', t: 'Verde' }, { v: 'vinho', t: 'Vinho' }, { v: 'basalto', t: 'Basalto' }], prefs.table)}</div>
        <div class="campo"><span class="rotulo">Costas das cartas</span>${options('p-back', [{ v: 'riscas', t: 'Riscas do barco' }, { v: 'losangos', t: 'Losangos' }], prefs.back)}</div>
        <div class="campo"><span class="rotulo">Naipes</span>${options('p-colors4', [{ v: false, t: 'Duas cores' }, { v: true, t: 'Quatro cores', d: 'Ouros azuis e paus verdes' }], prefs.colors4)}</div>
        <div class="campo"><span class="rotulo">Som</span>${options('p-sound', [{ v: true, t: 'Ligado' }, { v: false, t: 'Desligado' }], prefs.sound)}</div>
        <div class="campo"><span class="rotulo">Animações</span>${options('p-motion', [{ v: true, t: 'Ligadas' }, { v: false, t: 'Desligadas' }], prefs.motion)}</div>
        ${load('save', null) ? '<div class="campo"><span class="rotulo">Partida guardada</span><div class="acoes-fim"><button class="btn peq perigo" data-act="clear-save">Apagar a partida guardada</button></div></div>' : ''}
      </div></div>`;
  }

  function renderRules() {
    const m = (v, l, cards) => monteHtml(v, l, cards);
    app.innerHTML = `<div class="pagina tabuas">${topo('Instruções', session ? 'game' : 'menu')}
      <div class="pagina-corpo regras">${window.CassinoRules(id => cardHtml(id), m)}</div></div>`;
  }

  // --- Sessão local ----------------------------------------------------------
  const BOT_NAMES = ['Zita', 'Agostinho', 'Conceição'];
  function LocalSession(state, level, names) {
    this.kind = 'local'; this.state = state; this.level = level; this.names = names; this.timer = null;
    this.seats = names.map((n, i) => ({ nick: n, isBot: i !== 0, connected: true }));
  }
  LocalSession.prototype.view = function () { return E.publicView(this.state, 0); };
  LocalSession.prototype.persist = function () {
    const s = this.state;
    if (s.phase === 'matchEnd') save('save', null);
    else save('save', { state: s, level: this.level, names: this.names });
  };
  LocalSession.prototype.tick = function () {
    clearTimeout(this.timer);
    const s = this.state;
    this.persist();
    if (s.phase !== 'play' || s.turn === 0) return;
    const delay = (SPEEDS[prefs.speed] || 1150) + Math.max(0, ui.dealingUntil - Date.now());
    this.timer = setTimeout(() => {
      if (session !== this) return;
      const p = s.turn;
      const m = B.choose(this.level, E.botView(s, p), Math.random);
      const r = E.applyMove(s, p, m);
      if (!r.ok) { console.error('bot', r, m); E.applyMove(s, p, { type: 'trail', card: s.hands[p][0] }); }
      updateGame(); this.tick();
    }, delay);
  };
  LocalSession.prototype.play = function (m) {
    const r = E.applyMove(this.state, 0, m);
    if (!r.ok) { toast(r.reason); return; }
    updateGame(); this.tick();
  };
  LocalSession.prototype.next = function () {
    E.nextRound(this.state, Math.random);
    updateGame(); this.tick();
  };
  LocalSession.prototype.leave = function () { clearTimeout(this.timer); };

  function startOffline() {
    const cfg = modeToCfg(offlineCfg.mode, offlineCfg.target);
    save('offline', offlineCfg);
    const names = [chosenName() || 'Tu'].concat(BOT_NAMES.slice(0, cfg.numPlayers - 1));
    session = new LocalSession(E.createMatch(cfg, Math.random), offlineCfg.level, names);
    ui.reset(); go('game'); session.tick();
  }
  function resumeOffline() {
    const d = load('save', null);
    if (!d) return;
    session = new LocalSession(d.state, d.level, d.names);
    ui.reset(); go('game'); session.tick();
  }

  // --- Sessão online ---------------------------------------------------------
  const API_BASE = window.CASSINO_API || '';
  let onlineAvailable = null;
  async function checkOnline() {
    try {
      const r = await fetch(API_BASE + '/api/health', { cache: 'no-store' });
      const j = await r.json();
      onlineAvailable = !!(j && j.ok && j.game === 'cassino');
    } catch (e) { onlineAvailable = false; }
    return onlineAvailable;
  }
  async function api(path, body) {
    const opts = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
    let r;
    try { r = await fetch(API_BASE + path, opts); }
    catch (e) { throw new Error('Sem ligação ao servidor. Verifica a internet e tenta outra vez.'); }
    let j = {};
    try { j = await r.json(); } catch (e) {}
    if (!r.ok) { const er = new Error(j.error || 'O servidor recusou o pedido.'); er.code = j.code; throw er; }
    return j;
  }

  function OnlineSession(code, token) {
    this.kind = 'online'; this.code = code; this.token = token; this.lobby = null; this.v = null; this.es = null;
    this.connected = false; this.chatSeen = 0;
  }
  OnlineSession.prototype.connect = function () {
    // Alguns alojamentos gratuitos adormecem sem pedidos a chegar, mesmo com jogadores ligados.
    clearInterval(this.keepAlive);
    this.keepAlive = setInterval(() => { if (session === this && this.es) api(`/api/rooms/${this.code}/check`, { token: this.token }).catch(() => {}); }, 240000);
    this.es = new EventSource(`${API_BASE}/api/rooms/${this.code}/stream?token=${encodeURIComponent(this.token)}`);
    this.es.onopen = () => { this.connected = true; };
    this.es.onmessage = ev => {
      const d = JSON.parse(ev.data);
      if (d.closed) { this.handleClosed(d.closed); return; }
      this.lobby = d.lobby; this.v = d.view;
      if (d.lobby.now) serverOffset = d.lobby.now - Date.now();
      this.seats = d.lobby.seats;
      const inGame = d.lobby.phase === 'game';
      if (inGame && screen === 'lobby') { ui.reset(); go('game'); }
      else if (!inGame && screen === 'game') { ui.reset(); go('lobby'); }
      else if (screen === 'lobby') renderLobby();
      else if (screen === 'game') updateGame();
    };
    this.es.onerror = () => {
      this.connected = false;
      if (this.es && this.es.readyState === 2) this.retry();
      else toast('Perdeste a ligação. A tentar voltar à sala.');
    };
  };
  // O navegador desistiu da ligação: pergunta se a sala ainda existe e volta a ligar.
  OnlineSession.prototype.retry = function () {
    this.close();
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(async () => {
      if (session !== this) return;
      try {
        await api(`/api/rooms/${this.code}/check`, { token: this.token });
        if (session === this) this.connect();
      } catch (e) {
        if (e.code === 'gone') this.handleClosed(e.message);
        else this.retry();
      }
    }, 2000);
  };
  OnlineSession.prototype.handleClosed = function (msg) {
    this.close(); save('room', null);
    if (session === this) session = null;
    toast(msg, 5000); go('online');
  };
  OnlineSession.prototype.close = function () { clearInterval(this.keepAlive); if (this.es) { this.es.close(); this.es = null; } };
  OnlineSession.prototype.action = async function (action, data) {
    try { await api(`/api/rooms/${this.code}/action`, Object.assign({ token: this.token, action }, data)); }
    catch (e) { toast(e.message); if (e.code === 'gone') this.handleClosed(e.message); }
  };
  OnlineSession.prototype.view = function () { return this.v; };
  OnlineSession.prototype.play = function (move) { this.action('move', { move }); };
  OnlineSession.prototype.next = function () { this.action('next'); };
  OnlineSession.prototype.leave = function () { clearTimeout(this.retryTimer); this.action('leave'); this.close(); save('room', null); };

  function enterRoom(code, token) {
    if (session && session.leave && session.kind === 'local') session.leave();
    session = new OnlineSession(code, token);
    save('room', { code, token });
    session.connect();
    go('lobby');
  }

  const online = { rooms: [], err: '', timer: null, code: '', pass: null, info: null, busy: false };
  const createCfg = Object.assign({ name: '', visibility: 'public', password: '', mode: '2', target: '21', turn: '60' }, load('create', {}));
  createCfg.password = '';

  async function refreshRooms() {
    try { online.rooms = (await api('/api/rooms')).rooms; online.err = ''; }
    catch (e) { online.err = e.message; }
    if (screen === 'online') paintRooms();
  }
  function paintRooms() {
    const box = document.getElementById('lista-salas');
    if (!box) return;
    const modeTxt = c => (c.teams ? '4 em duplas' : c.numPlayers + ' jogadores');
    const tgt = c => (c.target === 'round' ? 'uma ronda' : c.target + ' pontos');
    if (online.err) { box.innerHTML = `<p class="erro">${esc(online.err)}</p>`; return; }
    if (!online.rooms.length) { box.innerHTML = '<div class="vazio">Não há salas públicas abertas. Cria uma e partilha o link com os teus amigos.</div>'; return; }
    box.innerHTML = '<div class="salas">' + online.rooms.map(r => `<div class="sala"><div><b>${esc(r.name)}</b><small>${esc(modeTxt(r.config))}, ${esc(tgt(r.config))}. ${r.players} de ${r.capacity} lugares.</small></div>
      <button class="btn peq prim" data-act="join-public" data-code="${esc(r.code)}">Entrar</button></div>`).join('') + '</div>';
  }
  function needName() {
    const n = chosenName();
    if (!n) { toast('Escreve o teu nome para entrar.'); const i = document.getElementById('nome-online'); if (i) i.focus(); return null; }
    return n;
  }

  async function renderOnline() {
    if (onlineAvailable === null) {
      app.innerHTML = `<div class="pagina tabuas">${topo('Jogar online', 'menu')}<div class="pagina-corpo"><p>A procurar o servidor do jogo.</p></div></div>`;
      await checkOnline();
      if (screen !== 'online') return;
    }
    if (!onlineAvailable) {
      app.innerHTML = `<div class="pagina tabuas">${topo('Jogar online', 'menu')}
        <div class="pagina-corpo"><div class="bloco"><h3>Esta versão só tem o modo offline</h3>
        <p>Os lobbies com código e link funcionam quando o jogo está a correr no site com o servidor. Aqui podes jogar contra os bots e testar as regras.</p>
        <div class="acoes-fim"><button class="btn prim" data-act="go" data-to="offline">Jogar contra bots</button></div></div></div></div>`;
      return;
    }
    const inv = online.pendingInvite;
    app.innerHTML = `<div class="pagina tabuas">${topo('Jogar online', 'menu')}
      <div class="pagina-corpo">
        <div class="campo"><label for="nome-online">O teu nome</label><input id="nome-online" type="text" maxlength="20" value="${esc(prefs.name)}" autocomplete="nickname" placeholder="Como te chamam à mesa"></div>
        ${inv ? `<div class="bloco"><h3>Convite para a sala ${esc(inv)}</h3><p class="nota">Escreve o teu nome em cima e entra.</p></div>` : ''}
        <div class="bloco"><h3>Entrar numa sala privada</h3>
          <div class="campo"><label for="cod">Código da sala</label>
            <div class="linha-entrar"><input id="cod" type="text" maxlength="5" autocomplete="off" autocapitalize="characters" value="${esc(inv || online.code)}" placeholder="ABCDE"></div></div>
          <div class="campo"><label for="pw">Password</label><input id="pw" type="password" maxlength="40" autocomplete="off" placeholder="Só nas salas privadas"></div>
          <p class="erro" id="err-join" hidden></p>
          <div class="acoes-fim"><button class="btn prim" data-act="join-code">Entrar na sala</button></div>
        </div>
        <div class="bloco"><h3>Criar um lobby</h3><p class="nota">Recebes um código e um link para enviar aos teus amigos. Não precisam de conta.</p>
          <div class="acoes-fim"><button class="btn" data-act="go" data-to="create">Criar sala</button></div></div>
        <div class="bloco"><h3>Salas públicas</h3><div id="lista-salas"><div class="vazio">A carregar salas.</div></div></div>
      </div></div>`;
    refreshRooms();
    clearInterval(online.timer);
    online.timer = setInterval(() => { if (screen === 'online') refreshRooms(); else clearInterval(online.timer); }, 5000);
  }

  function renderCreate() {
    app.innerHTML = `<div class="pagina tabuas">${topo('Criar sala', 'online')}
      <div class="pagina-corpo">
        <div class="campo"><label for="nome-online">O teu nome</label><input id="nome-online" type="text" maxlength="20" value="${esc(prefs.name)}" autocomplete="nickname"></div>
        <div class="campo"><label for="nome-sala">Nome da sala</label><input id="nome-sala" type="text" maxlength="30" value="${esc(createCfg.name)}" placeholder="Ex.: Mesa do café"></div>
        <div class="campo"><span class="rotulo">Quem pode entrar</span>${options('c-visibility', [{ v: 'public', t: 'Pública', d: 'Aparece na lista de salas' }, { v: 'private', t: 'Privada', d: 'Só com código e password' }], createCfg.visibility)}</div>
        <div class="campo" id="campo-pw" ${createCfg.visibility === 'private' ? '' : 'hidden'}><label for="pw-sala">Password da sala</label><input id="pw-sala" type="password" maxlength="40" autocomplete="new-password" value="${esc(createCfg.password)}" placeholder="Pelo menos 3 caracteres"></div>
        <div class="campo"><span class="rotulo">Jogadores</span>${options('c-mode', MODES, createCfg.mode)}<p class="nota">No lobby podes preencher lugares vazios com bots.</p></div>
        <div class="campo"><span class="rotulo">Duração</span>${options('c-target', TARGETS, createCfg.target)}</div>
        <div class="campo"><span class="rotulo">Tempo por jogada</span>${options('c-turn', [{ v: '30', t: '30 segundos' }, { v: '60', t: '60 segundos' }, { v: '0', t: 'Sem limite' }], createCfg.turn)}<p class="nota">Quando o tempo acaba, o jogo faz uma jogada por ti.</p></div>
        <p class="erro" id="err-create" hidden></p>
        <div class="acoes-fim"><button class="btn prim" data-act="create-room">Criar sala</button></div>
      </div></div>`;
  }

  function renderLobby() {
    const s = session;
    if (!s || s.kind !== 'online') { go('online'); return; }
    const L = s.lobby;
    if (!L) { app.innerHTML = `<div class="pagina tabuas">${topo('Sala', 'online')}<div class="pagina-corpo"><p>A entrar na sala.</p></div></div>`; return; }
    const active = document.activeElement && document.activeElement.id === 'chat-txt' ? document.getElementById('chat-txt').value : null;
    const isHost = L.you.isHost;
    const link = location.origin + location.pathname + '?sala=' + L.code;
    const filled = L.seats.every(Boolean);
    const seat = (x, i) => {
      const side = L.config.teams ? i % 2 : -1;
      const mine = i === L.you.seat;
      if (!x) return `<div class="lugar lado-${side}"><b>Lugar livre</b>${L.config.teams ? `<small>${side === 0 ? 'Dupla 1' : 'Dupla 2'}</small>` : '<small>À espera de jogador</small>'}
        <div class="lugar-acoes"><button class="btn peq" data-act="seat" data-seat="${i}">Sentar aqui</button>
        ${isHost ? `<button class="btn peq" data-act="add-bot" data-seat="${i}" data-level="easy">Bot fácil</button><button class="btn peq" data-act="add-bot" data-seat="${i}" data-level="medium">Médio</button><button class="btn peq" data-act="add-bot" data-seat="${i}" data-level="hard">Difícil</button>` : ''}</div></div>`;
      return `<div class="lugar lado-${side}"><b>${esc(x.nick)}${mine ? ' (tu)' : ''}</b>
        <small>${x.isBot ? 'Bot ' + esc(LEVEL_NAME[x.level] || '') : x.connected ? (x.isHost ? 'Anfitrião' : 'Ligado') : 'Sem ligação'}${L.config.teams ? (side === 0 ? ', dupla 1' : ', dupla 2') : ''}</small>
        ${isHost && !mine ? `<div class="lugar-acoes"><button class="btn peq" data-act="remove-seat" data-seat="${i}">${x.isBot ? 'Tirar bot' : 'Expulsar'}</button></div>` : ''}</div>`;
    };
    const tgtTxt = L.config.target === 'round' ? 'uma ronda' : L.config.target + ' pontos';
    app.innerHTML = `<div class="pagina tabuas">${topo(L.name, 'leave-room')}
      <div class="pagina-corpo">
        <div class="bloco"><span class="rotulo">Código da sala</span><div class="codigo">${esc(L.code)}</div>
          <p class="nota">${L.visibility === 'private' ? 'Sala privada. Envia o link e a password aos teus amigos.' : 'Sala pública. Também aparece na lista de salas.'} ${L.config.teams ? '4 em duplas' : L.config.numPlayers + ' jogadores'}, ${esc(tgtTxt)}${L.turnSeconds ? `, ${L.turnSeconds} segundos por jogada` : ', sem limite de tempo'}.</p>
          <div class="acoes-fim"><button class="btn peq" data-act="copy" data-text="${esc(link)}">Copiar link de convite</button></div></div>
        <div class="bloco"><h3>Lugares</h3><div class="lugares">${L.seats.map(seat).join('')}</div></div>
        <div class="acoes-fim">${isHost ? `<button class="btn prim" data-act="start-online" ${filled ? '' : 'disabled'}>Começar partida</button>${filled ? '' : '<p class="nota">Espera por amigos ou preenche os lugares vazios com bots.</p>'}` : '<p>Quem criou a sala começa a partida.</p>'}</div>
        <div class="bloco chat"><h3>Conversa</h3>${chatHtml(L)}</div>
      </div></div>`;
    const list = app.querySelector('.chat-lista'); if (list) list.scrollTop = list.scrollHeight;
    if (active !== null) { const c = document.getElementById('chat-txt'); c.value = active; c.focus(); }
  }
  function chatHtml(L) {
    return `<div class="chat-lista" aria-live="polite">${L.chat.length ? L.chat.map(m => `<p><b>${esc(m.nick)}:</b> ${esc(m.text)}</p>`).join('') : '<p class="nota">Ainda ninguém escreveu.</p>'}</div>
    <form class="linha-entrar" data-form="chat"><input id="chat-txt" type="text" maxlength="200" autocomplete="off" placeholder="Escreve uma mensagem" aria-label="Mensagem" style="text-transform:none;letter-spacing:0;font-weight:400"><button class="btn peq" type="submit">Enviar</button></form>`;
  }

  // --- Mesa de jogo -----------------------------------------------------------
  const ui = {
    card: null, sel: new Set(), chatOpen: false, menuOpen: false, logDrawer: false, logStick: true,
    deal: null, dealSig: '', dealToken: 0, dealingUntil: 0,
    reset() { this.card = null; this.sel = new Set(); this.chatOpen = false; this.menuOpen = false; this.logDrawer = false; this.logStick = true; this.deal = null; this.dealSig = ''; this.dealToken++; this.dealingUntil = 0; lastMoveSig = ''; },
  };
  let lastMoveSig = '';

  function nameOf(seat, v) {
    if (seat === v.me) return 'Tu';
    const x = session.seats && session.seats[seat];
    return x ? x.nick : 'Jogador';
  }
  function sideName(side, v) {
    const cfg = v.config;
    if (!cfg.teams) return nameOf(side, v);
    return side === E.sideOf(cfg, v.me) ? 'A tua dupla' : 'Adversários';
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
      case 'build': return (me ? `Montaste ${m.value}` : `${n} montou ${m.value}`) + (detail ? ` com ${mini(m.card)} sobre ${list(m.take)}` : '');
      case 'call': return (me ? `Chamaste ${m.value}` : `${n} chamou ${m.value}`) + (detail ? ` com ${mini(m.card)} sobre ${list(m.take)}` : '');
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
    const x = session.seats && session.seats[p];
    const partner = cfg.teams && p !== v.me && side === E.sideOf(cfg, v.me);
    const backs = Array.from({ length: Math.max(0, v.handCounts[p] - (ui.deal ? ui.deal.seats[p] || 0 : 0)) }, () => back()).join('');
    const off = x && !x.isBot && x.connected === false;
    return `<div class="assento ${v.turn === p && v.phase === 'play' ? 'vez' : ''} ${off ? 'fora' : ''}" data-seat="${p}">
      <div class="assento-nome">${esc(nameOf(p, v))}${v.dealer === p ? '<span class="etiqueta" title="Dador">Dá</span>' : ''}${partner ? '<span class="etiqueta parceiro">Dupla</span>' : ''}</div>
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
    if (!session) { go('menu'); return; }
    const v = session.view();
    if (!v) { app.innerHTML = `<div class="pagina tabuas"><div class="pagina-corpo"><p>A carregar a mesa.</p></div></div>`; return; }
    checkDeal(v); // antes de desenhar, para as cartas a caminho não aparecerem já na mão de ninguém
    const metaTxt = v.config.target === 'round' ? 'Partida de uma ronda' : `Meta ${v.config.target}`;
    const others = [];
    for (let i = 1; i < v.config.numPlayers; i++) others.push((v.me + i) % v.config.numPlayers);
    const myDeal = v.dealer === v.me ? '<span class="etiqueta">Dá</span>' : '';
    app.innerHTML = `<div class="jogo tabuas">
      <div class="barra">
        <span class="info">Ronda ${v.roundNo}. ${esc(metaTxt)}</span>
        <div class="placar">${placar(v)}</div>
        <div class="barra-acoes"><button class="icon" data-act="toggle-log" aria-controls="historico">Histórico</button>${session.kind === 'online' ? `<button class="icon" data-act="toggle-chat">Conversa</button>` : ''}<button class="icon" data-act="toggle-menu">Menu</button></div>
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
            <div class="assento-nome">${esc(session.kind === 'local' ? (chosenName() || 'Tu') : 'Tu')}${myDeal}</div>
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
    const open = isWide() ? prefs.logOpen : ui.logDrawer;
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
      if (screen === 'game' && session) {
        const now = session.view();
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
    if (nEl && session) nEl.textContent = session.view().deckCount + d.deck;
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
    const ctx = { hand: v.hand, table: v.table };
    // Limpa seleções que deixaram de fazer sentido.
    if (ui.card && !v.hand.includes(ui.card)) { ui.card = null; ui.sel.clear(); }
    for (const id of [...ui.sel]) if (!v.table.some(t => t.id === id)) ui.sel.delete(id);
    if (!canAct) { ui.card = null; ui.sel.clear(); }

    // Mesa
    const hints = ui.card && prefs.hints ? E.captureHints(v.table, ui.card) : new Set();
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
    linha.textContent = (v.config.teams ? 'A tua dupla: ' : 'Tu: ') + capText(v, side);
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
    if (v.phase !== 'play' || ui.deal) { al.textContent = ''; return; }
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
      case 'build': return `Montar ${a.value}`;
      case 'call': return `Chamar ${a.value}`;
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
      const deadline = session.kind === 'online' && session.lobby && session.lobby.deadline;
      box.innerHTML = `<p>Vez de ${esc(nameOf(v.turn, v))}.${deadline ? ` <span class="relogio" data-deadline="${deadline}"></span>` : ''}</p>`;
      tickClock(); return;
    }
    const deadline = session.kind === 'online' && session.lobby && session.lobby.deadline;
    const clock = deadline ? ` <span class="relogio" data-deadline="${deadline}"></span>` : '';
    if (!ui.card) { box.innerHTML = `<p>É a tua vez. Escolhe uma carta da mão.${clock}</p>`; tickClock(); return; }
    const sel = [...ui.sel];
    const acts = E.actionsFor(ctx, ui.card, sel);
    const parts = [];
    if (!sel.length) {
      const best = E.bestCapture(v.table, ui.card, it => (it.k === 'b' ? it.cards.length : 1));
      if (best.length) {
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
    else if (!sel.length && !parts.length) msg = '<p>Toca nas cartas da mesa para montar.</p>';
    box.innerHTML = parts.join('') + msg + clock;
    tickClock();
  }

  function tickClock() {
    const c = document.querySelector('.relogio');
    if (!c) return;
    const left = Math.max(0, Math.ceil((+c.dataset.deadline - serverNow()) / 1000));
    c.textContent = left + ' s';
  }
  let serverOffset = 0;
  function serverNow() { return Date.now() + serverOffset; }
  setInterval(() => { if (screen === 'game') tickClock(); }, 500);

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

  const HOW = { cards: 'pelas cartas', spades: 'pelas espadas', grande: 'pelo Cassino Grande', pequeno: 'pelo Cassino Pequeno', aces: 'pelos ases', sweeps: 'pelas clarezas' };
  function paintOverlay(v) {
    const box = document.getElementById('sobre');
    let html = '';
    if (ui.menuOpen) {
      html = `<div class="sobre"><div class="folha"><h2>Menu</h2>
        <div class="folha-acoes"><button class="btn prim" data-act="toggle-menu">Voltar ao jogo</button></div>
        <div class="folha-acoes"><button class="btn" data-act="go" data-to="rules">Instruções</button><button class="btn" data-act="go" data-to="settings">Definições</button></div>
        <div class="folha-acoes"><button class="btn perigo" data-act="quit">${session.kind === 'online' ? 'Sair da sala' : 'Sair para o menu'}</button></div>
        ${session.kind === 'local' ? '<p class="nota">A partida fica guardada neste dispositivo.</p>' : '<p class="nota">Se saíres, um bot fica com o teu lugar.</p>'}
      </div></div>`;
    } else if (ui.chatOpen && session.kind === 'online') {
      html = `<div class="sobre"><div class="folha chat"><h2>Conversa</h2>${chatHtml(session.lobby)}<div class="folha-acoes"><button class="btn" data-act="toggle-chat">Fechar</button></div></div></div>`;
    } else if (v.phase === 'roundEnd' || v.phase === 'matchEnd') {
      const end = v.phase === 'matchEnd';
      const left = v.result.leftovers.length && v.result.leftoversTo !== null ? `<p class="nota">${v.result.leftovers.length} ${v.result.leftovers.length === 1 ? 'carta que sobrou foi' : 'cartas que sobraram foram'} para ${esc(sideNameOfPlayer(v.result.leftoversTo, v))}.</p>` : '';
      let title = `Fim da ronda ${v.roundNo}`, cls = '', note = '';
      if (end) {
        const w = v.match.winners[0];
        const mine = w === E.sideOf(v.config, v.me);
        title = mine ? (v.config.teams ? 'A tua dupla ganhou!' : 'Ganhaste!') : `${sideName(w, v)} ${v.config.teams ? 'ganharam' : 'ganhou'}`;
        cls = mine ? 'ganhou' : 'perdeu';
        if (v.match.how && v.match.how !== 'score') note = `<p class="nota">Empate no total, decidido ${HOW[v.match.how]} da última ronda.</p>`;
      } else if (v.match.extra) note = '<p>Empate total. Joga-se mais uma ronda e os pontos somam ao total.</p>';
      else note = v.config.target !== 'round' ? `<p class="nota">A partida continua até ${v.config.target} pontos.</p>` : '';
      const isHost = session.kind !== 'online' || (session.lobby && session.lobby.you.isHost);
      let actions = '';
      if (end) {
        actions = session.kind === 'online'
          ? (isHost ? '<button class="btn prim" data-act="back-lobby">Voltar ao lobby</button>' : '<p class="nota">Quem criou a sala escolhe o que fazer a seguir.</p>') + '<button class="btn" data-act="quit">Sair da sala</button>'
          : '<button class="btn prim" data-act="again">Jogar outra vez</button><button class="btn" data-act="quit">Sair para o menu</button>';
      } else {
        actions = isHost ? '<button class="btn prim" data-act="next-round">Próxima ronda</button>' : '<p class="nota">A próxima ronda começa quando quem criou a sala avançar.</p>';
      }
      html = `<div class="sobre"><div class="folha ${cls}"><h2>${esc(title)}</h2>${note}${scoreTable(v)}${left}<div class="folha-acoes">${actions}</div><button class="link" data-act="toggle-log">Ver o histórico da ronda</button></div></div>`;
    }
    box.innerHTML = html;
    if (ui.chatOpen) { const l = box.querySelector('.chat-lista'); if (l) l.scrollTop = l.scrollHeight; }
  }
  function sideNameOfPlayer(p, v) { return v.config.teams ? sideName(E.sideOf(v.config, p), v) : (p === v.me ? 'ti' : nameOf(p, v)); }

  // Atualiza a mesa com animações: cada carta voa da posição antiga para a nova.
  function updateGame() {
    if (screen !== 'game') return;
    const v = session.view();
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

  // --- Eventos -----------------------------------------------------------------
  document.addEventListener('click', async ev => {
    const t = ev.target.closest('[data-act]');
    if (!t || t.disabled) return;
    const act = t.dataset.act;
    switch (act) {
      case 'go': ui.menuOpen = false; go(t.dataset.to); break;
      case 'back':
        if (t.dataset.to === 'leave-room') { if (session) session.leave(); session = null; go('online'); break; }
        if (t.dataset.to === 'menu' && session && session.kind === 'online' && session.lobby) { go('lobby'); break; }
        go(t.dataset.to); break;
      case 'resume': resumeOffline(); break;
      case 'clear-save': save('save', null); renderSettings(); break;
      case 'opt': handleOption(t); break;
      case 'start-offline': startOffline(); break;
      case 'pick-hand': {
        const c = t.dataset.cardBtn;
        if (ui.card === c) { ui.card = null; ui.sel.clear(); }
        else { ui.card = c; ui.sel.clear(); }
        beep(500, 0.03, 'triangle', 0.02);
        paintDynamic(session.view()); break;
      }
      case 'pick-table': {
        const id = t.dataset.id;
        if (ui.sel.has(id)) ui.sel.delete(id); else ui.sel.add(id);
        paintDynamic(session.view()); break;
      }
      case 'do-action': {
        const m = ui.actions[+t.dataset.i];
        if (m) { ui.card = null; ui.sel.clear(); session.play(m); }
        break;
      }
      case 'next-round': session.next(); break;
      case 'again': { const prev = session; clearTimeout(prev.timer); session = new LocalSession(E.createMatch(prev.state.config, Math.random), prev.level, prev.names); ui.reset(); go('game'); session.tick(); break; }
      case 'back-lobby': session.action('lobby'); break;
      case 'quit':
        ui.reset();
        if (session) session.leave();
        { const wasOnline = session && session.kind === 'online'; session = null; go(wasOnline ? 'online' : 'menu'); }
        break;
      case 'toggle-menu': ui.menuOpen = !ui.menuOpen; paintOverlay(session.view()); break;
      case 'toggle-log':
        if (isWide()) { prefs.logOpen = !prefs.logOpen; applyPrefs(); } else ui.logDrawer = !ui.logDrawer;
        ui.logStick = true;
        paintLog(session.view());
        break;
      case 'toggle-chat': ui.chatOpen = !ui.chatOpen; paintOverlay(session.view()); break;
      case 'join-public': { const n = needName(); if (n) await doJoin(t.dataset.code, ''); break; }
      case 'join-code': {
        const n = needName(); if (!n) break;
        const code = document.getElementById('cod').value.trim().toUpperCase();
        if (code.length !== 5) { showErr('err-join', 'O código tem 5 letras ou números.'); break; }
        await doJoin(code, document.getElementById('pw').value);
        break;
      }
      case 'create-room': await doCreate(); break;
      case 'seat': session.action('seat', { seat: +t.dataset.seat }); break;
      case 'add-bot': session.action('addBot', { seat: +t.dataset.seat, level: t.dataset.level }); break;
      case 'remove-seat': session.action('removeSeat', { seat: +t.dataset.seat }); break;
      case 'start-online': session.action('start'); break;
      case 'copy': {
        const text = t.dataset.text;
        try { await navigator.clipboard.writeText(text); toast('Link copiado.'); }
        catch (e) { toast(text, 8000); }
        break;
      }
    }
  });

  function showErr(id, msg) { const e = document.getElementById(id); if (e) { e.textContent = msg; e.hidden = false; } else toast(msg); }

  function handleOption(t) {
    const f = t.dataset.field; let val = t.dataset.val;
    if (val === 'true') val = true; else if (val === 'false') val = false;
    if (f.startsWith('p-')) {
      prefs[f.slice(2)] = val;
      if (f === 'p-colors4') for (const k in cardCache) delete cardCache[k];
      applyPrefs(); renderSettings(); return;
    }
    if (f.startsWith('c-')) {
      keepCreateInputs();
      createCfg[f.slice(2)] = String(val); renderCreate(); return;
    }
    offlineCfg[f] = String(val); renderOffline();
  }
  function keepCreateInputs() {
    const a = document.getElementById('nome-sala'); if (a) createCfg.name = a.value;
    const b = document.getElementById('pw-sala'); if (b) createCfg.password = b.value;
  }

  document.addEventListener('input', ev => {
    const id = ev.target.id;
    if (id === 'nome' || id === 'nome-online') { prefs.name = ev.target.value; applyPrefs(); }
  });
  document.addEventListener('submit', ev => {
    ev.preventDefault();
    const f = ev.target;
    if (f.dataset.form === 'chat') {
      const i = f.querySelector('input');
      const text = i.value.trim();
      if (text && session && session.action) { session.action('chat', { text }); i.value = ''; }
    }
  });

  async function doJoin(code, password) {
    try {
      const r = await api(`/api/rooms/${encodeURIComponent(code)}/join`, { nick: chosenName(), password });
      online.pendingInvite = null;
      cleanUrl();
      enterRoom(code, r.token);
    } catch (e) { showErr('err-join', e.message); }
  }
  async function doCreate() {
    const nick = needName(); if (!nick) return;
    keepCreateInputs();
    const pw = createCfg.password;
    if (createCfg.visibility === 'private' && pw.length < 3) { showErr('err-create', 'A password tem de ter pelo menos 3 caracteres.'); return; }
    const c = { ...createCfg }; delete c.password; save('create', c);
    try {
      const r = await api('/api/rooms', {
        nick, name: createCfg.name.trim() || `Mesa de ${nick}`, visibility: createCfg.visibility, password: pw,
        config: modeToCfg(createCfg.mode, createCfg.target), turnSeconds: +createCfg.turn,
      });
      createCfg.password = '';
      enterRoom(r.code, r.token);
    } catch (e) { showErr('err-create', e.message); }
  }
  function cleanUrl() { try { const u = new URL(location.href); u.searchParams.delete('sala'); history.replaceState(null, '', u.pathname + u.search); } catch (e) {} }

  // --- Arranque ----------------------------------------------------------------
  applyPrefs();
  (async function boot() {
    let inv = null;
    try { inv = new URLSearchParams(location.search).get('sala'); } catch (e) {}
    const saved = load('room', null);
    if (inv || saved) {
      await checkOnline();
      if (onlineAvailable) {
        if (saved && (!inv || saved.code === inv.toUpperCase())) {
          try {
            await api(`/api/rooms/${saved.code}/check`, { token: saved.token });
            cleanUrl(); enterRoom(saved.code, saved.token); return;
          } catch (e) { save('room', null); }
        }
        if (inv) { online.pendingInvite = inv.toUpperCase().slice(0, 5); go('online'); return; }
      }
    }
    go('menu');
  })();
})();
