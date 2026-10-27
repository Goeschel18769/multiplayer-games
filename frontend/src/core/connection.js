import { backendOrigin } from './http.js';
import { identity, validSnapshot } from './protocol.js';

const HANDSHAKE_ERROR = 'Der Raum konnte nicht betreten werden. Bitte Namen und Raumcode prüfen. Der Raum kann fehlen, abgelaufen, voll oder für neue Namen gesperrt sein. Du kannst es mit „Erneut verbinden“ noch einmal versuchen.';
const newRequestId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');

// Spielunabhängiger Transport. Ausschließlich Serveransichten werden übernommen.
export class RoomConnection {
  constructor(config, {
    WebSocketImpl = globalThis.WebSocket, onChange = () => {}, onWin = () => {},
    timers = globalThis, requestId = newRequestId,
  } = {}) {
    this.origin = backendOrigin(config.backendUrl);
    this.version = config.protocolVersion;
    this.WebSocket = WebSocketImpl;
    this.timers = timers;
    this.requestId = requestId;
    this.onChange = onChange;
    this.onWin = onWin;
    this.phase = 'idle';
    this.message = 'Raum erstellen oder einem bestehenden Raum beitreten.';
    this.snapshot = null;
    this.playerId = null;
    this.connectionId = null;
    this.socket = null;
    this.pending = null;
    this.generation = 0;
    this.heartbeat = null;
    this.deadline = null;
    this.seenWins = new Set();
  }
  get canMutate() { return this.phase === 'connected' && this.socket?.readyState === 1 && this.snapshot !== null && !this.pending; }
  changed() { this.onChange(this); }
  clearTimers() {
    this.timers.clearInterval(this.heartbeat);
    this.timers.clearTimeout(this.deadline);
    this.heartbeat = null; this.deadline = null;
  }
  disconnect(message = 'Du bist getrennt. Dein Spielerplatz bleibt im Raum reserviert.') {
    this.generation++;
    this.clearTimers();
    const old = this.socket;
    this.socket = null;
    this.pending = null;
    this.phase = 'disconnected';
    this.message = message;
    try { old?.close(1000, 'Client disconnected'); } catch { /* Bereits geschlossen. */ }
    this.changed();
  }
  requireSync(message = 'Die Aktion ist nicht sicher bestätigt. Bitte erneut verbinden, um den aktuellen Stand zu laden.') {
    this.disconnect(message);
    this.phase = 'resync';
    this.changed();
  }
  connect(name, code) {
    const normalized = identity(name, code);
    this.disconnect();
    const generation = this.generation;
    this.snapshot = null; this.playerId = null; this.connectionId = null;
    this.phase = 'connecting';
    this.message = 'Verbindung wird aufgebaut …';
    const url = new URL(`/api/rooms/${encodeURIComponent(normalized.roomCode)}/ws`, this.origin);
    url.searchParams.set('name', normalized.name);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws;
    try { ws = new this.WebSocket(url.href); this.socket = ws; }
    catch { this.disconnect(HANDSHAKE_ERROR); return; }
    const current = () => generation === this.generation && this.socket === ws;
    this.deadline = this.timers.setTimeout(() => { if (current()) this.requireSync(HANDSHAKE_ERROR); }, 15000);
    ws.addEventListener('message', event => {
      if (!current()) return;
      try {
        if (typeof event.data !== 'string') throw new Error('Unexpected binary message');
        const m = JSON.parse(event.data);
        if (m?.v !== this.version) throw new Error('Unknown protocol');
        this.receive(m);
      } catch { this.requireSync('Die Serverantwort konnte nicht übernommen werden. Bitte erneut verbinden.'); }
    });
    ws.addEventListener('error', () => {
      if (current()) this.requireSync(this.phase === 'connecting' ? HANDSHAKE_ERROR : 'Die Verbindung ist unterbrochen. Bitte manuell erneut verbinden.');
    });
    ws.addEventListener('close', event => {
      if (!current()) return;
      const wasConnecting = this.phase === 'connecting';
      this.clearTimers(); this.socket = null; this.pending = null;
      this.phase = 'disconnected';
      this.message = event.code === 4001
        ? 'Eine andere Verbindung mit gleichem Namen hat deinen Spielerplatz übernommen. Du kannst bei Bedarf manuell erneut verbinden.'
        : wasConnecting ? HANDSHAKE_ERROR : 'Die Verbindung wurde beendet. Bitte bei Bedarf erneut verbinden.';
      this.changed();
    });
    this.changed();
  }
  receive(m) {
    if (m.type === 'welcome') {
      if (this.phase !== 'connecting' || !validSnapshot(m, this.version) ||
          typeof m.playerId !== 'string' || typeof m.connectionId !== 'string' ||
          !m.room.players.some(p => p.playerId === m.playerId) ||
          !Number.isSafeInteger(m.settings?.heartbeatIntervalMs) || m.settings.heartbeatIntervalMs <= 0) throw new Error('Invalid welcome');
      this.timers.clearTimeout(this.deadline); this.deadline = null;
      this.playerId = m.playerId; this.connectionId = m.connectionId;
      this.snapshot = m; this.phase = 'connected'; this.message = 'Verbunden.';
      const generation = this.generation;
      this.heartbeat = this.timers.setInterval(() => {
        if (this.phase !== 'connected' || generation !== this.generation || this.socket?.readyState !== 1) return;
        try { this.send({ v: this.version, type: 'ping' }); } catch { this.requireSync(); }
      }, m.settings.heartbeatIntervalMs);
    } else if (m.type === 'state') {
      if (this.phase !== 'connected' || !validSnapshot(m, this.version) || m.roomInstanceId !== this.snapshot.roomInstanceId) return;
      if (m.matchId === this.snapshot.matchId && m.revision < this.snapshot.revision) return;
      if (this.snapshot.matchId !== null && m.matchId === null) return;
      this.snapshot = m;
      if (this.pending?.ack && m.matchId === this.pending.ack.matchId && m.revision >= this.pending.ack.revision) {
        this.pending = null;
        this.timers.clearTimeout(this.deadline); this.deadline = null;
        this.message = 'Verbunden.';
      }
    } else if (m.type === 'ack') {
      // Ein Ack darf niemals aktuelle Match-IDs oder Revisionen zurücksetzen.
      if (this.pending?.requestId === m.requestId && m.roomInstanceId === this.snapshot?.roomInstanceId) this.pending.ack = m;
      this.changed(); return;
    } else if (m.type === 'error') {
      if (this.pending && (!m.requestId || m.requestId === this.pending.requestId)) {
        this.pending = null;
        this.timers.clearTimeout(this.deadline); this.deadline = null;
        if (!m.requestId || ['STALE_MATCH', 'STALE_REVISION', 'INTERNAL_ERROR'].includes(m.code)) {
          this.requireSync(); return;
        }
      }
      this.message = m.message || 'Die Aktion wurde abgelehnt.';
    } else return;
    this.changed();
    if (this.snapshot?.room.status.type === 'won') {
      const key = `${this.snapshot.roomInstanceId}/${this.snapshot.matchId}`;
      if (!this.seenWins.has(key)) {
        this.seenWins.add(key);
        if (this.seenWins.size > 64) this.seenWins.delete(this.seenWins.values().next().value);
        const winner = this.snapshot.room.players.find(p => p.playerId === this.snapshot.room.status.winnerPlayerId);
        this.onWin(winner?.displayName.toLowerCase());
      }
    }
  }
  send(message) {
    if (this.socket?.readyState !== 1) throw new Error('Not connected');
    this.socket.send(JSON.stringify(message));
  }
  mutate(type, fields = {}) {
    if (!this.canMutate) return false;
    const message = { v: this.version, type, requestId: this.requestId() };
    if (type === 'ready') message.ready = fields.ready;
    if (['action', 'rematch', 'abort'].includes(type)) message.matchId = this.snapshot.matchId;
    if (type === 'action') { message.expectedRevision = this.snapshot.revision; message.action = fields.action; }
    this.pending = { requestId: message.requestId, ack: null };
    this.message = 'Aktion wird bestätigt …';
    const generation = this.generation;
    this.deadline = this.timers.setTimeout(() => { if (generation === this.generation && this.pending) this.requireSync(); }, 12000);
    try { this.send(message); } catch { this.requireSync(); return false; }
    this.changed();
    return true;
  }
}
