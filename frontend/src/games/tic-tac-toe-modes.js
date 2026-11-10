// Gemeinsame Beschreibungen für Auswahl, Raumziel und Brettdarstellung.
export const TTT_MODES = Object.freeze({
  classic: Object.freeze({
    id: 'classic', label: '3 × 3', boardSize: 3, winLength: 3,
    roomCode: 'BEN-JOEL-TTT', config: Object.freeze({}),
  }),
  five: Object.freeze({
    id: 'five', label: '15 × 15', boardSize: 15, winLength: 5,
    roomCode: 'BEN-JOEL-TTT-15', config: Object.freeze({ mode: 'five' }),
  }),
});
