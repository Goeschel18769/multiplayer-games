import { test } from 'node:test';
import assert from 'node:assert/strict';
import { battleship as engine } from '../../backend/src/games/battleship.js';
import { fleetA, fleetB, cellsA, cellsB } from '../fixtures/battleship.js';
import { placementCells, canPlace, completeFleet, randomFleet } from '../../frontend/src/games/battleship-placement.js';

const players = [{ playerId: 'a' }, { playerId: 'b' }];
const initial = (start = 'a', config = {}) => engine.createInitialState(players, config, { startingPlayerId: start });
const place = (state, id, ships) => engine.handleAction(state, id, { kind: 'placeFleet', ships });
const fire = (state, cell, id = state.currentPlayerId) => engine.handleAction(state, id, { kind: 'fire', cell });
const battle = (start = 'a') => place(place(initial(start), 'a', fleetA), 'b', fleetB);
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) freeze(item); }
  return value;
}

test('Schiffe: zwei Spieler, leere Config und unabhängige Platzierungsphase', () => {
  for (const start of ['a','b']) {
    const state = initial(start); assert.equal(state.phase, 'placement'); assert.equal(state.currentPlayerId, null);
    assert.deepEqual(engine.getStatus(state), { type: 'running' });
    const first = place(freeze(state), 'b', freeze(structuredClone(fleetB)));
    assert.equal(first.phase, 'placement'); assert.equal(first.currentPlayerId, null);
    const ready = place(freeze(first), 'a', fleetA);
    assert.equal(ready.phase, 'battle'); assert.equal(ready.currentPlayerId, start);
    assert.deepEqual(state.players.map(player => player.fleet), [null,null]);
  }
  for (const config of [null, [], 1, { mode: 'x' }, { size: 10 }, { [Symbol('x')]: true }, Object.create({})]) {
    assert.equal(engine.validateConfig(config), false); assert.throws(() => initial('a', config));
  }
  for (const list of [null, [], [players[0]], [...players, { playerId: 'c' }], [players[0],players[0]], [null,players[1]]]) assert.throws(() => engine.createInitialState(list, {}, { startingPlayerId: 'a' }));
  assert.throws(() => initial('unknown'));
});

test('Schiffe: L-Schiff hat in allen vier Drehungen genau fünf Felder; Berührung erlaubt', () => {
  const expected = [[0,1,2,10,20], [0,1,2,12,22], [2,12,20,21,22], [0,10,20,21,22]];
  const rest = [{ cell: 40, rotation: 0 }, { cell: 60, rotation: 0 }, { cell: 80, rotation: 0 }, { cell: 94, rotation: 0 }];
  for (let rotation = 0; rotation < 4; rotation++) {
    const placements = [{ cell: 0, rotation }, ...rest];
    const state = place(initial(), 'a', placements);
    assert.deepEqual(state.players[0].fleet[0], expected[rotation]);
    assert.deepEqual(placementCells(0, placements[0]), expected[rotation]);
  }
  const touching = place(initial(), 'a', fleetA);
  assert.deepEqual(touching.players[0].fleet, cellsA);
  assert.equal(touching.players[0].fleet.flat().length, 17);
});

test('Schiffe: ungültige, überlappende, unvollständige oder nachträgliche Flotten ohne Mutation', () => {
  const original = freeze(initial()), before = structuredClone(original);
  const bad = [null, [], fleetA.slice(1), [...fleetA,fleetA[0]],
    [{ cell: 99, rotation: 0 }, ...fleetA.slice(1)], [{ cell: 9, rotation: 0 }, ...fleetA.slice(1)],
    [{ cell: 0, rotation: 4 }, ...fleetA.slice(1)], [{ cell: 0, rotation: -1 }, ...fleetA.slice(1)],
    [{ cell: '0', rotation: 0 }, ...fleetA.slice(1)], [{ cell: 0 }, ...fleetA.slice(1)],
    [{ cell: 0, rotation: 0, extra: true }, ...fleetA.slice(1)], [fleetA[0], { cell: 1, rotation: 0 }, ...fleetA.slice(2)]];
  for (const ships of bad) { assert.throws(() => place(original, 'a', ships)); assert.deepEqual(original, before); }
  const confirmed = freeze(place(initial(), 'a', fleetA));
  assert.throws(() => place(confirmed, 'a', fleetB));
  assert.throws(() => place(confirmed, 'unknown', fleetB));
  assert.throws(() => place(freeze(battle()), 'a', fleetB));
  assert.throws(() => engine.handleAction(original, 'a', { kind: 'placeFleet', ships: fleetA, extra: 1 }));
});

