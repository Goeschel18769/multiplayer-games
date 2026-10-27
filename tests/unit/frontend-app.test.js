import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

test('Spieloberfläche: erfolgreicher Create mit fehlgeschlagenem Join behält Code und wiederholt niemals Create', async () => {
  // Tatsächlicher App-Einstieg, kontrolliertes DOM/Netzwerk; kein Browsertest.
  const bundle = await build({ entryPoints: ['frontend/src/app.js'], bundle: true, write: false, platform: 'browser', format: 'iife' });
  class Element {
    constructor(tag = '') { this.tag = tag; this.value = ''; this.children = []; this.handlers = {}; this.dataset = {}; this.disabled = false; }
    set innerHTML(_) { throw new Error('Unsafe HTML rendering'); }
    append(...items) { this.children.push(...items); if (this.tag === 'select' && !this.value && items[0]) this.value = items[0].value; }
    replaceChildren(...items) { this.children = []; if (this.tag === 'select') this.value = ''; this.append(...items); }
    setAttribute() {}
    addEventListener(type, handler) { this.handlers[type] = handler; }
    click() { if (!this.disabled) return this.handlers.click?.(); }
  }
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element(id === 'game-select' ? 'select' : ''));
    return elements.get(id);
  };
  const sockets = [], calls = [], timeouts = new Map(); let timer = 0;
  class Socket {
    constructor(url) { this.url = url; this.handlers = {}; this.readyState = 0; sockets.push(this); }
    addEventListener(type, handler) { this.handlers[type] = handler; }
    close() { this.readyState = 3; }
  }
  runInNewContext(bundle.outputFiles[0].text, {
    document: { getElementById: get, createElement: tag => new Element(tag) }, window: { addEventListener() {} },
    URL, AbortController, crypto: webcrypto, WebSocket: Socket,
    setTimeout(fn) { const id = ++timer; timeouts.set(id, fn); return id; }, clearTimeout(id) { timeouts.delete(id); },
    setInterval() { return ++timer; }, clearInterval() {},
    async fetch(url, options) {
      calls.push({ path: new URL(url).pathname, options });
      const path = new URL(url).pathname;
      return { ok: true, async json() {
        if (path === '/api/games') return [{ id: 'tic-tac-toe', version: '1', minPlayers: 2, maxPlayers: 2 }];
        if (path === '/api/rooms') return { roomCode: 'SAVED-ROOM', roomInstanceId: 'private-id', webSocketPath: '/api/rooms/SAVED-ROOM/ws' };
        return [];
      } };
    },
  });
  await new Promise(setImmediate);
  get('player-name').value = 'Joël'; get('room-code').value = ' saved-room ';
  await get('create-room').click();
  assert.equal(calls.filter(c => c.path === '/api/rooms').length, 1);
  assert.equal(sockets.length, 1);
  sockets[0].handlers.close({ code: 1006 });
  assert.equal(get('room-code').value, 'SAVED-ROOM');
  assert.equal(get('player-name').value, 'Joël');
  assert.equal(get('reconnect').hidden, false); assert.equal(get('reconnect').disabled, false);
  get('reconnect').click();
  assert.equal(sockets.length, 2);
  assert.equal(calls.filter(c => c.path === '/api/rooms').length, 1);
  assert.ok(sockets[1].url.includes('/SAVED-ROOM/ws'));
  sockets[1].readyState = 1;
  sockets[1].handlers.message({ data: JSON.stringify({
    v: 1, type: 'welcome', roomInstanceId: 'room-private', matchId: null, revision: 0,
    playerId: 'actor-private', connectionId: 'connection-private', settings: { heartbeatIntervalMs: 25000 },
    room: { roomCode: 'SAVED-ROOM', gameId: 'unsupported-game', status: { type: 'lobby' },
      players: [{ playerId: 'actor-private', displayName: 'Joël', ready: false, connected: true }],
      participants: [], rematchVotes: [], startingPlayerId: null }, view: null,
  }) });
  assert.match(get('game-view').children[0].textContent, /nicht unterstützt/);
  assert.equal(get('ready').disabled, true);
  assert.equal(get('start-match').disabled, true);
});
