import { TTT_MODES } from './tic-tac-toe-modes.js';

function modeFor(room, view, fallback) {
  if (view?.mode !== undefined) return TTT_MODES[view.mode] || null;
  if (view?.board?.length === 225) return TTT_MODES.five;
  if (room.config?.mode !== undefined) return TTT_MODES[room.config.mode] || null;
  if (room.config || view?.board?.length === 9) return TTT_MODES.classic;
  return TTT_MODES[fallback] || TTT_MODES.classic;
}
function validView(view, mode, playerId) {
  if (!view || !mode || (view.boardSize !== undefined && view.boardSize !== mode.boardSize) ||
      (view.winLength !== undefined && view.winLength !== mode.winLength) ||
      !Array.isArray(view.board) || view.board.length !== mode.boardSize ** 2 ||
      !view.board.every(value => value === null || value === 'X' || value === 'O') ||
      !Array.isArray(view.symbols) || view.symbols.length !== 2 ||
      !view.symbols.every(player => player && typeof player.playerId === 'string' && ['X', 'O'].includes(player.symbol)) ||
      new Set(view.symbols.map(player => player.playerId)).size !== 2 ||
      new Set(view.symbols.map(player => player.symbol)).size !== 2 ||
      view.symbols.find(player => player.playerId === playerId)?.symbol !== view.yourSymbol) return false;
  const inBounds = cell => Number.isInteger(cell) && cell >= 0 && cell < view.board.length;
  return (view.lastMove === undefined || view.lastMove === null || inBounds(view.lastMove)) &&
    (view.currentPlayerId === null || view.symbols.some(player => player.playerId === view.currentPlayerId)) &&
    (view.winningLine === null || (Array.isArray(view.winningLine) &&
      view.winningLine.length >= mode.winLength && view.winningLine.every(inBounds)));
}

