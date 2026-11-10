import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectFour as engine } from '../../backend/src/games/connect-four.js';

const players = [{ playerId: 'a' }, { playerId: 'b' }];
const initial = (start = 'a', config = {}) => engine.createInitialState(players, config, { startingPlayerId: start });
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) freeze(item); }
  return value;
}
function play(columns, start = 'a') {
  let state = initial(start);
  for (const column of columns) state = engine.handleAction(freeze(state), state.currentPlayerId, freeze({ kind: 'drop', column }));
  return state;
}
const drawColumns = [0,2,5,1,2,6,0,6,1,4,2,0,5,1,1,6,6,0,6,5,0,1,1,2,4,6,0,2,5,5,5,2,4,4,3,4,4,3,3,3,3,3];

test('4 Gewinnt: leere Config, zwei Spieler, beide serverseitigen Startpositionen', () => {
  assert.equal(engine.validateConfig({}), true);
  for (const config of [null, [], 1, 'x', new Date(), { rows: 6 }, { mode: 'classic' }, { x: undefined }, { [Symbol('x')]: true }, Object.create({})]) {
    assert.equal(engine.validateConfig(config), false); assert.throws(() => initial('a', config));
  }
  for (const start of ['a', 'b']) {
    const state = initial(start);
    assert.deepEqual(state.board, Array(42).fill(null));
    assert.equal(state.rows, 6); assert.equal(state.columns, 7); assert.equal(state.winLength, 4);
    assert.equal(state.currentPlayerId, start); assert.equal(state.lastMove, null);
    assert.equal(state.discs.find(player => player.playerId === start).color, 'umber');
    assert.deepEqual(engine.getStatus(state), { type: 'running' });
  }
  for (const list of [null, [], players.slice(0, 1), [...players, { playerId: 'c' }], [players[0], players[0]], [null, players[1]]]) {
    assert.throws(() => engine.createInitialState(list, {}, { startingPlayerId: 'a' }));
  }
  assert.throws(() => initial('absent'));
});

test('4 Gewinnt: Schwerkraft, Zugwechsel, volle Spalte und unveränderte Eingaben', () => {
  const original = freeze(initial()), action = freeze({ kind: 'drop', column: 0 });
  const next = engine.handleAction(original, 'a', action);
  assert.equal(next.lastMove, 35); assert.equal(next.board[35], 'umber'); assert.equal(next.currentPlayerId, 'b');
  assert.deepEqual(original.board, Array(42).fill(null));
  const stack = freeze(play([0,0,0,0,0,0]));
  assert.deepEqual([0,7,14,21,28,35].map(cell => stack.board[cell]), ['clay','umber','clay','umber','clay','umber']);
  assert.equal(stack.lastMove, 0); assert.equal(stack.status.type, 'running');
  const before = structuredClone(stack);
  assert.throws(() => engine.handleAction(stack, stack.currentPlayerId, action));
  assert.deepEqual(stack, before);
  const other = engine.handleAction(stack, stack.currentPlayerId, { kind: 'drop', column: 6 });
  assert.equal(other.lastMove, 41); assert.equal(other.board[41], 'umber');
});

const diagonal = [0,1,1,2,4,2,2,3,4,3,5,3,3];
for (const [label, columns, line] of [
  ['waagrecht', [0,6,1,6,2,5,3], [35,36,37,38]],
  ['senkrecht', [0,1,0,1,0,1,0], [14,21,28,35]],
  ['diagonal nach links', diagonal, [17,23,29,35]],
  ['diagonal nach rechts', diagonal.map(column => 6 - column), [17,25,33,41]],
]) {
  test(`4 Gewinnt: ${label}, Sieg und gesperrte Folgezüge`, () => {
    for (const start of ['a', 'b']) {
      const state = freeze(play(columns, start));
      assert.deepEqual(engine.getStatus(state), { type: 'won', winnerPlayerId: start });
      assert.deepEqual(state.winningLine, line); assert.equal(state.currentPlayerId, null);
      for (const id of ['a', 'b']) assert.throws(() => engine.handleAction(state, id, { kind: 'drop', column: 4 }));
    }
  });
}

test('4 Gewinnt: Terrakotta gewinnt; drei Steine und Zeilenumbrüche gewinnen nicht', () => {
  const second = play([6,0,6,1,5,2,5,3]);
  assert.deepEqual(second.status, { type: 'won', winnerPlayerId: 'b' });
  assert.deepEqual(second.winningLine, [35,36,37,38]);
  assert.equal(second.board[35], 'clay');
  for (const columns of [[0,6,1,6,2], [6,6,0,5,1,5,2]]) {
    const state = play(columns); assert.equal(state.status.type, 'running'); assert.equal(state.winningLine, null);
  }
});

test('4 Gewinnt: alle ungültigen Aktionen und fremde Spieler bleiben ohne Mutation', () => {
  const state = freeze(initial()), before = structuredClone(state);
  for (const action of [null, [], {}, { kind: 'drop' }, { column: 0 }, { kind: 'place', column: 0 },
    { kind: 'drop', column: 0, extra: true }, { kind: 'drop', column: 0, [Symbol('extra')]: true },
    ...[-1,7,NaN,Infinity,'0',null,true,2.5].map(column => ({ kind: 'drop', column }))]) {
    assert.throws(() => engine.handleAction(state, 'a', freeze(action))); assert.deepEqual(state, before);
  }
  for (const id of ['b', 'unknown']) assert.throws(() => engine.handleAction(state, id, { kind: 'drop', column: 0 }));
});

test('4 Gewinnt: Unentschieden mit 42 legalen Zügen; Sieg im letzten Feld hat Vorrang', () => {
  const draw = freeze(play(drawColumns));
  assert.equal(draw.board.filter(Boolean).length, 42);
  assert.deepEqual(draw.status, { type: 'draw' }); assert.equal(draw.currentPlayerId, null); assert.equal(draw.winningLine, null);
  assert.throws(() => engine.handleAction(draw, 'a', { kind: 'drop', column: 0 }));
  const almost = structuredClone(draw);
  almost.status = { type: 'running' }; almost.currentPlayerId = 'a';
  for (const cell of [0,1,3]) almost.board[cell] = 'umber';
  almost.board[2] = null;
  const won = engine.handleAction(freeze(almost), 'a', { kind: 'drop', column: 2 });
  assert.equal(won.board.filter(Boolean).length, 42);
  assert.deepEqual(won.status, { type: 'won', winnerPlayerId: 'a' });
  assert.deepEqual(won.winningLine, [0,1,2,3,4,5]);
});

test('4 Gewinnt: JSON-Ansichten und Status liefern unabhängig kopierte Daten', () => {
  const state = freeze(play([0,6,1,6,2,5,3])), before = structuredClone(state);
  const a = engine.getPlayerView(state, 'a'), b = engine.getPlayerView(state, 'b');
  assert.equal(a.yourColor, 'umber'); assert.equal(b.yourColor, 'clay');
  assert.deepEqual(a.board, b.board); assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  assert.throws(() => engine.getPlayerView(state, 'absent'));
  a.board[35] = null; a.discs[0].color = 'clay'; a.winningLine[0] = 0;
  engine.getStatus(state).type = 'draw';
  assert.deepEqual(state, before); assert.deepEqual(b.board, before.board);
});
