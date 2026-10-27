import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = await readFile('tests/manual/client/app.js', 'utf8');
// Gezielte Logiktests mit DOM-/Transport-Doubles; ausdrücklich kein Browsertest.
function harness(availableGames = []) {
  class Element {
    constructor() { this.children = []; this.value = ''; this.textContent = ''; this.dataset = {}; this.handlers = {}; this.disabled = false; }
    append(...items) { for (const item of items) { item.parent = this; this.children.push(item); } }
    prepend(item) { item.parent = this; this.children.unshift(item); }
    replaceChildren(...items) { this.children = []; this.append(...items); }
    get lastElementChild() { return this.children.at(-1); }
    remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); }
    setAttribute(name, value) { (this.attributes ||= {})[name] = value; }
    addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }
    emit(type, event = {}) { for (const handler of this.handlers[type] || []) handler(event); }
    click() { if (!this.disabled) this.emit('click'); }
  }
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  get('backend').value = 'http://127.0.0.1:8787'; get('name').value = 'Joël'; get('code').value = 'JOEL-BEN'; get('heartbeat').checked = true;
  const sockets = [], timers = new Map(), requests = [];
  let timerId = 0;
  class Socket extends Element {
    static OPEN = 1;
    static CONNECTING = 0;
    constructor(url) { super(); this.url = String(url); this.readyState = 0; this.sent = []; sockets.push(this); }
    send(raw) { this.sent.push(JSON.parse(raw)); }
    close() { this.readyState = 3; }
    open() { this.readyState = 1; this.emit('open'); }
    receive(message) { this.emit('message', { data: JSON.stringify(message) }); }
  }
  runInNewContext(source, {
    document: { getElementById: get, createElement: () => new Element() },
    window: { addEventListener() {} }, WebSocket: Socket, URL, crypto: webcrypto,
    setInterval(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearInterval(id) { timers.delete(id); },
    async fetch(url, options) { requests.push({ url: String(url), options }); return { ok: true, status: 200, async json() { return String(url).endsWith('/api/games') ? availableGames : []; } }; },
  });
  return { get, sockets, timers, requests, connect() { get('join').click(); const ws = sockets.at(-1); ws.open(); return ws; } };
}
function view(type = 'welcome', overrides = {}) {
  return { v: 1, type, roomInstanceId: 'room-1', matchId: 'match-1', revision: 3,
    playerId: 'p1', connectionId: 'c1', settings: { heartbeatIntervalMs: 25000 },
    room: { gameId: 'fixture', status: { type: 'running' }, players: [
      { playerId: 'p1', displayName: 'Joël', ready: false, connected: true },
      { playerId: 'p2', displayName: 'Ben', ready: false, connected: true },
    ], participants: ['p1', 'p2'], startingPlayerId: 'p1', rematchVotes: [] },
    view: { moves: 3, secret: 'own-only' }, ...overrides };
}

test('Diagnoseclient: URL-Kodierung, WSS, Welcome-Grenze und ausstehende Aktion', () => {
  const h = harness();
  h.get('backend').value = 'https://example.test'; h.get('code').value = ' raum-ä ';
  const ws = h.connect();
  const url = new URL(ws.url);
  assert.equal(url.protocol, 'wss:');
  assert.equal(decodeURIComponent(url.pathname), '/api/rooms/ raum-ä /ws');
  assert.equal(url.searchParams.get('name'), 'Joël');
  assert.equal(h.get('step').disabled, true);
  ws.receive(view());
  assert.equal(h.timers.size, 1);
  assert.equal([...h.timers.values()][0].ms, 25000);
  h.get('step').click(); h.get('step').click();
  assert.equal(ws.sent.length, 1);
  const message = ws.sent[0];
  assert.equal(message.matchId, 'match-1'); assert.equal(message.expectedRevision, 3);
  assert.equal(message.action.kind, 'step'); assert.match(message.requestId, /^[a-f0-9]{32}$/);
  ws.receive({ v: 1, type: 'ack', roomInstanceId: 'room-1', matchId: 'match-1', revision: 4, requestId: message.requestId });
  assert.equal(h.get('step').disabled, true); // Ack allein ist keine Spieleransicht.
  assert.equal(h.get('revision').textContent, 3);
  ws.receive(view('state', { revision: 4 }));
  assert.equal(h.get('step').disabled, false);
  h.get('invalid').click();
  assert.notEqual(ws.sent[1].requestId, message.requestId);
  ws.receive({ v: 1, type: 'error', requestId: ws.sent[1].requestId, code: 'INVALID_ACTION', message: 'Ungültige Aktion.' });
  assert.equal(h.get('step').disabled, false);
  assert.equal(h.get('revision').textContent, 4);
});

