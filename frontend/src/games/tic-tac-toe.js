// Darstellung empfangener Ansichten; keine Regeln und keine Zugberechnung im Client.
export function mountTicTacToe(root, act) {
  const info = document.createElement('p');
  info.className = 'game-info';
  const board = document.createElement('div');
  board.className = 'board';
  board.setAttribute('role', 'group');
  board.setAttribute('aria-label', 'Tic Tac Toe, drei Zeilen mit je drei Feldern');
  const buttons = Array.from({ length: 9 }, (_, cell) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'cell'; button.disabled = true;
    button.addEventListener('click', () => { if (!button.disabled) act({ kind: 'place', cell }); });
    board.append(button);
    return button;
  });
  root.replaceChildren(info, board);
  return {
    render({ snapshot, playerId, canMutate }) {
      const { room, view } = snapshot;
      const valid = view && Array.isArray(view.board) && view.board.length === 9 &&
        view.board.every(cell => cell === null || cell === 'X' || cell === 'O') &&
        Array.isArray(view.symbols) && view.symbols.every(p => typeof p.playerId === 'string' && ['X', 'O'].includes(p.symbol)) &&
        ['X', 'O'].includes(view.yourSymbol);
      const nameFor = id => room.players.find(p => p.playerId === id)?.displayName || 'Mitspieler';
      if (room.status.type === 'lobby') info.textContent = 'Das Brett wird nach dem Start freigegeben.';
      else if (!valid) info.textContent = 'Die Spielansicht ist nicht verfügbar. Bitte erneut verbinden.';
      else {
        const symbols = view.symbols.map(p => `${p.symbol}: ${nameFor(p.playerId)}`).join(' · ');
        const turn = room.status.type === 'running'
          ? view.currentPlayerId === playerId ? 'Du bist am Zug.' : `${nameFor(view.currentPlayerId)} ist am Zug.`
          : 'Diese Partie ist beendet.';
        info.textContent = `${symbols} · Du spielst ${view.yourSymbol}. ${turn}`;
      }
      // Der Raumstatus sperrt auch beim Infrastruktur-Abbruch alle Felder.
      const allowed = valid && canMutate && room.status.type === 'running' &&
        room.participants.includes(playerId) && view.currentPlayerId === playerId;
      buttons.forEach((button, cell) => {
        const value = valid ? view.board[cell] : null;
        button.textContent = value || '';
        button.setAttribute('aria-label', `Feld ${cell + 1}, ${value || 'leer'}`);
        button.dataset.winning = String(Boolean(valid && room.status.type === 'won' && view.winningLine?.includes(cell)));
        button.disabled = !allowed || value !== null;
      });
    },
  };
}
