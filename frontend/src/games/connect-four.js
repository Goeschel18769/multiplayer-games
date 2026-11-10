const ROWS = 6, COLUMNS = 7;
const colors = ['umber', 'clay'];
const colorName = color => color === 'umber' ? 'Umbra' : 'Terrakotta';

function validView(view, playerId) {
  if (!view || view.rows !== ROWS || view.columns !== COLUMNS || view.winLength !== 4 ||
      !Array.isArray(view.board) || view.board.length !== ROWS * COLUMNS ||
      !view.board.every(value => value === null || colors.includes(value)) ||
      !Array.isArray(view.discs) || view.discs.length !== 2 ||
      !view.discs.every(player => player && typeof player.playerId === 'string' && colors.includes(player.color)) ||
      new Set(view.discs.map(player => player.playerId)).size !== 2 || new Set(view.discs.map(player => player.color)).size !== 2 ||
      view.discs.find(player => player.playerId === playerId)?.color !== view.yourColor) return false;
  const inBounds = cell => Number.isInteger(cell) && cell >= 0 && cell < ROWS * COLUMNS;
  return (view.currentPlayerId === null || view.discs.some(player => player.playerId === view.currentPlayerId)) &&
    (view.lastMove === null || inBounds(view.lastMove)) &&
    (view.winningLine === null || Array.isArray(view.winningLine) && view.winningLine.length >= 4 && view.winningLine.every(inBounds));
}

