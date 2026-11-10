import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountBattleship } from '../../frontend/src/games/battleship.js';
import { battleship as engine } from '../../backend/src/games/battleship.js';
import { fleetA, fleetB, cellsA, cellsB } from '../fixtures/battleship.js';

let sequence = 0;
function snapshot(state = engine.createInitialState([{ playerId: 'a' },{ playerId: 'b' }], {}, { startingPlayerId: 'a' }), playerId = 'a') {
  return { roomInstanceId: `room-${++sequence}`, matchId: 'm1', revision: 0,
    room: { gameId: 'battleship', players: [{ playerId: 'a', displayName: 'Ben' }, { playerId: 'b', displayName: 'Joël' }],
      participants: ['a','b'], status: engine.getStatus(state), rematchVotes: [] }, view: engine.getPlayerView(state, playerId) };
}
const battle = () => engine.handleAction(engine.handleAction(engine.createInitialState([{ playerId: 'a' },{ playerId: 'b' }], {}, { startingPlayerId: 'a' }), 'a', { kind: 'placeFleet', ships: fleetA }), 'b', { kind: 'placeFleet', ships: fleetB });
function harness() {
  let focused;
  const document = { createElement: () => new Element(), createElementNS: () => new Element() };
  function withDocument(fn) {
    const previous = globalThis.document; globalThis.document = document;
    try { return fn(); } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
  }
  class Element {
    constructor() { this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.style = {}; this.disabled = false; }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = items; }
    setAttribute(key, value) { this.attributes[key] = value; if (key === 'class') this.className = value; }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    emit(type, extra = {}) { const event = { key: '', preventDefault() { this.prevented = true; }, ...extra }; withDocument(() => this.listeners[type]?.(event)); return event; }
    click() { if (!this.disabled) this.emit('click'); }
    focus() { focused = this; this.emit('focus'); }
    scrollIntoView() {}
    set innerHTML(_) { throw new Error('Unsafe HTML rendering'); }
  }
  const root = new Element(), actions = [];
  const renderer = withDocument(() => mountBattleship(root, action => actions.push(action)));
  const walk = node => [node, ...node.children.flatMap(walk)];
  const byClass = name => walk(root).filter(node => node.className?.split(' ').includes(name));
  const cells = kind => walk(byClass('bs-panel').find(node => node.dataset.board === kind)).filter(node => node.attributes.role === 'gridcell');
  return { actions, byClass, cells, focused: () => focused,
    render: (s, extra = {}) => withDocument(() => renderer.render({ snapshot: s, playerId: 'a', canMutate: true, ...extra })) };
}

test('Schiffe-Oberfläche: manuelle Flotte, L-Form und berührende Schiffe vor serverseitiger Bestätigung', () => {
  const h = harness(), s = snapshot(); h.render(s);
  assert.equal(h.cells('own').length, 100); assert.equal(h.cells('target').length, 100);
  assert.equal(h.byClass('bs-confirm')[0].disabled, true);
  assert.equal(h.byClass('bs-panel').find(panel => panel.dataset.board === 'target').hidden, true);
  for (const cell of [0,3,11,21,30]) h.cells('own')[cell].click();
  assert.equal(h.cells('own').filter(cell => cell.dataset.state === 'ship').length, 17);
  assert.deepEqual(h.cells('own').flatMap((cell, index) => cell.dataset.ship === '0' ? [index] : []), cellsA[0]);
  assert.equal(h.cells('own')[0].dataset.east, 'false'); // innerhalb des L-Schiffs
  assert.equal(h.cells('own')[2].dataset.east, 'true'); // berührende Schiffe bleiben getrennt erkennbar
  assert.equal(h.cells('own')[3].dataset.west, 'true');
  assert.equal(h.byClass('bs-fleet-art')[0].children.length, 5);
  assert.equal(h.byClass('bs-fleet-art')[1].children.length, 0); // keine fremde Geometrie
  assert.equal(h.byClass('bs-confirm')[0].disabled, false); h.byClass('bs-confirm')[0].click();
  assert.deepEqual(h.actions, [{ kind: 'placeFleet', ships: fleetA }]);
  assert.equal(s.view.yourReady, false); // kein optimistisches Bestätigen
  const state = engine.handleAction(engine.createInitialState([{ playerId: 'a' },{ playerId: 'b' }], {}, { startingPlayerId: 'a' }), 'a', h.actions[0]);
  const confirmed = { ...s, view: engine.getPlayerView(state, 'a') }; h.render(confirmed);
  assert.equal(h.byClass('bs-placement')[0].hidden, true); assert.equal(h.byClass('bs-confirm')[0].hidden, true);
  assert.match(h.byClass('bs-status')[0].textContent, /Warte auf die andere/);
});

