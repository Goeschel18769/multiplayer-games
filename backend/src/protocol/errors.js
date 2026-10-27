export const ERRORS = Object.freeze({
  INVALID_MESSAGE: [400, 'Ungültige Nachricht.'],
  MESSAGE_TOO_LARGE: [413, 'Nachricht zu groß.'],
  INVALID_NAME: [400, 'Ungültiger Spielername.'],
  INVALID_ROOM_CODE: [400, 'Ungültiger Raumcode.'],
  ROOM_EXISTS: [409, 'Raum existiert bereits.'],
  ROOM_NOT_FOUND: [404, 'Raum existiert nicht oder ist abgelaufen.'],
  ROOM_FULL: [409, 'Alle Spielerplätze sind belegt.'],
  ROOM_LOCKED: [409, 'Teilnehmer dieser Rauminstanz stehen bereits fest.'],
  UNKNOWN_GAME: [400, 'Unbekanntes Spiel.'],
  INVALID_CONFIG: [400, 'Ungültige Spielkonfiguration.'],
  NOT_READY: [409, 'Teilnehmer sind noch nicht startbereit.'],
  MATCH_NOT_RUNNING: [409, 'Keine laufende Partie.'],
  STALE_MATCH: [409, 'Partiekennung ist nicht aktuell.'],
  STALE_REVISION: [409, 'Spielstand ist nicht aktuell.'],
  INVALID_ACTION: [400, 'Ungültige Spielaktion.'],
  RATE_LIMITED: [429, 'Nachrichtenlimit erreicht.'],
  INTERNAL_ERROR: [500, 'Interner Fehler.'],
  NOT_FOUND: [404, 'Pfad nicht gefunden.'],
  METHOD_NOT_ALLOWED: [405, 'Methode nicht erlaubt.'],
  UPGRADE_REQUIRED: [426, 'WebSocket-Upgrade erforderlich.'],
  RESULT_CONFLICT: [409, 'Widersprüchliches Partieergebnis.'],
});
export class AppError extends Error {
  constructor(code) {
    super(ERRORS[code]?.[1] ?? ERRORS.INTERNAL_ERROR[1]);
    this.code = ERRORS[code] ? code : 'INTERNAL_ERROR';
    this.status = ERRORS[this.code][0];
  }
}
export function safeError(error) {
  const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
  return { code, message: ERRORS[code][1] };
}
export function fail(code) { throw new AppError(code); }
