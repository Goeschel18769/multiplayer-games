import { GameRoom as BaseGameRoom } from '../../backend/src/rooms/game-room.js';
import { GlobalStats as BaseStats } from '../../backend/src/stats/global-stats.js';
import { createWorker } from '../../backend/src/worker.js';
import { fixtureRegistry } from './engine.js';

// Test-RPCs existieren ausschließlich in diesem separaten Bundle.
export class GameRoom extends BaseGameRoom {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql.exec('CREATE TABLE IF NOT EXISTS test_clock (id INTEGER PRIMARY KEY, time INTEGER NOT NULL)');
    this.sql.exec('INSERT OR IGNORE INTO test_clock VALUES (1, ?)', Date.now() + 86400000);
    this.oldSocket = null;
  }
  get engines() { return fixtureRegistry; }
  now() { return this.sql.exec('SELECT time FROM test_clock WHERE id = 1').one().time; }
  firstPosition() { return 0; }
  async tick(ms, runAlarm = true) {
    this.sql.exec('UPDATE test_clock SET time = time + ? WHERE id = 1', ms);
    if (runAlarm) await this.alarm();
    return this.inspect();
  }
  async inspect() {
    return { room: this.load(), outbox: this.sql.exec('SELECT * FROM outbox').toArray(),
      alarm: await this.ctx.storage.getAlarm(), sockets: this.ctx.getWebSockets().map(ws => this.attachment(ws)) };
  }
  async reconstruct() {
    // Neue Instanz mit echtem Runtime-Context, SQLite und WebSocket-Attachments.
    const restored = new GameRoom(this.ctx, this.env);
    const snapshot = await restored.inspect();
    for (const { ws } of restored.sockets(restored.load())) restored.webSocketMessage(ws, JSON.stringify({ v: 1, type: 'ping' }));
    return snapshot;
  }
  rememberSocket(playerId) { this.oldSocket = this.sockets(this.load()).find(item => item.p.playerId === playerId).ws; }
  lateEvents(raw) {
    this.webSocketMessage(this.oldSocket, raw);
    this.webSocketClose(this.oldSocket);
    this.webSocketError(this.oldSocket);
    return this.inspect();
  }
  drop(playerId) {
    const item = this.sockets(this.load()).find(item => item.p.playerId === playerId);
    if (item) { this.close(item.ws, 1000, 'Test disconnect'); this.disconnected(item.ws); }
    return this.inspect();
  }
}
export class GlobalStats extends BaseStats {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql.exec('CREATE TABLE IF NOT EXISTS test_fault (id INTEGER PRIMARY KEY, mode TEXT NOT NULL)');
  }
  fault(mode) { this.sql.exec('INSERT OR REPLACE INTO test_fault VALUES (1, ?)', mode); }
  recordWin(event) {
    const mode = this.sql.exec('SELECT mode FROM test_fault WHERE id = 1').toArray()[0]?.mode;
    if (mode === 'offline') throw new Error('Test stats unavailable');
    const result = super.recordWin(event);
    if (mode === 'lost-ack') throw new Error('Test acknowledgement lost');
    return result;
  }
}
export default createWorker(fixtureRegistry);
