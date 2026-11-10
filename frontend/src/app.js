import { CONFIG } from './config.js';
import { createApi } from './core/http.js';
import { RoomConnection } from './core/connection.js';
import { Statistics } from './core/statistics.js';
import { identity } from './core/protocol.js';
import { initMotion } from './core/motion.js';
import { gamePresentation, supportedGame, supportedMode } from './games/registry.js';
import { TTT_MODES } from './games/tic-tac-toe-modes.js';
import previewImage from './assets/tic-tac-toe-preview.png';
import connectFourPreview from './assets/connect-four-preview.png';

const $ = id => document.getElementById(id);
const api = createApi(CONFIG);
const names = { ben: 'Ben', joel: 'Joël' };
$('ttt-preview-image').src = previewImage;
$('c4-preview-image').src = connectFourPreview;
let selectedPlayer = null;
let activeGameId = 'tic-tac-toe';
let activeMode = 'classic';
let activeRoomCode = TTT_MODES[activeMode].roomCode;
let games = [];
let gamesBusy = false;
let creating = false;
let attempted = false;
let screen = 'hub';
let localMessage = '';
let mountedGameId = null;
let gameUI = null;
let editBaseline = null;
let saving = false;
let opening = 0;
let manualCreation = false;
let pendingMode = null;
let hasRoomSnapshot = false;
try {
  const stored = sessionStorage.getItem('multiplayer-player');
  if (Object.hasOwn(names, stored)) selectedPlayer = stored;
} catch { /* Spielerwahl funktioniert auch ohne Browserspeicher. */ }

function setTheme(theme) {
  if (!['light', 'dark', 'office'].includes(theme)) theme = 'light';
  document.documentElement.dataset.theme = theme;
  for (const mode of ['light', 'dark', 'office']) $('theme-' + mode).setAttribute('aria-pressed', String(theme === mode));
  try { localStorage.setItem('spielzeit-theme', theme); } catch { /* Browserspeicher ist optional, auch über file://. */ }
}
try { setTheme(localStorage.getItem('spielzeit-theme') || 'light'); }
catch { setTheme('light'); }
let themeOpen = false;
let toggleIntent = null;
let suppressThemeFocus = false;
const themeDrawer = $('theme-drawer');
function setThemeOpen(open, focusToggle = false) {
  themeOpen = open;
  themeDrawer.dataset.open = String(open);
  $('theme-toggle').setAttribute('aria-expanded', String(open));
  if (focusToggle) {
    suppressThemeFocus = true;
    $('theme-toggle').focus();
    suppressThemeFocus = false;
  }
}
themeDrawer.addEventListener('pointerenter', event => {
  if (event.pointerType !== 'touch') setThemeOpen(true);
});
themeDrawer.addEventListener('pointerleave', () => {
  if (!themeDrawer.contains(document.activeElement)) setThemeOpen(false);
});
themeDrawer.addEventListener('focusin', () => {
  if (!suppressThemeFocus) setThemeOpen(true);
});
themeDrawer.addEventListener('focusout', event => {
  if (!themeDrawer.contains(event.relatedTarget)) setThemeOpen(false);
});
$('theme-toggle').addEventListener('pointerdown', () => { toggleIntent = !themeOpen; });
$('theme-toggle').addEventListener('click', () => {
  setThemeOpen(toggleIntent ?? !themeOpen);
  toggleIntent = null;
});
themeDrawer.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  setThemeOpen(false, true);
});
document.addEventListener('pointerdown', event => {
  if (!themeDrawer.contains(event.target)) setThemeOpen(false);
});
for (const mode of ['light', 'dark', 'office']) $('theme-' + mode).addEventListener('click', () => {
  setTheme(mode);
  setThemeOpen(false, true);
});
setThemeOpen(false);