test('Schiffe-Oberfläche: drehen, entfernen, Zufallsflotte und Grenzen', () => {
  const h = harness(); h.render(snapshot());
  h.cells('own')[0].emit('keydown', { key: 'r' }); h.cells('own')[99].click();
  assert.match(h.byClass('bs-placement-help')[0].textContent, /freie Felder/);
  h.cells('own')[0].click();
  assert.deepEqual(h.cells('own').flatMap((cell, index) => cell.dataset.ship === '0' ? [index] : []), [0,1,2,12,22]);
  h.byClass('bs-piece')[0].click(); h.byClass('bs-rotate')[0].click();
  assert.deepEqual(h.cells('own').flatMap((cell, index) => cell.dataset.ship === '0' ? [index] : []), [2,12,20,21,22]);
  h.byClass('bs-remove')[0].click(); assert.equal(h.cells('own').filter(cell => cell.dataset.state === 'ship').length, 0);
  h.byClass('bs-random')[0].click(); assert.equal(h.cells('own').filter(cell => cell.dataset.state === 'ship').length, 17);
  assert.equal(h.byClass('bs-confirm')[0].disabled, false);
  h.byClass('bs-clear')[0].click(); assert.equal(h.byClass('bs-confirm')[0].disabled, true);
});

test('Schiffe-Oberfläche: Entwurf bleibt bei Reconnect erhalten und ist pro Partie/Spieler getrennt', () => {
  const s = snapshot(), first = harness(); first.render(s);
  for (const cell of [0,3,11,21,30]) first.cells('own')[cell].click();
  const reconnected = harness(); reconnected.render(s);
  assert.equal(reconnected.cells('own').filter(cell => cell.dataset.state === 'ship').length, 17);
  reconnected.byClass('bs-confirm')[0].click(); assert.deepEqual(reconnected.actions[0].ships, fleetA);
  reconnected.render({ ...s, matchId: 'm2' }); assert.equal(reconnected.cells('own').filter(cell => cell.dataset.state === 'ship').length, 0);
  reconnected.render(s, { playerId: 'b' }); assert.equal(reconnected.cells('own').filter(cell => cell.dataset.state === 'ship').length, 0);
  const ownB = { ...s, view: { ...s.view } }; reconnected.render(ownB, { playerId: 'b' });
  assert.equal(reconnected.cells('own').filter(cell => cell.dataset.state === 'ship').length, 0);
});

