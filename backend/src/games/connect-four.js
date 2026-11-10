const ROWS = 6, COLUMNS = 7, WIN_LENGTH = 4;
const plainObject = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

function winningRun(board, cell, color) {
  const row = Math.floor(cell / COLUMNS), column = cell % COLUMNS;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const line = [cell];
    for (const direction of [-1, 1]) {
      let r = row + dr * direction, c = column + dc * direction;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLUMNS && board[r * COLUMNS + c] === color) {
        if (direction < 0) line.unshift(r * COLUMNS + c);
        else line.push(r * COLUMNS + c);
        r += dr * direction; c += dc * direction;
      }
    }
    if (line.length >= WIN_LENGTH) return line;
  }
  return null;
}

export const connectFour = {
  id: 'connect-four', version: '1', minPlayers: 2, maxPlayers: 2,
  validateConfig(config) { return plainObject(config) && Reflect.ownKeys(config).length === 0; },
  createInitialState(players, config, context) {
    if (!this.validateConfig(config) || !Array.isArray(players) || players.length !== 2 ||
        players.some(player => typeof player?.playerId !== 'string' || !player.playerId) ||
        players[0].playerId === players[1].playerId || !players.some(player => player.playerId === context?.startingPlayerId)) {
      throw new Error('Invalid Connect Four initialization');
    }
    const first = context.startingPlayerId, second = players.find(player => player.playerId !== first).playerId;
    return {
      rows: ROWS, columns: COLUMNS, winLength: WIN_LENGTH, board: Array(ROWS * COLUMNS).fill(null),
      discs: [{ playerId: first, color: 'umber' }, { playerId: second, color: 'clay' }],
      currentPlayerId: first, winningLine: null, lastMove: null, status: { type: 'running' },
    };
  },
  handleAction(state, playerId, action) {
    if (!plainObject(action) || Reflect.ownKeys(action).length !== 2 ||
        !Object.hasOwn(action, 'kind') || !Object.hasOwn(action, 'column') || action.kind !== 'drop' ||
        !Number.isInteger(action.column) || action.column < 0 || action.column >= COLUMNS) throw new Error('Invalid drop');
    const own = state.discs.find(player => player.playerId === playerId);
    if (!own || state.status.type !== 'running' || state.currentPlayerId !== playerId) throw new Error('Drop not allowed');
    let row = ROWS - 1;
    while (row >= 0 && state.board[row * COLUMNS + action.column] !== null) row--;
    if (row < 0) throw new Error('Column is full');
    const cell = row * COLUMNS + action.column, board = [...state.board];
    board[cell] = own.color;
    const line = winningRun(board, cell, own.color);
    const status = line ? { type: 'won', winnerPlayerId: playerId }
      : board.every(value => value !== null) ? { type: 'draw' } : { type: 'running' };
    return {
      rows: ROWS, columns: COLUMNS, winLength: WIN_LENGTH, board,
      discs: state.discs.map(player => ({ ...player })),
      currentPlayerId: status.type === 'running' ? state.discs.find(player => player.playerId !== playerId).playerId : null,
      winningLine: line ? [...line] : null, lastMove: cell, status,
    };
  },
  getPlayerView(state, playerId) {
    const own = state.discs.find(player => player.playerId === playerId);
    if (!own) throw new Error('Unknown player');
    return {
      rows: ROWS, columns: COLUMNS, winLength: WIN_LENGTH, board: [...state.board],
      discs: state.discs.map(player => ({ ...player })), yourColor: own.color,
      currentPlayerId: state.currentPlayerId, winningLine: state.winningLine ? [...state.winningLine] : null,
      lastMove: state.lastMove,
    };
  },
  getStatus(state) { return { ...state.status }; },
};
