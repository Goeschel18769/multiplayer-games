import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountTicTacToe } from '../../frontend/src/games/tic-tac-toe.js';

function harness(mode = 'classic') {
  const document = { activeElement: null };
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.className = ''; this.children = [];
      this.dataset = {}; this.attributes = {}; this.listeners = {}; this.hidden = false;
      this.properties = new Map(); this.textContent = ''; this.tabIndex = -1;
      this.style = { setProperty: (key, value) => this.properties.set(key, value) };
      this.scrolls = [];
    }
    set innerHTML(_) { throw new Error('Unsafe HTML rendering'); }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = [...items]; }
    setAttribute(key, value) {
      this.attributes[key] = String(value);
      if (key === 'class') this.className = String(value);
    }
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
    emit(type, properties = {}) {
      const event = { target: this, key: '', ctrlKey: false, metaKey: false, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, ...properties };
      for (const handler of this.listeners[type] || []) handler(event);
      return event;
    }
    click() { this.emit('click'); }
    focus() { document.activeElement = this; this.emit('focus'); }
    scrollIntoView(options) { this.scrolls.push(options); }
  }
  document.createElement = tag => new Element(tag);
  document.createElementNS = (_, tag) => new Element(tag);
  const withDocument = action => {
    const previous = globalThis.document;
    globalThis.document = document;
    try { return action(); }
    finally {
      if (previous === undefined) delete globalThis.document;
      else globalThis.document = previous;
    }
  };
  const root = new Element('main'), actions = [];
  const renderer = withDocument(() => mountTicTacToe(root, action => actions.push(action), { mode }));
  const all = () => {
    const walk = node => [node, ...node.children.flatMap(walk)];
    return walk(root);
  };
  const byClass = name => all().find(node => node.className.split(' ').includes(name));
  return {
    actions, byClass,
    render: (snapshot, overrides = {}) => withDocument(() => renderer.render({ snapshot, playerId: 'a', canMutate: true, ...overrides })),
    cells: () => all().filter(node => node.attributes.role === 'gridcell'),
    rows: () => all().filter(node => node.attributes.role === 'row'),
    focused: () => document.activeElement,
    trace: () => byClass('ttt-winning-trace'),
  };
}

