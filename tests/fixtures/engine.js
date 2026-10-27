import { createRegistry } from '../../backend/src/games/registry.js';

// Ausschließlich im Test-Einstiegspunkt importiert; keine Produktionsregistrierung.
export const fixtureEngine = {
  id: 'fixture', version: '1', minPlayers: 2, maxPlayers: 4,
  validateConfig(config) { return Object.keys(config).every(k => k === 'viewFailure') && (config.viewFailure === undefined || typeof config.viewFailure === 'boolean'); },
  createInitialState(players, config, context) {
    return { players: players.map(p => p.playerId), startingPlayerId: context.startingPlayerId,
      secrets: Object.fromEntries(players.map((p, i) => [p.playerId, `PRIVATE-${i}-${p.playerId}`])),
      moves: 0, status: { type: 'running' }, viewFailure: config.viewFailure ?? false };
  },
  handleAction(state, playerId, action) {
    if (action.kind === 'invalid') { state.moves = 999; throw new Error('secret engine failure'); }
    if (action.kind === 'step') state.moves++;
    else if (action.kind === 'win') state.status = { type: 'won', winnerPlayerId: playerId };
    else if (action.kind === 'draw') state.status = { type: 'draw' };
    else if (action.kind === 'aborted') state.status = { type: 'aborted' };
    else if (action.kind === 'bad-winner') state.status = { type: 'won', winnerPlayerId: 'outsider' };
    else throw new Error('Invalid action');
    return state;
  },
  getPlayerView(state, playerId) {
    if (state.viewFailure) throw new Error('private engine data');
    return { moves: state.moves, secret: state.secrets[playerId] ?? null };
  },
  getStatus(state) { return state.status; },
};
export const fixtureRegistry = createRegistry([fixtureEngine]);
