import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const bundle = await build({ entryPoints: ['frontend/src/app.js'], bundle: true, write: false, platform: 'browser', format: 'iife', loader: { '.png': 'dataurl' } });
const flush = () => new Promise(setImmediate);
const html = await readFile('frontend/index.html', 'utf8');
async function harness(responder, { session = new Map(), blockedStorage = false } = {}) {
  // Echter App-Einstieg mit kontrolliertem DOM/Netzwerk; zusätzliche echte Browserprüfung separat.
  let document;
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.value = ''; this.children = []; this.listeners = {};
      this.dataset = {}; this.attributes = {}; this.disabled = false; this.open = false; this.parentElement = null;
      this.styles = new Map();
      this.style = { setProperty: (name, value) => this.styles.set(name, value), removeProperty: name => this.styles.delete(name) };
    }
    set innerHTML(_) { throw new Error('Unsafe HTML rendering'); }
    append(...items) { for (const item of items) { item.parentElement = this; this.children.push(item); } }
    replaceChildren(...items) { this.children = []; this.append(...items); }
    contains(item) { return item === this || this.children.some(child => child.contains(item)); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
    emit(type, properties = {}, bubbles = false) {
      const event = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...properties };
      let current = this;
      do {
        event.currentTarget = current;
        for (const handler of current.listeners[type] || []) event.result = handler(event);
        current = bubbles ? current.parentElement : null;
      } while (current);
      return event;
    }
    click() { if (!this.disabled) return this.emit('click', {}, true).result; }
    focus() {
      if (this.disabled || document.activeElement === this) return;
      const previous = document.activeElement;
      document.activeElement = this;
      previous?.emit('focusout', { relatedTarget: this }, true);
      this.emit('focusin', { relatedTarget: previous }, true);
    }
    showModal() { this.open = true; }
    close() { if (this.open) { this.open = false; this.emit('close'); } }
  }
  const elements = new Map(), calls = [], sockets = [];
  const root = new Element('document'), stack = [root];
  const voidTags = new Set(['meta', 'link', 'input', 'br', 'hr', 'img']);
  for (const match of html.matchAll(/<\/?([a-z][\w-]*)\b([^>]*)>/gi)) {
    const [raw, tag, attributes] = match;
    if (raw.startsWith('</')) {
      const at = stack.findLastIndex(element => element.tagName === tag.toUpperCase());
      if (at > 0) stack.length = at;
      continue;
    }
    const element = new Element(tag);
    for (const attr of attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
      element.setAttribute(attr[1], attr[2] ?? '');
      if (attr[1] === 'id') elements.set(attr[2], element);
      if (attr[1] === 'disabled' || attr[1] === 'hidden') element[attr[1]] = true;
    }
    stack.at(-1).append(element);
    if (!voidTags.has(tag.toLowerCase()) && !raw.endsWith('/>')) stack.push(element);
  }
  const get = id => {
    assert.ok(elements.has(id), `App greift auf fehlende HTML-ID zu: ${id}`);
    return elements.get(id);
  };
  class Socket {
    constructor(url) { this.url = url; this.listeners = {}; this.readyState = 0; sockets.push(this); }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    close() { this.readyState = 3; }
    message(message) { this.readyState = 1; this.listeners.message({ data: JSON.stringify(message) }); }
    ended(code = 1006) { this.readyState = 3; this.listeners.close({ code }); }
  }
  document = {
    activeElement: null, documentElement: root.children.find(element => element.tagName === 'HTML'),
    getElementById: get, createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag),
    addEventListener: (type, handler) => root.addEventListener(type, handler),
  };
  const window = new Element('window');
  runInNewContext(bundle.outputFiles[0].text, {
    document, window,
    localStorage: { getItem() { throw new Error('file:// storage denied'); }, setItem() { throw new Error('file:// storage denied'); } },
    sessionStorage: {
      getItem(key) { if (blockedStorage) throw new Error('Storage denied'); return session.get(key) ?? null; },
      setItem(key, value) { if (blockedStorage) throw new Error('Storage denied'); session.set(key, value); },
    },
    URL, AbortController, crypto: webcrypto, WebSocket: Socket,
    setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    async fetch(url, options) {
      const path = new URL(url).pathname;
      calls.push({ path, options });
      const custom = await responder?.(path, options);
      const body = custom?.body ?? (path === '/api/games' ? [{ id: 'tic-tac-toe', version: '1', minPlayers: 2, maxPlayers: 2, modes: [{ id: 'classic', boardSize: 3, winLength: 3 }, { id: 'five', boardSize: 15, winLength: 5 }] }, { id: 'connect-four', version: '1', minPlayers: 2, maxPlayers: 2 }]
        : path === '/api/rooms' ? { roomCode: JSON.parse(options.body).roomCode } : []);
      return { ok: custom?.ok ?? true, async json() { return body; } };
    },
  });
  await flush();
  return {
    get, calls, sockets, session, documentElement: document.documentElement, focused: () => document.activeElement,
    submit: (id = 'score-form') => get(id).emit('submit').result,
    outsidePointer: () => root.emit('pointerdown', { target: get('hub-view') }),
  };
}
const roomCalls = h => h.calls.filter(call => call.path === '/api/rooms');
const socketCode = socket => new URL(socket.url).pathname.split('/')[3];
function welcome(roomCode = 'BEN-JOEL-TTT', gameId = 'tic-tac-toe', config = {}) {
  return {
    v: 1, type: 'welcome', roomInstanceId: roomCode, matchId: null, revision: 0,
    playerId: 'p1', connectionId: 'c1', settings: { heartbeatIntervalMs: 25000 },
    room: { roomCode, gameId, config, status: { type: 'lobby' },
      players: [{ playerId: 'p1', displayName: 'Joël', ready: false, connected: true }],
      participants: [], rematchVotes: [], startingPlayerId: null }, view: null,
  };
}
async function enter(h, player = 'joel', mode = 'classic') {
  if (h.get('player-dialog').open) h.get('player-' + player).click();
  h.get('game-tic-tac-toe').click();
  await h.get('mode-' + mode).click();
  return h.sockets.at(-1);
}
function manual(h, code) {
  h.get('room-toggle').click();
  h.get('manual-room-code').value = code;
}