test('Schiffe-Oberfläche: Schüsse senden nur im eigenen Zug; keine optimistischen Treffer', () => {
  const h = harness(), state = battle(), s = snapshot(state); h.render(s);
  assert.equal(h.byClass('bs-tabs')[0].hidden, false);
  h.cells('target')[57].click(); assert.deepEqual(h.actions, [{ kind: 'fire', cell: 57 }]);
  assert.equal(h.byClass('bs-fleet-art')[1].children.length, 0);
  assert.equal(h.cells('target')[57].dataset.state, 'unknown');
  h.render(s, { canMutate: false }); h.cells('target')[58].click(); assert.equal(h.actions.length, 1);
  const hit = engine.handleAction(state, 'a', { kind: 'fire', cell: 57 });
  h.render({ ...s, view: engine.getPlayerView(hit, 'a') }); assert.equal(h.cells('target')[57].dataset.state, 'hit');
  assert.equal(h.byClass('bs-fleet-art')[1].children.length, 0); // Treffer verrät nicht die restliche Schiffsform
  assert.match(h.byClass('bs-status')[0].textContent, /Treffer auf H6.*Du bist am Zug/);
  h.cells('target')[57].click(); assert.equal(h.actions.length, 1);
  const miss = engine.handleAction(hit, 'a', { kind: 'fire', cell: 99 });
  h.render({ ...s, view: engine.getPlayerView(miss, 'a') }); h.cells('target')[58].click(); assert.equal(h.actions.length, 1);
  h.cells('own')[0].click(); assert.equal(h.actions.length, 1);
  h.byClass('bs-tab')[1].click(); assert.equal(h.byClass('bs-panel').find(panel => panel.dataset.board === 'own').dataset.selected, 'true');
});

test('Schiffe-Oberfläche: Versenken markiert keine Nachbarn; nur Raumstatus erlaubt weitere Züge', () => {
  let state = battle(); for (const cell of cellsB[0]) state = engine.handleAction(state, 'a', { kind: 'fire', cell });
  const h = harness(), s = snapshot(state); h.render(s);
  assert.equal(h.cells('target').filter(cell => cell.dataset.state === 'sunk').length, 5);
  assert.equal(h.byClass('bs-fleet-art')[1].children.length, 1);
  assert.equal(h.cells('target')[56].dataset.state, 'unknown');
  s.room.status = { type: 'aborted' }; h.render(s); h.cells('target')[99].click(); assert.equal(h.actions.length, 0);
  assert.equal(h.byClass('bs-status')[0].textContent, 'Runde beendet.');
  for (const cell of cellsB.slice(1).flat()) state = engine.handleAction(state, 'a', { kind: 'fire', cell });
  const won = snapshot(state); h.render(won); assert.equal(h.byClass('bs-status')[0].textContent, 'Ben gewinnt.');
  h.cells('target')[99].click(); assert.equal(h.actions.length, 0);
});

test('Schiffe-Oberfläche: Tastatur-Pfeile, Home/End, Vorschau und genau ein Tabstopp pro Brett', () => {
  const h = harness(); h.render(snapshot());
  const cells = h.cells('own'); cells[0].focus();
  assert.equal(cells.filter(cell => cell.dataset.preview === 'valid').length, 5);
  cells[0].emit('keydown', { key: 'ArrowRight' }); assert.equal(h.focused(), cells[1]);
  cells[1].emit('keydown', { key: 'End', ctrlKey: true }); assert.equal(h.focused(), cells[99]);
  cells[99].emit('keydown', { key: 'ArrowDown' }); assert.equal(h.focused(), cells[99]);
  cells[99].emit('keydown', { key: 'Home', ctrlKey: true }); assert.equal(h.focused(), cells[0]);
  for (const kind of ['own','target']) assert.equal(h.cells(kind).filter(cell => cell.tabIndex === 0).length, 1);
  assert.equal(h.actions.length, 0);
});

test('Schiffe-Oberfläche: ungültige Ansichten sperren das Spiel und erholen sich nach gültiger Antwort', () => {
  const h = harness();
  for (const change of [s => { s.view = null; }, s => { s.view.boardSize = 9; }, s => { s.view.ownShips = [null]; },
    s => { s.view.targetBoard.pop(); }, s => { s.view.remaining.you = -1; }, s => { s.view.lastShot = { cell: 100 }; }]) {
    const s = snapshot(); change(s); assert.doesNotThrow(() => h.render(s));
    assert.equal(h.byClass('bs-layout')[0].hidden, true); h.cells('target')[0].click(); assert.equal(h.actions.length, 0);
    assert.match(h.byClass('bs-status')[0].textContent, /erneut verbinden/);
  }
  h.render(snapshot()); assert.equal(h.byClass('bs-layout')[0].hidden, false);
});
