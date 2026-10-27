import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, Log, LogLevel } from 'miniflare';
import { readFile } from 'node:fs/promises';

let mf, productionMf, rooms, stats;
let sequence = 0;
const code = () => `ROOM-${++sequence}`;
before(async () => {
  const bundleOptions = { bundle: true, write: false, format: 'esm', platform: 'neutral', external: ['cloudflare:workers'] };
  const [bundle, production, configuration] = await Promise.all([
    build({ ...bundleOptions, entryPoints: ['tests/fixtures/worker.js'] }),
    build({ ...bundleOptions, entryPoints: ['backend/src/worker.js'] }),
    readFile('backend/wrangler.jsonc', 'utf8').then(JSON.parse),
  ]);
  assert.ok(!production.outputFiles[0].text.includes('PRIVATE-'));
  assert.ok(!production.outputFiles[0].text.includes('test_clock'));
  const config = (name, contents) => ({ config: {
    name, compatibilityDate: configuration.compatibility_date,
    manifest: { mainModule: 'worker.js', modules: { 'worker.js': { type: 'esm', contents } } },
    exports: configuration.exports,
    env: Object.fromEntries(configuration.durable_objects.bindings.map(binding => [binding.name,
      { type: 'durable-object', worker: name, exportName: binding.class_name }])),
  } });
  mf = new Miniflare({ log: new Log(LogLevel.ERROR), workers: [
    config('phase3-test', bundle.outputFiles[0].text),
    config('phase3-production', production.outputFiles[0].text),
  ] });
  productionMf = new Miniflare({ log: new Log(LogLevel.ERROR), workers: [config('phase6-production', production.outputFiles[0].text)] });
  await Promise.all([mf.ready, productionMf.ready]);
  rooms = await mf.getDurableObjectNamespace('GAME_ROOMS', 'phase3-test');
  const ns = await mf.getDurableObjectNamespace('GLOBAL_STATS', 'phase3-test');
  stats = ns.getByName('global');
});
after(async () => { await Promise.all([mf?.dispose(), productionMf?.dispose()]); });
const request = (path, options) => mf.dispatchFetch(`http://localhost${path}`, options);
async function create(roomCode = code(), config = {}) {
  const response = await request('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomCode, gameId: 'fixture', config }) });
  return { response, body: await response.json(), code: roomCode.trim().toUpperCase() };
}
function client(ws) {
  const queue = [], waiters = [];
  const messages = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data); messages.push(m);
    const index = waiters.findIndex(w => w.predicate(m));
    if (index < 0) queue.push(m);
    else { const [w] = waiters.splice(index, 1); clearTimeout(w.timer); w.resolve(m); }
  });
  ws.accept();
  return {
    ws, messages,
    next(predicate = () => true) {
      const index = queue.findIndex(predicate);
      if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const w = { predicate, resolve, timer: setTimeout(() => {
          waiters.splice(waiters.indexOf(w), 1); reject(new Error('WebSocket message timeout'));
        }, 5000) }; waiters.push(w);
      });
    },
    send(message) { ws.send(typeof message === 'string' || message instanceof ArrayBuffer ? message : JSON.stringify(message)); },
    async command(type, fields = {}) {
      const requestId = `req-${++sequence}`;
      this.send({ v: 1, type, requestId, ...fields });
      return this.next(m => m.requestId === requestId && ['ack', 'error'].includes(m.type));
    },
  };
}
async function join(roomCode, name, fetcher = request) {
  const response = await fetcher(`/api/rooms/${encodeURIComponent(roomCode)}/ws?name=${encodeURIComponent(name)}`, { headers: { Upgrade: 'websocket', Origin: 'null' } });
  assert.equal(response.status, 101, `join ${name}: HTTP ${response.status}`);
  const c = client(response.webSocket);
  c.welcome = await c.next(m => m.type === 'welcome');
  return c;
}
async function running(count = 2, config = {}) {
  const created = await create(undefined, config);
  assert.equal(created.response.status, 201);
  const clients = [];
  for (let i = 0; i < count; i++) clients.push(await join(created.code, `P${sequence}-${i}`));
  for (const c of clients) assert.equal((await c.command('ready', { ready: true })).type, 'ack');
  const started = await clients[0].command('start');
  assert.equal(started.type, 'ack');
  const stub = rooms.getByName(created.code);
  return { ...created, clients, stub, match: (await stub.inspect()).room.match };
}
async function eventually(fn, predicate) {
  for (let i = 0; i < 80; i++) {
    const result = await fn();
    if (predicate(result)) return result;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('Condition did not become true');
}

test('HTTP, Healthcheck, CORS, Methoden, Body-Bytes und unbekannte Spiele', async () => {
  const health = await request('/health');
  assert.deepEqual(await health.json(), { ok: true });
  const root = await request('/'); assert.equal(root.status, 404);
  assert.equal((await root.json()).code, 'NOT_FOUND');
  for (const [path, method] of [['/health', 'GET'], ['/api/games', 'GET'], ['/api/stats', 'GET'], ['/api/rooms', 'POST']]) {
    const preflight = await request(path, { method: 'OPTIONS', headers: { Origin: 'null' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
    const wrong = await request(path, { method: method === 'GET' ? 'POST' : 'GET' });
    assert.equal(wrong.status, 405); assert.equal(wrong.headers.get('allow'), method);
    assert.equal(wrong.headers.get('access-control-allow-origin'), '*');
    assert.equal(wrong.headers.get('cache-control'), 'no-store');
  }
  const unknown = await request('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomCode: 'HELLO', gameId: 'absent', config: {} }) });
  assert.equal((await unknown.json()).code, 'UNKNOWN_GAME');
  const oversized = await request('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 'é'.repeat(9000) }) });
  assert.equal(oversized.status, 413); assert.equal((await oversized.json()).code, 'MESSAGE_TOO_LARGE');
  assert.equal((await request('/api/games')).headers.get('cache-control'), 'no-store');
  const missing = await request('/api/rooms/ABSENT/ws?name=Ben', { headers: { Upgrade: 'websocket' } });
  assert.equal(missing.status, 404); assert.equal(missing.headers.get('access-control-allow-origin'), '*');
});

test('Gleichzeitiges Create normalisiert denselben Raum, genau ein Erfolg', async () => {
  const name = code();
  const results = await Promise.all([create(` ${name.toLowerCase()} `), create(name), create(name)]);
  assert.deepEqual(results.map(r => r.response.status).sort(), [201, 409, 409]);
  const success = results.find(r => r.response.status === 201);
  assert.equal(success.body.roomCode, name);
  assert.equal(success.body.webSocketPath, `/api/rooms/${name}/ws`);
});

test('Neue leere Räume: fünf Minuten, spätes Join, Wiederverwendung und alter Alarm', async () => {
  const r = await create(); const stub = rooms.getByName(r.code);
  const initial = await stub.inspect();
  assert.equal(initial.room.expiresAt - initial.room.emptySince, 300000);
  assert.ok((await stub.tick(299999)).room);
  await stub.tick(1, false); // Alarm bewusst verspätet: Join muss die Frist selbst prüfen.
  const response = await request(`/api/rooms/${r.code}/ws?name=Ben`, { headers: { Upgrade: 'websocket' } });
  assert.equal(response.status, 404);
  const fresh = await create(r.code); assert.equal(fresh.response.status, 201);
  assert.notEqual(fresh.body.roomInstanceId, r.body.roomInstanceId);
  await stub.tick(0); // Wiederholung/alter Alarm liest die aktuelle Generation.
  assert.equal((await stub.inspect()).room.roomInstanceId, fresh.body.roomInstanceId);
  assert.equal((await stub.tick(300000)).room, null);
});

test('Reconnect, stabile Identität, Zustand und späte Ereignisse ersetzter Verbindung', async () => {
  const r = await running(); const old = r.clients[0];
  const before = await r.stub.inspect();
  const player = before.room.players[0];
  await r.stub.rememberSocket(player.playerId);
  const replacement = await join(r.code.toLowerCase(), ` ${player.displayName.toUpperCase()} `);
  assert.equal(replacement.welcome.playerId, old.welcome.playerId);
  assert.equal(replacement.welcome.matchId, r.match.matchId);
  assert.equal(replacement.welcome.view.moves, 0);
  assert.notEqual(replacement.welcome.connectionId, old.welcome.connectionId);
  await r.stub.lateEvents(JSON.stringify({ v: 1, type: 'abort', requestId: 'old', matchId: r.match.matchId }));
  const after = await r.stub.inspect();
  assert.equal(after.room.players.length, 2);
  assert.equal(after.room.players[0].connectionId, replacement.welcome.connectionId);
  assert.equal(after.room.match.status.type, 'running');
  replacement.send({ v: 1, type: 'ping' }); assert.equal((await replacement.next(m => m.type === 'pong')).type, 'pong');
  await r.stub.drop(player.playerId);
  const rejoined = await join(r.code, player.displayName.toLowerCase());
  assert.equal(rejoined.welcome.playerId, player.playerId);
  assert.equal(rejoined.welcome.matchId, r.match.matchId);
});

test('Hibernation-Rekonstruktion: echte SQLite-Daten, Attachments und Nachrichtenlimit', async () => {
  const r = await running(); const c = r.clients[0];
  for (let i = 0; i < 10; i++) { c.send({ v: 1, type: 'ping' }); await c.next(m => m.type === 'pong'); }
  const before = await r.stub.inspect();
  const after = await r.stub.reconstruct();
  assert.deepEqual(after.room, before.room);
  assert.deepEqual(after.sockets, before.sockets);
  await c.next(m => m.type === 'pong'); // Vom neu konstruierten Handler erzeugt.
  c.send({ v: 1, type: 'ping' }); await c.next(m => m.type === 'pong');
  for (let i = 0; i < 60; i++) c.send({ v: 1, type: 'ping' });
  assert.equal((await c.next(m => m.code === 'RATE_LIMITED')).type, 'error');
});

test('Liveness trennt stille Verbindungen; Wiederverbindung hebt Leerraumfrist auf', async () => {
  const r = await running();
  assert.equal((await r.stub.tick(119999)).room.expiresAt, null);
  const dead = await r.stub.tick(1);
  assert.ok(dead.room.players.every(p => p.connectionId === null));
  assert.equal(dead.room.expiresAt - dead.room.emptySince, 300000);
  assert.equal(dead.room.match.status.type, 'running');
  await r.stub.tick(299999);
  const p = dead.room.players[0];
  const c = await join(r.code, p.displayName);
  assert.equal(c.welcome.playerId, p.playerId);
  assert.equal((await r.stub.inspect()).room.expiresAt, null);
  c.send({ v: 1, type: 'ping' }); await c.next(m => m.type === 'pong');
  // Ein überfälliger alter Löschalarm darf den jetzt lebenden Raum nicht entfernen.
  assert.ok((await r.stub.tick(1)).room);
});

test('Aktionen: invalid, duplicate, veraltete Revision/Partie und Client-Identität', async () => {
  const r = await running(); const c = r.clients[0];
  const fields = { matchId: r.match.matchId, expectedRevision: 0 };
  const invalid = await c.command('action', { ...fields, action: { kind: 'invalid' } });
  assert.equal(invalid.code, 'INVALID_ACTION');
  assert.equal((await r.stub.inspect()).room.match.state.moves, 0);
  const message = { v: 1, type: 'action', requestId: 'same', ...fields, action: { kind: 'step' } };
  c.send(message); assert.equal((await c.next(m => m.requestId === 'same')).type, 'ack');
  c.send(message); assert.equal((await c.next(m => m.requestId === 'same')).type, 'ack');
  assert.equal((await r.stub.inspect()).room.match.state.moves, 1);
  assert.equal((await c.command('action', { ...fields, action: { kind: 'step' } })).code, 'STALE_REVISION');
  assert.equal((await c.command('action', { ...fields, matchId: 'old', action: { kind: 'step' } })).code, 'STALE_MATCH');
  c.send({ v: 1, type: 'action', requestId: 'spoof', ...fields, playerId: r.clients[1].welcome.playerId, action: { kind: 'win' } });
  assert.equal((await c.next(m => m.code === 'INVALID_MESSAGE')).type, 'error');
  c.send(new ArrayBuffer(8)); assert.equal((await c.next(m => m.code === 'INVALID_MESSAGE')).type, 'error');
  c.send('é'.repeat(9000)); assert.equal((await c.next(m => m.code === 'MESSAGE_TOO_LARGE')).type, 'error');
  assert.equal((await r.stub.inspect()).room.match.revision, 1);
});

test('Vier Spieler, Platzlimit, alle bereit/verbunden, private Ansichten und Rematch-Rotation', async () => {
  const made = await create(); const stub = rooms.getByName(made.code);
  const clients = [];
  for (const name of ['Ben', 'Joel', 'Alice', '李']) clients.push(await join(made.code, name));
  const full = await request(`/api/rooms/${made.code}/ws?name=Fifth`, { headers: { Upgrade: 'websocket' } });
  assert.equal(full.status, 409);
  assert.equal((await full.json()).code, 'ROOM_FULL');
  assert.equal((await clients[0].command('start')).code, 'NOT_READY');
  for (const c of clients) await c.command('ready', { ready: true });
  await stub.drop(clients[3].welcome.playerId);
  assert.equal((await clients[0].command('start')).code, 'NOT_READY');
  clients[3] = await join(made.code, '李');
  const started = await clients[0].command('start');
  assert.equal(started.type, 'ack');
  const first = (await stub.inspect()).room.match;
  assert.equal(first.participants.length, 4);
  assert.equal(first.startingPlayerId, clients[0].welcome.playerId);
  for (let i = 0; i < 4; i++) {
    const state = await clients[i].next(m => m.type === 'state' && m.matchId === first.matchId);
    assert.equal(state.view.secret, `PRIVATE-${i}-${clients[i].welcome.playerId}`);
    for (let j = 0; j < 4; j++) if (j !== i) assert.ok(!JSON.stringify(clients[i].messages).includes(`PRIVATE-${j}-`));
  }
  await clients[0].command('action', { matchId: first.matchId, expectedRevision: 0, action: { kind: 'draw' } });
  for (const c of clients) assert.equal((await c.command('rematch', { matchId: first.matchId })).type, 'ack');
  const second = (await stub.inspect()).room.match;
  assert.notEqual(second.matchId, first.matchId);
  assert.equal(second.startingPlayerId, clients[1].welcome.playerId);
  assert.deepEqual(second.rematchVotes, []);
});

test('Während laufender Partie keine neuen Plätze; View-Fehler verraten keinen Zustand', async () => {
  const r = await running(2, { viewFailure: true });
  const response = await request(`/api/rooms/${r.code}/ws?name=NewName`, { headers: { Upgrade: 'websocket' } });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'ROOM_LOCKED');
  const error = await r.clients[0].next(m => m.type === 'error' && m.code === 'INTERNAL_ERROR');
  assert.equal(error.view, undefined);
  assert.ok(!JSON.stringify(r.clients[0].messages).includes('PRIVATE-'));
  assert.ok(!JSON.stringify(error).includes('private engine data'));
});

test('Sieg atomar genau einmal, parallele Räume, Rematch und verlorene RPC-Bestätigung', async () => {
  const a = await running(); const b = await running();
  await stats.fault('lost-ack');
  const win = r => r.clients[0].command('action', { matchId: r.match.matchId, expectedRevision: 0, action: { kind: 'win' } });
  await Promise.all([win(a), win(b)]);
  await eventually(() => stats.list(), rows => [a, b].every(r => rows.some(row => row.nameKey === r.clients[0].welcome.room.players[0].displayName.toLowerCase() && row.wins === 1)));
  await eventually(() => a.stub.inspect(), s => s.outbox.length === 1 && s.outbox[0].attempts >= 1);
  await stats.fault('');
  await Promise.all([a.stub.tick(60000), b.stub.tick(60000)]);
  assert.equal((await a.stub.inspect()).outbox.length, 0);
  const winner = a.clients[0].welcome.room.players[0].displayName.toLowerCase();
  assert.equal((await stats.list()).find(row => row.nameKey === winner).wins, 1);
  for (const c of a.clients) await c.command('rematch', { matchId: a.match.matchId });
  const second = (await a.stub.inspect()).room.match;
  await a.clients[0].command('action', { matchId: second.matchId, expectedRevision: 0, action: { kind: 'win' } });
  await eventually(() => stats.list(), rows => rows.find(row => row.nameKey === winner)?.wins === 2);
  const event = { matchId: second.matchId, nameKey: winner, displayName: a.clients[0].welcome.room.players[0].displayName };
  assert.equal((await stats.recordWin(event)).ok, true);
  await assert.rejects(() => stats.recordWin({ ...event, displayName: 'Other', nameKey: 'other' }));
});

test('Statistikausfall: Outbox überlebt Löschung und Wiederverwendung, neuer Raum bleibt unverändert', async () => {
  const r = await running(); await stats.fault('offline');
  await r.clients[0].command('action', { matchId: r.match.matchId, expectedRevision: 0, action: { kind: 'win' } });
  await eventually(() => r.stub.inspect(), s => s.outbox.length === 1 && s.outbox[0].attempts > 0);
  const winner = r.clients[0].welcome.room.players[0].displayName.toLowerCase();
  for (const c of r.clients) await r.stub.drop(c.welcome.playerId);
  const cleared = await r.stub.tick(300000);
  assert.equal(cleared.room, null); assert.equal(cleared.outbox.length, 1); assert.ok(cleared.alarm);
  const fresh = await create(r.code); assert.equal(fresh.response.status, 201);
  await stats.fault(''); await r.stub.tick(60000);
  const delivered = await r.stub.inspect();
  assert.equal(delivered.room.roomInstanceId, fresh.body.roomInstanceId);
  assert.equal(delivered.room.match, null);
  assert.equal(delivered.outbox.length, 0);
  assert.equal((await stats.list()).find(row => row.nameKey === winner).wins, 1);
});

test('Unentschieden, Abbruch, Disconnect und Löschung erzeugen keinen Sieg', async () => {
  const before = await stats.list();
  for (const kind of ['draw', 'aborted', 'abort']) {
    const r = await running();
    const response = kind === 'abort'
      ? await r.clients[0].command('abort', { matchId: r.match.matchId })
      : await r.clients[0].command('action', { matchId: r.match.matchId, expectedRevision: 0, action: { kind } });
    assert.equal(response.type, 'ack');
    for (const c of r.clients) await r.stub.drop(c.welcome.playerId);
    await r.stub.tick(300000);
  }
  assert.deepEqual(await stats.list(), before);
});


test('Produktionsbundle: Tic Tac Toe registriert, Fixture und Test-RPCs nicht aktiviert', async () => {
  const worker = await mf.getWorker('phase3-production');
  assert.deepEqual(await (await worker.fetch('http://localhost/api/games')).json(), [{ id: 'tic-tac-toe', version: '1', minPlayers: 2, maxPlayers: 2 }]);
  assert.deepEqual(await (await worker.fetch('http://localhost/health')).json(), { ok: true });
  const response = await worker.fetch('http://localhost/api/rooms', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomCode: 'PRODUCTION', gameId: 'fixture', config: {} }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'UNKNOWN_GAME');
});

test('Konkurrierender Start und doppelte Abschlüsse mutieren genau einmal', async () => {
  const r = await create(); const stub = rooms.getByName(r.code);
  const a = await join(r.code, 'ConcurrentA'); const b = await join(r.code, 'ConcurrentB');
  await a.command('ready', { ready: true }); await b.command('ready', { ready: true });
  const starts = await Promise.all([a.command('start'), b.command('start')]);
  assert.deepEqual(starts.map(m => m.type).sort(), ['ack', 'error']);
  const match = (await stub.inspect()).room.match;
  const message = { v: 1, type: 'action', requestId: 'finish-once', matchId: match.matchId,
    expectedRevision: 0, action: { kind: 'win' } };
  a.send(message); a.send(message);
  const first = await a.next(m => m.requestId === message.requestId);
  const second = await a.next(m => m.requestId === message.requestId);
  assert.deepEqual(first, second);
  assert.equal((await stub.inspect()).room.match.revision, 1);
  assert.equal((await b.command('abort', { matchId: match.matchId })).code, 'MATCH_NOT_RUNNING');
  await eventually(() => stats.list(), rows => rows.find(row => row.nameKey === 'concurrenta')?.wins === 1);
  const vote = { v: 1, type: 'rematch', requestId: 'vote-once', matchId: match.matchId };
  a.send(vote); a.send(vote);
  await a.next(m => m.requestId === vote.requestId); await a.next(m => m.requestId === vote.requestId);
  assert.deepEqual((await stub.inspect()).room.match.rematchVotes, [a.welcome.playerId]);
  await b.command('rematch', { matchId: match.matchId });
  const nextMatch = (await stub.inspect()).room.match;
  a.send(vote); await a.next(m => m.requestId === vote.requestId);
  assert.equal((await stub.inspect()).room.match.matchId, nextMatch.matchId);
  assert.deepEqual((await stub.inspect()).room.match.rematchVotes, []);
});

test('Ein Scheduler behält Retry, Liveness und Leerraumfrist; Backoff ist begrenzt', async () => {
  const r = await running(); await stats.fault('offline');
  await r.clients[0].command('action', { matchId: r.match.matchId, expectedRevision: 0, action: { kind: 'win' } });
  let s = await eventually(() => r.stub.inspect(), s => s.outbox[0]?.attempts >= 1);
  assert.equal(s.alarm, s.outbox[0].next_attempt);
  for (let i = 0; i < 8; i++) s = await r.stub.tick(60000);
  assert.equal(s.room, null); // Liveness-Erkennung plus volle Leerraumfrist.
  assert.equal(s.outbox.length, 1);
  assert.equal(s.alarm, s.outbox[0].next_attempt);
  const next = await r.stub.tick(60000);
  assert.equal(next.outbox[0].next_attempt - s.outbox[0].next_attempt, 60000);
  await stats.fault(''); await r.stub.tick(60000);
  assert.equal((await r.stub.inspect()).outbox.length, 0);
});

test('Statistik nutzt dieselbe NFC-/Kleinschreibungsidentität und deterministische Sortierung', async () => {
  await stats.recordWin({ matchId: 'normalization-a', ...{ nameKey: 'bén', displayName: 'Bén' } });
  await stats.recordWin({ matchId: 'normalization-b', ...{ nameKey: 'bén', displayName: 'BÉN' } });
  const rows = await (await request('/api/stats')).json();
  assert.equal(rows.filter(r => r.nameKey === 'bén').length, 1);
  assert.deepEqual(rows.find(r => r.nameKey === 'bén'), { nameKey: 'bén', displayName: 'BÉN', wins: 2 });
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].wins > rows[i].wins ||
      (rows[i - 1].wins === rows[i].wins && rows[i - 1].nameKey < rows[i].nameKey));
  }
});

for (const [status, action] of [['won', 'win'], ['draw', 'draw'], ['aborted', null]]) {
  test(`Feste Teilnehmer nach ${status}: neue Namen gesperrt, Reconnect/Rematch und neue Rauminstanz offen`, async () => {
    const r = await running(2);
    const before = (await r.stub.inspect()).room;
    const finished = action
      ? await r.clients[0].command('action', { matchId: r.match.matchId, expectedRevision: 0, action: { kind: action } })
      : await r.clients[0].command('abort', { matchId: r.match.matchId });
    assert.equal(finished.type, 'ack');
    assert.equal((await r.stub.inspect()).room.match.status.type, status);

    const thirdName = `Third-${r.code}`;
    const locked = await request(`/api/rooms/${r.code}/ws?name=${thirdName}`, { headers: { Upgrade: 'websocket', Origin: 'null' } });
    assert.equal(locked.status, 409);
    assert.equal((await locked.json()).code, 'ROOM_LOCKED');
    assert.equal((await r.stub.inspect()).room.players.length, 2);

    // Bekannter normalisierter Name ersetzt auch nach Abschluss die aktive Verbindung.
    const replacement = await join(r.code, ` ${before.players[0].displayName.toUpperCase()} `);
    assert.equal(replacement.welcome.playerId, before.players[0].playerId);
    assert.equal(replacement.welcome.matchId, r.match.matchId);
    assert.notEqual(replacement.welcome.connectionId, r.clients[0].welcome.connectionId);
    assert.equal(replacement.welcome.room.status.type, status);

    // Auch ein wirklich getrennter bekannter Teilnehmer behält seinen Platz.
    await r.stub.drop(before.players[1].playerId);
    const reconnected = await join(r.code, before.players[1].displayName.toLowerCase());
    assert.equal(reconnected.welcome.playerId, before.players[1].playerId);
    for (const c of [replacement, reconnected]) {
      assert.equal((await c.command('rematch', { matchId: r.match.matchId })).type, 'ack');
    }
    const rematch = (await r.stub.inspect()).room.match;
    assert.notEqual(rematch.matchId, r.match.matchId);
    assert.equal(rematch.status.type, 'running');
    assert.deepEqual(rematch.participants.map(p => p.playerId), before.players.map(p => p.playerId));

    for (const p of before.players) await r.stub.drop(p.playerId);
    assert.equal((await r.stub.tick(299999)).room.roomInstanceId, before.roomInstanceId);
    assert.equal((await r.stub.tick(1)).room, null);
    const fresh = await create(r.code);
    assert.equal(fresh.response.status, 201);
    assert.notEqual(fresh.body.roomInstanceId, before.roomInstanceId);
    const newcomer = await join(r.code, thirdName);
    assert.equal(newcomer.welcome.roomInstanceId, fresh.body.roomInstanceId);
    assert.equal(newcomer.welcome.matchId, null);
    assert.equal(newcomer.welcome.room.players.length, 1);
    assert.equal(newcomer.welcome.room.players[0].displayName, thirdName);
  });
}

test('Produktives Tic Tac Toe: Züge, Reconnect, Sieg genau einmal, Rematch, Draw und Abort', async () => {
  const fetcher = (path, options) => productionMf.dispatchFetch(`http://localhost${path}`, options);
  const readStats = async () => (await fetcher('/api/stats')).json();
  const roomCode = `TTT-${++sequence}`;
  const created = await fetcher('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomCode, gameId: 'tic-tac-toe', config: {} }) });
  assert.equal(created.status, 201);
  const clients = [await join(roomCode, 'TttAlice', fetcher), await join(roomCode, 'TttBen', fetcher)];
  for (const c of clients) assert.equal((await c.command('ready', { ready: true })).type, 'ack');
  const started = await clients[0].command('start');
  assert.equal(started.type, 'ack');
  let state;
  async function synchronized(ack) {
    const views = await Promise.all(clients.map(c => c.next(m => m.type === 'state' && m.matchId === ack.matchId && m.revision === ack.revision)));
    assert.deepEqual(views[0].view.board, views[1].view.board);
    assert.deepEqual(views[0].room, views[1].room);
    assert.notEqual(views[0].view.yourSymbol, views[1].view.yourSymbol);
    state = views[0];
    return views;
  }
  await synchronized(started);
  const originalStartingPlayerId = state.room.startingPlayerId;
  const currentClient = () => clients.find(c => c.welcome.playerId === state.view.currentPlayerId);
  async function place(cell) {
    const ack = await currentClient().command('action', { matchId: state.matchId, expectedRevision: state.revision, action: { kind: 'place', cell } });
    assert.equal(ack.type, 'ack');
    await synchronized(ack);
  }
  await place(0);
  const wrong = clients.find(c => c !== currentClient());
  assert.equal((await wrong.command('action', { matchId: state.matchId, expectedRevision: state.revision, action: { kind: 'place', cell: 1 } })).code, 'INVALID_ACTION');
  await place(3);
  assert.equal(state.revision, 2); // Falscher Spieler hat nichts verändert.
  assert.equal((await currentClient().command('action', { matchId: state.matchId, expectedRevision: 2, action: { kind: 'place', cell: 0 } })).code, 'INVALID_ACTION');

  // Echter produktiver Join-Pfad, ohne Test-RPCs oder künstliche Uhr.
  const old = clients[0];
  old.ws.close(1000, 'Reconnect test');
  const name = state.room.players.find(p => p.playerId === old.welcome.playerId).displayName;
  clients[0] = await join(roomCode, ` ${name.toUpperCase()} `, fetcher);
  assert.equal(clients[0].welcome.playerId, old.welcome.playerId);
  assert.equal(clients[0].welcome.matchId, state.matchId);
  assert.deepEqual(clients[0].welcome.view.board, state.view.board);
  assert.equal(clients[0].welcome.revision, 2);
  await place(1); await place(4);
  const finisher = currentClient();
  const finish = { v: 1, type: 'action', requestId: 'ttt-finish-once', matchId: state.matchId,
    expectedRevision: state.revision, action: { kind: 'place', cell: 2 } };
  finisher.send(finish);
  const ack = await finisher.next(m => m.requestId === finish.requestId);
  assert.equal(ack.type, 'ack');
  await synchronized(ack);
  assert.deepEqual(state.room.status, { type: 'won', winnerPlayerId: originalStartingPlayerId });
  assert.deepEqual(state.view.winningLine, [0,1,2]);
  assert.equal(state.view.currentPlayerId, null);
  const winner = state.room.players.find(p => p.playerId === originalStartingPlayerId);
  const winnerKey = winner.displayName.toLowerCase();
  const wins = await eventually(readStats, rows => rows.find(row => row.nameKey === winnerKey)?.wins === 1);
  finisher.send(finish);
  assert.deepEqual(await finisher.next(m => m.requestId === finish.requestId), ack);
  assert.deepEqual(await readStats(), wins);

  async function rematch() {
    const oldMatchId = state.matchId;
    let ack;
    for (const c of clients) {
      ack = await c.command('rematch', { matchId: oldMatchId });
      assert.equal(ack.type, 'ack');
    }
    assert.notEqual(ack.matchId, oldMatchId);
    await synchronized(ack);
    assert.deepEqual(state.view.board, Array(9).fill(null));
    assert.equal(state.revision, 0);
  }
  await rematch();
  assert.notEqual(state.room.startingPlayerId, originalStartingPlayerId);
  assert.equal(state.view.symbols.find(p => p.playerId === state.room.startingPlayerId).symbol, 'X');
  for (const cell of [0,1,2,4,3,5,7,6,8]) await place(cell);
  assert.deepEqual(state.room.status, { type: 'draw' });
  assert.equal(state.view.currentPlayerId, null);
  assert.deepEqual(await readStats(), wins);
  await rematch();
  await place(4);
  const aborted = await clients[0].command('abort', { matchId: state.matchId });
  assert.equal(aborted.type, 'ack');
  await synchronized(aborted);
  assert.deepEqual(state.room.status, { type: 'aborted' });
  // Engine bleibt intern running; room.status ist verbindlich.
  assert.notEqual(state.view.currentPlayerId, null);
  assert.equal((await currentClient().command('action', { matchId: state.matchId, expectedRevision: state.revision, action: { kind: 'place', cell: 0 } })).code, 'MATCH_NOT_RUNNING');
  assert.deepEqual(await readStats(), wins);
  for (const c of clients) c.ws.close(1000, 'Done');
});