test('Spielerwahl: erforderlich, einmal pro Tab gespeichert, initial nicht abbrechbar', async () => {
  const session = new Map();
  const h = await harness(undefined, { session });
  assert.equal(h.get('player-dialog').open, true);
  assert.equal(h.get('player-cancel').hidden, true);
  assert.equal(h.get('player-dialog').emit('cancel').defaultPrevented, true);
  assert.equal(h.get('player-dialog').open, true);
  await h.get('game-tic-tac-toe').click();
  assert.equal(roomCalls(h).length, 0);
  h.get('player-joel').click();
  assert.equal(h.get('player-dialog').open, false);
  assert.equal(h.focused(), h.get('game-tic-tac-toe'));
  assert.equal(session.get('multiplayer-player'), 'joel');
  assert.equal(h.get('scoreboard-player-joel').dataset.selected, 'true');
  assert.equal(h.get('games-info').textContent, '');
  const reload = await harness(undefined, { session });
  assert.equal(reload.get('player-dialog').open, false);
  await enter(reload);
  assert.equal(new URL(reload.sockets[0].url).searchParams.get('name'), 'Joël');
  const invalid = await harness(undefined, { session: new Map([['multiplayer-player', 'other']]) });
  assert.equal(invalid.get('player-dialog').open, true);
});

test('Spielerwahl: gesperrter Browserspeicher bleibt optional, Auswahl gilt bis zum Neuladen', async () => {
  const h = await harness(undefined, { blockedStorage: true });
  await enter(h, 'ben');
  assert.equal(h.get('player-dialog').open, false);
  assert.equal(new URL(h.sockets[0].url).searchParams.get('name'), 'Ben');
  const reload = await harness(undefined, { blockedStorage: true });
  assert.equal(reload.get('player-dialog').open, true);
});

test('Spielerwechsel: eigener Name öffnet Dialog, Abbrechen behält Verbindung, Wechsel geht in den Hub', async () => {
  const h = await harness();
  const socket = await enter(h);
  socket.message(welcome());
  h.get('scoreboard-player-joel').click();
  assert.equal(h.get('player-dialog').open, true);
  assert.equal(h.get('player-cancel').hidden, false);
  h.get('player-dialog').emit('cancel');
  assert.equal(h.get('player-dialog').open, false);
  assert.equal(socket.readyState, 1);
  assert.equal(h.focused(), h.get('scoreboard-player-joel'));
  h.get('scoreboard-player-joel').click();
  h.get('player-ben').click();
  assert.equal(h.get('hub-view').hidden, false);
  assert.equal(socket.readyState, 3);
  assert.equal(h.sockets.length, 1);
  await enter(h);
  assert.equal(new URL(h.sockets[1].url).searchParams.get('name'), 'Ben');
});

