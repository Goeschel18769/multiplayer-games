import { CONFIG } from './config.js';
import { createApi } from './core/http.js';
import { identity } from './core/protocol.js';
import { RoomConnection } from './core/connection.js';
import { Statistics } from './core/statistics.js';
import { gamePresentation, supportedGame } from './games/registry.js';

const $ = id => document.getElementById(id);
const api = createApi(CONFIG);
let games = [];
let gamesBusy = false;
let creating = false;
let attempted = false;
let createdCode = null;
let localMessage = '';
let mountedGameId = null;
let gameUI = null;
const stats = new Statistics(api, state => {
  $('stats-info').textContent = state.message;
  $('refresh-stats').disabled = state.busy;
  $('scores').replaceChildren();
  for (const row of state.rows) {
    const item = document.createElement('li');
    const name = document.createElement('span'); name.textContent = row.displayName;
    const count = document.createElement('strong'); count.textContent = `${row.wins} ${row.wins === 1 ? 'Sieg' : 'Siege'}`;
    item.append(name, count); $('scores').append(item);
  }
});
const connection = new RoomConnection(CONFIG, {
  onChange: () => { localMessage = ''; if (connection.phase === 'connected') createdCode = null; render(); },
  onWin: key => stats.refresh(key),
});

function credentials() {
  const result = identity($('player-name').value, $('room-code').value);
  $('player-name').value = result.name; $('room-code').value = result.roomCode;
  return result;
}
function join() {
  if (creating || connection.phase === 'connecting') return;
  try { const { name, roomCode } = credentials(); attempted = true; connection.connect(name, roomCode); }
  catch (error) { localMessage = error.message; render(); }
}
function render() {
  const { snapshot, playerId, phase, canMutate } = connection;
  const room = snapshot?.room;
  const open = ['connecting', 'connected'].includes(phase);
  for (const id of ['player-name', 'room-code', 'game-select']) $(id).disabled = open || creating || (id === 'game-select' && !games.some(supportedGame));
  $('create-room').disabled = open || creating || !games.some(game => supportedGame(game) && game.id === $('game-select').value);
  $('join-room').disabled = open || creating;
  $('reload-games').disabled = gamesBusy || creating;
  $('leave-room').hidden = !open;
  $('reconnect').hidden = !attempted || phase === 'connecting';
  $('reconnect').disabled = creating;
  $('connection-badge').textContent = phase === 'connected' ? 'Verbunden' : phase === 'connecting' ? 'Verbindet …' : 'Nicht verbunden';
  $('connection-badge').dataset.connected = String(phase === 'connected');
  const createdHint = createdCode && !open ? `Raum ${createdCode} wurde erstellt. Du kannst ihm erneut beitreten. ` : '';
  $('connection-message').textContent = localMessage || (createdHint + connection.message);
  const nameFor = id => room?.players.find(p => p.playerId === id)?.displayName || 'Mitspieler';
  $('room-label').textContent = room ? `Raum ${room.roomCode}` : '02 · Die nächste Runde';
  const presentation = room && gamePresentation(room.gameId);
  $('play-title').textContent = room ? presentation?.title || 'Nicht unterstütztes Spiel' : 'Noch kein Raum geöffnet';
  $('players').replaceChildren();
  for (const player of room?.players || []) {
    const item = document.createElement('li');
    const name = document.createElement('strong'); name.textContent = player.displayName + (player.playerId === playerId ? ' (du)' : '');
    const status = document.createElement('span'); status.textContent = `${player.connected ? 'Verbunden' : 'Getrennt'} · ${player.ready ? 'bereit' : 'nicht bereit'}`;
    item.append(name, status); $('players').append(item);
  }
  const own = room?.players.find(p => p.playerId === playerId);
  const lobby = room?.status.type === 'lobby' && snapshot.matchId === null;
  const metadata = games.find(game => game.id === room?.gameId && supportedGame(game));
  $('ready').disabled = !canMutate || !lobby || !own || !metadata;
  $('ready').textContent = own?.ready ? 'Nicht mehr bereit' : 'Bereit';
  $('start-match').disabled = !canMutate || !lobby || !metadata ||
    room.players.length < metadata.minPlayers || room.players.length > metadata.maxPlayers || !room.players.every(p => p.ready && p.connected);
  const participant = room?.participants.includes(playerId);
  $('rematch').disabled = !canMutate || !participant || !['won', 'draw', 'aborted'].includes(room?.status.type) || room.rematchVotes.includes(playerId);
  $('abort-match').disabled = !canMutate || !participant || room?.status.type !== 'running';
  let message = room ? 'Seid ihr bereit für die erste Partie?' : 'Hier wartet euer Spiel auf euch.';
  if (room?.status.type === 'running') message = 'Die Partie läuft.';
  if (room?.status.type === 'won') message = `${nameFor(room.status.winnerPlayerId)} hat gewonnen!`;
  if (room?.status.type === 'draw') message = 'Unentschieden. Auf eine neue Runde?';
  if (room?.status.type === 'aborted') message = 'Die Partie wurde abgebrochen. Kein Sieg wurde gewertet.';
  if (room?.rematchVotes.length) message += ` Rematch: ${room.rematchVotes.map(nameFor).join(', ')} ${room.rematchVotes.length === 1 ? 'hat' : 'haben'} zugestimmt.`;
  if (room && phase !== 'connected') message += ' Angezeigt wird der zuletzt empfangene Stand.';
  $('match-message').textContent = message;
  if (mountedGameId !== (room?.gameId ?? null)) {
    mountedGameId = room?.gameId ?? null;
    gameUI = presentation?.mount($('game-view'), action => connection.mutate('action', { action })) || null;
    if (!gameUI) {
      const text = document.createElement('p'); text.className = 'empty';
      text.textContent = room ? 'Dieses Spiel wird von dieser Ausgabe noch nicht unterstützt. Bitte eine passende Ausgabe verwenden oder den Raum verlassen.' : 'Ein Raumcode bringt euch an denselben Tisch.';
      $('game-view').replaceChildren(text);
    }
  }
  if (gameUI) gameUI.render({ snapshot, playerId, canMutate });
}