// Das Brett, die Fallposition und der Gewinner stammen ausschließlich vom Server.
export function mountConnectFour(root, act) {
  const element = (tag, className, text) => {
    const item = document.createElement(tag);
    item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  };
  const game = element('div', 'c4-game');
  const players = element('div', 'c4-players');
  players.setAttribute('aria-label', 'Steine und Spieler');
  const cards = colors.map(color => {
    const card = element('div', 'c4-player');
    const disc = element('span', 'c4-disc');
    disc.dataset.color = color;
    disc.setAttribute('aria-hidden', 'true');
    const copy = element('span', 'c4-player-copy');
    const name = element('span', 'c4-player-name');
    const caption = element('span', 'c4-player-caption', colorName(color));
    const dot = element('span', 'c4-turn-dot');
    dot.setAttribute('aria-hidden', 'true');
    copy.append(name, caption); card.append(disc, copy, dot); players.append(card);
    return { card, name, color };
  });
  const status = element('p', 'c4-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const arena = element('div', 'c4-arena');
  const board = element('div', 'c4-board');
  board.setAttribute('role', 'table');
  board.setAttribute('aria-label', '4 Gewinnt, 6 Reihen und 7 Spalten');
  board.setAttribute('aria-rowcount', '6'); board.setAttribute('aria-colcount', '7');
  const cells = [];
  for (let row = 0; row < ROWS; row++) {
    const rowElement = element('div', 'c4-row');
    rowElement.setAttribute('role', 'row');
    for (let column = 0; column < COLUMNS; column++) {
      const cell = element('div', 'c4-cell');
      cell.setAttribute('role', 'cell');
      cell.setAttribute('aria-rowindex', String(row + 1)); cell.setAttribute('aria-colindex', String(column + 1));
      const disc = element('span', 'c4-disc');
      disc.setAttribute('aria-hidden', 'true');
      cell.append(disc); rowElement.append(cell); cells.push({ cell, disc });
    }
    board.append(rowElement);
  }
  const controls = element('div', 'c4-controls');
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Spalte für den nächsten Stein wählen');
  let allowed = false, values = [], focusColumn = 3, shownMatch = null, shownRevision = null;
  const buttons = [];
  function tabStops() { buttons.forEach((button, column) => { button.tabIndex = column === focusColumn ? 0 : -1; }); }
  for (let column = 0; column < COLUMNS; column++) {
    const button = element('button', 'c4-column');
    button.type = 'button';
    const preview = element('span', 'c4-column-preview');
    preview.setAttribute('aria-hidden', 'true');
    const disc = element('span', 'c4-disc');
    preview.append(disc); button.append(preview);
    button.addEventListener('click', () => {
      focusColumn = column; tabStops();
      if (allowed && values[column] === null) act({ kind: 'drop', column });
    });
    button.addEventListener('focus', () => { focusColumn = column; tabStops(); });
    button.addEventListener('keydown', event => {
      let next = column;
      if (event.key === 'ArrowLeft') next = Math.max(0, column - 1);
      else if (event.key === 'ArrowRight') next = Math.min(COLUMNS - 1, column + 1);
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = COLUMNS - 1;
      else return;
      event.preventDefault(); focusColumn = next; tabStops(); buttons[next].focus();
    });
    buttons.push(button); controls.append(button);
  }
  tabStops();
  arena.append(board, controls);
  const caption = element('p', 'c4-caption', '7 × 6 · 4 in einer Reihe');
  game.append(players, status, arena, caption);
  root.replaceChildren(game);

  return {
    render({ snapshot, playerId, canMutate }) {
      const { room, view, matchId, revision } = snapshot;
      const valid = validView(view, playerId), lobby = room.status.type === 'lobby';
      allowed = valid && canMutate && room.status.type === 'running' && room.participants.includes(playerId) && view.currentPlayerId === playerId;
      values = valid ? view.board : Array(ROWS * COLUMNS).fill(null);
      players.hidden = !valid;
      arena.hidden = !lobby && !valid;
      game.dataset.phase = room.status.type;
      game.dataset.interactive = String(Boolean(allowed));
      game.dataset.color = valid ? view.yourColor : '';
      const nameFor = id => room.players.find(player => player.playerId === id)?.displayName || 'Mitspieler';
      status.textContent = lobby ? '' : !valid ? 'Spielansicht nicht verfügbar. Bitte erneut verbinden.'
        : room.status.type === 'won' ? `${nameFor(room.status.winnerPlayerId)} gewinnt.`
          : room.status.type === 'draw' ? 'Unentschieden.'
            : room.status.type === 'aborted' ? 'Runde beendet.'
              : !canMutate ? 'Spielstand wird abgeglichen …'
                : view.currentPlayerId === playerId ? 'Du bist am Zug.' : `${nameFor(view.currentPlayerId)} ist am Zug.`;
      if (valid && room.rematchVotes.length) status.textContent += ` Noch einmal: ${room.rematchVotes.length} von ${room.participants.length}.`;
      status.hidden = !status.textContent;
      if (valid) cards.forEach(({ card, name, color }) => {
        const player = view.discs.find(player => player.color === color);
        name.textContent = nameFor(player.playerId);
        card.dataset.active = String(room.status.type === 'running' && view.currentPlayerId === player.playerId);
        card.dataset.winner = String(room.status.type === 'won' && room.status.winnerPlayerId === player.playerId);
      });
      // Beim Reconnect oder unveränderten Snapshots fällt kein Stein erneut.
      const animate = valid && shownMatch === matchId && Number.isInteger(shownRevision) && revision === shownRevision + 1 &&
        view.lastMove !== null && cells[view.lastMove].disc.dataset.color !== values[view.lastMove];
      const winning = valid && room.status.type === 'won' ? view.winningLine : null;
      cells.forEach(({ cell, disc }, index) => {
        const value = values[index], row = Math.floor(index / COLUMNS), column = index % COLUMNS;
        cell.setAttribute('aria-label', `Reihe ${row + 1}, Spalte ${column + 1}, ${value ? colorName(value) : 'leer'}${valid && view.lastMove === index ? ', letzter Zug' : ''}`);
        cell.dataset.last = String(valid && view.lastMove === index);
        cell.dataset.winning = String(Boolean(winning?.includes(index)));
        disc.dataset.color = value || '';
        disc.style.setProperty('--fall-distance', String(row + 1));
        const falling = Boolean(animate && view.lastMove === index);
        // Der gleiche letzte Zug behält seine CSS-Animation während eines ausstehenden Acks.
        if (!falling && disc.dataset.falling === 'true' && value && shownMatch === matchId && revision === shownRevision) return;
        disc.dataset.falling = String(falling);
      });
      buttons.forEach((button, column) => {
        const full = valid && values[column] !== null;
        button.dataset.full = String(full);
        button.setAttribute('aria-disabled', String(!allowed || full));
        button.setAttribute('aria-label', `Stein in Spalte ${column + 1} einwerfen${full ? ', Spalte voll' : ''}`);
        button.children[0].children[0].dataset.color = valid ? view.yourColor : '';
      });
      shownMatch = matchId; shownRevision = revision;
    },
  };
}