function snapshot(mode = 'classic') {
  const size = mode === 'five' ? 15 : 3;
  return {
    room: { gameId: 'tic-tac-toe', config: mode === 'five' ? { mode: 'five' } : {},
      players: [{ playerId: 'a', displayName: 'Ben' }, { playerId: 'b', displayName: 'Joël' }],
      participants: ['a', 'b'], status: { type: 'running' }, rematchVotes: [] },
    view: { mode, boardSize: size, winLength: size === 15 ? 5 : 3,
      board: Array(size ** 2).fill(null),
      symbols: [{ playerId: 'a', symbol: 'X' }, { playerId: 'b', symbol: 'O' }],
      yourSymbol: 'X', currentPlayerId: 'a', winningLine: null, lastMove: null },
  };
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

test('TTT-Oberfläche: 3×3 und 15×15 als zugängliche Raster, leere Lobby und Größenwechsel', () => {
  const h = harness();
  for (const mode of ['classic', 'five', 'classic']) {
    const state = snapshot(mode), size = mode === 'five' ? 15 : 3;
    state.room.status = { type: 'lobby' };
    state.view = null;
    h.render(state);
    assert.equal(h.cells().length, size ** 2);
    assert.equal(h.rows().length, size);
    assert.ok(h.rows().every(row => row.children.length === size));
    const board = h.byClass('ttt-board');
    assert.equal(board.attributes.role, 'grid');
    assert.equal(board.attributes['aria-rowcount'], String(size));
    assert.equal(board.attributes['aria-colcount'], String(size));
    assert.equal(board.properties.get('--board-size'), String(size));
    assert.equal(h.cells().at(-1).attributes['aria-rowindex'], String(size));
    assert.equal(h.cells().at(-1).attributes['aria-colindex'], String(size));
    assert.equal(h.byClass('ttt-player-bar').hidden, true);
    assert.equal(h.byClass('ttt-viewport').hidden, false);
    assert.equal(h.byClass('ttt-status').hidden, true);
    assert.equal(h.byClass('ttt-pan-hint').hidden, size !== 15);
    assert.deepEqual(h.cells().flatMap((cell, index) => cell.tabIndex === 0 ? [index] : []), [Math.floor(size / 2) * size + Math.floor(size / 2)]);
    h.cells().at(-1).click();
    assert.equal(h.actions.length, 0);
  }
});

test('TTT-Oberfläche: nur serverseitiges Zugrecht und freie Felder senden Aktionen, kein optimistischer Spielstand', () => {
  const h = harness('five');
  const state = snapshot('five'); state.view.board[0] = 'O';
  freeze(state);
  h.render(state);
  assert.equal(h.byClass('ttt-status').textContent, 'Du bist am Zug.');
  assert.equal(h.cells()[0].attributes['aria-disabled'], 'true');
  assert.equal(h.cells()[224].attributes['aria-disabled'], 'false');
  h.cells()[0].click(); h.cells()[224].click();
  assert.deepEqual(h.actions, [{ kind: 'place', cell: 224 }]);
  assert.equal(h.cells()[224].dataset.value, '');
  assert.equal(state.view.board[224], null);
  for (const altered of [
    current => { current.view.currentPlayerId = 'b'; },
    current => { current.room.participants = ['b']; },
    ...['won', 'draw', 'aborted', 'lobby'].map(type => current => { current.room.status = { type, winnerPlayerId: 'b' }; }),
  ]) {
    const current = structuredClone(state); altered(current);
    h.render(current); h.cells()[223].click();
    assert.equal(h.cells()[223].attributes['aria-disabled'], 'true');
  }
  h.render(state, { canMutate: false }); h.cells()[223].click();
  assert.match(h.byClass('ttt-status').textContent, /abgeglichen/);
  assert.equal(h.actions.length, 1);
  const otherTurn = structuredClone(state); otherTurn.view.currentPlayerId = 'b';
  h.render(otherTurn);
  assert.equal(h.byClass('ttt-status').textContent, 'Joël ist am Zug.');
});

test('TTT-Oberfläche: ungültige Serveransichten sperren das Brett und erholen sich nach gültigem Stand', () => {
  const invalid = [
    state => { state.view = null; },
    state => { state.view.mode = 'unknown'; },
    state => { state.view.boardSize = 3; },
    state => { state.view.winLength = 3; },
    state => { state.view.board.pop(); },
    state => { state.view.board[100] = 'Z'; },
    state => { state.view.symbols[0] = null; },
    state => { state.view.symbols[1].playerId = 'a'; },
    state => { state.view.symbols[1].symbol = 'X'; },
    state => { state.view.yourSymbol = 'O'; },
    state => { state.view.currentPlayerId = 'unknown'; },
    state => { state.view.winningLine = [0, 1, 2, 3]; },
    state => { state.view.winningLine = [0, 1, 2, 3, 225]; },
    state => { state.view.winningLine = [0, 1, 2, 3, 4.5]; },
    state => { state.view.lastMove = -1; },
    state => { state.view.lastMove = 225; },
    state => { state.view.lastMove = '224'; },
  ];
  const h = harness('five');
  for (const alter of invalid) {
    const state = snapshot('five'); alter(state);
    assert.doesNotThrow(() => h.render(freeze(state)));
    assert.equal(h.byClass('ttt-viewport').hidden, true);
    assert.match(h.byClass('ttt-status').textContent, /erneut verbinden/);
    assert.ok(h.cells().every(cell => cell.attributes['aria-disabled'] === 'true'));
    assert.equal(h.trace().hidden, true);
    h.cells()[0].click();
    assert.equal(h.actions.length, 0);
  }
  h.render(snapshot('five'));
  assert.equal(h.byClass('ttt-viewport').hidden, false);
  h.cells()[224].click();
  assert.deepEqual(h.actions, [{ kind: 'place', cell: 224 }]);
});

test('TTT-Oberfläche: Gewinner und hervorgehobene Linie stammen ausschließlich vom Server', () => {
  const h = harness();
  const state = snapshot();
  for (const cell of [0, 1, 2]) state.view.board[cell] = 'X';
  h.render(state);
  assert.equal(h.trace().hidden, true);
  assert.ok(h.cells().every(cell => cell.dataset.winning === 'false'));
  assert.equal(h.byClass('ttt-status').textContent, 'Du bist am Zug.');
  state.room.status = { type: 'won', winnerPlayerId: 'b' };
  state.view.currentPlayerId = null;
  state.view.winningLine = [6, 7, 8];
  h.render(freeze(state));
  assert.equal(h.byClass('ttt-status').textContent, 'Joël gewinnt.');
  assert.deepEqual(h.cells().flatMap((cell, index) => cell.dataset.winning === 'true' ? [index] : []), [6, 7, 8]);
  assert.equal(h.trace().hidden, false);
  const line = h.trace().children[0];
  assert.equal(Number(line.attributes.x1), 100 / 6);
  assert.equal(Number(line.attributes.x2), 250 / 3);
  assert.equal(line.attributes.y1, line.attributes.y2);
  h.render(snapshot());
  assert.equal(h.trace().hidden, true);
  assert.equal(h.trace().style.display, 'none');
});

test('TTT-Oberfläche: überlange Server-Gewinnlinie, letzter Zug und hohe Indizes im großen Brett', () => {
  const h = harness('five');
  const state = snapshot('five');
  for (const cell of [45, 46, 47, 48, 49, 50]) state.view.board[cell] = 'O';
  state.view.winningLine = [45, 46, 47, 48, 49, 50];
  state.view.currentPlayerId = null;
  state.view.lastMove = 48;
  state.room.status = { type: 'won', winnerPlayerId: 'b' };
  h.render(freeze(state));
  assert.deepEqual(h.cells().flatMap((cell, index) => cell.dataset.winning === 'true' ? [index] : []), [45, 46, 47, 48, 49, 50]);
  assert.equal(h.cells()[48].dataset.last, 'true');
  assert.equal(h.cells()[48].attributes['aria-label'], 'Zeile 4, Spalte 4, O, letzter Zug');
  assert.equal(h.trace().dataset.symbol, 'O');
  const line = h.trace().children[0];
  assert.equal(Number(line.attributes.x1), .5 * 100 / 15);
  assert.equal(Number(line.attributes.x2), 5.5 * 100 / 15);
  assert.equal(Number(line.attributes.y1), 3.5 * 100 / 15);
  const next = snapshot('five'); next.view.board[224] = 'X'; next.view.lastMove = 224;
  h.render(next);
  assert.equal(h.cells()[224].dataset.value, 'X');
  assert.equal(h.cells()[224].children[0].dataset.symbol, 'X');
  assert.equal(h.cells()[224].attributes['aria-label'], 'Zeile 15, Spalte 15, X, letzter Zug');
  assert.equal(h.cells()[48].dataset.last, 'false');
  next.view.lastMove = 0; next.view.board[0] = 'O';
  h.render(next);
  assert.equal(h.cells()[0].dataset.last, 'true');
  assert.equal(h.cells()[224].dataset.last, 'false');
});

test('TTT-Oberfläche: alte 3×3-Ansichten und Modusbestimmung aus 225 Serverfeldern bleiben kompatibel', () => {
  for (const mode of ['classic', 'five']) {
    const h = harness(mode === 'classic' ? 'five' : 'classic'), state = snapshot(mode);
    delete state.room.config;
    for (const field of ['mode', 'boardSize', 'winLength', 'lastMove']) delete state.view[field];
    h.render(freeze(state));
    assert.equal(h.cells().length, mode === 'five' ? 225 : 9);
    assert.equal(h.byClass('ttt-viewport').hidden, false);
    assert.ok(h.cells().every(cell => cell.dataset.last === 'false'));
    h.cells().at(-1).click();
    assert.deepEqual(h.actions, [{ kind: 'place', cell: mode === 'five' ? 224 : 8 }]);
  }
});

for (const [mode, size] of [['classic', 3], ['five', 15]]) {
  test(`TTT-Oberfläche ${size}×${size}: Pfeile, Home/End, Randbegrenzung und genau ein Tabstopp`, () => {
    const h = harness(mode); h.render(snapshot(mode));
    const center = Math.floor(size / 2) * size + Math.floor(size / 2);
    const move = (from, key, to, modifiers = {}) => {
      const event = h.cells()[from].emit('keydown', { key, ...modifiers });
      assert.equal(event.defaultPrevented, true);
      assert.equal(h.focused(), h.cells()[to]);
      assert.deepEqual(h.cells().flatMap((cell, index) => cell.tabIndex === 0 ? [index] : []), [to]);
      assert.deepEqual(h.cells()[to].scrolls.at(-1), { block: 'nearest', inline: 'nearest', behavior: 'instant' });
    };
    move(center, 'ArrowRight', center + 1);
    move(center + 1, 'ArrowLeft', center);
    move(center, 'ArrowDown', center + size);
    move(center + size, 'ArrowUp', center);
    move(center, 'Home', Math.floor(size / 2) * size);
    move(center, 'End', Math.floor(size / 2) * size + size - 1);
    move(center, 'Home', 0, { ctrlKey: true });
    move(center, 'End', size ** 2 - 1, { metaKey: true });
    move(0, 'ArrowUp', 0); move(0, 'ArrowLeft', 0);
    move(size - 1, 'ArrowRight', size - 1);
    move(size ** 2 - 1, 'ArrowDown', size ** 2 - 1);
    move(size ** 2 - 1, 'ArrowRight', size ** 2 - 1);
    const focused = h.focused();
    assert.equal(h.cells()[0].emit('keydown', { key: 'Tab' }).defaultPrevented, false);
    assert.equal(h.focused(), focused);
    h.cells()[1].focus();
    assert.deepEqual(h.cells().flatMap((cell, index) => cell.tabIndex === 0 ? [index] : []), [1]);
    assert.equal(h.actions.length, 0);
  });
}
