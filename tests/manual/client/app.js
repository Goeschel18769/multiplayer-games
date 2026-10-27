/* Klassisches Skript: keine Imports, keine Speicherung, nur öffentliche HTTP/WS-API. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const mutationButtons = ['ready', 'not-ready', 'start', 'rematch', 'abort', 'step', 'win', 'draw', 'invalid'];
  let socket = null;
  let generation = 0;
  let welcomed = false;
  let snapshot = null;
  let playerId = null;
  let connectionId = null;
  let heartbeatTimer = null;
  let heartbeatMs = null;
  let pending = null;
  let games = [];
  let creating = false;
  let gamesRequest = 0;
  let statsRequest = 0;
  const seenWins = new Set();

  function notice(message, error = false) {
    $('notice').textContent = message;
    $('notice').dataset.error = String(error);
  }
  function log(direction, type, content) {
    const item = document.createElement('li');
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = `${new Date().toLocaleTimeString()} · ${direction} · ${type}`;
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(content, null, 2);
    details.append(summary, pre);
    item.append(details);
    $('log').prepend(item);
    while ($('log').children.length > 200) $('log').lastElementChild.remove();
  }
  function backendUrl() {
    const url = new URL($('backend').value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Backend-Adresse muss eine HTTP-/HTTPS-Adresse ohne Zugangsdaten, Pfad oder Query sein.');
    }
    return url.origin;
  }
  async function http(base, path, options = {}) {
    const url = new URL(path, `${base}/`);
    log('HTTP →', options.method || 'GET', { url: url.href, ...(options.body ? { body: JSON.parse(options.body) } : {}) });
    const response = await fetch(url, { ...options, credentials: 'omit', cache: 'no-store' });
    const body = await response.json();
    log('HTTP ←', String(response.status), body);
    if (!response.ok) throw new Error(`HTTP ${response.status} · ${body.code || 'ERROR'}: ${body.message || 'Anfrage fehlgeschlagen.'}`);
    return body;
  }
  async function loadStats(base) {
    const request = ++statsRequest;
    $('stats-status').textContent = 'Statistik wird geladen …';
    try {
      const rows = await http(base || backendUrl(), '/api/stats');
      if (request !== statsRequest) return;
      if (!Array.isArray(rows)) throw new Error('Ungültige Statistikantwort.');
      $('stats').textContent = JSON.stringify(rows, null, 2);
      $('stats-status').textContent = `Aktualisiert: ${new Date().toLocaleTimeString()}. Outbox-Zustellung kann verzögert sein.`;
    } catch (error) {
      if (request === statsRequest) $('stats-status').textContent = `Statistik nicht geladen: ${error.message}`;
    }
  }
  function stopHeartbeat() {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  function configureHeartbeat() {
    stopHeartbeat();
    if (!welcomed || socket?.readyState !== WebSocket.OPEN) {
      $('heartbeat-status').textContent = 'Heartbeat inaktiv; kein gültiges Welcome einer offenen Verbindung.';
      return;
    }
    if (!$('heartbeat').checked) {
      $('heartbeat-status').textContent = 'Heartbeat ausgeschaltet. Andere gültige Nachrichten halten die Verbindung weiterhin am Leben.';
      return;
    }
    const currentGeneration = generation;
    const currentSocket = socket;
    heartbeatTimer = setInterval(() => {
      if (generation === currentGeneration && socket === currentSocket && welcomed && socket.readyState === WebSocket.OPEN) {
        try { send({ v: 1, type: 'ping' }); }
        catch (error) { stopHeartbeat(); notice(`Heartbeat nicht gesendet: ${error.message}`, true); }
      }
    }, heartbeatMs);
    $('heartbeat-status').textContent = `Heartbeat aktiv: alle ${heartbeatMs / 1000} Sekunden laut Welcome-Einstellungen. Hintergrundtabs können pausieren.`;
  }
  function renderGame() {
    const gameId = snapshot?.room.gameId || $('game').value;
    $('fixture-actions').hidden = gameId !== 'fixture';
    $('tic-tac-toe').hidden = gameId !== 'tic-tac-toe';
    const room = snapshot?.room;
    const view = gameId === 'tic-tac-toe' ? snapshot?.view : null;
    const nameFor = id => room?.players.find(p => p.playerId === id)?.displayName || id;
    $('ttt-symbols').textContent = view
      ? `${view.symbols.map(p => `${p.symbol}: ${nameFor(p.playerId)}`).join(' · ')} · Dein Spielstein: ${view.yourSymbol}`
      : 'Noch keine Symbolzuordnung.';
    let status = 'Noch keine Partie gestartet.';
    if (view && room.status.type === 'running') status = view.currentPlayerId === playerId
      ? `Du bist am Zug (${view.yourSymbol}).` : `${nameFor(view.currentPlayerId)} ist am Zug.`;
    if (room?.status.type === 'won') status = `Sieg für ${nameFor(room.status.winnerPlayerId)}.`;
    if (room?.status.type === 'draw') status = 'Unentschieden.';
    if (room?.status.type === 'aborted') status = 'Partie abgebrochen. Keine weiteren Züge; kein Sieg gewertet.';
    $('ttt-status').textContent = status;
    const canPlace = gameId === 'tic-tac-toe' && welcomed && socket?.readyState === WebSocket.OPEN &&
      !pending && room?.status.type === 'running' && room.participants.includes(playerId) && view?.currentPlayerId === playerId;
    for (let cell = 0; cell < 9; cell++) {
      const button = $(`cell-${cell}`);
      const value = view?.board[cell] ?? null;
      button.textContent = value || '–';
      button.setAttribute('aria-label', `Feld ${cell}, ${value || 'leer'}`);
      button.dataset.winning = String(Boolean(view?.winningLine?.includes(cell)));
      button.disabled = !canPlace || value !== null;
    }
  }
  function renderControls() {
    const active = socket !== null;
    for (const id of ['backend', 'name', 'code', 'game']) $(id).disabled = active || creating;
    $('create').disabled = creating || active || !games.some(game => game.id === $('game').value);
    $('load-games').disabled = creating;
    $('join').disabled = creating || socket?.readyState === WebSocket.CONNECTING;
    $('disconnect').disabled = !active;
    for (const id of mutationButtons) $(id).disabled = true;
    $('pending').textContent = pending
      ? `Ausstehend: ${pending.type} · requestId ${pending.requestId}${pending.ack ? ' · Ack erhalten, warte auf passende Spieleransicht.' : ' · warte auf Ack/Fehler. Bei Verbindungsproblemen bewusst trennen und erneut verbinden.'}`
      : 'Keine ausstehende Aktion.';
    renderGame();
    if (!welcomed || socket?.readyState !== WebSocket.OPEN || !snapshot || pending) return;
    const own = snapshot.room.players.find(p => p.playerId === playerId);
    const status = snapshot.room.status.type;
    const lobby = snapshot.matchId === null && status === 'lobby';
    $('ready').disabled = !lobby || !own || own.ready;
    $('not-ready').disabled = !lobby || !own?.ready;
    const game = games.find(game => game.id === snapshot.room.gameId);
    const count = snapshot.room.players.length;
    $('start').disabled = !lobby || !game || count < game.minPlayers || count > game.maxPlayers ||
      !snapshot.room.players.every(p => p.ready && p.connected);
    const participant = snapshot.room.participants.includes(playerId);
    const running = status === 'running' && participant;
    $('abort').disabled = !running;
    for (const id of ['step', 'win', 'draw', 'invalid']) $(id).disabled = !running || snapshot.room.gameId !== 'fixture';
    $('rematch').disabled = !participant || !['won', 'draw', 'aborted'].includes(status) || snapshot.room.rematchVotes.includes(playerId);
  }
  function renderSnapshot() {
    $('player-id').textContent = playerId || '–';
    $('connection-id').textContent = connectionId || '–';
    $('room-instance-id').textContent = snapshot?.roomInstanceId || '–';
    $('match-id').textContent = snapshot?.matchId || '–';
    $('revision').textContent = snapshot?.revision ?? '–';
    $('match-status').textContent = snapshot ? JSON.stringify(snapshot.room.status) : '–';
    const nameFor = id => snapshot.room.players.find(p => p.playerId === id)?.displayName || id;
    $('starting-player').textContent = snapshot?.room.startingPlayerId ? nameFor(snapshot.room.startingPlayerId) : '–';
    $('rematch-votes').textContent = snapshot?.room.rematchVotes.map(nameFor).join(', ') || '–';
    $('players').replaceChildren();
    for (const p of snapshot?.room.players || []) {
      const row = document.createElement('tr');
      for (const value of [p.displayName, p.playerId, p.ready ? 'bereit' : 'nicht bereit', p.connected ? 'verbunden' : 'getrennt']) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      $('players').append(row);
    }
    $('view').textContent = JSON.stringify(snapshot?.view ?? null, null, 2);
    renderControls();
  }
  function validSnapshot(m) {
    return m?.v === 1 && typeof m.roomInstanceId === 'string' &&
      (m.matchId === null || typeof m.matchId === 'string') && Number.isSafeInteger(m.revision) && m.revision >= 0 &&
      typeof m.room?.gameId === 'string' && typeof m.room?.status?.type === 'string' &&
      Array.isArray(m.room.players) && m.room.players.every(p => typeof p.playerId === 'string' && typeof p.displayName === 'string' && typeof p.ready === 'boolean' && typeof p.connected === 'boolean') &&
      Array.isArray(m.room.participants) && Array.isArray(m.room.rematchVotes) && Object.hasOwn(m, 'view');
  }
  function receive(m, base) {
    if (m.type === 'welcome') {
      if (welcomed || !validSnapshot(m) || typeof m.playerId !== 'string' || typeof m.connectionId !== 'string' ||
          !m.room.players.some(p => p.playerId === m.playerId) ||
          !Number.isSafeInteger(m.settings?.heartbeatIntervalMs) || m.settings.heartbeatIntervalMs <= 0) {
        throw new Error('Ungültiges Welcome; Aktionen bleiben gesperrt.');
      }
      welcomed = true;
      playerId = m.playerId;
      connectionId = m.connectionId;
      snapshot = m;
      $('connection-status').textContent = 'Verbindung: verbunden · gültiges Welcome · Close-Code: –';
      $('snapshot-status').textContent = 'Aktuelle empfangene Spieleransicht.';
      heartbeatMs = m.settings.heartbeatIntervalMs;
      configureHeartbeat();
      notice('Beitritt erfolgreich. Keine automatische Wiederverbindung.');
      renderSnapshot();
    } else if (m.type === 'state') {
      if (!welcomed || !validSnapshot(m) || m.roomInstanceId !== snapshot.roomInstanceId) return;
      // WebSocket-State-Nachrichten sind geordnet; Revisionen derselben Partie nie zurücksetzen.
      if (m.matchId === snapshot.matchId && m.revision < snapshot.revision) return;
      if (snapshot.matchId !== null && m.matchId === null) return;
      snapshot = m;
      if (pending?.ack && m.matchId === pending.ack.matchId && m.revision >= pending.ack.revision) pending = null;
      renderSnapshot();
    } else if (m.type === 'ack') {
      // Acks sind Bestätigungen, niemals eine Quelle für angezeigte IDs oder Revisionen.
      if (welcomed && m.roomInstanceId === snapshot.roomInstanceId && pending?.requestId === m.requestId) {
        pending.ack = m;
        renderControls();
      }
    } else if (m.type === 'error') {
      if (m.requestId && pending?.requestId === m.requestId) pending = null;
      notice(`${m.code || 'ERROR'}: ${m.message || 'Protokollfehler.'}`, true);
      renderControls();
    }
    if (snapshot?.room.status.type === 'won') {
      const key = `${snapshot.roomInstanceId}/${snapshot.matchId}`;
      if (!seenWins.has(key)) {
        seenWins.add(key);
        loadStats(base); // Einmal je empfangenem Sieg, kein Polling.
      }
    }
  }
  function send(m) {
    if (!welcomed || socket?.readyState !== WebSocket.OPEN) throw new Error('Keine bestätigte offene Verbindung.');
    socket.send(JSON.stringify(m));
    log('WS →', m.type, m);
  }
  function mutate(type, fields = {}) {
    if (pending || !welcomed || !snapshot || socket?.readyState !== WebSocket.OPEN) return;
    // Auch file:// ohne crypto.randomUUID unterstützt: keine Sitzungstokens.
    const requestId = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    const m = { v: 1, type, requestId, ...fields };
    pending = { type, requestId, ack: null };
    try { send(m); }
    catch (error) { pending = null; notice(error.message, true); }
    renderControls();
  }
  function disconnect(reason = 'Manually disconnected') {
    generation++;
    stopHeartbeat();
    const old = socket;
    socket = null;
    welcomed = false;
    pending = null;
    if (old) old.close(1000, reason);
    $('connection-status').textContent = 'Verbindung: bewusst getrennt · lokaler Close-Code: 1000';
    $('snapshot-status').textContent = 'Letzte empfangene Ansicht; nach Disconnect möglicherweise veraltet.';
    configureHeartbeat();
    renderControls();
  }
  function join() {
    let base, url;
    try {
      base = backendUrl();
      url = new URL(`/api/rooms/${encodeURIComponent($('code').value)}/ws`, `${base}/`);
      url.searchParams.set('name', $('name').value);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    } catch (error) { notice(error.message, true); return; }
    disconnect('Connection changed');
    const attempt = generation;
    playerId = null;
    connectionId = null;
    snapshot = null;
    renderSnapshot();
    $('snapshot-status').textContent = 'Warte auf gültiges Welcome.';
    try { socket = new WebSocket(url); }
    catch (error) { notice(`Verbindung nicht gestartet: ${error.message}`, true); renderControls(); return; }
    const current = socket;
    let receivedWelcome = false;
    const isCurrent = () => attempt === generation && socket === current;
    const handshakeHint = 'WebSocket-Verbindung fehlgeschlagen. JavaScript kann den HTTP-Fehlerbody eines gescheiterten Upgrades nicht auslesen. Netzwerk-Tab öffnen und den WS-Handshake prüfen.';
    $('connection-status').textContent = 'Verbindung: wird aufgebaut · Close-Code: –';
    log('WS →', 'connect', { url: url.href, generation: attempt });
    current.addEventListener('open', () => {
      if (!isCurrent()) return;
      $('connection-status').textContent = 'Verbindung: Transport offen, warte auf Welcome · Close-Code: –';
    });
    current.addEventListener('message', event => {
      if (!isCurrent()) return;
      try {
        if (typeof event.data !== 'string') throw new Error('Unerwartete binäre Servernachricht.');
        const m = JSON.parse(event.data);
        log('WS ←', m.type || 'unknown', m);
        if (m.v !== 1) throw new Error('Unbekannte Protokollversion.');
        receive(m, base);
        receivedWelcome = welcomed;
      } catch (error) { notice(`Servernachricht nicht übernommen: ${error.message}`, true); }
    });
    current.addEventListener('error', () => {
      if (isCurrent()) notice(receivedWelcome ? 'WebSocket-Transportfehler; keine automatische Wiederverbindung.' : handshakeHint, true);
    });
    current.addEventListener('close', event => {
      if (!isCurrent()) return;
      stopHeartbeat();
      socket = null;
      welcomed = false;
      pending = null;
      $('connection-status').textContent = `Verbindung: geschlossen · Close-Code: ${event.code} · ${event.reason || 'kein Grund übermittelt'}`;
      $('snapshot-status').textContent = 'Letzte empfangene Ansicht; Verbindung geschlossen.';
      notice(event.code === 4001
        ? 'Diese Verbindung wurde durch eine andere Verbindung mit gleichem Namen ersetzt.'
        : receivedWelcome ? `Verbindung geschlossen (${event.code}). Bei Bedarf manuell erneut verbinden.` : handshakeHint, true);
      log('WS ←', 'close', { code: event.code, reason: event.reason, wasClean: event.wasClean });
      configureHeartbeat();
      renderControls();
    });
    renderControls();
  }

  $('load-games').addEventListener('click', async () => {
    const request = ++gamesRequest;
    try {
      const list = await http(backendUrl(), '/api/games');
      if (request !== gamesRequest) return;
      if (!Array.isArray(list)) throw new Error('Ungültige Spieleliste.');
      games = list.filter(game => typeof game.id === 'string' && Number.isSafeInteger(game.minPlayers) && Number.isSafeInteger(game.maxPlayers) && game.minPlayers > 0 && game.maxPlayers >= game.minPlayers);
      const selected = snapshot?.room.gameId || $('game').value;
      $('game').replaceChildren();
      for (const game of games) {
        const option = document.createElement('option');
        option.value = game.id;
        option.textContent = `${game.id} · v${game.version} · ${game.minPlayers}–${game.maxPlayers} Spieler${game.id === 'fixture' ? ' (Test)' : ''}`;
        $('game').append(option);
      }
      if (games.some(game => game.id === selected)) $('game').value = selected;
      notice(games.length ? 'Spiele geladen. Raum erstellen und Beitritt sind getrennte Aktionen.' : 'Keine Spiele verfügbar.');
      renderControls();
    } catch (error) { notice(error.message, true); }
  });
  $('game').addEventListener('change', () => {
    if (!socket && snapshot?.room.gameId !== $('game').value) {
      snapshot = null; playerId = null; connectionId = null;
      renderSnapshot();
    } else renderControls();
  });
  $('create').addEventListener('click', async () => {
    if (creating) return;
    creating = true;
    renderControls();
    try {
      const result = await http(backendUrl(), '/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: $('code').value, gameId: $('game').value, config: {} }) });
      $('code').value = result.roomCode;
      $('creation').textContent = `Raum erstellt: ${result.roomCode} · roomInstanceId ${result.roomInstanceId} · WS-Pfad ${result.webSocketPath}. Jetzt separat beitreten.`;
      notice('Raum erstellt; noch keine WebSocket-Verbindung aufgebaut.');
    } catch (error) { $('creation').textContent = `Raumerstellung fehlgeschlagen: ${error.message}`; notice(error.message, true); }
    finally { creating = false; renderControls(); }
  });
  $('join').addEventListener('click', join);
  $('disconnect').addEventListener('click', () => disconnect());
  $('heartbeat').addEventListener('change', configureHeartbeat);
  $('ready').addEventListener('click', () => mutate('ready', { ready: true }));
  $('not-ready').addEventListener('click', () => mutate('ready', { ready: false }));
  $('start').addEventListener('click', () => mutate('start'));
  $('rematch').addEventListener('click', () => mutate('rematch', { matchId: snapshot.matchId }));
  $('abort').addEventListener('click', () => mutate('abort', { matchId: snapshot.matchId }));
  for (const kind of ['step', 'win', 'draw', 'invalid']) {
    $(kind).addEventListener('click', () => mutate('action', { matchId: snapshot.matchId, expectedRevision: snapshot.revision, action: { kind } }));
  }
  for (let cell = 0; cell < 9; cell++) {
    $(`cell-${cell}`).addEventListener('click', () => {
      if (!$(`cell-${cell}`).disabled) mutate('action', { matchId: snapshot.matchId, expectedRevision: snapshot.revision, action: { kind: 'place', cell } });
    });
  }
  $('load-stats').addEventListener('click', () => loadStats());
  $('backend').addEventListener('input', () => {
    gamesRequest++;
    statsRequest++;
    games = [];
    $('game').replaceChildren();
    $('stats').textContent = '[]';
    $('stats-status').textContent = 'Backend-Adresse geändert; Statistik erneut laden.';
    snapshot = null; playerId = null; connectionId = null;
    $('snapshot-status').textContent = 'Backend-Adresse geändert; noch keine Spieleransicht empfangen.';
    renderSnapshot();
  });
  window.addEventListener('pagehide', () => disconnect('Page closed'));
  renderControls();
  loadStats();
})();
