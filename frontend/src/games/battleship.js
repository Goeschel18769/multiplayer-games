import { FLEET, shapeOffsets, placementCells, canPlace, completeFleet, randomFleet } from './battleship-placement.js';

const draftCache = new Map(); // Nur eigene Entwürfe, pro Rauminstanz/Partie/Spieler, ausschließlich im Arbeitsspeicher.
const states = ['unknown', 'ship', 'miss', 'hit', 'sunk'];
const coordinate = cell => `${String.fromCharCode(65 + cell % 10)}${Math.floor(cell / 10) + 1}`;
function validView(view, room, playerId) {
  if (!view || view.boardSize !== 10 || !['placement','battle','finished'].includes(view.phase) ||
      JSON.stringify(view.fleetSizes) !== '[5,4,3,3,2]' || typeof view.yourReady !== 'boolean' || typeof view.opponentReady !== 'boolean' ||
      !['ownBoard','targetBoard'].every(key => Array.isArray(view[key]) && view[key].length === 100 && view[key].every(value => states.includes(value))) ||
      !['ownShips','opponentShips'].every(key => Array.isArray(view[key]) && view[key].every(ship => ship &&
        Number.isInteger(ship.index) && ship.index >= 0 && ship.index < 5 && typeof ship.sunk === 'boolean' &&
        Array.isArray(ship.cells) && ship.cells.length === FLEET[ship.index].size && new Set(ship.cells).size === ship.cells.length &&
        ship.cells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < 100)) &&
        new Set(view[key].map(ship => ship.index)).size === view[key].length) ||
      view.ownShips.length !== (view.yourReady ? 5 : 0) ||
      !['you','opponent'].every(key => Number.isInteger(view.remaining?.[key]) && view.remaining[key] >= 0 && view.remaining[key] <= 5) ||
      !room.participants.includes(playerId) ||
      (view.currentPlayerId !== null && !room.participants.includes(view.currentPlayerId))) return false;
  return view.lastShot === null || view.lastShot && room.participants.includes(view.lastShot.playerId) &&
    Number.isInteger(view.lastShot.cell) && view.lastShot.cell >= 0 && view.lastShot.cell < 100 && ['miss','hit','sunk'].includes(view.lastShot.result);
}

