import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ticTacToe as engine } from '../../backend/src/games/tic-tac-toe.js';

const players = [{ playerId: 'a', displayName: 'Alice' }, { playerId: 'b', displayName: 'Ben' }];
const initial = (startingPlayerId = 'a', config = {}) => engine.createInitialState(players, config, { matchId: 'm1', startingPlayerId });
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) freeze(item); }
  return value;
}
function play(cells, start = 'a', config = {}) {
  let state = initial(start, config);
  for (const cell of cells) state = engine.handleAction(freeze(state), state.currentPlayerId, freeze({ kind: 'place', cell }));
  return state;
}

test('TTT: leere Config, genau zwei Spieler und beide Startpositionen', () => {
  assert.equal(engine.validateConfig({}), true);
  assert.equal(engine.validateConfig({ mode: 'classic' }), true);
  assert.equal(engine.validateConfig({ mode: 'five' }), true);
  for (const config of [null, [], 1, 'x', { size: 3 }, { x: undefined }, new Date(),
    { mode: 'unknown' }, { mode: undefined }, { mode: null }, { mode: 'five', size: 15 },
    { [Symbol('mode')]: 'five' }, Object.create({ mode: 'five' })]) {
    assert.equal(engine.validateConfig(config), false);
    assert.throws(() => initial('a', config));
  }
  assert.deepEqual(initial('a', { mode: 'classic' }), initial());
  for (const start of ['a', 'b']) {
    const context = freeze({ matchId: 'm1', startingPlayerId: start });
    const state = engine.createInitialState(freeze(structuredClone(players)), freeze({}), context);
    assert.deepEqual(state.board, Array(9).fill(null));
    assert.deepEqual(state.symbols, [{ playerId: start, symbol: 'X' }, { playerId: start === 'a' ? 'b' : 'a', symbol: 'O' }]);
    assert.equal(state.currentPlayerId, start);
    assert.equal(state.mode, 'classic'); assert.equal(state.boardSize, 3); assert.equal(state.winLength, 3);
    assert.equal(state.lastMove, null);
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
  assert.equal(next.lastMove, 4);
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
  assert.deepEqual(Object.keys(a).sort(), ['mode','boardSize','winLength','board','symbols','yourSymbol','currentPlayerId','winningLine','lastMove'].sort());
  assert.throws(() => engine.getPlayerView(state, 'unknown'));
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  a.board[0] = null; a.symbols[0].symbol = 'O'; a.winningLine[0] = 8;
  const status = engine.getStatus(state); status.type = 'draw';
  assert.deepEqual(state, play([0,3,1,4,2]));
});

test('TTT: bestehende Version-1-Zustände bleiben spielbar und lesbar', () => {
  const legacy = structuredClone(play([0, 3, 1, 4]));
  for (const field of ['mode', 'boardSize', 'winLength', 'lastMove']) delete legacy[field];
  freeze(legacy);
  const view = engine.getPlayerView(legacy, 'a');
  assert.equal(view.mode, 'classic'); assert.equal(view.boardSize, 3); assert.equal(view.winLength, 3);
  assert.equal(view.lastMove, null);
  assert.deepEqual(view.board, legacy.board);
  const next = engine.handleAction(legacy, 'a', { kind: 'place', cell: 2 });
  assert.deepEqual(engine.getStatus(next), { type: 'won', winnerPlayerId: 'a' });
  assert.deepEqual(next.winningLine, [0, 1, 2]);
  assert.equal(next.lastMove, 2);
  assert.equal(Object.hasOwn(legacy, 'mode'), false);
});

const fiveInitial = (start = 'a') => initial(start, { mode: 'five' });
const fivePlay = (cells, start = 'a') => play(cells, start, { mode: 'five' });

test('TTT 15×15: zwei Startpositionen, 225 Felder und unabhängige Ansichten', () => {
  for (const start of ['a', 'b']) {
    const state = freeze(fiveInitial(start));
    assert.deepEqual(state.board, Array(225).fill(null));
    assert.equal(state.mode, 'five'); assert.equal(state.boardSize, 15); assert.equal(state.winLength, 5);
    assert.equal(state.currentPlayerId, start); assert.equal(state.lastMove, null);
    const action = freeze({ kind: 'place', cell: 224 });
    const next = engine.handleAction(state, start, action);
    assert.equal(next.board[224], 'X'); assert.equal(next.lastMove, 224);
    assert.equal(next.currentPlayerId, start === 'a' ? 'b' : 'a');
    next.symbols[0].symbol = 'O';
    assert.equal(state.symbols[0].symbol, 'X');
    assert.deepEqual(state.board, Array(225).fill(null));
    const a = engine.getPlayerView(state, start), b = engine.getPlayerView(state, start === 'a' ? 'b' : 'a');
    assert.equal(a.yourSymbol, 'X'); assert.equal(b.yourSymbol, 'O');
    a.board[224] = 'X'; a.symbols[0].symbol = 'O';
    assert.deepEqual(b.board, Array(225).fill(null));
    assert.equal(b.symbols[0].symbol, 'X');
    assert.deepEqual(JSON.parse(JSON.stringify(b)), b);
  }
});

const fiveLines = [
  [0, 1, 2, 3, 4], [220, 221, 222, 223, 224],
  [0, 15, 30, 45, 60], [164, 179, 194, 209, 224],
  [0, 16, 32, 48, 64], [160, 176, 192, 208, 224],
  [14, 28, 42, 56, 70], [154, 168, 182, 196, 210],
];
for (const line of fiveLines) {
  for (const winningSymbol of ['X', 'O']) {
    test(`TTT 15×15: ${winningSymbol} gewinnt mit ${line.join(',')}`, () => {
      // Verteilte Gegenzüge bilden weder eine Gewinnlinie noch stören sie die getestete Linie.
      const others = [112, 114, 142, 144, 172].filter(cell => !line.includes(cell));
      const moves = [];
      for (let i = 0; i < line.length; i++) {
        if (winningSymbol === 'O') moves.push(others[i]);
        moves.push(line[i]);
        if (winningSymbol === 'X' && i < line.length - 1) moves.push(others[i]);
      }
      const state = freeze(fivePlay(moves));
      assert.deepEqual(engine.getStatus(state), { type: 'won', winnerPlayerId: winningSymbol === 'X' ? 'a' : 'b' });
      assert.deepEqual(state.winningLine, line);
      assert.equal(state.currentPlayerId, null); assert.equal(state.lastMove, line[4]);
      for (const playerId of ['a', 'b']) assert.throws(() => engine.handleAction(state, playerId, { kind: 'place', cell: 100 }));
      const view = engine.getPlayerView(state, 'a');
      view.winningLine[0] = 100; view.board[line[0]] = null; view.symbols[0].symbol = 'O';
      assert.deepEqual(state.winningLine, line);
      assert.equal(state.board[line[0]], winningSymbol);
      assert.equal(state.symbols[0].symbol, 'X');
    });
  }
}

test('TTT 15×15: vier reichen nicht, unterbrochene Reihen und Zeilenumbrüche gewinnen nicht', () => {
  for (const cells of [
    [0, 112, 1, 114, 2, 142, 3],
    [0, 112, 1, 114, 3, 142, 4, 144, 5],
    [12, 112, 13, 114, 14, 142, 15, 144, 16],
    [14, 112, 30, 114, 46, 142, 62, 144, 78],
    [0, 112, 14, 114, 28, 142, 42, 144, 56],
  ]) {
    const state = fivePlay(cells);
    assert.deepEqual(engine.getStatus(state), { type: 'running' });
    assert.equal(state.winningLine, null);
  }
});

test('TTT 15×15: ein verbindender Zug gewinnt auch mit sechs Steinen', () => {
  const state = fivePlay([45, 112, 46, 114, 47, 142, 49, 144, 50, 172, 48]);
  assert.deepEqual(engine.getStatus(state), { type: 'won', winnerPlayerId: 'a' });
  assert.deepEqual(state.winningLine, [45, 46, 47, 48, 49, 50]);
});

test('TTT 15×15: Grenzen und ungültige Aktionen mutieren nichts', () => {
  const state = freeze(fiveInitial());
  for (const action of [null, [], {}, { kind: 'place' }, { cell: 0 }, { kind: 'step', cell: 0 },
    { kind: 'place', cell: 0, extra: true },
    ...[-1,225,NaN,Infinity,'224',null,true,224.5].map(cell => ({ kind: 'place', cell }))]) {
    assert.throws(() => engine.handleAction(state, 'a', freeze(action)));
    assert.deepEqual(state, fiveInitial());
  }
  for (const id of ['b', 'unknown']) assert.throws(() => engine.handleAction(state, id, { kind: 'place', cell: 0 }));
  const occupied = freeze(fivePlay([224]));
  assert.throws(() => engine.handleAction(occupied, 'b', { kind: 'place', cell: 224 }));
  assert.deepEqual(occupied, fivePlay([224]));
});

test('TTT 15×15: volles Brett unentschieden, Sieg hat auf dem letzten Feld Vorrang', () => {
  // Jede Richtung wechselt nach höchstens zwei Feldern die Farbe.
  const x = [], o = [];
  for (let cell = 0; cell < 225; cell++) {
    const row = Math.floor(cell / 15), column = cell % 15;
    ((row + 2 * column) % 4 < 2 ? x : o).push(cell);
  }
  const moves = x.flatMap((cell, index) => index < o.length ? [cell, o[index]] : [cell]);
  const draw = freeze(fivePlay(moves));
  assert.equal(draw.board.filter(Boolean).length, 225);
  assert.deepEqual(engine.getStatus(draw), { type: 'draw' });
  assert.equal(draw.winningLine, null); assert.equal(draw.currentPlayerId, null);
  assert.throws(() => engine.handleAction(draw, 'a', { kind: 'place', cell: 0 }));

  const almostFull = structuredClone(draw);
  Object.assign(almostFull, { currentPlayerId: 'a', status: { type: 'running' }, winningLine: null });
  for (const cell of [0, 1, 3, 4]) almostFull.board[cell] = 'X';
  almostFull.board[2] = null;
  const won = engine.handleAction(freeze(almostFull), 'a', { kind: 'place', cell: 2 });
  assert.equal(won.board.filter(Boolean).length, 225);
  assert.deepEqual(engine.getStatus(won), { type: 'won', winnerPlayerId: 'a' });
  assert.deepEqual(won.winningLine, [0, 1, 2, 3, 4]);
});