async function loadGames() {
  if (gamesBusy) return;
  gamesBusy = true; render();
  try {
    const list = await api.games();
    if (!Array.isArray(list)) throw new Error('Die Spieleliste konnte nicht geladen werden.');
    games = list.filter(game => typeof game?.id === 'string' && typeof game.version === 'string' &&
      Number.isSafeInteger(game.minPlayers) && Number.isSafeInteger(game.maxPlayers) && game.minPlayers > 0 && game.maxPlayers >= game.minPlayers);
    const selected = $('game-select').value;
    $('game-select').replaceChildren();
    for (const game of games.filter(supportedGame)) {
      const option = document.createElement('option'); option.value = game.id;
      option.textContent = `${gamePresentation(game.id).title} · ${game.minPlayers === game.maxPlayers ? game.minPlayers : `${game.minPlayers}–${game.maxPlayers}`} Spieler`;
      $('game-select').append(option);
    }
    if (games.some(game => supportedGame(game) && game.id === selected)) $('game-select').value = selected;
    const unsupported = games.some(game => !supportedGame(game));
    $('games-info').textContent = games.some(supportedGame)
      ? unsupported ? 'Weitere angebotene Spiele werden von dieser Ausgabe noch nicht unterstützt.' : 'Wähle ein Spiel für euren neuen Raum.'
      : 'Es werden derzeit keine von dieser Ausgabe unterstützten Spiele angeboten.';
  } catch (error) { $('games-info').textContent = error.message; }
  finally { gamesBusy = false; render(); }
}
$('room-form').addEventListener('submit', event => { event.preventDefault(); join(); });
$('reconnect').addEventListener('click', join);
$('leave-room').addEventListener('click', () => connection.disconnect());
$('reload-games').addEventListener('click', loadGames);
$('create-room').addEventListener('click', async () => {
  if (creating || ['connected', 'connecting'].includes(connection.phase)) return;
  let who;
  try { who = credentials(); } catch (error) { localMessage = error.message; render(); return; }
  creating = true; localMessage = 'Raum wird erstellt …'; render();
  try {
    const created = await api.createRoom(who.roomCode, $('game-select').value);
    if (typeof created.roomCode !== 'string') throw new Error('Die Raumerstellung konnte nicht bestätigt werden. Bitte erst einen Beitritt versuchen.');
    $('room-code').value = created.roomCode;
    createdCode = created.roomCode;
    attempted = true;
    connection.connect(who.name, created.roomCode);
  } catch (error) { localMessage = error.message; }
  finally { creating = false; render(); }
});
$('ready').addEventListener('click', () => {
  const own = connection.snapshot?.room.players.find(p => p.playerId === connection.playerId);
  connection.mutate('ready', { ready: !own?.ready });
});
$('start-match').addEventListener('click', () => connection.mutate('start'));
$('rematch').addEventListener('click', () => connection.mutate('rematch'));
$('abort-match').addEventListener('click', () => connection.mutate('abort'));
$('refresh-stats').addEventListener('click', () => stats.refresh());
window.addEventListener('pagehide', () => { connection.disconnect(); stats.dispose(); });
render(); loadGames(); stats.refresh();