const stats = new Statistics(api, state => {
  for (const [key, name] of Object.entries(names)) {
    const wins = state.rows.find(row => row.nameKey === name.toLowerCase())?.wins ?? 0;
    $('score-' + key).textContent = state.loaded ? String(wins) : '—';
  }
  $('stats-info').textContent = state.busy ? 'Wird geladen …'
    : !state.loaded ? 'Siegestand nicht erreichbar'
      : state.error ? 'Zuletzt geladener Stand'
        : state.message === 'Siegestand gespeichert.' ? state.message : '';
  $('scoreboard').setAttribute('aria-busy', String(state.busy));
  $('scoreboard').setAttribute('aria-label', state.loaded
    ? `Ben: ${$('score-ben').textContent} Siege, Joël: ${$('score-joel').textContent} Siege. Siegestand bearbeiten.`
    : 'Siegestand noch nicht geladen. Siegestand öffnen.');
  $('refresh-stats').disabled = state.busy || saving;
  $('save-scores').disabled = !state.loaded || state.busy || saving || !editBaseline;
});
const connection = new RoomConnection(CONFIG, {
  onChange: state => {
    if (state.phase === 'connecting') hasRoomSnapshot = false;
    if (state.phase === 'connected') {
      hasRoomSnapshot = true;
      activeGameId = state.snapshot.room.gameId;
      activeRoomCode = state.snapshot.room.roomCode;
      if (state.snapshot?.room.gameId === 'tic-tac-toe') {
        const { room, view } = state.snapshot;
        const explicit = view?.mode ?? room.config?.mode;
        const size = view?.boardSize ?? (Array.isArray(view?.board) ? Math.sqrt(view.board.length) : null);
        activeMode = Object.hasOwn(TTT_MODES, explicit) ? explicit : size === 15 ? 'five' : 'classic';
        activeRoomCode = room.roomCode;
      } else activeMode = null;
    }
    render();
  },
  onWin: key => stats.refresh(key),
});

function openPlayerDialog() {
  $('player-cancel').hidden = !selectedPlayer;
  if (!$('player-dialog').open) $('player-dialog').showModal();
  $('player-' + (selectedPlayer || 'ben')).focus();
}
function closePlayerDialog() {
  if (!selectedPlayer) return;
  $('player-dialog').close();
  $('scoreboard-player-' + selectedPlayer).focus();
}
function choosePlayer(key) {
  const initial = !selectedPlayer;
  const changed = selectedPlayer !== key;
  selectedPlayer = key;
  try { sessionStorage.setItem('multiplayer-player', key); } catch { /* Auswahl bleibt bis zum Neuladen erhalten. */ }
  if (changed && (screen === 'play' || creating)) showHub();
  $('hub-message').textContent = '';
  $('player-dialog').close();
  render();
  $(initial ? 'game-tic-tac-toe' : 'scoreboard-player-' + key).focus();
}
for (const key of Object.keys(names)) {
  $('player-' + key).addEventListener('click', () => choosePlayer(key));
  $('scoreboard-player-' + key).addEventListener('click', openPlayerDialog);
}
$('player-cancel').addEventListener('click', closePlayerDialog);
$('player-dialog').addEventListener('cancel', event => {
  event.preventDefault();
  closePlayerDialog();
});

function cancelManualRequest() {
  if (!manualCreation) return;
  opening++;
  manualCreation = false;
  creating = false;
  render();
}
function closeRoomOptions() {
  cancelManualRequest();
  $('room-dialog').close();
}
$('close-room-options').addEventListener('click', closeRoomOptions);
$('room-dialog').addEventListener('cancel', event => {
  event.preventDefault();
  closeRoomOptions();
});
$('room-dialog').addEventListener('close', cancelManualRequest);
$('room-toggle').addEventListener('click', () => {
  if (screen !== 'play' || creating || !selectedPlayer) return;
  $('manual-room-code').value = activeRoomCode;
  $('manual-room-status').textContent = '';
  $('room-dialog').showModal();
  $('manual-room-code').focus();
});

function showHub(event) {
  event?.preventDefault();
  opening++;
  creating = false;
  manualCreation = false;
  pendingMode = null;
  hasRoomSnapshot = false;
  screen = 'hub';
  activeGameId = 'tic-tac-toe';
  activeMode = 'classic';
  activeRoomCode = TTT_MODES[activeMode].roomCode;
  attempted = false;
  localMessage = '';
  $('hub-message').textContent = '';
  $('room-dialog').close();
  $('mode-dialog').close();
  connection.disconnect();
  render();
  if (!stats.busy && !saving) void stats.refresh();
  $('hub-title').setAttribute('tabindex', '-1');
  $('hub-title').focus();
}
$('back-to-hub').addEventListener('click', showHub);

