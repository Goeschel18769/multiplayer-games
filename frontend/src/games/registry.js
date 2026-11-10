import { mountTicTacToe } from './tic-tac-toe.js';
import { TTT_MODES } from './tic-tac-toe-modes.js';
import { mountConnectFour } from './connect-four.js';
import { mountBattleship } from './battleship.js';

const games = new Map([
  ['tic-tac-toe', { title: 'Tic Tac Toe', version: '1', roomCode: TTT_MODES.classic.roomCode, modes: TTT_MODES, mount: mountTicTacToe }],
  ['connect-four', { title: '4 Gewinnt', version: '1', roomCode: 'BEN-JOEL-C4', config: Object.freeze({}), mount: mountConnectFour }],
  ['battleship', { title: 'Schiffe versenken', version: '1', roomCode: 'BEN-JOEL-SHIPS', config: Object.freeze({}), mount: mountBattleship }],
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
