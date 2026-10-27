import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomConnection } from '../../frontend/src/core/connection.js';
import { Statistics } from '../../frontend/src/core/statistics.js';
import { createApi } from '../../frontend/src/core/http.js';
import { identity } from '../../frontend/src/core/protocol.js';

function harness() {
  const sockets = [], intervals = new Map(), timeouts = new Map();
  let id = 0, request = 0;
  class Socket {
    constructor(url) { this.url = url; this.readyState = 0; this.handlers = {}; this.sent = []; sockets.push(this); }
    addEventListener(type, handler) { this.handlers[type] = handler; }
    send(raw) { this.sent.push(JSON.parse(raw)); }
    close() { this.readyState = 3; }
    message(m) { this.readyState = 1; this.handlers.message({ data: JSON.stringify(m) }); }
  }
  const timers = {
    setInterval(fn, ms) { const key = ++id; intervals.set(key, { fn, ms }); return key; }, clearInterval(key) { intervals.delete(key); },
    setTimeout(fn, ms) { const key = ++id; timeouts.set(key, { fn, ms }); return key; }, clearTimeout(key) { timeouts.delete(key); },
  };
  const wins = [];
  const client = new RoomConnection({ backendUrl: 'https://example.test', protocolVersion: 1 }, {
    WebSocketImpl: Socket, timers, requestId: () => `request-${++request}`, onWin: key => wins.push(key),
  });
  return { client, sockets, intervals, timeouts, timers, wins, connect() { client.connect(' Joël ', ' room-code '); return sockets.at(-1); } };
}
function snapshot(type = 'welcome', overrides = {}) {
  return { v: 1, type, roomInstanceId: 'room-1', matchId: 'match-1', revision: 2,
    playerId: 'p1', connectionId: 'c1', settings: { heartbeatIntervalMs: 25000 },
    room: { roomCode: 'ROOM-CODE', gameId: 'any-engine', players: [
      { playerId: 'p1', displayName: 'Joël', ready: false, connected: true },
      { playerId: 'p2', displayName: 'Ben', ready: false, connected: true },
    ], status: { type: 'running' }, participants: ['p1','p2'], startingPlayerId: 'p1', rematchVotes: [] },
    view: { arbitrary: 'server view' }, ...overrides };
}

test('Spielclient: Identität, WSS und serverautoritärer Welcome/Ack/State-Ablauf', () => {
  assert.deepEqual(identity('  Joe\u0308l ', ' joel-ben '), { name: 'Joël', roomCode: 'JOEL-BEN' });
  assert.throws(() => identity('<script>', 'ROOM')); assert.throws(() => identity('Ben', 'bad_code'));
  const h = harness(); const ws = h.connect();
  assert.equal(new URL(ws.url).protocol, 'wss:'); assert.equal(new URL(ws.url).searchParams.get('name'), 'Joël');
  assert.equal(h.client.mutate('action', { action: {} }), false);
  ws.message(snapshot()); assert.equal(h.client.canMutate, true);
  assert.equal(h.intervals.size, 1); assert.equal([...h.intervals.values()][0].ms, 25000);
  assert.equal(h.client.mutate('action', { action: { kind: 'engine-action' }, playerId: 'spoof' }), true);
  assert.equal(h.client.mutate('action', { action: {} }), false);
  assert.deepEqual(ws.sent[0], { v: 1, type: 'action', requestId: 'request-1', matchId: 'match-1', expectedRevision: 2, action: { kind: 'engine-action' } });
  ws.message({ v: 1, type: 'ack', requestId: 'request-1', roomInstanceId: 'room-1', matchId: 'match-1', revision: 3 });
  assert.equal(h.client.snapshot.revision, 2); assert.equal(h.client.canMutate, false);
  ws.message(snapshot('state', { revision: 3 })); assert.equal(h.client.canMutate, true);
  ws.message({ v: 1, type: 'ack', requestId: 'old', roomInstanceId: 'room-1', matchId: 'old', revision: 0 });
  assert.equal(h.client.snapshot.matchId, 'match-1'); assert.equal(h.client.snapshot.revision, 3);
  ws.message(snapshot('state', { revision: 1 })); assert.equal(h.client.snapshot.revision, 3);
});

