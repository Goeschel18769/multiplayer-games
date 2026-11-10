import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountConnectFour } from '../../frontend/src/games/connect-four.js';

function harness() {
  let focused;
  class Element {
    constructor() { this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.style = { setProperty() {} }; }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = items; }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    click() { this.listeners.click?.(); }
    focus() { focused = this; this.listeners.focus?.(); }
    key(key) { const event = { key, preventDefault() { this.prevented = true; } }; this.listeners.keydown(event); return event; }
    set innerHTML(_) { throw new Error('Unsafe HTML rendering'); }
  }
  const root = new Element(), actions = [], previous = globalThis.document;
  globalThis.document = { createElement: () => new Element() };
  let renderer;
  try { renderer = mountConnectFour(root, action => actions.push(action)); }
  finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
  const all = node => [node, ...node.children.flatMap(all)];
  const byClass = name => all(root).filter(node => node.className === name);
  return { actions, byClass, focused: () => focused,
    render: (snapshot, extra = {}) => renderer.render({ snapshot, playerId: 'a', canMutate: true, ...extra }),
    buttons: () => byClass('c4-column'), cells: () => byClass('c4-cell'),
  };
}
function snapshot() {
  return { matchId: 'm1', revision: 0,
    room: { gameId: 'connect-four', players: [{ playerId: 'a', displayName: 'Ben' }, { playerId: 'b', displayName: 'Joël' }],
      participants: ['a', 'b'], status: { type: 'running' }, rematchVotes: [] },
    view: { rows: 6, columns: 7, winLength: 4, board: Array(42).fill(null), discs: [{ playerId: 'a', color: 'umber' }, { playerId: 'b', color: 'clay' }],
      yourColor: 'umber', currentPlayerId: 'a', winningLine: null, lastMove: null } };
}

test('4-Gewinnt-Oberfläche: 42 zugängliche Felder, 7 Spalten und kein optimistischer Stein', () => {
  const h = harness(), s = snapshot(); h.render(s);
  assert.equal(h.cells().length, 42); assert.equal(h.buttons().length, 7);
  assert.equal(h.byClass('c4-row').length, 6);
  assert.equal(h.byClass('c4-board')[0].attributes.role, 'table');
  assert.match(h.cells()[41].attributes['aria-label'], /Reihe 6, Spalte 7, leer/);
  h.buttons()[6].click(); assert.deepEqual(h.actions, [{ kind: 'drop', column: 6 }]);
  assert.ok(s.view.board.every(value => value === null));
  assert.ok(h.cells().every(cell => cell.children[0].dataset.color === ''));
  assert.equal(h.byClass('c4-status')[0].textContent, 'Du bist am Zug.');
});

test('4-Gewinnt-Oberfläche: volle Spalten, Zugrecht, Pending, Lobby und Abbruch sperren Aktionen', () => {
  const changes = [s => { for (let row = 0; row < 6; row++) s.view.board[row * 7] = row % 2 ? 'umber' : 'clay'; },
    s => { s.view.currentPlayerId = 'b'; }, s => { s.room.status.type = 'aborted'; }, s => { s.room.participants = ['b']; },
    s => { s.room.status.type = 'lobby'; s.view = null; }];
  for (const change of changes) {
    const h = harness(), s = snapshot(); change(s); h.render(s); h.buttons()[0].click(); assert.equal(h.actions.length, 0);
    assert.equal(h.buttons()[0].attributes['aria-disabled'], 'true');
  }
  const h = harness(); h.render(snapshot(), { canMutate: false }); h.buttons()[1].click(); assert.equal(h.actions.length, 0);
  h.render(snapshot()); h.buttons()[1].click(); assert.equal(h.actions.length, 1);
});

test('4-Gewinnt-Oberfläche: ungültige Ansichten sperren und eine gültige Ansicht stellt wieder her', () => {
  const h = harness();
  for (const change of [s => { s.view = null; }, s => { s.view.rows = 7; }, s => { s.view.board.pop(); },
    s => { s.view.board[0] = 'invalid'; }, s => { s.view.discs[0] = null; }, s => { s.view.yourColor = 'clay'; },
    s => { s.view.lastMove = 42; }, s => { s.view.currentPlayerId = 'absent'; }, s => { s.view.winningLine = [35,36,37,42]; }]) {
    const s = snapshot(); change(s); assert.doesNotThrow(() => h.render(s)); h.buttons()[0].click();
    assert.equal(h.actions.length, 0); assert.equal(h.byClass('c4-arena')[0].hidden, true);
    assert.match(h.byClass('c4-status')[0].textContent, /erneut verbinden/);
  }
  h.render(snapshot()); assert.equal(h.byClass('c4-arena')[0].hidden, false); h.buttons()[0].click(); assert.equal(h.actions.length, 1);
});

test('4-Gewinnt-Oberfläche: Servergewinner, Gewinnfelder und letzter Zug ohne lokale Siegerberechnung', () => {
  const h = harness(), s = snapshot();
  for (const cell of [35,36,37,38]) s.view.board[cell] = 'umber';
  s.view.lastMove = 38; h.render(s);
  assert.ok(h.cells().every(cell => cell.dataset.winning === 'false'));
  assert.equal(h.cells()[38].dataset.last, 'true');
  s.room.status = { type: 'won', winnerPlayerId: 'b' }; s.view.winningLine = [35,36,37,38]; s.view.currentPlayerId = null;
  s.room.rematchVotes = ['a']; h.render(s);
  assert.match(h.byClass('c4-status')[0].textContent, /Joël gewinnt.*1 von 2/);
  assert.equal(h.cells().filter(cell => cell.dataset.winning === 'true').length, 4);
  h.buttons()[0].click(); assert.equal(h.actions.length, 0);
});

test('4-Gewinnt-Oberfläche: Fallanimation nur für neuen bestätigten Stein, ohne Reconnect-Replay', () => {
  const h = harness(), s = snapshot(); h.render(s);
  s.view.board[35] = 'umber'; s.view.lastMove = 35; s.revision = 1; h.render(s);
  assert.equal(h.cells()[35].children[0].dataset.falling, 'true');
  h.render(s, { canMutate: false }); assert.equal(h.cells()[35].children[0].dataset.falling, 'true');
  const reconnected = harness(); reconnected.render(s);
  assert.equal(reconnected.cells()[35].children[0].dataset.falling, 'false');
  s.matchId = 'm2'; s.revision = 0; s.view.board = Array(42).fill(null); s.view.lastMove = null; h.render(s);
  assert.ok(h.cells().every(cell => cell.children[0].dataset.falling === 'false'));
});

test('4-Gewinnt-Oberfläche: ein Tabstopp, Pfeile und Home/End ohne Randumbruch', () => {
  const h = harness(); h.render(snapshot()); const buttons = h.buttons();
  assert.deepEqual(buttons.flatMap((button, index) => button.tabIndex === 0 ? [index] : []), [3]);
  assert.equal(buttons[3].key('ArrowRight').prevented, true); assert.equal(h.focused(), buttons[4]);
  buttons[4].key('End'); assert.equal(h.focused(), buttons[6]);
  buttons[6].key('ArrowRight'); assert.equal(h.focused(), buttons[6]);
  buttons[6].key('Home'); buttons[0].key('ArrowLeft'); assert.equal(h.focused(), buttons[0]);
  assert.equal(buttons.filter(button => button.tabIndex === 0).length, 1);
  assert.equal(h.actions.length, 0);
});
