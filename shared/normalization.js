import { AppError } from '../backend/src/protocol/errors.js';

export function normalizePlayerName(value) {
  if (typeof value !== 'string' || /\p{Cc}/u.test(value)) throw new AppError('INVALID_NAME');
  const displayName = value.normalize('NFC').trim();
  if ([...displayName].length < 1 || [...displayName].length > 32 ||
      !/^[\p{L}\p{M}\p{N} _-]+$/u.test(displayName)) throw new AppError('INVALID_NAME');
  return { displayName, nameKey: displayName.toLowerCase() };
}

export function normalizeRoomCode(value) {
  if (typeof value !== 'string') throw new AppError('INVALID_ROOM_CODE');
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(code)) throw new AppError('INVALID_ROOM_CODE');
  return code;
}
