import { DurableObject } from 'cloudflare:workers';
import { SETTINGS, CLOSE } from '../../../shared/settings.js';
import { normalizePlayerName } from '../../../shared/normalization.js';
import { registry } from '../games/registry.js';
import { validatedConfig, playerView } from '../core/engine.js';
import { mutateRoom } from '../core/match-flow.js';
import { parseMessage } from '../protocol/messages.js';
import { AppError, fail, safeError } from '../protocol/errors.js';
import { httpError } from '../protocol/http.js';

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS outbox (match_id TEXT PRIMARY KEY, event TEXT NOT NULL, attempts INTEGER NOT NULL, next_attempt INTEGER NOT NULL)');
  }
  get engines() { return registry; }
  now() { return Date.now(); }
  firstPosition(count) { return crypto.getRandomValues(new Uint32Array(1))[0] % count; }
  load() {
    const row = this.sql.exec('SELECT data FROM room WHERE id = 1').toArray()[0];
    return row ? JSON.parse(row.data) : null;
  }
  save(room) { this.sql.exec('INSERT OR REPLACE INTO room (id, data) VALUES (1, ?)', JSON.stringify(room)); }
  attachment(ws) {
    try { return ws.deserializeAttachment(); } catch { return null; }
  }
  sockets(room) {
    if (!room) return [];
    return this.ctx.getWebSockets().flatMap(ws => {
      const a = this.attachment(ws);
      const p = room.players.find(p => p.playerId === a?.playerId);
      return ws.readyState === 1 && a?.roomInstanceId === room.roomInstanceId &&
        p?.connectionId === a.connectionId ? [{ ws, a, p }] : [];
    });
  }
  close(ws, code, reason) { try { ws.close(code, reason); } catch { /* Verbindung bereits geschlossen. */ } }
  send(ws, payload) { try { ws.send(JSON.stringify(payload)); } catch { /* Liveness/Close erkennt den Ausfall. */ } }
  ids(room) {
    return { roomInstanceId: room.roomInstanceId, matchId: room.match?.matchId ?? null, revision: room.match?.revision ?? 0 };
  }
  // Nur aktuelle persistente Generation und Attachments auswerten, nie Alarm-Payloads.
  maintain(now = this.now()) {
    let room = this.load();
    if (!room) return null;
    const live = this.sockets(room);
    const active = new Set();
    for (const { ws, a, p } of live) {
      if (now - a.lastSeen >= SETTINGS.connectionTimeoutMs) this.close(ws, CLOSE.TIMEOUT, 'Activity timeout');
      else active.add(p.playerId);
    }
    let changed = false;
    for (const p of room.players) {
      if (p.connectionId && !active.has(p.playerId)) { p.connectionId = null; changed = true; }
    }
    if (active.size) {
      if (room.expiresAt !== null) { room.emptySince = null; room.expiresAt = null; changed = true; }
    } else if (room.expiresAt === null) {
      room.emptySince = now;
      room.expiresAt = now + SETTINGS.emptyRoomTtlMs;
      changed = true;
    }
    if (room.expiresAt !== null && now >= room.expiresAt && !active.size) {
      // Die Outbox bleibt unabhängig von Raum und Generation erhalten.
      this.sql.exec('DELETE FROM room WHERE id = 1');
      return null;
    }
    if (changed) this.save(room);
    return room;
  }
  schedule() {
    const room = this.load();
    const deadlines = [];
    if (room?.expiresAt !== null && room?.expiresAt !== undefined) deadlines.push(room.expiresAt);
    for (const { a } of this.sockets(room)) deadlines.push(a.lastSeen + SETTINGS.connectionTimeoutMs);
    const next = this.sql.exec('SELECT MIN(next_attempt) AS deadline FROM outbox').one().deadline;
    if (next !== null) deadlines.push(next);
    // Aufrufe werden synchron aus aktuellen Daten berechnet; kein alter Snapshot nach await.
    const promise = deadlines.length
      ? this.ctx.storage.setAlarm(Math.max(this.now() + 1, Math.min(...deadlines)))
      : this.ctx.storage.deleteAlarm();
    this.ctx.waitUntil(promise);
  }
  create(input) {
    try {
      this.maintain();
      if (this.load()) fail('ROOM_EXISTS');
      const engine = this.engines.get(input.gameId);
      const config = validatedConfig(engine, input.config);
      const now = this.now();
      const room = {
        roomCode: input.roomCode, roomInstanceId: crypto.randomUUID(), gameId: engine.id,
        config, players: [], match: null, nextStartIndex: null,
        emptySince: now, expiresAt: now + SETTINGS.emptyRoomTtlMs, dedupe: [],
      };
      this.save(room);
      return { status: 201, body: { roomCode: room.roomCode, roomInstanceId: room.roomInstanceId, webSocketPath: `/api/rooms/${room.roomCode}/ws` } };
    } catch (error) {
      return { status: error instanceof AppError ? error.status : 500, body: safeError(error) };
    } finally { this.schedule(); }
  }
  fetch(request) {
    try {
      if (request.method !== 'GET') fail('METHOD_NOT_ALLOWED');
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') fail('UPGRADE_REQUIRED');
      const name = normalizePlayerName(new URL(request.url).searchParams.get('name'));
      const room = this.maintain();
      if (!room) fail('ROOM_NOT_FOUND');
      let player = room.players.find(p => p.nameKey === name.nameKey);
      if (!player) {
        if (room.match !== null) fail('ROOM_LOCKED');
        if (room.players.length >= this.engines.get(room.gameId).maxPlayers) fail('ROOM_FULL');
        player = { ...name, playerId: crypto.randomUUID(), connectionId: null, ready: false };
        room.players.push(player);
      }
      const old = this.sockets(room).filter(item => item.p.playerId === player.playerId);
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      const now = this.now();
      const connectionId = crypto.randomUUID();
      server.serializeAttachment({ roomInstanceId: room.roomInstanceId, playerId: player.playerId, connectionId,
        lastSeen: now, windowStart: now, messageCount: 0 });
      Object.assign(player, name, { connectionId });
      room.emptySince = null;
      room.expiresAt = null;
      this.save(room);
      for (const item of old) this.close(item.ws, CLOSE.REPLACED, 'Connection replaced');
      this.sendView(server, room, player, 'welcome', { playerId: player.playerId, connectionId, settings: SETTINGS });
      this.broadcast(room);
      // Origin null wird ausdrücklich akzeptiert; der Name ist die einzige Identitätsprüfung.
      return new Response(null, { status: 101, webSocket: client });
    } catch (error) { return httpError(error); }
    finally { this.schedule(); }
  }
  metadata(room) {
    return {
      roomCode: room.roomCode, gameId: room.gameId,
      players: room.players.map(({ playerId, displayName, ready, connectionId }) => ({ playerId, displayName, ready, connected: connectionId !== null })),
      status: room.match?.status ?? { type: 'lobby' },
      participants: room.match?.participants.map(p => p.playerId) ?? [],
      startingPlayerId: room.match?.startingPlayerId ?? null,
      rematchVotes: room.match?.rematchVotes ?? [],
    };
  }
  sendView(ws, room, player, type = 'state', extra = {}) {
    try {
      const view = room.match ? playerView(this.engines.get(room.gameId), room.match, player.playerId) : null;
      this.send(ws, { v: 1, type, ...this.ids(room), room: this.metadata(room), view, ...extra });
    } catch {
      // Insbesondere KEIN Fallback auf room.match.state.
      this.send(ws, { v: 1, type: 'error', ...this.ids(room), ...safeError(new Error()) });
    }
  }
  broadcast(room = this.load()) {
    for (const { ws, p } of this.sockets(room)) this.sendView(ws, room, p);
  }
  mutate(room, player, message) {
    const event = mutateRoom(room, player, message, {
      engines: this.engines, firstPosition: count => this.firstPosition(count),
    });
    if (event) this.sql.exec(
      'INSERT OR IGNORE INTO outbox (match_id, event, attempts, next_attempt) VALUES (?, ?, 0, ?)',
      event.matchId, JSON.stringify(event), this.now(),
    );
  }
  webSocketMessage(ws, raw) {
    const room = this.maintain();
    const a = this.attachment(ws);
    const current = this.sockets(room).find(item => item.a.connectionId === a?.connectionId && item.ws === ws);
    if (!current) { this.schedule(); return; }
    let m;
    try {
      const now = this.now();
      if (now - a.windowStart >= SETTINGS.rateWindowMs) { a.windowStart = now; a.messageCount = 0; }
      a.messageCount++;
      ws.serializeAttachment(a); // Auch ungültige Nachrichten zählen; überlebt Hibernation.
      if (a.messageCount > SETTINGS.maxMessagesPerWindow) fail('RATE_LIMITED');
      m = parseMessage(raw);
      a.lastSeen = now;
      ws.serializeAttachment(a);
      if (m.type === 'ping') {
        this.send(ws, { v: 1, type: 'pong', ...this.ids(room) });
        return;
      }
      const scope = m.matchId ?? 'room';
      const fingerprint = JSON.stringify(m);
      const previous = room.dedupe.find(entry => entry.playerId === a.playerId && entry.scope === scope && entry.requestId === m.requestId);
      if (previous) {
        if (previous.fingerprint !== fingerprint) fail('INVALID_MESSAGE');
        this.send(ws, previous.ack);
        return;
      }
      let ack;
      this.ctx.storage.transactionSync(() => {
        this.mutate(room, current.p, m);
        ack = { v: 1, type: 'ack', requestId: m.requestId, ...this.ids(room) };
        room.dedupe.push({ playerId: a.playerId, scope, requestId: m.requestId, fingerprint, ack });
        const own = room.dedupe.filter(entry => entry.playerId === a.playerId);
        const discard = new Set(own.slice(0, Math.max(0, own.length - SETTINGS.dedupeEntriesPerPlayer)));
        room.dedupe = room.dedupe.filter(entry => !discard.has(entry));
        this.save(room);
      });
      this.send(ws, ack);
      this.broadcast(room);
      this.ctx.waitUntil(this.flushStats());
    } catch (error) {
      this.send(ws, { v: 1, type: 'error', ...this.ids(this.load()), ...(m?.requestId ? { requestId: m.requestId } : {}), ...safeError(error) });
    } finally { this.schedule(); }
  }
  disconnected(ws) {
    const room = this.load();
    const a = this.attachment(ws);
    if (!room || a?.roomInstanceId !== room.roomInstanceId) return;
    const p = room.players.find(p => p.playerId === a.playerId && p.connectionId === a.connectionId);
    if (!p) return; // Späte Ereignisse ersetzter Verbindungen sind wirkungslos.
    p.connectionId = null;
    this.save(room);
    this.maintain();
    this.schedule();
    this.broadcast();
  }
  webSocketClose(ws) { this.disconnected(ws); }
  webSocketError(ws) { this.close(ws, 1011, 'Connection error'); this.disconnected(ws); }
  async flushStats() {
    const due = this.sql.exec('SELECT * FROM outbox WHERE next_attempt <= ? ORDER BY next_attempt, match_id', this.now()).toArray();
    for (const row of due) {
      // Vor RPC persistente Retry-Frist setzen: auch ein Neustart verliert nichts.
      const latest = this.sql.exec('SELECT next_attempt FROM outbox WHERE match_id = ?', row.match_id).toArray()[0];
      if (!latest || latest.next_attempt > this.now()) continue;
      const attempts = Math.min(row.attempts + 1, 31);
      const delay = Math.min(SETTINGS.statsRetryMaxMs, SETTINGS.statsRetryBaseMs * 2 ** (attempts - 1));
      this.sql.exec('UPDATE outbox SET attempts = ?, next_attempt = ? WHERE match_id = ?', attempts, this.now() + delay, row.match_id);
      this.schedule();
      try {
        const result = await this.env.GLOBAL_STATS.getByName('global').recordWin(JSON.parse(row.event));
        if (result?.ok === true) this.sql.exec('DELETE FROM outbox WHERE match_id = ?', row.match_id);
      } catch { /* Unbegrenzt weiter versuchen, ohne Payloads oder interne Fehler zu loggen. */ }
      // Nach await nur Outbox nach match_id ändern, niemals den früheren Raum speichern.
      this.schedule();
    }
  }
  async alarm() {
    this.maintain();
    this.broadcast();
    this.schedule();
    await this.flushStats();
    this.schedule();
  }
}