test('Hub: fester Raum, nach fehlgeschlagenem Join kein Create-Replay, fremdes Spiel gesperrt', async () => {
  const h = await harness();
  const socket = await enter(h);
  assert.equal(h.get('hub-view').hidden, true);
  assert.equal(socketCode(socket), 'BEN-JOEL-TTT');
  socket.ended();
  assert.equal(h.get('reconnect').hidden, false);
  h.get('reconnect').click();
  assert.equal(h.sockets.length, 2);
  assert.equal(roomCalls(h).length, 1);
  h.sockets[1].message(welcome('BEN-JOEL-TTT', 'unsupported-game'));
  assert.match(h.get('game-view').children[0].textContent, /nicht unterstützt/);
  assert.equal(h.get('ready').disabled, true);
  assert.equal(h.get('start-match').disabled, true);
});

test('Hub: vorhandenen gemeinsamen Raum betreten, andere Create-Fehler nicht verschlucken', async () => {
  for (const error of ['ROOM_EXISTS', 'INVALID_CONFIG']) {
    const h = await harness(path => path === '/api/rooms' ? { ok: false, body: { code: error, message: error } } : undefined);
    await enter(h, 'ben');
    assert.equal(h.sockets.length, error === 'ROOM_EXISTS' ? 1 : 0);
    if (error === 'INVALID_CONFIG') assert.equal(h.get('mode-info').textContent, error);
    else assert.equal(new URL(h.sockets[0].url).searchParams.get('name'), 'Ben');
  }
});

test('Modusauswahl: Schliessen während Raumerstellung verhindert späten Beitritt', async () => {
  let finish;
  const h = await harness(path => path === '/api/rooms' ? new Promise(resolve => { finish = resolve; }) : undefined);
  h.get('player-ben').click();
  h.get('game-tic-tac-toe').click();
  const opening = h.get('mode-classic').click();
  h.get('close-mode-dialog').click();
  finish({ body: { roomCode: 'BEN-JOEL-TTT' } });
  await opening;
  assert.equal(h.sockets.length, 0);
  assert.equal(h.get('hub-view').hidden, false);
});

test('Modusauswahl: Kachel öffnet immer die Auswahl, Abbrechen erzeugt keinen Raum', async () => {
  const h = await harness();
  h.get('player-ben').click();
  h.get('game-tic-tac-toe').click();
  assert.equal(h.get('mode-dialog').open, true);
  assert.equal(roomCalls(h).length, 0);
  assert.equal(h.get('hub-view').hidden, false);
  h.get('mode-dialog').emit('cancel');
  assert.equal(h.get('mode-dialog').open, false);
  assert.equal(roomCalls(h).length, 0);
  h.get('game-tic-tac-toe').click();
  await h.get('mode-classic').click();
  assert.equal(h.get('mode-dialog').open, false);
  assert.equal(socketCode(h.sockets[0]), 'BEN-JOEL-TTT');
  assert.deepEqual(JSON.parse(roomCalls(h)[0].options.body).config, {});
  h.get('back-to-hub').click();
  h.get('game-tic-tac-toe').click();
  assert.equal(h.get('mode-dialog').open, true);
  assert.equal(roomCalls(h).length, 1);
});

test('Modi: gleiche Auswahl verwendet denselben festen Raum und 15 × 15 seine eigene Konfiguration', async () => {
  for (const player of ['ben', 'joel']) {
    const h = await harness(path => path === '/api/rooms'
      ? { ok: false, body: { code: 'ROOM_EXISTS', message: 'Vorhanden.' } } : undefined);
    const socket = await enter(h, player, 'five');
    assert.equal(socketCode(socket), 'BEN-JOEL-TTT-15');
    assert.deepEqual(JSON.parse(roomCalls(h)[0].options.body), {
      roomCode: 'BEN-JOEL-TTT-15', gameId: 'tic-tac-toe', config: { mode: 'five' },
    });
    assert.equal(h.get('play-view').dataset.mode, 'five');
    assert.equal(h.get('play-mode').textContent, '15 × 15 · 5 in Reihe');
    socket.ended();
    h.get('reconnect').click();
    assert.equal(socketCode(h.sockets[1]), 'BEN-JOEL-TTT-15');
    assert.equal(roomCalls(h).length, 1);
  }
});

