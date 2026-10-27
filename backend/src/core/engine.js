import { fail } from '../protocol/errors.js';
import { exactKeys, isObject } from '../protocol/messages.js';

// Prüft verlustfreie JSON-Daten, auch undefined, NaN, Prototypen und Zyklen.
export function jsonClone(value) {
  const seen = new Set();
  function visit(item) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (typeof item !== 'object' || seen.has(item)) throw new Error('Non-JSON value');
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype) throw new Error('Non-JSON object');
    seen.add(item);
    if (Array.isArray(item)) {
      for (let i = 0; i < item.length; i++) {
        if (!Object.hasOwn(item, i)) throw new Error('Sparse array');
        visit(item[i]);
      }
    } else for (const entry of Object.values(item)) visit(entry);
    seen.delete(item);
  }
  visit(value);
  return JSON.parse(JSON.stringify(value));
}
export function assertEngine(engine) {
  if (!engine || typeof engine.id !== 'string' || !/^[a-z0-9-]+$/.test(engine.id) ||
      typeof engine.version !== 'string' || !engine.version ||
      !Number.isSafeInteger(engine.minPlayers) || !Number.isSafeInteger(engine.maxPlayers) ||
      engine.minPlayers < 1 || engine.maxPlayers < engine.minPlayers ||
      !['validateConfig', 'createInitialState', 'handleAction', 'getPlayerView', 'getStatus'].every(k => typeof engine[k] === 'function')) {
    throw new Error('Invalid engine contract');
  }
  return engine;
}
export function validatedConfig(engine, config) {
  try {
    if (!isObject(config) || engine.validateConfig(jsonClone(config)) !== true) fail('INVALID_CONFIG');
    return jsonClone(config);
  } catch { fail('INVALID_CONFIG'); }
}
export function checkedState(engine, value, participants) {
  const state = jsonClone(value);
  const status = jsonClone(engine.getStatus(jsonClone(state)));
  if (!exactKeys(status, status.type === 'won' ? ['type', 'winnerPlayerId'] : ['type']) ||
      !['running', 'won', 'draw', 'aborted'].includes(status.type) ||
      (status.type === 'won' && !participants.some(p => p.playerId === status.winnerPlayerId))) {
    throw new Error('Invalid engine status');
  }
  return { state, status };
}
export function initialMatch(engine, players, config, context) {
  const result = checkedState(engine, engine.createInitialState(jsonClone(players), jsonClone(config), jsonClone(context)), players);
  if (result.status.type !== 'running') throw new Error('Initial state must be running');
  return result;
}
export function applyAction(engine, match, playerId, action) {
  let next;
  try { next = engine.handleAction(jsonClone(match.state), playerId, jsonClone(action)); }
  catch { fail('INVALID_ACTION'); }
  return checkedState(engine, next, match.participants);
}
export function playerView(engine, match, playerId) {
  return jsonClone(engine.getPlayerView(jsonClone(match.state), playerId));
}