function reconnect() {
  if (screen !== 'play' || !selectedPlayer || creating || connection.phase === 'connecting') return;
  localMessage = '';
  connection.connect(names[selectedPlayer], activeRoomCode);
}

function modeMetadata() {
  return games.find(game => game.id === 'tic-tac-toe' && supportedGame(game));
}
function cancelModeRequest() {
  if (!pendingMode) return;
  opening++;
  pendingMode = null;
  creating = false;
  render();
}
function closeModeDialog() {
  cancelModeRequest();
  $('mode-dialog').close();
}
function openModeDialog() {
  if (manualCreation || gamesBusy || !modeMetadata()) return;
  if (!selectedPlayer) {
    openPlayerDialog();
    return;
  }
  $('mode-info').textContent = supportedMode(modeMetadata(), 'five') ? '' : '15 × 15 ist mit diesem Backend noch nicht verfügbar.';
  render();
  if (!$('mode-dialog').open) $('mode-dialog').showModal();
  $('mode-' + (supportedMode(modeMetadata(), activeMode) ? activeMode : 'classic')).focus();
}
$('game-tic-tac-toe').addEventListener('click', openModeDialog);
$('game-connect-four').addEventListener('click', () => openGame('connect-four'));
$('play-mode').addEventListener('click', openModeDialog);
$('close-mode-dialog').addEventListener('click', closeModeDialog);
$('mode-dialog').addEventListener('cancel', event => {
  event.preventDefault();
  closeModeDialog();
});
$('mode-dialog').addEventListener('close', cancelModeRequest);
for (const modeId of Object.keys(TTT_MODES)) $('mode-' + modeId).addEventListener('click', () => selectMode(modeId));

async function selectMode(modeId) {
  if (!selectedPlayer || manualCreation || pendingMode === modeId || !$('mode-dialog').open || !supportedMode(modeMetadata(), modeId)) return;
  const mode = TTT_MODES[modeId];
  const generation = ++opening;
  pendingMode = modeId;
  creating = true;
  $('mode-info').textContent = 'Raum wird geöffnet …';
  render();
  try {
    try {
      const created = await api.createRoom(mode.roomCode, 'tic-tac-toe', mode.config);
      if (created.roomCode !== mode.roomCode) throw new Error('Der Raum konnte nicht bestätigt werden. Bitte erneut versuchen.');
    } catch (error) {
      // Gleichzeitige Auswahl desselben Modus führt in denselben Standardraum.
      if (error.code !== 'ROOM_EXISTS') throw error;
    }
    if (generation !== opening) return;
    pendingMode = null;
    creating = false;
    activeGameId = 'tic-tac-toe';
    activeMode = modeId;
    activeRoomCode = mode.roomCode;
    screen = 'play';
    attempted = true;
    hasRoomSnapshot = false;
    localMessage = '';
    $('mode-dialog').close();
    connection.connect(names[selectedPlayer], mode.roomCode);
    $('play-title').setAttribute('tabindex', '-1');
    $('play-title').focus();
  } catch (error) {
    if (generation === opening) $('mode-info').textContent = error.message;
  } finally {
    if (generation === opening) { pendingMode = null; creating = false; render(); }
  }
}

async function openGame(gameId) {
  const presentation = gamePresentation(gameId);
  if (creating || gamesBusy || !presentation || !games.some(game => game.id === gameId && supportedGame(game))) return;
  if (!selectedPlayer) { openPlayerDialog(); return; }
  const generation = ++opening;
  creating = true;
  $('hub-message').textContent = 'Raum wird geöffnet …';
  render();
  try {
    try {
      const created = await api.createRoom(presentation.roomCode, gameId, presentation.config || {});
      if (created.roomCode !== presentation.roomCode) throw new Error('Der Raum konnte nicht bestätigt werden. Bitte erneut versuchen.');
    } catch (error) { if (error.code !== 'ROOM_EXISTS') throw error; }
    if (generation !== opening) return;
    activeGameId = gameId;
    activeMode = null;
    activeRoomCode = presentation.roomCode;
    creating = false;
    screen = 'play';
    attempted = true;
    hasRoomSnapshot = false;
    localMessage = '';
    $('hub-message').textContent = '';
    connection.connect(names[selectedPlayer], activeRoomCode);
    $('play-title').focus();
  } catch (error) {
    if (generation === opening) $('hub-message').textContent = error.message;
  } finally {
    if (generation === opening) { creating = false; render(); }
  }
}
$('reconnect').addEventListener('click', reconnect);