test('Modi: altes Backend bleibt klassisch nutzbar; 15 × 15 benötigt passende Modus-Metadaten', async () => {
  for (const modes of [undefined, [], [{ id: 'five', boardSize: 9, winLength: 5 }], [{ id: 'five', boardSize: 15, winLength: 4 }]]) {
    const h = await harness(path => path === '/api/games'
      ? { body: [{ id: 'tic-tac-toe', version: '1', minPlayers: 2, maxPlayers: 2, ...(modes ? { modes } : {}) }] } : undefined);
    h.get('player-ben').click();
    h.get('game-tic-tac-toe').click();
    assert.equal(h.get('mode-classic').disabled, false);
    assert.equal(h.get('mode-five').disabled, true);
    assert.match(h.get('mode-info').textContent, /nicht verfügbar/);
    await h.get('mode-five').click();
    assert.equal(roomCalls(h).length, 0);
    await h.get('mode-classic').click();
    assert.equal(socketCode(h.sockets[0]), 'BEN-JOEL-TTT');
  }
});

test('Moduswechsel: laufender Raum bleibt bis Bestätigung erhalten; Schliessen und neue Auswahl verwerfen späte Antworten', async () => {
  for (const cancel of ['close', 'escape', 'new-mode']) {
    let finish;
    const h = await harness((path, options) => path === '/api/rooms' && JSON.parse(options.body).roomCode === 'BEN-JOEL-TTT-15'
      ? new Promise(resolve => { finish = resolve; }) : undefined);
    const original = await enter(h);
    original.message(welcome());
    h.get('play-mode').click();
    const switching = h.get('mode-five').click();
    assert.equal(original.readyState, 1);
    assert.equal(h.get('play-view').dataset.mode, 'classic');
    if (cancel === 'escape') h.get('mode-dialog').emit('cancel');
    else if (cancel === 'close') h.get('close-mode-dialog').click();
    else await h.get('mode-classic').click();
    const socketCount = h.sockets.length;
    finish({ body: { roomCode: 'BEN-JOEL-TTT-15' } });
    await switching;
    assert.equal(h.sockets.length, socketCount);
    assert.equal(h.get('play-view').dataset.mode, 'classic');
    assert.equal(h.get('mode-dialog').open, false);
    assert.equal(cancel === 'new-mode' ? h.sockets.at(-1).readyState : original.readyState, cancel === 'new-mode' ? 0 : 1);
  }
});

test('Manueller Raum: Servermodus und Brettgrösse aktualisieren Auswahl, neue Räume und Reconnect verwenden das Ziel', async () => {
  for (const source of ['config', 'view']) {
    const h = await harness();
    await enter(h);
    manual(h, 'manual-five');
    await h.submit('room-form');
    const snapshot = welcome('MANUAL-FIVE', 'tic-tac-toe', source === 'config' ? { mode: 'five' } : {});
    if (source === 'view') snapshot.view = { boardSize: 15, board: Array(225).fill(null) };
    h.sockets.at(-1).message(snapshot);
    assert.equal(h.get('play-view').dataset.mode, 'five');
    assert.equal(h.get('play-mode').textContent, '15 × 15 · 5 in Reihe');
    manual(h, 'custom-created');
    await h.get('create-manual-room').click();
    assert.deepEqual(JSON.parse(roomCalls(h).at(-1).options.body).config, { mode: 'five' });
    h.sockets.at(-1).ended();
    h.get('reconnect').click();
    assert.equal(socketCode(h.sockets.at(-1)), 'CUSTOM-CREATED');
    h.get('play-mode').click();
    await h.get('mode-classic').click();
    assert.equal(socketCode(h.sockets.at(-1)), 'BEN-JOEL-TTT');
    assert.deepEqual(JSON.parse(roomCalls(h).at(-1).options.body).config, {});
  }
});