test('Diagnoseclient: alte Acks und Callbacks überschreiben keine neuere Verbindung', () => {
  const h = harness(); const old = h.connect(); old.receive(view());
  h.get('join').click();
  assert.equal(h.timers.size, 0);
  const current = h.sockets.at(-1); current.open();
  current.receive(view('welcome', { roomInstanceId: 'room-2', matchId: 'match-2', revision: 8, connectionId: 'c2' }));
  old.receive(view()); old.emit('close', { code: 4001, reason: 'replaced' }); old.emit('error');
  current.receive({ v: 1, type: 'ack', requestId: 'old', roomInstanceId: 'room-1', matchId: 'match-1', revision: 1 });
  assert.equal(h.get('room-instance-id').textContent, 'room-2');
  assert.equal(h.get('match-id').textContent, 'match-2');
  assert.equal(h.get('revision').textContent, 8);
  assert.equal(h.get('connection-id').textContent, 'c2');
  assert.equal(h.timers.size, 1);
  current.emit('close', { code: 4001, reason: 'Connection replaced', wasClean: true });
  assert.equal(h.get('notice').textContent, 'Diese Verbindung wurde durch eine andere Verbindung mit gleichem Namen ersetzt.');
  assert.equal(h.timers.size, 0);
  assert.equal(h.sockets.length, 2); // Kein automatischer Gegen-Reconnect.
});

