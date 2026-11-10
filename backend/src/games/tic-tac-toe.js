const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
const plainObject = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const MODES = Object.freeze([
  Object.freeze({ id: 'classic', boardSize: 3, winLength: 3 }),
  Object.freeze({ id: 'five', boardSize: 15, winLength: 5 }),
]);
const modeSettings = mode => MODES.find(settings => settings.id === mode) ?? MODES[0];

function fiveInARow(board, cell, symbol, size, winLength) {
  const row = Math.floor(cell / size), column = cell % size;
  for (const [rowStep, columnStep] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const line = [cell];
    for (const direction of [-1, 1]) {
      let r = row + rowStep * direction, c = column + columnStep * direction;
      while (r >= 0 && r < size && c >= 0 && c < size && board[r * size + c] === symbol) {
        if (direction === -1) line.unshift(r * size + c);
        else line.push(r * size + c);
        r += rowStep * direction;
        c += columnStep * direction;
      }
    }
    if (line.length >= winLength) return line;
  }
  return null;
}

export const ticTacToe = {
  id: 'tic-tac-toe',
  version: '1',
  minPlayers: 2,
  maxPlayers: 2,
  modes: MODES,
  validateConfig(config) {
    if (!plainObject(config)) return false;
    const keys = Reflect.ownKeys(config);
    return keys.length === 0 || (keys.length === 1 && keys[0] === 'mode' && MODES.some(mode => mode.id === config.mode));
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
    const { id: mode, boardSize, winLength } = modeSettings(config.mode);
    return {
      mode, boardSize, winLength,
      board: Array(boardSize * boardSize).fill(null),
      symbols: [{ playerId: startingPlayerId, symbol: 'X' }, { playerId: other.playerId, symbol: 'O' }],
      currentPlayerId: startingPlayerId,
      winningLine: null,
      lastMove: null,
      status: { type: 'running' },
    };
  },
  handleAction(state, playerId, action) {
    // Version-1-Zustände vor der Moduserweiterung sind klassische 3×3-Partien.
    const { id: mode, boardSize, winLength } = modeSettings(state.mode);
    if (!plainObject(action) || Reflect.ownKeys(action).length !== 2 ||
        !Object.hasOwn(action, 'kind') || !Object.hasOwn(action, 'cell') || action.kind !== 'place' ||
        !Number.isInteger(action.cell) || action.cell < 0 || action.cell >= boardSize * boardSize) {
      throw new Error('Invalid placement');
    }
    const own = state.symbols.find(p => p.playerId === playerId);
    if (!own || state.status.type !== 'running' || state.currentPlayerId !== playerId || state.board[action.cell] !== null) {
      throw new Error('Placement not allowed');
    }
    const board = [...state.board];
    board[action.cell] = own.symbol;
    const line = mode === 'classic'
      ? WINNING_LINES.find(cells => cells.every(cell => board[cell] === own.symbol))
      : fiveInARow(board, action.cell, own.symbol, boardSize, winLength);
    // Sieg hat Vorrang, insbesondere beim letzten freien Feld.
    const status = line ? { type: 'won', winnerPlayerId: playerId }
      : board.every(cell => cell !== null) ? { type: 'draw' } : { type: 'running' };
    return {
      mode, boardSize, winLength,
      board,
      symbols: state.symbols.map(p => ({ ...p })),
      currentPlayerId: status.type === 'running' ? state.symbols.find(p => p.playerId !== playerId).playerId : null,
      winningLine: line ? [...line] : null,
      lastMove: action.cell,
      status,
    };
  },
  getPlayerView(state, playerId) {
    const own = state.symbols.find(p => p.playerId === playerId);
    if (!own) throw new Error('Unknown player');
    const { id: mode, boardSize, winLength } = modeSettings(state.mode);
    return {
      mode, boardSize, winLength,
      board: [...state.board],
      symbols: state.symbols.map(p => ({ ...p })),
      yourSymbol: own.symbol,
      currentPlayerId: state.currentPlayerId,
      winningLine: state.winningLine ? [...state.winningLine] : null,
      lastMove: state.lastMove ?? null,
    };
  },
  getStatus(state) { return { ...state.status }; },
};