test('Spielstatus: Lobby bleibt sichtbar, eine echte Spielansicht übernimmt Spieler- und Rundenstatus', async () => {
  const h = await harness();
  const socket = await enter(h);
  socket.message(welcome());
  assert.equal(h.get('players').hidden, false);
  assert.equal(h.get('match-message').hidden, false);
  assert.equal(h.get('ready').hidden, false);
  assert.equal(h.get('start-match').hidden, false);
  assert.equal(h.get('ready').disabled, false);
  assert.equal(h.get('start-match').disabled, true);
  const readyLobby = welcome();
  readyLobby.type = 'state'; readyLobby.revision = 1;
  readyLobby.room.players[0].ready = true;
  readyLobby.room.players.push({ playerId: 'p2', displayName: 'Ben', ready: true, connected: true });
  socket.message(readyLobby);
  assert.equal(h.get('start-match').hidden, false);
  assert.equal(h.get('start-match').disabled, false);
  const state = welcome();
  state.type = 'state'; state.matchId = 'match-1'; state.revision = 1;
  state.room.status = { type: 'running' }; state.room.participants = ['p1', 'p2'];
  state.room.players.push({ playerId: 'p2', displayName: 'Ben', ready: true, connected: true });
  state.view = {
    board: Array(9).fill(null), boardSize: 3, winLength: 3, yourSymbol: 'X', currentPlayerId: 'p1',
    symbols: [{ playerId: 'p1', symbol: 'X' }, { playerId: 'p2', symbol: 'O' }], winningLine: null,
  };
  socket.message(state);
  assert.equal(h.get('players').hidden, true);
  assert.equal(h.get('match-message').hidden, true);
  assert.equal(h.get('ready').hidden, true);
  assert.equal(h.get('start-match').hidden, true);
  assert.equal(h.get('abort-match').disabled, false);
  state.revision = 2;
  state.room.status = { type: 'won', winnerPlayerId: 'p1' };
  state.view.board.splice(0, 3, 'X', 'X', 'X');
  state.view.winningLine = [0, 1, 2];
  state.view.currentPlayerId = null;
  socket.message(state);
  assert.equal(h.get('ready').hidden, true);
  assert.equal(h.get('start-match').hidden, true);
  assert.equal(h.get('rematch').disabled, false);
  assert.equal(h.get('abort-match').disabled, true);
});

test('4 Gewinnt: eigene Kachel öffnet denselben Standardraum direkt, Reconnect und Hub-Reset', async () => {
  for (const player of ['ben', 'joel']) {
    const h = await harness(); h.get('player-' + player).click();
    await h.get('game-connect-four').click();
    assert.equal(h.get('mode-dialog').open, false);
    assert.equal(h.get('hub-view').hidden, true);
    assert.equal(h.get('play-mode').hidden, true);
    assert.equal(h.get('play-title').textContent, '4 Gewinnt');
    assert.equal(socketCode(h.sockets[0]), 'BEN-JOEL-C4');
    assert.deepEqual(JSON.parse(roomCalls(h)[0].options.body), { roomCode: 'BEN-JOEL-C4', gameId: 'connect-four', config: {} });
    h.sockets[0].message(welcome('BEN-JOEL-C4', 'connect-four'));
    assert.equal(h.get('game-view').children[0].className, 'c4-game');
    h.sockets[0].ended(); h.get('reconnect').click();
    assert.equal(socketCode(h.sockets[1]), 'BEN-JOEL-C4'); assert.equal(roomCalls(h).length, 1);
    h.sockets[1].message(welcome('BEN-JOEL-C4', 'connect-four'));
    manual(h, 'C4-ZWEIT'); await h.get('create-manual-room').click();
    assert.deepEqual(JSON.parse(roomCalls(h)[1].options.body), { roomCode: 'C4-ZWEIT', gameId: 'connect-four', config: {} });
    assert.equal(socketCode(h.sockets.at(-1)), 'C4-ZWEIT');
    h.get('back-to-hub').click(); await h.get('game-connect-four').click();
    assert.equal(socketCode(h.sockets.at(-1)), 'BEN-JOEL-C4');
    h.get('back-to-hub').click(); await enter(h);
    assert.equal(socketCode(h.sockets.at(-1)), 'BEN-JOEL-TTT'); assert.equal(h.get('play-mode').hidden, false);
  }
});