function manualIdentity() {
  if (!selectedPlayer) return null;
  try {
    const normalized = identity(names[selectedPlayer], $('manual-room-code').value);
    $('manual-room-code').value = normalized.roomCode;
    return normalized;
  } catch (error) {
    $('manual-room-status').textContent = error.message;
    $('manual-room-code').focus();
    return null;
  }
}
function joinManualRoom(normalized) {
  opening++;
  creating = false;
  manualCreation = false;
  pendingMode = null;
  activeRoomCode = normalized.roomCode;
  attempted = true;
  hasRoomSnapshot = false;
  localMessage = '';
  $('room-dialog').close();
  connection.connect(normalized.name, normalized.roomCode);
}
$('room-form').addEventListener('submit', event => {
  event.preventDefault();
  if (screen !== 'play' || creating || !$('room-dialog').open) return;
  const normalized = manualIdentity();
  if (normalized) joinManualRoom(normalized);
});
$('create-manual-room').addEventListener('click', async () => {
  if (screen !== 'play' || creating || !$('room-dialog').open) return;
  const normalized = manualIdentity();
  if (!normalized) return;
  const generation = ++opening;
  creating = true;
  manualCreation = true;
  $('manual-room-status').textContent = 'Raum wird erstellt …';
  render();
  try {
    const config = gamePresentation(activeGameId)?.modes?.[activeMode]?.config || gamePresentation(activeGameId)?.config || {};
    const created = await api.createRoom(normalized.roomCode, activeGameId, config);
    if (generation !== opening) return;
    if (created.roomCode !== normalized.roomCode) throw new Error('Die Raumerstellung konnte nicht bestätigt werden.');
    joinManualRoom(normalized);
  } catch (error) {
    if (generation === opening) $('manual-room-status').textContent = error.message;
  } finally {
    if (generation === opening) { creating = false; manualCreation = false; render(); }
  }
});

