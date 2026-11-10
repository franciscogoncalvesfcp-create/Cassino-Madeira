// Plataforma: menu, definições, partidas offline, salas online, lobby e conversa.
// A mesa de cada jogo vem do seu módulo (games/<jogo>/table.js) e regista-se em window.PlatformGames.
(function () {
  'use strict';
  const N = window.PlatformNames;
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
  // Escolhas guardadas por jogo. As de antes da plataforma (mode/level/target soltos) eram do Cassino.
  const offlineCfg = (function () {
    const raw = load('offline', {}) || {};
    const c = { game: raw.game || 'cassino', per: raw.per || {} };
    if (!raw.per && (raw.mode || raw.level || raw.target)) c.per.cassino = { mode: raw.mode, level: raw.level, target: raw.target };
    return c;
  })();

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

  // O anfitrião pode desligar ajudas, histórico e avisos para toda a sala.
  function roomOpt(k) { return !(session && session.kind === 'online' && session.lobby && session.lobby.options && session.lobby.options[k] === false); }
  const hintsOn = () => prefs.hints && roomOpt('hints');

  // --- O que a plataforma dá a cada mesa ----------------------------------------
  let serverOffset = 0;
  function serverNow() { return Date.now() + serverOffset; }
  function tickClock() {
    const c = document.querySelector('.relogio');
    if (!c) return;
    const left = Math.max(0, Math.ceil((+c.dataset.deadline - serverNow()) / 1000));
    c.textContent = left + ' s';
  }
  setInterval(() => { if (screen === 'game') tickClock(); }, 500);

  const P = {
    esc, prefs, save, load, sfx, beep, toast, applyPrefs, reducedMotion, chosenName, roomOpt, hintsOn, serverNow, tickClock,
    ui: { menuOpen: false, chatOpen: false },
    get app() { return app; },
    get session() { return session; },
    get screen() { return screen; },
    go: (s, o) => go(s, o),
    baseOverlay: () => baseOverlay(),
    confetti: () => confetti(),
    chatHtml: L => chatHtml(L),
  };
  P.cards = window.PlatformCards.create({ prefs, esc, mark: id => !!(G && G.markCard && G.markCard(id)) });
  const GAMES = {};
  let G = null; // jogo atual
  for (const id in window.PlatformGames) GAMES[id] = window.PlatformGames[id](P);
  G = GAMES.cassino;
  const useGame = id => { if (GAMES[id]) G = GAMES[id]; return G; };
  function resetTable() { P.ui.menuOpen = false; P.ui.chatOpen = false; G.reset(); }
  const perGame = (store, game) => (store.per[game.id] = Object.assign({}, game.defaults, store.per[game.id] || {}));
  const gameChoice = (field, current) => (Object.keys(GAMES).length > 1
    ? `<div class="campo"><span class="rotulo">Jogo</span>${options(field, Object.values(GAMES).map(g => ({ v: g.id, t: g.name, d: g.tagline })), current)}</div>` : '');
  function confetti() {
    if (reducedMotion()) return;
    const box = document.createElement('div');
    box.className = 'confetes';
    box.setAttribute('aria-hidden', 'true');
    const cols = ['#f4bc23', '#cf3b22', '#fbfaf4', '#1b6a93'];
    for (let i = 0; i < 70; i++) {
      const c = document.createElement('i');
      c.style.left = Math.random() * 100 + '%';
      c.style.background = cols[i % 4];
      c.style.animationDelay = 300 + Math.random() * 900 + 'ms';
      c.style.animationDuration = 1600 + Math.random() * 1400 + 'ms';
      c.style.setProperty('--x', (Math.random() * 120 - 60) + 'px');
      c.style.setProperty('--r', Math.random() * 720 + 'deg');
      box.appendChild(c);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 4400);
  }
  // Menu e conversa por cima da mesa, iguais em todos os jogos.
  function baseOverlay() {
    if (P.ui.menuOpen) {
      return `<div class="sobre"><div class="folha"><h2>Menu</h2>
        <div class="folha-acoes"><button class="btn prim" data-act="toggle-menu">Voltar ao jogo</button></div>
        <div class="folha-acoes"><button class="btn" data-act="go" data-to="rules">Instruções</button><button class="btn" data-act="go" data-to="settings">Definições</button></div>
        <div class="folha-acoes"><button class="btn perigo" data-act="quit">${session.kind === 'online' ? 'Sair da sala' : 'Sair para o menu'}</button></div>
        ${session.kind === 'local' ? '<p class="nota">A partida fica guardada neste dispositivo.</p>' : '<p class="nota">Se saíres, um bot fica com o teu lugar.</p>'}
      </div></div>`;
    }
    if (P.ui.chatOpen && session.kind === 'online') {
      return `<div class="sobre"><div class="folha chat"><h2>Conversa</h2>${chatHtml(session.lobby)}<div class="folha-acoes"><button class="btn" data-act="toggle-chat">Fechar</button></div></div></div>`;
    }
    return '';
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
    else if (screen === 'game') G.render();
  }

  // --- Menu ------------------------------------------------------------------
  function renderMenu() {
    const saved = load('save', null);
    app.innerHTML = `<div class="menu tabuas">
      <div class="menu-corpo">
        <div class="marca">
          <div class="leque" aria-hidden="true">${G.menuArt()}</div>
          <h1>Cassino</h1>
          <p>Jogos de cartas da Madeira: ${Object.values(GAMES).map(g => esc(g.name)).join(' e ')}. Joga contra bots ou com amigos.</p>
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
  function renderOffline() {
    useGame(offlineCfg.game);
    const o = perGame(offlineCfg, G);
    app.innerHTML = `<div class="pagina tabuas">${topo('Jogar contra bots', 'menu')}
      <div class="pagina-corpo">
        ${gameChoice('game', G.id)}
        <div class="campo"><span class="rotulo">Nível dos bots</span>${options('level', G.levels, o.level)}
          <p class="nota">Nenhum bot vê as tuas cartas nem o baralho.</p></div>
        <div class="campo"><span class="rotulo">Jogadores</span>${options('mode', G.modes, o.mode)}</div>
        ${G.targets.length ? `<div class="campo"><span class="rotulo">Duração</span>${options('target', G.targets, o.target)}</div>` : ''}
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
    // Durante uma partida mostra as regras desse jogo; no menu dá para escolher.
    const tabs = !session && Object.keys(GAMES).length > 1
      ? `<div class="escolhas" role="group" aria-label="Jogo">${Object.values(GAMES).map(g => `<button type="button" class="escolha" data-act="rules-game" data-game="${g.id}" aria-pressed="${g === G}"><b>${esc(g.name)}</b></button>`).join('')}</div>` : '';
    app.innerHTML = `<div class="pagina tabuas">${topo('Instruções', session ? 'game' : 'menu')}
      <div class="pagina-corpo regras">${tabs}${G.instructions()}</div></div>`;
  }

  // --- Sessão local (contra bots, no próprio dispositivo) -------------------------
  // Usa o contrato do módulo, como o servidor: o jogador é sempre o lugar 0.
  const localCtx = () => ({ now: Date.now(), rng: Math.random });
  function LocalSession(game, state, level, names) {
    this.kind = 'local'; this.game = game; this.mod = game.module; this.state = state; this.level = level; this.names = names; this.timer = null;
    this.seats = names.map((n, i) => ({ nick: n, isBot: i !== 0, connected: true }));
  }
  LocalSession.prototype.view = function () { return this.mod.view(this.state, 0, { now: Date.now(), options: {} }); };
  LocalSession.prototype.persist = function () {
    if (this.mod.over(this.state)) save('save', null);
    else save('save', { game: this.game.id, state: this.state, level: this.level, names: this.names });
  };
  LocalSession.prototype.tick = function () {
    clearTimeout(this.timer);
    const s = this.state, mod = this.mod;
    this.persist();
    if (mod.over(s)) return;
    this.version = (this.version || 0) + 1;
    if (this.reactVersion !== this.version) { this.reactTried = {}; this.reactVersion = this.version; }
    const now = Date.now();
    const busy = Math.max(0, (this.game.busyUntil ? this.game.busyUntil() : 0) - now);
    const speed = SPEEDS[prefs.speed] || 1150;
    const due = [];
    for (const w of mod.waitingFor(s, now)) if (w.seat !== 0) due.push({ at: now + speed + busy, run: () => this.botChoose(w.seat) });
    // Bots que querem jogar fora da vez (ex.: Jogada Rápida no Gringo).
    for (let p = 1; p < this.names.length; p++) {
      const r = mod.bots.react(this.level, mod.bots.view(s, p), Math.random);
      if (!r || !r.action) continue;
      const key = p + ':' + JSON.stringify(r.action);
      if (this.reactTried[key]) continue;
      due.push({ at: now + busy + r.delayMs * speed / 1150, run: () => this.botReact(p, r.action, key) });
    }
    const d = mod.nextDeadline(s, now);
    if (d !== null && d !== undefined) due.push({ at: d, run: () => { mod.tick(s, Date.now(), Math.random); this.game.update(); this.tick(); } });
    if (!due.length) return;
    due.sort((x, y) => x.at - y.at);
    const first = due[0];
    this.timer = setTimeout(() => { if (session === this) first.run(); }, Math.max(0, first.at - Date.now()));
  };
  LocalSession.prototype.botChoose = function (p) {
    const s = this.state, mod = this.mod;
    const m = mod.bots.choose(this.level, mod.bots.view(s, p), Math.random);
    const r = m ? mod.apply(s, p, m, localCtx()) : { ok: false };
    if (!r.ok) { console.error('bot', r, m); const f = mod.fallback(s, p, Math.random); if (f) mod.apply(s, p, f, localCtx()); }
    this.game.update(); this.tick();
  };
  LocalSession.prototype.botReact = function (p, action, key) {
    const s = this.state, mod = this.mod;
    this.reactTried[key] = true;
    const again = mod.bots.react(this.level, mod.bots.view(s, p), Math.random);
    if (again && JSON.stringify(again.action) === JSON.stringify(action) && mod.apply(s, p, action, localCtx()).ok) this.game.update();
    this.tick();
  };
  LocalSession.prototype.play = function (m) {
    const r = this.mod.apply(this.state, 0, m, localCtx());
    if (!r.ok) { toast(r.reason); return; }
    this.game.update(); this.tick();
  };
  LocalSession.prototype.next = function () { this.play({ type: 'next' }); };
  LocalSession.prototype.leave = function () { clearTimeout(this.timer); };

  function startLocal(game, cfg, level, names, settings) {
    if (session && session.kind === 'local') session.leave();
    useGame(game.id);
    session = new LocalSession(game, game.module.setup(cfg, Math.random, settings || {}), level, names);
    resetTable(); go('game'); session.tick();
  }
  function startOffline() {
    const o = perGame(offlineCfg, G);
    const cfg = G.modeToCfg(o.mode, o.target);
    save('offline', offlineCfg);
    const me = chosenName() || 'Tu';
    startLocal(G, cfg, o.level, [me].concat(N.pickNames(cfg.numPlayers - 1, Math.random, [me])));
  }
  function resumeOffline() {
    const d = load('save', null);
    if (!d) return;
    const game = useGame(d.game || 'cassino'); // partidas guardadas antes da plataforma não têm o jogo
    session = new LocalSession(game, d.state, d.level, d.names);
    resetTable(); go('game'); session.tick();
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
      useGame(d.lobby.game);
      if (d.lobby.now) serverOffset = d.lobby.now - Date.now();
      this.seats = d.lobby.seats;
      const inGame = d.lobby.phase === 'game';
      if (inGame && screen === 'lobby') { resetTable(); go('game'); }
      else if (!inGame && screen === 'game') { resetTable(); go('lobby'); }
      else if (screen === 'lobby') renderLobby();
      else if (screen === 'game') G.update();
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
  const createCfg = (function () {
    const raw = load('create', {}) || {};
    const c = { name: raw.name || '', visibility: raw.visibility || 'public', password: '', turn: raw.turn || '60', game: raw.game || 'cassino', per: raw.per || {} };
    if (!raw.per && (raw.mode || raw.target)) c.per.cassino = { mode: raw.mode, target: raw.target };
    return c;
  })();

  async function refreshRooms() {
    try { online.rooms = (await api('/api/rooms')).rooms; online.err = ''; }
    catch (e) { online.err = e.message; }
    if (screen === 'online') paintRooms();
  }
  function paintRooms() {
    const box = document.getElementById('lista-salas');
    if (!box) return;
    const gameOf = r => GAMES[r.game] || G;
    if (online.err) { box.innerHTML = `<p class="erro">${esc(online.err)}</p>`; return; }
    if (!online.rooms.length) { box.innerHTML = '<div class="vazio">Não há salas públicas abertas. Cria uma e partilha o link com os teus amigos.</div>'; return; }
    box.innerHTML = '<div class="salas">' + online.rooms.map(r => `<div class="sala"><div><b>${esc(r.name)}</b><small>${esc(gameOf(r).name)}: ${esc(gameOf(r).modeName(r.config))}, ${esc(gameOf(r).targetText(r.config))}. ${r.players} de ${r.capacity} lugares.</small></div>
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
    useGame(createCfg.game);
    const o = perGame(createCfg, G);
    app.innerHTML = `<div class="pagina tabuas">${topo('Criar sala', 'online')}
      <div class="pagina-corpo">
        <div class="campo"><label for="nome-online">O teu nome</label><input id="nome-online" type="text" maxlength="20" value="${esc(prefs.name)}" autocomplete="nickname"></div>
        <div class="campo"><label for="nome-sala">Nome da sala</label><input id="nome-sala" type="text" maxlength="30" value="${esc(createCfg.name)}" placeholder="Ex.: Mesa do café"></div>
        ${gameChoice('c-game', G.id)}
        <div class="campo"><span class="rotulo">Quem pode entrar</span>${options('c-visibility', [{ v: 'public', t: 'Pública', d: 'Aparece na lista de salas' }, { v: 'private', t: 'Privada', d: 'Só com código e password' }], createCfg.visibility)}</div>
        <div class="campo" id="campo-pw" ${createCfg.visibility === 'private' ? '' : 'hidden'}><label for="pw-sala">Password da sala</label><input id="pw-sala" type="password" maxlength="40" autocomplete="new-password" value="${esc(createCfg.password)}" placeholder="Pelo menos 3 caracteres"></div>
        <div class="campo"><span class="rotulo">Jogadores</span>${options('c-mode', G.modes, o.mode)}<p class="nota">No lobby podes preencher lugares vazios com bots e mudar de jogo.</p></div>
        ${G.targets.length ? `<div class="campo"><span class="rotulo">Duração</span>${options('c-target', G.targets, o.target)}</div>` : ''}
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
    const teams = N.numTeams(L.config);
    const seat = (x, i) => {
      const side = teams ? i % teams : -1;
      const mine = i === L.you.seat;
      const botBtns = isHost ? G.levels.map((l, k) => `<button class="btn peq" data-act="add-bot" data-seat="${i}" data-level="${esc(l.v)}">${esc(k === 0 ? 'Bot ' + l.t.toLowerCase() : l.t)}</button>`).join('') : '';
      if (!x) return `<div class="lugar lado-${side}"><b>Lugar livre</b><small>À espera de jogador</small>
        <div class="lugar-acoes"><button class="btn peq" data-act="seat" data-seat="${i}">Sentar aqui</button>${botBtns}</div></div>`;
      const moves = [];
      if (isHost && !mine) moves.push(`<button class="btn peq" data-act="remove-seat" data-seat="${i}">${x.isBot ? 'Tirar bot' : 'Expulsar'}</button>`);
      if (teams && isHost && !mine) for (let t = 0; t < teams; t++) if (t !== side) moves.push(`<button class="btn peq" data-act="change-team" data-seat="${i}" data-team="${t}">Pôr na equipa ${t + 1}</button>`);
      return `<div class="lugar lado-${side}"><b>${esc(x.nick)}${mine ? ' (tu)' : ''}</b>
        <small>${x.isBot ? 'Bot ' + esc(G.levelName[x.level] || '') : x.connected ? (x.isHost ? 'Anfitrião' : 'Ligado') : 'Sem ligação'}</small>
        ${moves.length ? `<div class="lugar-acoes">${moves.join('')}</div>` : ''}</div>`;
    };
    const seatsHtml = teams
      ? `<div class="equipas">${Array.from({ length: teams }, (_, t) => {
          const mineHere = L.you.seat % teams === t;
          const list = L.seats.map((x, i) => [x, i]).filter(([, i]) => i % teams === t);
          return `<div class="equipa lado-${t}"><div class="equipa-topo"><h3>Equipa ${t + 1}</h3>${mineHere ? '<span class="etiqueta parceiro">A tua</span>' : `<button class="btn peq prim" data-act="change-team" data-team="${t}">Mudar para esta equipa</button>`}</div>${list.map(([x, i]) => seat(x, i)).join('')}</div>`;
        }).join('')}</div>`
      : `<div class="lugares">${L.seats.map(seat).join('')}</div>`;
    const tgtTxt = G.targetText(L.config);
    app.innerHTML = `<div class="pagina tabuas">${topo(L.name, 'leave-room')}
      <div class="pagina-corpo">
        <div class="bloco"><span class="rotulo">Código da sala</span><div class="codigo">${esc(L.code)}</div>
          <p class="nota">${esc(G.name)}. ${L.visibility === 'private' ? 'Sala privada. Envia o link e a password aos teus amigos.' : 'Sala pública. Também aparece na lista de salas.'} ${esc(G.modeName(L.config))}, ${esc(tgtTxt)}${L.turnSeconds ? `, ${L.turnSeconds} segundos por jogada` : ', sem limite de tempo'}.</p>
          <div class="acoes-fim"><button class="btn peq" data-act="copy" data-text="${esc(link)}">Copiar link de convite</button></div></div>
        <div class="bloco"><div class="equipa-topo"><h3>${teams ? 'Equipas' : 'Lugares'}</h3>${isHost && teams ? '<button class="btn peq" data-act="shuffle-teams">Baralhar equipas</button>' : ''}</div>${seatsHtml}</div>
        <div class="acoes-fim">${isHost ? `<button class="btn prim" data-act="start-online" ${filled ? '' : 'disabled'}>Começar partida</button>${filled ? '' : '<p class="nota">Espera por amigos ou preenche os lugares vazios com bots.</p>'}` : '<p>Quem criou a sala começa a partida.</p>'}</div>
        ${roomSettings(L, isHost)}
        <div class="bloco chat"><h3>Conversa</h3>${chatHtml(L)}</div>
      </div></div>`;
    const list = app.querySelector('.chat-lista'); if (list) list.scrollTop = list.scrollHeight;
    if (active !== null) { const c = document.getElementById('chat-txt'); c.value = active; c.focus(); }
  }
  function roomSettings(L, isHost) {
    const o = L.options || {};
    const opts = G.roomOptions;
    if (!isHost) {
      const off = opts.filter(([k]) => o[k] === false).map(([, t]) => t.toLowerCase());
      return `<div class="bloco"><h3>Regras da sala</h3><p class="nota">${off.length ? 'Quem criou a sala desligou: ' + esc(off.join(', ')) + '.' : 'Está tudo ligado: ' + esc(opts.map(([, t]) => t.toLowerCase()).join(', ')) + '.'}</p></div>`;
    }
    const onOff = (k) => [{ v: true, t: 'Ligado' }, { v: false, t: 'Desligado' }];
    return `<div class="bloco"><h3>Definições da sala</h3><p class="nota">Só tu podes mudar isto, e só antes de começar.</p>
      ${gameChoice('l-game', G.id)}
      <div class="campo"><span class="rotulo">Modo de jogo</span>${options('l-mode', G.modes, G.modeOf(L.config))}</div>
      ${G.targets.length ? `<div class="campo"><span class="rotulo">Duração</span>${options('l-target', G.targets, L.config.target)}</div>` : ''}
      <div class="campo"><span class="rotulo">Tempo por jogada</span>${options('l-turn', [{ v: '30', t: '30 segundos' }, { v: '60', t: '60 segundos' }, { v: '0', t: 'Sem limite' }], String(L.turnSeconds))}</div>
      ${opts.map(([k, t, d]) => `<div class="campo"><span class="rotulo">${t}</span><p class="nota">${d}.</p>${options('l-' + k, onOff(k), o[k] !== false)}</div>`).join('')}
    </div>`;
  }
  function chatHtml(L) {
    return `<div class="chat-lista" aria-live="polite">${L.chat.length ? L.chat.map(m => `<p><b>${esc(m.nick)}:</b> ${esc(m.text)}</p>`).join('') : '<p class="nota">Ainda ninguém escreveu.</p>'}</div>
    <form class="linha-entrar" data-form="chat"><input id="chat-txt" type="text" maxlength="200" autocomplete="off" placeholder="Escreve uma mensagem" aria-label="Mensagem" style="text-transform:none;letter-spacing:0;font-weight:400"><button class="btn peq" type="submit">Enviar</button></form>`;
  }

  // --- Eventos -----------------------------------------------------------------
  document.addEventListener('click', async ev => {
    const t = ev.target.closest('[data-act]');
    if (!t || t.disabled) return;
    const act = t.dataset.act;
    switch (act) {
      case 'go': P.ui.menuOpen = false; go(t.dataset.to); break;
      case 'back':
        if (t.dataset.to === 'leave-room') { if (session) session.leave(); session = null; go('online'); break; }
        if (t.dataset.to === 'menu' && session && session.kind === 'online' && session.lobby) { go('lobby'); break; }
        go(t.dataset.to); break;
      case 'resume': resumeOffline(); break;
      case 'clear-save': save('save', null); renderSettings(); break;
      case 'opt': handleOption(t); break;
      case 'start-offline': startOffline(); break;
      case 'again': {
        const prev = session, mod = prev.mod;
        const starter = mod.over(prev.state) && mod.nextStarter ? mod.nextStarter(mod.result(prev.state), prev.state.config) : undefined;
        startLocal(prev.game, prev.state.config, prev.level, prev.names, { starter });
        break;
      }
      case 'rules-game': useGame(t.dataset.game); renderRules(); break;
      case 'back-lobby': session.action('lobby'); break;
      case 'quit':
        resetTable();
        if (session) session.leave();
        { const wasOnline = session && session.kind === 'online'; session = null; go(wasOnline ? 'online' : 'menu'); }
        break;
      case 'toggle-menu': P.ui.menuOpen = !P.ui.menuOpen; G.repaintOverlay(); break;
      case 'toggle-chat': P.ui.chatOpen = !P.ui.chatOpen; G.repaintOverlay(); break;
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
      case 'shuffle-teams': session.action('shuffleTeams'); break;
      case 'change-team': session.action('changeTeam', Object.assign({ team: +t.dataset.team }, t.dataset.seat === undefined ? {} : { seat: +t.dataset.seat })); break;
      case 'add-bot': session.action('addBot', { seat: +t.dataset.seat, level: t.dataset.level }); break;
      case 'remove-seat': session.action('removeSeat', { seat: +t.dataset.seat }); break;
      case 'start-online': session.action('start'); break;
      default:
        if (G.onAct(act, t)) return;
        break;
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
      if (f === 'p-colors4') P.cards.clearCache();
      applyPrefs(); renderSettings(); return;
    }
    if (f.startsWith('l-')) {
      const k = f.slice(2), L = session && session.lobby;
      if (!L) return;
      if (k === 'game') session.action('setConfig', { game: String(val) });
      else if (k === 'mode') session.action('setConfig', { config: G.modeToCfg(String(val), L.config.target) });
      else if (k === 'target') session.action('setConfig', { config: { target: String(val) } });
      else if (k === 'turn') session.action('setConfig', { turnSeconds: +val });
      else session.action('setConfig', { options: { [k]: val } });
      return;
    }
    if (f.startsWith('c-')) {
      keepCreateInputs();
      const k = f.slice(2);
      if (k === 'game') createCfg.game = String(val);
      else if (k === 'mode' || k === 'target') perGame(createCfg, G)[k] = String(val);
      else createCfg[k] = String(val);
      renderCreate(); return;
    }
    if (f === 'game') offlineCfg.game = String(val);
    else perGame(offlineCfg, G)[f] = String(val);
    renderOffline();
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
        game: G.id, config: G.modeToCfg(perGame(createCfg, G).mode, perGame(createCfg, G).target), turnSeconds: +createCfg.turn,
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