test('4 Gewinnt: Backend-Fähigkeit steuert die Kachel; vorhandene Räume und echte Fehler', async () => {
  const game = { id: 'connect-four', version: '1', minPlayers: 2, maxPlayers: 2 };
  for (const body of [[], [{ ...game, version: '99' }], [game]]) {
    const h = await harness(path => path === '/api/games' ? { body } : undefined);
    h.get('player-ben').click(); await h.get('game-connect-four').click();
    assert.equal(h.sockets.length, body[0]?.version === '1' ? 1 : 0);
  }
  for (const code of ['ROOM_EXISTS', 'INVALID_CONFIG', 'WRONG_CONFIRMATION']) {
    const h = await harness(path => path === '/api/rooms' ? code === 'WRONG_CONFIRMATION'
      ? { body: { roomCode: 'WRONG' } } : { ok: false, body: { code, message: code } } : undefined);
    h.get('player-ben').click(); await h.get('game-connect-four').click();
    assert.equal(h.sockets.length, code === 'ROOM_EXISTS' ? 1 : 0);
    if (code !== 'ROOM_EXISTS') {
      assert.equal(h.get('hub-view').hidden, false);
      assert.ok(h.get('hub-message').textContent); assert.equal(h.get('game-connect-four').disabled, false);
    }
  }
});

test('4 Gewinnt: ausstehender Einstieg wird bei Spielerwechsel verworfen', async () => {
  let finish;
  const h = await harness(path => path === '/api/rooms' ? new Promise(resolve => { finish = resolve; }) : undefined);
  h.get('player-ben').click();
  const opening = h.get('game-connect-four').click();
  h.get('scoreboard-player-ben').click(); h.get('player-joel').click();
  finish({ body: { roomCode: 'BEN-JOEL-C4' } }); await opening;
  assert.equal(h.sockets.length, 0); assert.equal(h.get('hub-view').hidden, false);
  assert.equal(h.get('hub-message').textContent, '');
});

test('Spielwechsel per manuellem Raum übernimmt die tatsächliche Engine für neue Räume', async () => {
  const h = await harness(); const first = await enter(h, 'joel', 'five');
  first.message(welcome('BEN-JOEL-TTT-15', 'tic-tac-toe', { mode: 'five' }));
  manual(h, 'C4-MANUAL'); await h.submit('room-form');
  h.sockets.at(-1).message(welcome('C4-MANUAL', 'connect-four'));
  assert.equal(h.get('play-title').textContent, '4 Gewinnt'); assert.equal(h.get('play-mode').hidden, true);
  assert.equal(h.get('game-view').children[0].className, 'c4-game');
  manual(h, 'C4-NEU'); await h.get('create-manual-room').click();
  assert.equal(JSON.parse(roomCalls(h).at(-1).options.body).gameId, 'connect-four');
  assert.deepEqual(JSON.parse(roomCalls(h).at(-1).options.body).config, {});
  h.sockets.at(-1).message(welcome('C4-NEU', 'connect-four'));
  manual(h, 'TTT-MANUAL'); await h.submit('room-form');
  h.sockets.at(-1).message(welcome('TTT-MANUAL', 'tic-tac-toe', { mode: 'five' }));
  assert.equal(h.get('play-mode').hidden, false);
  assert.match(h.get('play-mode').textContent, /15 × 15/);
  manual(h, 'TTT-NEU'); await h.get('create-manual-room').click();
  assert.deepEqual(JSON.parse(roomCalls(h).at(-1).options.body), { roomCode: 'TTT-NEU', gameId: 'tic-tac-toe', config: { mode: 'five' } });
});

test('Darstellung: Hover, erster Touch-Klick, Fokus, Escape und Aussenklick öffnen/schliessen die Lippe', async () => {
  const h = await harness();
  h.get('player-ben').click();
  const drawer = h.get('theme-drawer'), toggle = h.get('theme-toggle');
  assert.equal(drawer.dataset.open, 'false');
  drawer.emit('pointerenter', { pointerType: 'mouse' });
  assert.equal(drawer.dataset.open, 'true');
  drawer.emit('pointerleave');
  assert.equal(drawer.dataset.open, 'false');
  drawer.emit('pointerenter', { pointerType: 'touch' });
  toggle.emit('pointerdown', { pointerType: 'touch' });
  toggle.focus();
  toggle.click();
  assert.equal(toggle.attributes['aria-expanded'], 'true');
  toggle.emit('pointerdown', { pointerType: 'touch' });
  toggle.click();
  assert.equal(toggle.attributes['aria-expanded'], 'false');
  h.get('theme-office').focus();
  drawer.emit('pointerleave');
  assert.equal(drawer.dataset.open, 'true');
  drawer.emit('keydown', { key: 'Escape' });
  assert.equal(drawer.dataset.open, 'false');
  assert.equal(h.focused(), toggle);
  for (const theme of ['office', 'dark', 'light']) {
    drawer.emit('pointerenter', { pointerType: 'mouse' });
    h.get('theme-' + theme).click();
    assert.equal(h.documentElement.dataset.theme, theme);
    assert.equal(h.get('theme-' + theme).attributes['aria-pressed'], 'true');
    assert.equal(drawer.dataset.open, 'false');
  }
  drawer.emit('pointerenter', { pointerType: 'mouse' });
  h.outsidePointer();
  assert.equal(drawer.dataset.open, 'false');
});