test('Diagnoseclient: Heartbeat-Schalter, begrenztes Textlog und einmaliger Statistikabruf nach Sieg', async () => {
  const h = harness(); const ws = h.connect(); ws.receive(view());
  h.get('heartbeat').checked = false; h.get('heartbeat').emit('change');
  assert.equal(h.timers.size, 0);
  assert.match(h.get('heartbeat-status').textContent, /Andere gültige Nachrichten/);
  for (let i = 0; i < 210; i++) ws.receive({ v: 1, type: 'pong' });
  assert.equal(h.get('log').children.length, 200);
  const won = view('state'); won.room.status = { type: 'won', winnerPlayerId: 'p1' };
  won.room.players[0].displayName = '<img src=x onerror=alert(1)>';
  ws.receive(won); ws.receive(won);
  await new Promise(setImmediate);
  assert.equal(h.requests.filter(r => r.url.endsWith('/api/stats')).length, 2); // Öffnen + Sieg, kein Polling.
  assert.equal(h.get('players').children[0].children[0].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(h.get('players').children[0].children[0].children.length, 0);
  assert.equal(h.requests[0].options.credentials, 'omit');
});

test('Diagnoseclient: fehlgeschlagener WS-Handshake zeigt keine erfundene HTTP-Antwort', () => {
  const h = harness(); const ws = h.connect();
  ws.emit('error'); ws.emit('close', { code: 1006, reason: '', wasClean: false });
  assert.match(h.get('notice').textContent, /HTTP-Fehlerbody.*nicht auslesen/);
  assert.match(h.get('notice').textContent, /Netzwerk-Tab/);
  assert.equal(h.get('step').disabled, true);
  assert.equal(h.sockets.length, 1);
});

const tttGame = { id: 'tic-tac-toe', version: '1', minPlayers: 2, maxPlayers: 2 };
function tttView(overrides = {}) {
  const m = view();
  m.room.gameId = 'tic-tac-toe';
  m.view = { board: Array(9).fill(null), symbols: [{ playerId: 'p1', symbol: 'X' }, { playerId: 'p2', symbol: 'O' }], yourSymbol: 'X', currentPlayerId: 'p1', winningLine: null };
  return { ...m, ...overrides };
}

test('Diagnoseclient: Tic-Tac-Toe-Züge warten auf Serverzustand und beachten Zug, Pending und Abort', () => {
  const h = harness(); const ws = h.connect(); ws.receive(tttView());
  assert.equal(h.get('fixture-actions').hidden, true);
  assert.equal(h.get('tic-tac-toe').hidden, false);
  h.get('cell-0').click(); h.get('cell-1').click();
  assert.equal(ws.sent.length, 1);
  assert.deepEqual(ws.sent[0].action, { kind: 'place', cell: 0 });
  assert.equal(ws.sent[0].expectedRevision, 3);
  assert.equal(h.get('cell-0').textContent, '–'); // Keine optimistische Brettmutation.
  ws.receive({ v: 1, type: 'ack', requestId: ws.sent[0].requestId, roomInstanceId: 'room-1', matchId: 'match-1', revision: 4 });
  const next = tttView({ type: 'state', revision: 4 }); next.view.board[0] = 'X'; next.view.currentPlayerId = 'p2';
  ws.receive(next);
  assert.equal(h.get('cell-0').textContent, 'X');
  for (let cell = 0; cell < 9; cell++) assert.equal(h.get(`cell-${cell}`).disabled, true);
  const ownTurn = tttView({ type: 'state', revision: 5 }); ownTurn.view.board[0] = 'X';
  ws.receive(ownTurn);
  assert.equal(h.get('cell-0').disabled, true); assert.equal(h.get('cell-1').disabled, false);
  ownTurn.revision = 6; ownTurn.room.status = { type: 'aborted' }; // Engine-Ansicht sagt weiterhin eigener Zug.
  ws.receive(ownTurn);
  for (let cell = 0; cell < 9; cell++) assert.equal(h.get(`cell-${cell}`).disabled, true);
  assert.match(h.get('ttt-status').textContent, /abgebrochen/);
  ws.receive(tttView({ type: 'state', revision: 7, room: { ...ownTurn.room, status: { type: 'won', winnerPlayerId: 'p1' } }, view: { ...ownTurn.view, winningLine: [0,1,2], currentPlayerId: null } }));
  assert.equal(h.get('cell-0').dataset.winning, 'true');
  assert.match(h.get('ttt-status').textContent, /Sieg für Joël/);
});

test('Diagnoseclient: produktive Spiele auswählbar und Start nur innerhalb Engine-Spielergrenzen', async () => {
  const h = harness([tttGame]);
  h.get('load-games').click(); await new Promise(setImmediate);
  assert.equal(h.get('game').children[0].value, 'tic-tac-toe');
  h.get('game').value = 'tic-tac-toe'; h.get('game').emit('change');
  assert.equal(h.get('create').disabled, false);
  const ws = h.connect();
  const lobby = tttView({ matchId: null, revision: 0, view: null });
  lobby.room.status = { type: 'lobby' }; lobby.room.players = [lobby.room.players[0]];
  lobby.room.players[0].ready = true; lobby.room.participants = [];
  ws.receive(lobby); assert.equal(h.get('start').disabled, true);
  const two = structuredClone(lobby); two.type = 'state';
  two.room.players.push({ playerId: 'p2', displayName: 'Ben', ready: true, connected: true });
  ws.receive(two); assert.equal(h.get('start').disabled, false);
  const three = structuredClone(two);
  three.room.players.push({ playerId: 'p3', displayName: 'Third', ready: true, connected: true });
  ws.receive(three); assert.equal(h.get('start').disabled, true);
});


test('Diagnoseclient: Wechsel vom TTT- zum Fixture-Backend entfernt die alte Brettansicht', async () => {
  const h = harness([{ id: 'fixture', version: '1', minPlayers: 2, maxPlayers: 4 }]);
  const ws = h.connect(); ws.receive(tttView());
  h.get('disconnect').click();
  h.get('backend').value = 'http://127.0.0.1:8788'; h.get('backend').emit('input');
  assert.equal(h.get('room-instance-id').textContent, '–');
  h.get('load-games').click(); await new Promise(setImmediate);
  h.get('game').value = 'fixture'; h.get('game').emit('change');
  assert.equal(h.get('tic-tac-toe').hidden, true);
  assert.equal(h.get('fixture-actions').hidden, false);
  assert.equal(h.get('create').disabled, false);
});