test('Spielclient: ersetzte Verbindung, alte Callbacks und alte Timer sind wirkungslos', () => {
  const h = harness(); const old = h.connect(); old.message(snapshot());
  const oldTimer = [...h.intervals.values()][0].fn;
  const current = h.connect(); assert.equal(h.intervals.size, 0);
  current.message(snapshot('welcome', { roomInstanceId: 'room-2', matchId: 'match-2', connectionId: 'c2' }));
  oldTimer(); old.message(snapshot()); old.handlers.close({ code: 4001 }); old.handlers.error();
  assert.equal(h.client.snapshot.roomInstanceId, 'room-2'); assert.equal(current.sent.length, 0);
  current.handlers.close({ code: 4001 });
  assert.match(h.client.message, /gleichem Namen.*übernommen/);
  assert.equal(h.sockets.length, 2); assert.equal(h.intervals.size, 0);
  assert.equal(h.client.canMutate, false);
});

test('Spielclient: Ablehnung entsperrt, unklare Bestätigung erfordert manuelle Synchronisierung ohne Replay', () => {
  const h = harness(); const ws = h.connect(); ws.message(snapshot());
  h.client.mutate('action', { action: {} });
  ws.message({ v: 1, type: 'error', requestId: 'request-1', code: 'INVALID_ACTION', message: 'Ungültige Aktion.' });
  assert.equal(h.client.canMutate, true); assert.equal(h.client.snapshot.revision, 2);
  h.client.mutate('action', { action: {} });
  const deadline = [...h.timeouts.values()].find(timer => timer.ms === 12000);
  deadline.fn();
  assert.equal(h.client.phase, 'resync'); assert.equal(h.client.pending, null); assert.equal(ws.sent.length, 2);
  assert.equal(h.intervals.size, 0);
  const replacement = h.connect(); replacement.message(snapshot('welcome', { revision: 3 }));
  assert.equal(h.client.canMutate, true); assert.equal(replacement.sent.length, 0);
  h.client.mutate('action', { action: {} });
  ws.message({ v: 1, type: 'ack', requestId: 'request-2', roomInstanceId: 'room-1', matchId: 'match-1', revision: 3 });
  assert.equal(h.client.pending.requestId, 'request-3');
  replacement.message({ v: 1, type: 'error', requestId: 'request-3', code: 'STALE_REVISION', message: 'Alter Stand.' });
  assert.equal(h.client.phase, 'resync');
});

test('Spielclient: fehlgeschlagener Handshake erzeugt keinen neuen Raum und kein automatisches Reconnect', () => {
  const h = harness(); const ws = h.connect();
  ws.handlers.close({ code: 1006 });
  assert.equal(h.client.phase, 'disconnected');
  assert.match(h.client.message, /Raum.*nicht betreten/);
  assert.equal(h.sockets.length, 1); assert.equal(ws.sent.length, 0); assert.equal(h.timeouts.size, 0);
});

test('Statistik: begrenzte Versuche, Fehler isoliert, neue Anfrage verdrängt alte', async () => {
  const h = harness(); let reads = 0;
  const stats = new Statistics({ async stats() { reads++; throw new Error('Offline'); } }, () => {}, h.timers);
  await stats.refresh('ben');
  for (let i = 0; i < 2; i++) { const [key, timer] = [...h.timeouts.entries()].at(-1); h.timeouts.delete(key); await timer.fn(); }
  assert.equal(reads, 3); assert.equal(h.timeouts.size, 0); assert.equal(stats.busy, false);
  let resolveOld;
  stats.api = { stats: () => new Promise(resolve => { resolveOld = resolve; }) };
  const old = stats.refresh();
  stats.api = { stats: async () => [{ displayName: 'Ben', nameKey: 'ben', wins: 2 }] };
  await stats.refresh(); resolveOld([]); await old;
  assert.equal(stats.rows[0].wins, 2);
});

test('HTTP: nur konfiguriertes Backend, keine Credentials, konkreter API-Fehler und sichere URL-Kodierung', async () => {
  const requests = [];
  const api = createApi({ backendUrl: 'https://example.test' }, async (url, options) => {
    requests.push({ url: String(url), options });
    return { ok: false, async json() { return { code: 'ROOM_EXISTS', message: 'Raum existiert bereits.' }; } };
  });
  await assert.rejects(() => api.createRoom('ROOM', 'tic-tac-toe'), /Raum existiert bereits/);
  assert.equal(requests[0].url, 'https://example.test/api/rooms');
  assert.equal(requests[0].options.credentials, 'omit');
  assert.deepEqual(JSON.parse(requests[0].options.body), { roomCode: 'ROOM', gameId: 'tic-tac-toe', config: {} });
  for (const backendUrl of ['file:///tmp', 'https://user:password@example.test', 'https://example.test/path']) assert.throws(() => createApi({ backendUrl }));
});