test('Manueller Raum: ungültiger Code ohne Seiteneffekt, normalisierter Join ohne POST, Reconnect und Hub-Reset', async () => {
  const h = await harness();
  const original = await enter(h);
  original.message(welcome());
  manual(h, 'bad_code');
  await h.submit('room-form');
  assert.equal(h.sockets.length, 1);
  assert.equal(original.readyState, 1);
  assert.equal(roomCalls(h).length, 1);
  assert.match(h.get('manual-room-status').textContent, /Raumcode/);
  h.get('manual-room-code').value = '  zweit-raum  ';
  await h.submit('room-form');
  assert.equal(h.get('room-dialog').open, false);
  assert.equal(h.sockets.length, 2);
  assert.equal(original.readyState, 3);
  assert.equal(socketCode(h.sockets[1]), 'ZWEIT-RAUM');
  assert.equal(new URL(h.sockets[1].url).searchParams.get('name'), 'Joël');
  assert.equal(roomCalls(h).length, 1);
  h.sockets[1].ended();
  h.get('reconnect').click();
  assert.equal(socketCode(h.sockets[2]), 'ZWEIT-RAUM');
  assert.equal(roomCalls(h).length, 1);
  h.get('room-toggle').click();
  assert.equal(h.get('manual-room-code').value, 'ZWEIT-RAUM');
  h.get('close-room-options').click();
  h.get('back-to-hub').click();
  await enter(h);
  assert.equal(socketCode(h.sockets.at(-1)), 'BEN-JOEL-TTT');
  assert.equal(roomCalls(h).length, 2);
});

test('Manueller Create: explizite Fehler und falsche Bestätigung erhalten die bestehende Verbindung', async () => {
  for (const error of ['ROOM_EXISTS', 'INVALID_CONFIG', 'WRONG_CONFIRMATION']) {
    const h = await harness((path, options) => {
      if (path !== '/api/rooms' || JSON.parse(options.body).roomCode === 'BEN-JOEL-TTT') return;
      return error === 'WRONG_CONFIRMATION' ? { body: { roomCode: 'OTHER-ROOM' } }
        : { ok: false, body: { code: error, message: error } };
    });
    const original = await enter(h);
    original.message(welcome());
    manual(h, 'neuer-raum');
    await h.get('create-manual-room').click();
    assert.equal(h.sockets.length, 1);
    assert.equal(original.readyState, 1);
    assert.equal(h.get('room-dialog').open, true);
    assert.match(h.get('manual-room-status').textContent, error === 'WRONG_CONFIRMATION' ? /nicht bestätigt/ : new RegExp(error));
    assert.equal(h.get('create-manual-room').disabled, false);
    h.get('close-room-options').click();
    h.get('room-toggle').click();
    assert.equal(h.get('manual-room-code').value, 'BEN-JOEL-TTT');
  }
});

test('Manueller Create: erst bestätigter Code wechselt die Verbindung', async () => {
  const h = await harness();
  const original = await enter(h);
  original.message(welcome());
  manual(h, '  zweiter-raum  ');
  await h.get('create-manual-room').click();
  assert.equal(h.sockets.length, 2);
  assert.equal(original.readyState, 3);
  assert.equal(socketCode(h.sockets[1]), 'ZWEITER-RAUM');
  assert.equal(h.get('room-dialog').open, false);
  assert.deepEqual(JSON.parse(roomCalls(h).at(-1).options.body), { roomCode: 'ZWEITER-RAUM', gameId: 'tic-tac-toe', config: {} });
});