// Rendert ausschließlich Serveransichten. Gewinner, Zugrecht und Regeln bleiben im Backend.
export function mountTicTacToe(root, act, options = {}) {
  const element = (tag, className, text) => {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  };
  const game = element('div', 'ttt-game');
  const playerBar = element('div', 'ttt-player-bar');
  playerBar.setAttribute('aria-label', 'Symbole und Spieler');
  const playerCards = ['X', 'O'].map(symbol => {
    const card = element('div', 'ttt-player');
    const mark = element('span', 'ttt-mark');
    mark.dataset.symbol = symbol;
    mark.setAttribute('aria-hidden', 'true');
    const copy = element('div', 'ttt-player-copy');
    const name = element('span', 'ttt-player-name');
    const caption = element('span', 'ttt-player-caption');
    copy.append(name, caption);
    const dot = element('span', 'ttt-turn-dot');
    dot.setAttribute('aria-hidden', 'true');
    card.append(mark, copy, dot);
    playerBar.append(card);
    return { card, name, caption };
  });
  const status = element('p', 'ttt-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const viewport = element('div', 'ttt-viewport');
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', 'Spielfeld');
  const shell = element('div', 'ttt-board-shell');
  const board = element('div', 'ttt-board');
  board.setAttribute('role', 'grid');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'ttt-winning-trace');
  svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(line);
  svg.hidden = true;
  shell.append(board, svg);
  viewport.append(shell);
  const hint = element('p', 'ttt-pan-hint', 'Zum Verschieben wischen.');
  game.append(playerBar, status, viewport, hint);
  root.replaceChildren(game);

  let size = 0;
  let focusCell = 0;
  let cells = [];
  let marks = [];
  let values = [];
  let allowed = false;
  const tabStops = () => cells.forEach((cell, index) => { cell.tabIndex = index === focusCell ? 0 : -1; });
  function moveFocus(event, cell) {
    const row = Math.floor(cell / size), column = cell % size;
    let next = cell;
    if (event.key === 'ArrowLeft') next = row * size + Math.max(0, column - 1);
    else if (event.key === 'ArrowRight') next = row * size + Math.min(size - 1, column + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, row - 1) * size + column;
    else if (event.key === 'ArrowDown') next = Math.min(size - 1, row + 1) * size + column;
    else if (event.key === 'Home') next = event.ctrlKey || event.metaKey ? 0 : row * size;
    else if (event.key === 'End') next = event.ctrlKey || event.metaKey ? size ** 2 - 1 : row * size + size - 1;
    else return;
    event.preventDefault();
    focusCell = next;
    tabStops();
    cells[next].focus({ preventScroll: true });
    cells[next].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  }
  function resize(nextSize) {
    if (size === nextSize) return;
    size = nextSize;
    focusCell = Math.floor(size / 2) * size + Math.floor(size / 2);
    cells = []; marks = [];
    board.replaceChildren();
    game.dataset.size = String(size);
    board.dataset.size = String(size);
    board.style.setProperty('--board-size', String(size));
    board.setAttribute('aria-label', `Tic Tac Toe, ${size} Zeilen mit je ${size} Feldern`);
    board.setAttribute('aria-rowcount', String(size));
    board.setAttribute('aria-colcount', String(size));
    for (let row = 0; row < size; row++) {
      const rowElement = element('div', 'ttt-row');
      rowElement.setAttribute('role', 'row');
      for (let column = 0; column < size; column++) {
        const index = row * size + column;
        const button = element('button', 'ttt-cell');
        button.type = 'button';
        button.setAttribute('role', 'gridcell');
        button.setAttribute('aria-rowindex', String(row + 1));
        button.setAttribute('aria-colindex', String(column + 1));
        const mark = element('span', 'ttt-mark');
        mark.setAttribute('aria-hidden', 'true');
        button.append(mark);
        button.addEventListener('click', () => {
          focusCell = index;
          tabStops();
          if (allowed && values[index] === null) act({ kind: 'place', cell: index });
        });
        button.addEventListener('focus', () => { focusCell = index; tabStops(); });
        button.addEventListener('keydown', event => moveFocus(event, index));
        cells.push(button); marks.push(mark); rowElement.append(button);
      }
      board.append(rowElement);
    }
    tabStops();
  }

  return {
    render({ snapshot, playerId, canMutate }) {
      const { room, view } = snapshot;
      const mode = modeFor(room, view, options.mode);
      const valid = validView(view, mode, playerId);
      const lobby = room.status.type === 'lobby';
      resize(mode?.boardSize || 3);
      game.dataset.phase = room.status.type;
      game.dataset.interactive = String(Boolean(valid && canMutate && room.status.type === 'running' && view.currentPlayerId === playerId));
      hint.hidden = size !== 15;
      playerBar.hidden = !valid;
      viewport.hidden = !mode || (!lobby && !valid);
      const nameFor = id => room.players.find(player => player.playerId === id)?.displayName || 'Mitspieler';
      allowed = valid && canMutate && room.status.type === 'running' &&
        room.participants.includes(playerId) && view.currentPlayerId === playerId;
      values = valid ? view.board : Array(size ** 2).fill(null);
      if (lobby) status.textContent = '';
      else if (!valid) status.textContent = 'Spielansicht nicht verfügbar. Bitte erneut verbinden.';
      else {
        if (!canMutate) status.textContent = room.status.type === 'running' ? 'Spielstand wird abgeglichen …' : '';
        else if (room.status.type === 'running') status.textContent = view.currentPlayerId === playerId ? 'Du bist am Zug.' : `${nameFor(view.currentPlayerId)} ist am Zug.`;
        else status.textContent = '';
        if (room.status.type === 'won') status.textContent = `${nameFor(room.status.winnerPlayerId)} gewinnt.`;
        if (room.status.type === 'draw') status.textContent = 'Unentschieden.';
        if (room.status.type === 'aborted') status.textContent = 'Runde beendet.';
        if (room.rematchVotes.length) status.textContent += ` Noch einmal: ${room.rematchVotes.length} von ${room.participants.length}.`;
        playerCards.forEach(({ card, name, caption }, index) => {
          const symbol = index === 0 ? 'X' : 'O';
          const player = view.symbols.find(item => item.symbol === symbol);
          name.textContent = nameFor(player.playerId);
          caption.textContent = symbol;
          card.dataset.active = String(room.status.type === 'running' && view.currentPlayerId === player.playerId);
          card.dataset.winner = String(room.status.type === 'won' && room.status.winnerPlayerId === player.playerId);
        });
      }
      status.hidden = !status.textContent;
      const winning = valid && room.status.type === 'won' ? view.winningLine : null;
      cells.forEach((button, cell) => {
        const value = values[cell];
        const last = valid && view.lastMove === cell;
        button.dataset.value = value || '';
        button.dataset.last = String(last);
        button.dataset.winning = String(Boolean(winning?.includes(cell)));
        button.setAttribute('aria-disabled', String(!allowed || value !== null));
        button.setAttribute('aria-label', `Zeile ${Math.floor(cell / size) + 1}, Spalte ${cell % size + 1}, ${value || 'leer'}${last ? ', letzter Zug' : ''}`);
        marks[cell].dataset.symbol = value || '';
      });
      // Nur die vom Server übermittelte Gewinnlinie zeichnen; keine Gewinnerberechnung.
      svg.hidden = !winning?.length;
      svg.style.display = winning?.length ? '' : 'none';
      if (winning?.length) {
        const first = winning[0], last = winning.at(-1);
        const position = cell => ({ x: (cell % size + .5) * 100 / size, y: (Math.floor(cell / size) + .5) * 100 / size });
        const from = position(first), to = position(last);
        for (const [key, value] of Object.entries({ x1: from.x, y1: from.y, x2: to.x, y2: to.y })) line.setAttribute(key, String(value));
        svg.dataset.symbol = values[first];
      }
    },
  };
}
