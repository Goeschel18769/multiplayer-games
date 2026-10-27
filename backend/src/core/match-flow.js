import { initialMatch, applyAction } from './engine.js';
import { fail } from '../protocol/errors.js';

function startMatch(room, engine, participants, firstPosition) {
  const count = participants.length;
  if (count < engine.minPlayers || count > engine.maxPlayers || participants.some(p => !p.connectionId)) fail('NOT_READY');
  const index = room.nextStartIndex === null ? firstPosition(count) : room.nextStartIndex % count;
  const matchId = crypto.randomUUID();
  const startingPlayerId = participants[index].playerId;
  const frozenPlayers = participants.map(({ playerId, displayName, nameKey }) => ({ playerId, displayName, nameKey }));
  const { state, status } = initialMatch(engine, frozenPlayers, room.config, { matchId, startingPlayerId });
  room.match = { matchId, startingPlayerId, participants: frozenPlayers, state, status, revision: 0, rematchVotes: [] };
  room.nextStartIndex = (index + 1) % count;
  for (const p of room.players) p.ready = false;
}
export function mutateRoom(room, player, m, { engines, firstPosition }) {
  const engine = engines.get(room.gameId);
  const match = room.match;
  const wasRunning = match?.status.type === 'running';
  if (m.type === 'ready') {
    if (match?.status.type === 'running') fail('NOT_READY');
    player.ready = m.ready;
  } else if (m.type === 'start') {
    if (match || room.players.some(p => !p.ready)) fail('NOT_READY');
    startMatch(room, engine, room.players, firstPosition);
  } else {
    if (!match || m.matchId !== match.matchId) fail('STALE_MATCH');
    if (!match.participants.some(p => p.playerId === player.playerId)) fail('INVALID_ACTION');
    if (m.type === 'rematch') {
      if (match.status.type === 'running') fail('NOT_READY');
      if (!match.rematchVotes.includes(player.playerId)) match.rematchVotes.push(player.playerId);
      if (match.participants.every(p => match.rematchVotes.includes(p.playerId))) {
        startMatch(room, engine, match.participants.map(p => room.players.find(candidate => candidate.playerId === p.playerId)), firstPosition);
      }
    } else {
      if (match.status.type !== 'running') fail('MATCH_NOT_RUNNING');
      if (m.type === 'abort') {
        // Infrastruktur-Abbruch: Engines müssen dafür keine spezielle Aktion kennen.
        match.status = { type: 'aborted' };
        match.revision++;
      } else {
        if (m.expectedRevision !== match.revision) fail('STALE_REVISION');
        const result = applyAction(engine, match, player.playerId, m.action);
        match.state = result.state;
        match.status = result.status;
        match.revision++;
      }
    }
  }
  // Der Abschluss und der Outbox-Eintrag werden vom Aufrufer zusammen gespeichert.
  if (wasRunning && room.match?.status.type === 'won') {
    const winner = room.match.participants.find(p => p.playerId === room.match.status.winnerPlayerId);
    const event = { matchId: room.match.matchId, nameKey: winner.nameKey, displayName: winner.displayName };
    return event;
  }
}