test('Schiffe: gegnerische Flotte bleibt vor und nach Bestätigung vollständig verborgen', () => {
  const state = place(initial(), 'a', fleetA);
  const own = engine.getPlayerView(state, 'a'), other = engine.getPlayerView(state, 'b');
  assert.equal(own.yourReady, true); assert.deepEqual(own.ownShips.map(ship => ship.cells), cellsA);
  assert.equal(other.opponentReady, true); assert.equal(other.yourReady, false);
  assert.deepEqual(other.opponentShips, []); assert.deepEqual(other.targetBoard, Array(100).fill('unknown'));
  const started = freeze(place(state, 'b', fleetB));
  for (const id of ['a','b']) {
    const view = engine.getPlayerView(started, id);
    assert.deepEqual(view.opponentShips, []); assert.deepEqual(view.targetBoard, Array(100).fill('unknown'));
    assert.ok(!Object.hasOwn(view, 'players')); assert.ok(!Object.hasOwn(view, 'fleet'));
  }
  assert.throws(() => engine.getPlayerView(started, 'unknown'));
});

test('Schiffe: nur tatsächliche Treffer/Fehlschüsse, Treffer behält Zug und Wasser wechselt', () => {
  let state = freeze(battle());
  state = fire(state, 57);
  assert.equal(state.currentPlayerId, 'a'); assert.deepEqual(state.lastShot, { playerId: 'a', cell: 57, result: 'hit' });
  let view = engine.getPlayerView(state, 'a');
  assert.equal(view.targetBoard[57], 'hit'); assert.equal(view.targetBoard.filter(value => value !== 'unknown').length, 1);
  assert.deepEqual(view.opponentShips, []);
  state = fire(freeze(state), 99); assert.equal(state.currentPlayerId, 'b'); assert.equal(state.lastShot.result, 'miss');
  state = fire(freeze(state), 99); assert.equal(state.currentPlayerId, 'a');
  view = engine.getPlayerView(state, 'b'); assert.equal(view.targetBoard[99], 'miss');
  assert.equal(view.targetBoard.filter(value => value !== 'unknown').length, 1);
});

test('Schiffe: versenkte Schiffe werden exakt getrennt; Nachbarfelder bleiben unmarkiert', () => {
  let state = battle('b');
  for (const cell of cellsA[0]) state = fire(freeze(state), cell);
  const view = engine.getPlayerView(state, 'b');
  assert.equal(state.lastShot.result, 'sunk'); assert.equal(state.currentPlayerId, 'b');
  assert.deepEqual(view.opponentShips, [{ index: 0, cells: cellsA[0], sunk: true }]);
  assert.equal(view.remaining.opponent, 4);
  assert.equal(view.targetBoard[3], 'unknown'); // direkt angrenzendes, noch ungetroffenes 4er-Schiff
  assert.equal(view.targetBoard[9], 'unknown'); // Wasser wird ebenfalls nicht automatisch markiert
  assert.equal(view.targetBoard.filter(value => value !== 'unknown').length, 5);
});