test('Manueller Create: Schliessen, Escape oder Hub verwerfen späte Antworten auch nach neuem Ziel', async () => {
  for (const cancel of ['close', 'escape', 'hub']) {
    let finish;
    const h = await harness((path, options) => path === '/api/rooms' && JSON.parse(options.body).roomCode === 'LATE-ROOM'
      ? new Promise(resolve => { finish = resolve; }) : undefined);
    const original = await enter(h);
    original.message(welcome());
    manual(h, 'late-room');
    const creating = h.get('create-manual-room').click();
    assert.equal(original.readyState, 1);
    if (cancel === 'hub') {
      h.get('back-to-hub').click();
      await enter(h);
    } else {
      if (cancel === 'escape') h.get('room-dialog').emit('cancel');
      else h.get('close-room-options').click();
      assert.equal(original.readyState, 1);
      manual(h, 'new-target');
      await h.submit('room-form');
    }
    const socketsBefore = h.sockets.length;
    finish({ body: { roomCode: 'LATE-ROOM' } });
    await creating;
    assert.equal(h.sockets.length, socketsBefore);
    assert.equal(socketCode(h.sockets.at(-1)), cancel === 'hub' ? 'BEN-JOEL-TTT' : 'NEW-TARGET');
    assert.equal(h.get('room-dialog').open, false);
  }
});

test('Verbindungsstatus: normal verbunden bleibt still, Serverfehler bleiben sichtbar', async () => {
  const h = await harness();
  const socket = await enter(h);
  socket.message(welcome());
  assert.equal(h.get('connection-message').hidden, true);
  socket.message({ v: 1, type: 'error', code: 'INVALID_ACTION', message: 'Aktion abgelehnt.' });
  assert.equal(h.get('connection-message').hidden, false);
  assert.equal(h.get('connection-message').textContent, 'Aktion abgelehnt.');
  assert.equal(h.get('connection-badge').textContent, 'Verbunden');
});

test('Scores: Klick öffnet Editor, Reset bleibt Entwurf bis PUT, Namen und Konfliktbasis bleiben korrekt', async () => {
  let rows = [{ displayName: 'Ben', nameKey: 'ben', wins: 5 }, { displayName: 'Joël', nameKey: 'joël', wins: 3 }];
  const h = await harness((path, options) => {
    if (path !== '/api/stats') return;
    if (options.method === 'PUT') rows = JSON.parse(options.body).scores.map(row => ({ displayName: row.displayName, nameKey: row.displayName.toLowerCase(), wins: row.wins }));
    return { body: rows };
  });
  h.get('player-ben').click();
  h.get('scoreboard').click();
  assert.equal(h.get('score-dialog').open, true);
  assert.equal(h.get('edit-ben').value, '5');
  h.get('reset-joel').click();
  assert.equal(h.get('score-joel').textContent, '3');
  assert.equal(h.calls.filter(call => call.options.method === 'PUT').length, 0);
  h.get('edit-ben').value = '8';
  await h.submit();
  const put = h.calls.find(call => call.options.method === 'PUT');
  assert.deepEqual(JSON.parse(put.options.body).scores, [
    { displayName: 'Ben', wins: 8, expectedWins: 5 }, { displayName: 'Joël', wins: 0, expectedWins: 3 },
  ]);
  assert.equal(h.get('score-dialog').open, false);
  assert.equal(h.get('score-ben').textContent, '8');
  assert.equal(h.get('score-joel').textContent, '0');
});

test('Scores: fehlendes Online-Update und Konflikt zeigen Fehler ohne lokale Scheinspeicherung', async () => {
  for (const code of ['METHOD_NOT_ALLOWED', 'STATS_CONFLICT']) {
    const h = await harness((path, options) => path === '/api/stats' ? options.method === 'PUT'
      ? { ok: false, body: { code, message: 'Inzwischen geändert.' } }
      : { body: [{ displayName: 'Ben', nameKey: 'ben', wins: 2 }] } : undefined);
    h.get('player-ben').click();
    h.get('scoreboard').click();
    h.get('edit-ben').value = '99';
    await h.submit();
    assert.equal(h.get('score-dialog').open, true);
    assert.equal(h.get('score-ben').textContent, '2');
    assert.match(h.get('score-error').textContent, code === 'METHOD_NOT_ALLOWED' ? /Backend-Version/ : /Neu laden/);
  }
});
