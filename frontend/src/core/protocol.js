export function identity(name, code) {
  if (typeof name !== 'string' || /\p{Cc}/u.test(name)) throw new Error('Bitte einen gültigen Spielernamen eingeben.');
  const displayName = name.normalize('NFC').trim();
  if (![...displayName].length || [...displayName].length > 32 || !/^[\p{L}\p{M}\p{N} _-]+$/u.test(displayName)) {
    throw new Error('Der Name darf 1 bis 32 Zeichen enthalten: Buchstaben, Zahlen, Leerzeichen, Bindestrich und Unterstrich.');
  }
  const roomCode = code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(roomCode)) throw new Error('Raumcode: 3 bis 32 Buchstaben, Zahlen oder Bindestriche; am Anfang ein Buchstabe oder eine Zahl.');
  return { name: displayName, roomCode };
}
export function validSnapshot(m, version) {
  const room = m?.room;
  return m?.v === version && typeof m.roomInstanceId === 'string' &&
    (m.matchId === null || typeof m.matchId === 'string') && Number.isSafeInteger(m.revision) && m.revision >= 0 &&
    typeof room?.roomCode === 'string' && typeof room?.gameId === 'string' &&
    ['lobby', 'running', 'won', 'draw', 'aborted'].includes(room.status?.type) &&
    (room.status.type !== 'won' || typeof room.status.winnerPlayerId === 'string') &&
    Array.isArray(room.players) && room.players.every(p => typeof p.playerId === 'string' && typeof p.displayName === 'string' && typeof p.ready === 'boolean' && typeof p.connected === 'boolean') &&
    Array.isArray(room.participants) && room.participants.every(id => typeof id === 'string') &&
    Array.isArray(room.rematchVotes) && room.rematchVotes.every(id => typeof id === 'string') &&
    Object.hasOwn(m, 'view');
}
