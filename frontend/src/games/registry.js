import { mountTicTacToe } from './tic-tac-toe.js';
import { TTT_MODES } from './tic-tac-toe-modes.js';

const games = new Map([
  ['tic-tac-toe', { title: 'Tic Tac Toe', version: '1', roomCode: TTT_MODES.classic.roomCode, modes: TTT_MODES, mount: mountTicTacToe }],
]);
export const gamePresentation = id => games.get(id) || null;
export const supportedGame = game => gamePresentation(game.id)?.version === game.version;

export function supportedMode(game, modeId) {
  if (!game || !supportedGame(game)) return false;
  const mode = gamePresentation(game.id)?.modes?.[modeId];
  if (!mode) return false;
  // Klassisch bleibt mit dem bisherigen Backend ohne Modus-Metadaten kompatibel.
  return modeId === 'classic' || Array.isArray(game.modes) && game.modes.some(candidate =>
    candidate?.id === mode.id && candidate.boardSize === mode.boardSize && candidate.winLength === mode.winLength);
}
