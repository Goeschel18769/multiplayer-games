import { mountTicTacToe } from './tic-tac-toe.js';

const games = new Map([
  ['tic-tac-toe', { title: 'Tic Tac Toe', version: '1', mount: mountTicTacToe }],
]);
export const gamePresentation = id => games.get(id) || null;
export const supportedGame = game => gamePresentation(game.id)?.version === game.version;
