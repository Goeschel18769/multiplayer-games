import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlayerName, normalizeRoomCode } from '../../shared/normalization.js';
import { parseMessage } from '../../backend/src/protocol/messages.js';
import { jsonClone, assertEngine, validatedConfig, initialMatch, applyAction, checkedState, playerView } from '../../backend/src/core/engine.js';
import { registry, createRegistry } from '../../backend/src/games/registry.js';
import { fixtureEngine } from '../fixtures/engine.js';
import { SETTINGS } from '../../shared/settings.js';

const rejectsCode = (fn, code) => assert.throws(fn, e => e.code === code);
test('NFC, Anzeigeform, gemeinsame Namensidentität, Unicode-Codepoints', () => {
  for (const name of ['Ben', 'ben', 'BEN', ' Ben ']) assert.equal(normalizePlayerName(name).nameKey, 'ben');
  assert.deepEqual(normalizePlayerName('  Be\u0301n_7-李  '), { displayName: 'Bén_7-李', nameKey: 'bén_7-李' });
  assert.equal(normalizePlayerName('𐐀'.repeat(32)).displayName.length, 64);
  for (const name of ['', ' ', 'a'.repeat(33), 'a\nb', '\tBen', 'a\u007fb', 'a/b', '🙂', 'a\u00a0b', 'a\u200bb', null, 4]) rejectsCode(() => normalizePlayerName(name), 'INVALID_NAME');
});
test('Raumcode normalisieren, unzulässige Zeichen nie entfernen', () => {
  assert.equal(normalizeRoomCode(' joel-ben '), 'JOEL-BEN');
  for (const code of ['ab', '-abc', 'a_b', 'a b', 'a/b', 'a'.repeat(33), null]) rejectsCode(() => normalizeRoomCode(code), 'INVALID_ROOM_CODE');
});
test('Zentrale Fristen und Produktionsregistry', () => {
  assert.equal(SETTINGS.emptyRoomTtlMs, 300000);
  assert.equal(SETTINGS.heartbeatIntervalMs, 25000);
  assert.equal(SETTINGS.connectionTimeoutMs, 120000);
  assert.deepEqual(registry.list(), [{ id: 'tic-tac-toe', version: '1', minPlayers: 2, maxPlayers: 2 }]);
  rejectsCode(() => registry.get('fixture'), 'UNKNOWN_GAME');
});
test('Alle Client-Schemas, strikte Kennungen und tatsächliche UTF-8-Bytes', () => {
  const messages = [
    { v: 1, type: 'ping' }, { v: 1, type: 'ready', requestId: 'r1', ready: true },
    { v: 1, type: 'start', requestId: 'r2' },
    { v: 1, type: 'action', requestId: 'r3', matchId: 'm1', expectedRevision: 0, action: {} },
    { v: 1, type: 'rematch', requestId: 'r4', matchId: 'm1' },
    { v: 1, type: 'abort', requestId: 'r5', matchId: 'm1' },
  ];
  for (const m of messages) assert.deepEqual(parseMessage(JSON.stringify(m)), m);
  for (const raw of ['null', '[]', '{', '{}', '{"v":1,"type":["start"],"requestId":"r"}', '{"v":1,"type":"toString"}', '{"v":2,"type":"ping"}', JSON.stringify({ ...messages[3], playerId: 'spoof' }), JSON.stringify({ ...messages[3], expectedRevision: -1 }), JSON.stringify({ ...messages[1], ready: 1 }), JSON.stringify({ ...messages[2], requestId: '' }), new ArrayBuffer(2)]) rejectsCode(() => parseMessage(raw), 'INVALID_MESSAGE');
  rejectsCode(() => parseMessage(JSON.stringify({ ...messages[3], action: { value: 'é'.repeat(9000) } })), 'MESSAGE_TOO_LARGE');
});
test('Synchroner Engine-Vertrag und verlustfreie JSON-Daten', () => {
  assert.equal(assertEngine(fixtureEngine), fixtureEngine);
  for (const engine of [{ ...fixtureEngine, maxPlayers: 1 }, { ...fixtureEngine, getStatus: null }]) assert.throws(() => assertEngine(engine));
  assert.throws(() => createRegistry([fixtureEngine, fixtureEngine]));
  for (const value of [undefined, NaN, Infinity, { a: undefined }, new Date(), Promise.resolve(1), [, 1]]) assert.throws(() => jsonClone(value));
  const cycle = {}; cycle.self = cycle; assert.throws(() => jsonClone(cycle));
  rejectsCode(() => validatedConfig(fixtureEngine, { bad: true }), 'INVALID_CONFIG');
  rejectsCode(() => validatedConfig({ ...fixtureEngine, validateConfig: async () => true }, {}), 'INVALID_CONFIG');
});
test('Initialisierung, kopierte Aktionen, Gewinnerprüfung, private Ansichten', () => {
  const participants = [{ playerId: 'p1' }, { playerId: 'p2' }];
  const result = initialMatch(fixtureEngine, participants, {}, { matchId: 'm1', startingPlayerId: 'p1' });
  const match = { ...result, participants };
  rejectsCode(() => applyAction(fixtureEngine, match, 'p1', { kind: 'invalid' }), 'INVALID_ACTION');
  assert.equal(match.state.moves, 0);
  assert.equal(applyAction(fixtureEngine, match, 'p1', { kind: 'step' }).state.moves, 1);
  assert.throws(() => applyAction(fixtureEngine, match, 'p1', { kind: 'bad-winner' }));
  assert.throws(() => checkedState(fixtureEngine, { ...match.state, status: { type: 'surprise' } }, participants));
  assert.throws(() => initialMatch({ ...fixtureEngine, createInitialState: async () => ({}) }, participants, {}, {}));
  const view = playerView(fixtureEngine, match, 'p1');
  assert.equal(view.secret, 'PRIVATE-0-p1');
  assert.ok(!JSON.stringify(view).includes('PRIVATE-1-p2'));
});
