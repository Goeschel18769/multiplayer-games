import { assertEngine } from '../core/engine.js';
import { fail } from '../protocol/errors.js';
import { ticTacToe } from './tic-tac-toe.js';

export function createRegistry(engines) {
  const registry = new Map();
  for (const engine of engines) {
    assertEngine(engine);
    if (registry.has(engine.id)) throw new Error('Duplicate engine');
    registry.set(engine.id, engine);
  }
  return Object.freeze({
    get(id) { const engine = registry.get(id); if (!engine) fail('UNKNOWN_GAME'); return engine; },
    list() { return [...registry.values()].map(({ id, version, minPlayers, maxPlayers }) => ({ id, version, minPlayers, maxPlayers })); },
  });
}
// Produktive Engines; Test-Fixtures werden nur in getrennten Test-Workern registriert.
export const registry = createRegistry([ticTacToe]);