test('Schiffe: letzter Treffer gewinnt, keine weiteren Aktionen und Flottenaufdeckung erst am Ende', () => {
  for (const start of ['a','b']) {
    let state = battle(start); const targets = start === 'a' ? cellsB : cellsA;
    for (const cell of targets.flat()) state = fire(freeze(state), cell);
    assert.deepEqual(state.status, { type: 'won', winnerPlayerId: start });
    assert.equal(state.phase, 'finished'); assert.equal(state.currentPlayerId, null);
    const loser = start === 'a' ? 'b' : 'a', view = engine.getPlayerView(state, loser);
    assert.equal(view.opponentShips.length, 5); assert.equal(view.targetBoard.filter(value => value === 'ship').length, 17);
    assert.equal(engine.getPlayerView(state, start).remaining.opponent, 0);
    assert.throws(() => fire(state, 98, start)); assert.throws(() => place(state, loser, fleetA));
  }
});

test('Schiffe: strikte Aktionen, falscher Zug, doppelte Schüsse, keine Schüsse vor Platzierung', () => {
  assert.throws(() => fire(initial(), 0, 'a'));
  const state = freeze(battle()), before = structuredClone(state);
  for (const action of [null, [], {}, { kind: 'fire' }, { cell: 0 }, { kind: 'drop', cell: 0 },
    { kind: 'fire', cell: 0, extra: true }, ...[-1,100,NaN,Infinity,'0',null,true,1.5].map(cell => ({ kind: 'fire', cell }))]) {
    assert.throws(() => engine.handleAction(state, 'a', action)); assert.deepEqual(state, before);
  }
  assert.throws(() => fire(state, 0, 'b')); assert.throws(() => fire(state, 0, 'unknown'));
  const hit = freeze(fire(state, 57)); assert.throws(() => fire(hit, 57)); assert.equal(hit.players[0].shots.length, 1);
  const miss = fire(state, 99); const back = freeze(fire(miss, 99)); assert.throws(() => fire(back, 99));
});

test('Schiffe: eigene JSON-Ansichten und Ergebnisdaten sind unabhängige Kopien', () => {
  const state = freeze(fire(battle(), 57)), before = structuredClone(state);
  const view = engine.getPlayerView(state, 'a'); assert.deepEqual(JSON.parse(JSON.stringify(view)), view);
  view.ownShips[0].cells[0] = 99; view.targetBoard[57] = 'miss'; view.lastShot.cell = 1; view.fleetSizes[0] = 1;
  engine.getStatus(state).type = 'draw'; assert.deepEqual(state, before);
});

test('Schiffe: gleichzeitige Erstplatzierung ist unabhängig, Schüsse und Änderungen bleiben strikt', () => {
  const first = place(initial(), 'a', fleetA), action = { kind: 'placeFleet', ships: fleetB };
  assert.equal(engine.canApplyStaleAction(freeze(first), 'b', action), true);
  assert.equal(engine.canApplyStaleAction(first, 'a', action), false);
  assert.equal(engine.canApplyStaleAction(first, 'unknown', action), false);
  assert.equal(engine.canApplyStaleAction(first, 'b', { ...action, extra: true }), false);
  assert.equal(engine.canApplyStaleAction(first, 'b', { kind: 'fire', cell: 0 }), false);
  assert.equal(engine.canApplyStaleAction(battle(), 'b', action), false);
});

test('Platzierungshilfe: gültige zufällige Flotten werden vom Server akzeptiert und Touching nicht blockiert', () => {
  let seed = 19763;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let run = 0; run < 80; run++) {
    const fleet = randomFleet(random); assert.equal(completeFleet(fleet), true);
    assert.doesNotThrow(() => place(initial(), 'a', fleet));
  }
  assert.equal(completeFleet(fleetA), true); assert.equal(canPlace(fleetA, 1, fleetA[1]), true);
  assert.equal(completeFleet(Array(5).fill(null)), false);
  assert.equal(canPlace(fleetA, 1, { cell: 1, rotation: 0 }), false);
  assert.equal(placementCells(0, { cell: 99, rotation: 0 }), null);
});
