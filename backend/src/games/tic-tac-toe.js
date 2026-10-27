const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
const plainObject = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

export const ticTacToe = {
  id: 'tic-tac-toe',
  version: '1',
  minPlayers: 2,
  maxPlayers: 2,
  validateConfig(config) {
    return plainObject(config) && Reflect.ownKeys(config).length === 0;
  },
  createInitialState(players, config, context) {
    if (!this.validateConfig(config) || !Array.isArray(players) || players.length !== 2 ||
        players.some(p => typeof p?.playerId !== 'string' || !p.playerId) ||
        players[0].playerId === players[1].playerId ||
        !players.some(p => p.playerId === context?.startingPlayerId)) {
      throw new Error('Invalid Tic Tac Toe initialization');
    }
    const startingPlayerId = context.startingPlayerId;
    const other = players.find(p => p.playerId !== startingPlayerId);
    return {
      board: Array(9).fill(null),
      symbols: [{ playerId: startingPlayerId, symbol: 'X' }, { playerId: other.playerId, symbol: 'O' }],
      currentPlayerId: startingPlayerId,
      winningLine: null,
      status: { type: 'running' },
    };
  },
  handleAction(state, playerId, action) {
    if (!plainObject(action) || Reflect.ownKeys(action).length !== 2 ||
        !Object.hasOwn(action, 'kind') || !Object.hasOwn(action, 'cell') || action.kind !== 'place' ||
        !Number.isInteger(action.cell) || action.cell < 0 || action.cell > 8) {
      throw new Error('Invalid placement');
    }
    const own = state.symbols.find(p => p.playerId === playerId);
    if (!own || state.status.type !== 'running' || state.currentPlayerId !== playerId || state.board[action.cell] !== null) {
      throw new Error('Placement not allowed');
    }
    const board = [...state.board];
    board[action.cell] = own.symbol;
    const line = WINNING_LINES.find(cells => cells.every(cell => board[cell] === own.symbol));
    // Sieg hat Vorrang, insbesondere beim letzten freien Feld.
    const status = line ? { type: 'won', winnerPlayerId: playerId }
      : board.every(cell => cell !== null) ? { type: 'draw' } : { type: 'running' };
    return {
      board,
      symbols: state.symbols.map(p => ({ ...p })),
      currentPlayerId: status.type === 'running' ? state.symbols.find(p => p.playerId !== playerId).playerId : null,
      winningLine: line ? [...line] : null,
      status,
    };
  },
  getPlayerView(state, playerId) {
    const own = state.symbols.find(p => p.playerId === playerId);
    if (!own) throw new Error('Unknown player');
    return {
      board: [...state.board],
      symbols: state.symbols.map(p => ({ ...p })),
      yourSymbol: own.symbol,
      currentPlayerId: state.currentPlayerId,
      winningLine: state.winningLine ? [...state.winningLine] : null,
    };
  },
  getStatus(state) { return { ...state.status }; },
};
