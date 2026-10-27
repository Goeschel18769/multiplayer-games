import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ticTacToe as engine } from '../../backend/src/games/tic-tac-toe.js';

const players = [{ playerId: 'a', displayName: 'Alice' }, { playerId: 'b', displayName: 'Ben' }];
const initial = (startingPlayerId = 'a') => engine.createInitialState(players, {}, { matchId: 'm1', startingPlayerId });
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) freeze(item); }
  return value;
}
function play(cells, start = 'a') {
  let state = initial(start);
  for (const cell of cells) state = engine.handleAction(freeze(state), state.currentPlayerId, freeze({ kind: 'place', cell }));
  return state;
}

test('TTT: leere Config, genau zwei Spieler und beide Startpositionen', () => {
  assert.equal(engine.validateConfig({}), true);
  for (const config of [null, [], 1, 'x', { size: 3 }, { x: undefined }, new Date()]) assert.equal(engine.validateConfig(config), false);
  for (const start of ['a', 'b']) {
    const context = freeze({ matchId: 'm1', startingPlayerId: start });
    const state = engine.createInitialState(freeze(structuredClone(players)), freeze({}), context);
    assert.deepEqual(state.board, Array(9).fill(null));
    assert.deepEqual(state.symbols, [{ playerId: start, symbol: 'X' }, { playerId: start === 'a' ? 'b' : 'a', symbol: 'O' }]);
    assert.equal(state.currentPlayerId, start);
    assert.deepEqual(engine.getStatus(state), { type: 'running' });
  }
  for (const list of [[], players.slice(0, 1), [...players, { playerId: 'c' }], [players[0], players[0]]]) assert.throws(() => engine.createInitialState(list, {}, { startingPlayerId: 'a' }));
  assert.throws(() => engine.createInitialState(players, {}, { startingPlayerId: 'unknown' }));
});

test('TTT: ein Stein pro Zug, Zugwechsel und unveränderte Eingaben', () => {
  const state = freeze(initial());
  const action = freeze({ kind: 'place', cell: 4 });
  const next = engine.handleAction(state, 'a', action);
  assert.equal(next.board[4], 'X'); assert.equal(next.currentPlayerId, 'b');
  assert.deepEqual(state.board, Array(9).fill(null));
  assert.deepEqual(action, { kind: 'place', cell: 4 });
  assert.equal(engine.handleAction(freeze(next), 'b', { kind: 'place', cell: 0 }).board[0], 'O');
});

const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
for (const line of lines) {
  test(`TTT: Gewinnlinie ${line.join(',')} für X`, () => {
    const other = Array.from({ length: 9 }, (_, i) => i).filter(i => !line.includes(i));
    const state = play([line[0], other[0], line[1], other[1], line[2]]);
    assert.deepEqual(engine.getStatus(state), { type: 'won', winnerPlayerId: 'a' });
    assert.deepEqual(state.winningLine, line);
    assert.equal(state.currentPlayerId, null);
  });
}

test('TTT: O gewinnt und Startspieler B kann als X gewinnen', () => {
  const o = play([0,3,1,4,8,5]);
  assert.deepEqual(engine.getStatus(o), { type: 'won', winnerPlayerId: 'b' });
  assert.deepEqual(o.winningLine, [3,4,5]);
  assert.equal(o.currentPlayerId, null);
  assert.deepEqual(engine.getStatus(play([0,3,1,4,2], 'b')), { type: 'won', winnerPlayerId: 'b' });
});

test('TTT: Unentschieden und Sieg auf dem neunten Feld', () => {
  const draw = play([0,1,2,4,3,5,7,6,8]);
  assert.deepEqual(engine.getStatus(draw), { type: 'draw' });
  assert.equal(draw.currentPlayerId, null); assert.equal(draw.winningLine, null);
  const won = play([0,1,4,2,5,3,6,7,8]);
  assert.equal(won.board.filter(Boolean).length, 9);
  assert.deepEqual(engine.getStatus(won), { type: 'won', winnerPlayerId: 'a' });
  assert.deepEqual(won.winningLine, [0,4,8]);
});

test('TTT: alle ungültigen Aktionen bleiben ohne Mutation', () => {
  const state = freeze(initial());
  for (const action of [null, [], {}, { kind: 'place' }, { cell: 0 }, { kind: 'step', cell: 0 },
    { kind: 'place', cell: 0, extra: true }, { kind: 'place', cell: 1.5 },
    ...[-1,9,NaN,Infinity,'0',null,true].map(cell => ({ kind: 'place', cell }))]) {
    assert.throws(() => engine.handleAction(state, 'a', freeze(action)));
    assert.deepEqual(state, initial());
  }
  for (const id of ['b', 'unknown']) assert.throws(() => engine.handleAction(state, id, { kind: 'place', cell: 0 }));
  const occupied = freeze(play([0]));
  assert.throws(() => engine.handleAction(occupied, 'b', { kind: 'place', cell: 0 }));
  assert.deepEqual(occupied, play([0]));
  for (const cells of [[0,3,1,4,2], [0,1,2,4,3,5,7,6,8]]) {
    const ended = freeze(play(cells));
    const before = structuredClone(ended);
    for (const id of ['a','b']) assert.throws(() => engine.handleAction(ended, id, { kind: 'place', cell: 8 }));
    assert.deepEqual(ended, before);
  }
});

test('TTT: eigene Ansichten, unbekannte Spieler, unabhängige JSON-Kopien', () => {
  const state = freeze(play([0,3,1,4,2]));
  const a = engine.getPlayerView(state, 'a'), b = engine.getPlayerView(state, 'b');
  assert.equal(a.yourSymbol, 'X'); assert.equal(b.yourSymbol, 'O');
  assert.deepEqual(a.board, b.board); assert.deepEqual(a.winningLine, [0,1,2]);
  assert.deepEqual(Object.keys(a).sort(), ['board','symbols','yourSymbol','currentPlayerId','winningLine'].sort());
  assert.throws(() => engine.getPlayerView(state, 'unknown'));
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  a.board[0] = null; a.symbols[0].symbol = 'O'; a.winningLine[0] = 8;
  const status = engine.getStatus(state); status.type = 'draw';
  assert.deepEqual(state, play([0,3,1,4,2]));
});