function render() {
  $('hub-view').hidden = screen !== 'hub';
  $('play-view').hidden = screen !== 'play';
  $('play-view').dataset.game = activeGameId;
  $('play-view').dataset.mode = activeMode || '';
  const mode = TTT_MODES[activeMode] || TTT_MODES.classic;
  $('play-mode').hidden = activeGameId !== 'tic-tac-toe';
  $('play-mode').textContent = `${mode.label} · ${mode.winLength} in Reihe`;
  $('play-mode').disabled = screen !== 'play' || manualCreation;
  for (const modeId of Object.keys(TTT_MODES)) {
    $('mode-' + modeId).disabled = manualCreation || pendingMode === modeId || !supportedMode(modeMetadata(), modeId);
    $('mode-' + modeId).setAttribute('aria-pressed', String(activeMode === modeId));
  }
  $('game-tic-tac-toe').disabled = creating || gamesBusy || !games.some(game => game.id === 'tic-tac-toe' && supportedGame(game));
  $('game-connect-four').disabled = creating || gamesBusy || !games.some(game => game.id === 'connect-four' && supportedGame(game));
  $('reload-games').disabled = gamesBusy;
  for (const key of Object.keys(names)) {
    const selected = key === selectedPlayer;
    $('player-' + key).setAttribute('aria-pressed', String(selected));
    $('scoreboard-player-' + key).dataset.selected = String(selected);
    $('scoreboard-player-' + key).disabled = !selected;
    $('scoreboard-player-' + key).setAttribute('aria-label', selected ? `${names[key]}. Spieler wechseln.` : names[key]);
  }
  const { playerId, phase, canMutate } = connection;
  const snapshot = hasRoomSnapshot ? connection.snapshot : null;
  const room = snapshot?.room;
  const connected = phase === 'connected';
  const pending = phase === 'connecting';
  $('connection-badge').textContent = connected ? 'Verbunden' : pending ? 'Verbindet …' : 'Nicht verbunden';
  $('connection-badge').dataset.connected = String(connected);
  const connectionMessage = localMessage || (connected && connection.message === 'Verbunden.' ? '' : connection.message);
  $('connection-message').textContent = connectionMessage;
  $('connection-message').hidden = !connectionMessage;
  $('room-toggle').disabled = screen !== 'play' || creating;
  $('manual-room-code').disabled = manualCreation;
  $('join-manual-room').disabled = creating;
  $('create-manual-room').disabled = creating;
  $('reconnect').hidden = screen !== 'play' || !attempted || connected || pending;
  const presentation = gamePresentation(room?.gameId || activeGameId);
  $('play-title').textContent = presentation?.title || 'Unbekanntes Spiel';
  $('players').replaceChildren();
  const nameFor = id => room?.players.find(player => player.playerId === id)?.displayName || 'Mitspieler';
  for (const player of room?.players || []) {
    const item = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = player.displayName;
    const status = document.createElement('span');
    status.textContent = `${player.connected ? 'online' : 'offline'} · ${player.ready ? 'bereit' : 'nicht bereit'}`;
    item.append(name, status);
    $('players').append(item);
  }
  const own = room?.players.find(player => player.playerId === playerId);
  const lobby = room?.status.type === 'lobby' && snapshot.matchId === null;
  const gameOwnsStatus = ['tic-tac-toe', 'connect-four'].includes(room?.gameId) && !lobby && snapshot?.view != null;
  $('players').hidden = gameOwnsStatus;
  const metadata = games.find(game => game.id === room?.gameId && supportedGame(game));
  $('ready').hidden = !lobby;
  $('start-match').hidden = !lobby;
  $('ready').disabled = !canMutate || !lobby || !own || !metadata;
  $('ready').textContent = own?.ready ? 'Bereit zurücknehmen' : 'Bereit';
  $('start-match').disabled = !canMutate || !lobby || !metadata || room.players.length < metadata.minPlayers ||
    room.players.length > metadata.maxPlayers || !room.players.every(player => player.ready && player.connected);
  const participant = room?.participants.includes(playerId);
  $('rematch').disabled = !canMutate || !participant || !['won', 'draw', 'aborted'].includes(room?.status.type) || room.rematchVotes.includes(playerId);
  $('abort-match').disabled = !canMutate || !participant || room?.status.type !== 'running';
  const allConnected = room?.players.length >= (metadata?.minPlayers ?? 2) && room.players.every(player => player.connected);
  let message = allConnected ? room.players.every(player => player.ready) ? 'Startbereit.' : 'Warte auf Bereitschaft.' : 'Warte auf Mitspieler.';
  if (room?.status.type === 'running') message = 'Runde läuft.';
  if (room?.status.type === 'won') message = `${nameFor(room.status.winnerPlayerId)} gewinnt.`;
  if (room?.status.type === 'draw') message = 'Unentschieden.';
  if (room?.status.type === 'aborted') message = 'Runde beendet.';
  if (room?.rematchVotes.length) message += ` Nächste Runde: ${room.rematchVotes.length} von 2 bereit.`;
  if (room && !connected) message += ' Zuletzt geladener Stand.';
  $('match-message').textContent = message;
  $('match-message').hidden = !room || gameOwnsStatus;
  const mountKey = room ? `${room.gameId}/${activeMode}` : null;
  if (mountedGameId !== mountKey) {
    mountedGameId = mountKey;
    gameUI = room && presentation?.mount($('game-view'), action => connection.mutate('action', { action }), { mode: activeMode });
    if (!gameUI) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = room ? 'Dieses Spiel wird von dieser Ausgabe nicht unterstützt.' : '';
      $('game-view').replaceChildren(empty);
    }
  }
  if (gameUI) gameUI.render({ snapshot, playerId, canMutate });
}