export function mountBattleship(root, act) {
  const element = (tag, className, text) => {
    const item = document.createElement(tag); item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  };
  const button = (className, text, handler) => {
    const item = element('button', className, text); item.type = 'button'; item.addEventListener('click', handler); return item;
  };
  const game = element('div', 'bs-game');
  const status = element('p', 'bs-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const placement = element('div', 'bs-placement');
  const pieces = element('div', 'bs-pieces'); pieces.setAttribute('role', 'group'); pieces.setAttribute('aria-label', 'Schiff wählen');
  const pieceButtons = FLEET.map((ship, index) => {
    const item = button('bs-piece', undefined, () => {
      if (!editable) return; selected = index; rotation = draft[index]?.rotation || 0; message = ''; paint();
    });
    item.append(element('span', 'bs-mini'), element('span', 'bs-piece-name', ship.label));
    pieces.append(item); return item;
  });
  const tools = element('div', 'bs-placement-tools');
  const rotate = button('bs-rotate', 'Drehen ↻', rotateSelection);
  const remove = button('text-button bs-remove', 'Entfernen', () => {
    if (!editable || selected === null) return; draft[selected] = null; message = ''; remember(); paint();
  });
  const random = button('bs-random', 'Zufällig platzieren', () => {
    if (!editable) return;
    try { draft = randomFleet(); selected = null; message = ''; remember(); paint(); }
    catch (error) { message = error.message; paint(); }
  });
  const clear = button('text-button bs-clear', 'Leeren', () => {
    if (!editable) return; draft = Array(5).fill(null); selected = 0; rotation = 0; message = ''; remember(); paint();
  });
  tools.append(rotate, remove, random, clear);
  const help = element('p', 'bs-placement-help'); help.setAttribute('role', 'status'); help.setAttribute('aria-live', 'polite');
  placement.append(pieces, tools, help);
  const tabs = element('div', 'bs-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Spielfeld anzeigen');
  const targetTab = button('bs-tab', 'Gegner', () => { activeBoard = 'target'; paint(); });
  const ownTab = button('bs-tab', 'Eigene Flotte', () => { activeBoard = 'own'; paint(); });
  tabs.append(targetTab, ownTab);
  const layout = element('div', 'bs-layout');
  let draft = Array(5).fill(null), selected = 0, rotation = 0, hover = null, message = '', key = null;
  let current = null, editable = false, fireAllowed = false, activeBoard = 'own', previousPhase = null;
  const boards = {};
  for (const kind of ['own', 'target']) {
    const panel = element('section', 'bs-panel'); panel.dataset.board = kind;
    const heading = element('div', 'bs-panel-heading');
    const title = element('h2', 'bs-board-title', kind === 'own' ? 'Eigene Flotte' : 'Gegner');
    const count = element('span', 'bs-fleet-count'); heading.append(title, count);
    const chart = element('div', 'bs-chart'), columns = element('div', 'bs-columns'), rows = element('div', 'bs-rows');
    for (let index = 0; index < 10; index++) { columns.append(element('span', '', String.fromCharCode(65 + index))); rows.append(element('span', '', String(index + 1))); }
    columns.setAttribute('aria-hidden', 'true'); rows.setAttribute('aria-hidden', 'true');
    const grid = element('div', 'bs-grid'); grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', kind === 'own' ? 'Eigene Flotte, 10 mal 10 Felder' : 'Gegnerisches Meer, 10 mal 10 Felder');
    grid.setAttribute('aria-rowcount', '10'); grid.setAttribute('aria-colcount', '10');
    const cells = []; let focusCell = 0;
    const tabStops = () => cells.forEach((cell, index) => { cell.tabIndex = focusCell === index ? 0 : -1; });
    for (let row = 0; row < 10; row++) {
      const rowElement = element('div', 'bs-row'); rowElement.setAttribute('role', 'row');
      for (let column = 0; column < 10; column++) {
        const cell = row * 10 + column;
        const item = button('bs-cell', undefined, () => {
          focusCell = cell; tabStops();
          if (kind === 'target') {
            if (fireAllowed && current.snapshot.view.targetBoard[cell] === 'unknown') act({ kind: 'fire', cell });
          } else placeAt(cell);
        });
        item.setAttribute('role', 'gridcell'); item.setAttribute('aria-rowindex', String(row + 1)); item.setAttribute('aria-colindex', String(column + 1));
        const mark = element('span', 'bs-cell-mark'); mark.setAttribute('aria-hidden', 'true'); item.append(mark);
        item.addEventListener('pointerenter', () => { if (kind === 'own' && editable) { hover = cell; paint(); } });
        item.addEventListener('focus', () => { focusCell = cell; tabStops(); if (kind === 'own' && editable) { hover = cell; paint(); } });
        item.addEventListener('keydown', event => {
          if (kind === 'own' && editable && event.key.toLowerCase() === 'r') { event.preventDefault(); rotateSelection(); return; }
          let next = cell;
          if (event.key === 'ArrowLeft') next = row * 10 + Math.max(0, column - 1);
          else if (event.key === 'ArrowRight') next = row * 10 + Math.min(9, column + 1);
          else if (event.key === 'ArrowUp') next = Math.max(0, row - 1) * 10 + column;
          else if (event.key === 'ArrowDown') next = Math.min(9, row + 1) * 10 + column;
          else if (event.key === 'Home') next = event.ctrlKey || event.metaKey ? 0 : row * 10;
          else if (event.key === 'End') next = event.ctrlKey || event.metaKey ? 99 : row * 10 + 9;
          else return;
          event.preventDefault(); focusCell = next; tabStops(); cells[next].focus({ preventScroll: true });
          cells[next].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        });
        cells.push(item); rowElement.append(item);
      }
      grid.append(rowElement);
    }
    grid.addEventListener('pointerleave', () => { if (kind === 'own' && hover !== null) { hover = null; paint(); } });
    tabStops(); chart.append(columns, rows, grid); panel.append(heading, chart); layout.append(panel);
    boards[kind] = { panel, cells, count };
  }
  const confirm = button('primary bs-confirm', 'Flotte bestätigen', () => {
    if (editable && completeFleet(draft)) { remember(); act({ kind: 'placeFleet', ships: draft.map(ship => ({ ...ship })) }); }
  });
  const legend = element('div', 'bs-legend');
  for (const [state, label] of [['ship','Schiff'],['hit','Treffer'],['miss','Wasser'],['sunk','Versenkt']]) {
    const item = element('span', 'bs-legend-item'); const mark = element('i', 'bs-legend-mark'); mark.dataset.state = state; item.append(mark, element('span', '', label)); legend.append(item);
  }
  game.append(status, placement, tabs, layout, confirm, legend); root.replaceChildren(game);

  function remember() {
    if (!key) return;
    draftCache.set(key, draft.map(ship => ship ? { ...ship } : null));
    while (draftCache.size > 8) draftCache.delete(draftCache.keys().next().value);
  }
  function rotateSelection() {
    if (!editable || selected === null) return;
    const next = (rotation + 1) % 4, ship = draft[selected];
    if (ship && !canPlace(draft, selected, { cell: ship.cell, rotation: next })) { message = 'Dort lässt sich das Schiff nicht drehen.'; paint(); return; }
    rotation = next;
    if (ship) draft[selected] = { cell: ship.cell, rotation };
    message = ''; remember(); paint();
  }
  function placeAt(cell) {
    if (!editable) return;
    if (selected === null) {
      const index = draft.findIndex((ship, index) => placementCells(index, ship)?.includes(cell));
      if (index >= 0) { selected = index; rotation = draft[index].rotation; paint(); }
      return;
    }
    const candidate = { cell, rotation };
    if (!canPlace(draft, selected, candidate)) { message = 'Das Schiff muss vollständig auf freie Felder passen.'; paint(); return; }
    draft[selected] = candidate; selected = draft.findIndex(ship => ship === null);
    if (selected < 0) selected = null;
    rotation = selected === null ? 0 : draft[selected]?.rotation || 0;
    message = ''; remember(); paint();
  }
  function paint() {
    if (!current) return;
    const { snapshot, playerId, canMutate } = current, { room, view } = snapshot;
    const valid = validView(view, room, playerId), running = room.status.type === 'running';
    editable = Boolean(valid && running && view.phase === 'placement' && !view.yourReady && canMutate);
    fireAllowed = Boolean(valid && running && view.phase === 'battle' && view.currentPlayerId === playerId && canMutate);
    game.dataset.phase = valid ? view.phase : 'unavailable';
    placement.hidden = !valid || !running || view.phase !== 'placement' || view.yourReady;
    confirm.hidden = placement.hidden; confirm.disabled = !editable || !completeFleet(draft);
    tabs.hidden = !valid || view.phase === 'placement'; layout.hidden = !valid; legend.hidden = !valid;
    if (!valid) status.textContent = room.status.type === 'lobby' ? '' : 'Spielansicht nicht verfügbar. Bitte erneut verbinden.';
    else if (room.status.type === 'won') status.textContent = `${room.players.find(player => player.playerId === room.status.winnerPlayerId)?.displayName || 'Mitspieler'} gewinnt.`;
    else if (!running) status.textContent = 'Runde beendet.';
    else if (view.phase === 'placement') status.textContent = view.yourReady ? 'Deine Flotte steht. Warte auf die andere Flotte.' : 'Setze deine Flotte.';
    else {
      const turn = !canMutate ? 'Spielstand wird abgeglichen …' : view.currentPlayerId === playerId ? 'Du bist am Zug.'
        : `${room.players.find(player => player.playerId === view.currentPlayerId)?.displayName || 'Mitspieler'} ist am Zug.`;
      status.textContent = (view.lastShot ? `${{ miss: 'Wasser', hit: 'Treffer', sunk: 'Versenkt' }[view.lastShot.result]} auf ${coordinate(view.lastShot.cell)}. ` : '') + turn;
    }
    if (valid && room.rematchVotes.length) status.textContent += ` Noch einmal: ${room.rematchVotes.length} von ${room.participants.length}.`;
    status.hidden = !status.textContent;
    if (!valid) return;
    rotate.disabled = !editable || selected === null; remove.disabled = !editable || selected === null || draft[selected] === null;
    random.disabled = clear.disabled = !editable;
    help.textContent = message || (selected === null ? 'Alle fünf Schiffe gesetzt.' : `${FLEET[selected].label} setzen · R dreht das Schiff.`);
    pieceButtons.forEach((item, index) => {
      item.disabled = !editable; item.setAttribute('aria-pressed', String(selected === index)); item.dataset.placed = String(draft[index] !== null);
      item.setAttribute('aria-label', `${FLEET[index].label}, ${FLEET[index].size} Felder${draft[index] ? ', gesetzt' : ''}`);
      const mini = item.children[0]; mini.replaceChildren();
      for (const [row, column] of shapeOffsets(index, selected === index ? rotation : draft[index]?.rotation || 0)) {
        const square = element('i', ''); square.style.gridRow = String(row + 1); square.style.gridColumn = String(column + 1); mini.append(square);
      }
    });
    const preview = editable && selected !== null && hover !== null ? placementCells(selected, { cell: hover, rotation }) : null;
    const previewValid = preview && canPlace(draft, selected, { cell: hover, rotation });
    const ownCells = new Map();
    if (!view.yourReady) draft.forEach((ship, index) => { for (const cell of placementCells(index, ship) || []) ownCells.set(cell, index); });
    else view.ownShips.forEach(ship => ship.cells.forEach(cell => ownCells.set(cell, ship.index)));
    const revealedTargets = new Map();
    view.opponentShips.forEach(ship => ship.cells.forEach(cell => revealedTargets.set(cell, ship.index)));
    for (const kind of ['own','target']) {
      const board = boards[kind], knownShips = kind === 'own' ? ownCells : revealedTargets;
      board.panel.hidden = kind === 'target' && view.phase === 'placement';
      board.panel.dataset.selected = String(activeBoard === kind);
      board.count.textContent = kind === 'own' && !view.yourReady ? `${draft.filter(Boolean).length} / 5 gesetzt` : `${view.remaining[kind === 'own' ? 'you' : 'opponent']} / 5 übrig`;
      board.cells.forEach((item, cell) => {
        const state = kind === 'own' && !view.yourReady ? ownCells.has(cell) ? 'ship' : 'unknown' : view[kind === 'own' ? 'ownBoard' : 'targetBoard'][cell];
        item.dataset.state = state;
        item.dataset.ship = knownShips.has(cell) ? String(knownShips.get(cell)) : '';
        for (const [edge, neighbor] of [['north', cell - 10], ['south', cell + 10],
          ['west', cell % 10 === 0 ? -1 : cell - 1], ['east', cell % 10 === 9 ? -1 : cell + 1]]) {
          item.dataset[edge] = String(knownShips.has(cell) && knownShips.get(neighbor) !== knownShips.get(cell));
        }
        item.dataset.preview = kind === 'own' && preview?.includes(cell) ? previewValid ? 'valid' : 'invalid' : '';
        item.dataset.last = String(view.lastShot?.cell === cell && (kind === 'target') === (view.lastShot.playerId === playerId));
        item.setAttribute('aria-disabled', String(kind === 'own' ? !editable : !fireAllowed || state !== 'unknown'));
        item.setAttribute('aria-label', `${coordinate(cell)}, ${{ unknown: kind === 'own' ? view.phase === 'placement' ? 'frei' : 'unbeschossen' : 'unbekannt', ship: 'Schiff', hit: 'Treffer', miss: 'Wasser', sunk: 'versenkt' }[state]}`);
      });
    }
    targetTab.setAttribute('aria-pressed', String(activeBoard === 'target')); ownTab.setAttribute('aria-pressed', String(activeBoard === 'own'));
  }
  return {
    render(input) {
      current = input;
      const { snapshot, playerId } = input, view = snapshot.view;
      const nextKey = `${snapshot.roomInstanceId}/${snapshot.matchId}/${playerId}`;
      if (key !== nextKey) {
        key = nextKey; draft = (draftCache.get(key) || Array(5).fill(null)).map(ship => ship ? { ...ship } : null);
        selected = draft.findIndex(ship => ship === null); if (selected < 0) selected = null;
        rotation = 0; message = ''; hover = null; previousPhase = null;
      }
      if (view?.phase !== previousPhase) { activeBoard = view?.phase === 'placement' ? 'own' : 'target'; previousPhase = view?.phase; }
      paint();
    },
  };
}
