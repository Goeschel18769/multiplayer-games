const SIZE = 10, LENGTHS = [5, 4, 3, 3, 2];
const plainObject = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plainObject(value) && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function cellsFor(index, placement) {
  if (!exact(placement, ['cell', 'rotation']) || !Number.isInteger(placement.cell) || placement.cell < 0 || placement.cell >= SIZE ** 2 ||
      !Number.isInteger(placement.rotation) || placement.rotation < 0 || placement.rotation > 3) throw new Error('Invalid ship placement');
  let offsets = index === 0 ? [[0,0],[0,1],[0,2],[1,0],[2,0]] : Array.from({ length: LENGTHS[index] }, (_, column) => [0, column]);
  for (let turn = 0; turn < placement.rotation; turn++) offsets = offsets.map(([row, column]) => [column, -row]);
  const minRow = Math.min(...offsets.map(([row]) => row)), minColumn = Math.min(...offsets.map(([, column]) => column));
  const row = Math.floor(placement.cell / SIZE), column = placement.cell % SIZE;
  return offsets.map(([r, c]) => {
    const y = row + r - minRow, x = column + c - minColumn;
    if (y >= SIZE || x >= SIZE) throw new Error('Ship outside board');
    return y * SIZE + x;
  }).sort((a, b) => a - b);
}
function fleetFor(placements) {
  if (!Array.isArray(placements) || placements.length !== LENGTHS.length) throw new Error('Incomplete fleet');
  const fleet = placements.map((placement, index) => cellsFor(index, placement));
  if (new Set(fleet.flat()).size !== LENGTHS.reduce((sum, length) => sum + length, 0)) throw new Error('Ships overlap');
  // Berührung ist ausdrücklich erlaubt, auch diagonal und direkt an anderen Schiffen.
  return fleet;
}
const isSunk = (ship, shots) => ship.every(cell => shots.includes(cell));
const remaining = (fleet, shots) => fleet ? fleet.filter(ship => !isSunk(ship, shots)).length : LENGTHS.length;

export const battleship = {
  id: 'battleship', version: '1', minPlayers: 2, maxPlayers: 2,
  validateConfig(config) { return exact(config, []); },
  canApplyStaleAction(state, playerId, action) {
    return state.status.type === 'running' && state.phase === 'placement' &&
      state.players.some(player => player.playerId === playerId && player.fleet === null) &&
      exact(action, ['kind', 'ships']) && action.kind === 'placeFleet';
  },
  createInitialState(players, config, context) {
    if (!this.validateConfig(config) || !Array.isArray(players) || players.length !== 2 ||
        players.some(player => typeof player?.playerId !== 'string' || !player.playerId) ||
        players[0].playerId === players[1].playerId || !players.some(player => player.playerId === context?.startingPlayerId)) {
      throw new Error('Invalid Battleship initialization');
    }
    return {
      phase: 'placement', startingPlayerId: context.startingPlayerId, currentPlayerId: null,
      players: players.map(({ playerId }) => ({ playerId, fleet: null, shots: [] })),
      lastShot: null, status: { type: 'running' },
    };
  },
  handleAction(state, playerId, action) {
    const own = state.players.find(player => player.playerId === playerId);
    if (!own || state.status.type !== 'running') throw new Error('Action not allowed');
    if (exact(action, ['kind', 'ships']) && action.kind === 'placeFleet') {
      if (state.phase !== 'placement' || own.fleet !== null) throw new Error('Fleet already confirmed');
      const fleet = fleetFor(action.ships), next = structuredClone(state);
      next.players.find(player => player.playerId === playerId).fleet = fleet;
      if (next.players.every(player => player.fleet !== null)) {
        next.phase = 'battle'; next.currentPlayerId = state.startingPlayerId;
      }
      return next;
    }
    if (!exact(action, ['kind', 'cell']) || action.kind !== 'fire' || !Number.isInteger(action.cell) ||
        action.cell < 0 || action.cell >= SIZE ** 2 || state.phase !== 'battle' || state.currentPlayerId !== playerId ||
        own.shots.includes(action.cell)) throw new Error('Invalid shot');
    const next = structuredClone(state), shooter = next.players.find(player => player.playerId === playerId);
    const defender = next.players.find(player => player.playerId !== playerId);
    shooter.shots.push(action.cell);
    const ship = defender.fleet.find(cells => cells.includes(action.cell));
    const result = !ship ? 'miss' : isSunk(ship, shooter.shots) ? 'sunk' : 'hit';
    next.lastShot = { playerId, cell: action.cell, result };
    if (remaining(defender.fleet, shooter.shots) === 0) {
      next.phase = 'finished'; next.currentPlayerId = null;
      next.status = { type: 'won', winnerPlayerId: playerId };
    } else next.currentPlayerId = ship ? playerId : defender.playerId;
    return next;
  },
  getPlayerView(state, playerId) {
    const own = state.players.find(player => player.playerId === playerId);
    if (!own) throw new Error('Unknown player');
    const other = state.players.find(player => player.playerId !== playerId);
    const finished = state.phase === 'finished';
    const ships = (fleet, shots, reveal) => (fleet || []).flatMap((cells, index) => {
      const sunk = isSunk(cells, shots);
      return reveal || sunk ? [{ index, cells: [...cells], sunk }] : [];
    });
    const board = (fleet, shots, reveal) => Array.from({ length: SIZE ** 2 }, (_, cell) => {
      const ship = fleet?.find(cells => cells.includes(cell));
      if (shots.includes(cell)) return !ship ? 'miss' : isSunk(ship, shots) ? 'sunk' : 'hit';
      return reveal && ship ? 'ship' : 'unknown';
    });
    // Vor Spielende werden ausschließlich beschossene Felder und versenkte Schiffe offengelegt.
    // Weder Nachbarwasser noch die Positionen ungetroffener gegnerischer Schiffe werden übertragen.
    return {
      boardSize: SIZE, phase: state.phase, fleetSizes: [...LENGTHS],
      yourReady: own.fleet !== null, opponentReady: other.fleet !== null,
      ownBoard: board(own.fleet, other.shots, true), targetBoard: board(other.fleet, own.shots, finished),
      ownShips: ships(own.fleet, other.shots, true), opponentShips: ships(other.fleet, own.shots, finished),
      remaining: { you: remaining(own.fleet, other.shots), opponent: remaining(other.fleet, own.shots) },
      currentPlayerId: state.currentPlayerId, lastShot: state.lastShot ? { ...state.lastShot } : null,
    };
  },
  getStatus(state) { return { ...state.status }; },
};