async function loadGames() {
  if (gamesBusy) return;
  gamesBusy = true;
  $('games-info').textContent = 'Spiele werden geladen …';
  render();
  try {
    const list = await api.games();
    if (!Array.isArray(list)) throw new Error('Spiele konnten nicht geladen werden.');
    games = list.filter(game => typeof game?.id === 'string' && typeof game.version === 'string' &&
      Number.isSafeInteger(game.minPlayers) && Number.isSafeInteger(game.maxPlayers) && game.minPlayers > 0 && game.maxPlayers >= game.minPlayers);
    const available = games.some(game => supportedGame(game));
    $('games-info').textContent = available ? '' : 'Spiele sind gerade nicht verfügbar.';
    $('reload-games').hidden = available;
  } catch (error) {
    $('games-info').textContent = error.message;
    $('reload-games').hidden = false;
  } finally { gamesBusy = false; render(); }
}
$('reload-games').addEventListener('click', loadGames);
$('ready').addEventListener('click', () => {
  const own = connection.snapshot?.room.players.find(player => player.playerId === connection.playerId);
  connection.mutate('ready', { ready: !own?.ready });
});
$('start-match').addEventListener('click', () => connection.mutate('start'));
$('rematch').addEventListener('click', () => connection.mutate('rematch'));
$('abort-match').addEventListener('click', () => connection.mutate('abort'));

function fillScoreEditor() {
  editBaseline = stats.loaded ? Object.fromEntries(Object.entries(names).map(([key, name]) => [key, stats.rows.find(row => row.nameKey === name.toLowerCase())?.wins ?? 0])) : null;
  for (const key of Object.keys(names)) $('edit-' + key).value = editBaseline ? String(editBaseline[key]) : '';
  $('save-scores').disabled = !editBaseline || stats.busy || saving;
}
$('scoreboard').addEventListener('click', () => {
  fillScoreEditor();
  $('score-error').textContent = stats.loaded ? '' : 'Der Siegestand ist noch nicht geladen. Versuche „Neu laden“.';
  $('score-dialog').showModal();
});
$('close-scores').addEventListener('click', () => { if (!saving) $('score-dialog').close(); });
$('score-dialog').addEventListener('cancel', event => { if (saving) event.preventDefault(); });
for (const key of Object.keys(names)) $('reset-' + key).addEventListener('click', () => { $('edit-' + key).value = '0'; });
$('refresh-stats').addEventListener('click', async () => {
  if (saving || stats.busy) return;
  await stats.refresh();
  fillScoreEditor();
  $('score-error').textContent = stats.loaded ? 'Aktueller Stand geladen.' : stats.message;
});
$('score-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (saving || stats.busy || !editBaseline) return;
  const scores = Object.entries(names).map(([key, displayName]) => ({ displayName, wins: Number($('edit-' + key).value), expectedWins: editBaseline[key] }));
  if (Object.keys(names).some(key => $('edit-' + key).value.trim() === '') || scores.some(row => !Number.isSafeInteger(row.wins) || row.wins < 0)) {
    $('score-error').textContent = 'Bitte ganze Zahlen ab 0 eingeben.';
    return;
  }
  saving = true;
  for (const key of Object.keys(names)) { $('edit-' + key).disabled = true; $('reset-' + key).disabled = true; }
  $('close-scores').disabled = true;
  $('save-scores').textContent = 'Wird gespeichert …';
  $('score-error').textContent = '';
  try {
    if (await stats.save(scores)) $('score-dialog').close();
  } catch (error) {
    $('score-error').textContent = ['NOT_FOUND', 'METHOD_NOT_ALLOWED'].includes(error.code)
      ? 'Das Online-Backend unterstützt die Bearbeitung noch nicht. Die neue Backend-Version muss zuerst bereitgestellt werden.'
      : error.message + (error.code === 'STATS_CONFLICT' ? ' „Neu laden“ übernimmt den aktuellen Stand.' : ' Bei unklarer Bestätigung zuerst „Neu laden“ wählen.');
  } finally {
    saving = false;
    for (const key of Object.keys(names)) { $('edit-' + key).disabled = false; $('reset-' + key).disabled = false; }
    $('close-scores').disabled = false;
    $('save-scores').textContent = 'Speichern';
    $('save-scores').disabled = !stats.loaded || stats.busy;
    $('refresh-stats').disabled = stats.busy;
  }
});
window.addEventListener('pagehide', () => { opening++; manualCreation = false; pendingMode = null; connection.disconnect(); stats.dispose(); });
window.addEventListener('focus', () => {
  if (!stats.busy && !saving && !$('score-dialog').open) void stats.refresh();
});
render();
loadGames();
stats.refresh();
if (!selectedPlayer) openPlayerDialog();
initMotion();
