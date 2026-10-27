import { SETTINGS } from '../../../shared/settings.js';
import { fail } from './errors.js';

export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function exactKeys(value, allowed, required = allowed) {
  return isObject(value) && Object.keys(value).every(key => allowed.includes(key)) &&
    required.every(key => Object.hasOwn(value, key));
}
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
export function parseMessage(raw) {
  if (typeof raw !== 'string') fail('INVALID_MESSAGE');
  if (new TextEncoder().encode(raw).byteLength > SETTINGS.maxMessageBytes) fail('MESSAGE_TOO_LARGE');
  let m;
  try { m = JSON.parse(raw); } catch { fail('INVALID_MESSAGE'); }
  if (!isObject(m) || m.v !== 1 || typeof m.type !== 'string') fail('INVALID_MESSAGE');
  const schemas = {
    ping: [], ready: ['requestId', 'ready'], start: ['requestId'],
    action: ['requestId', 'matchId', 'expectedRevision', 'action'],
    rematch: ['requestId', 'matchId'], abort: ['requestId', 'matchId'],
  };
  const fields = Object.hasOwn(schemas, m.type) ? schemas[m.type] : null;
  if (!fields || !exactKeys(m, ['v', 'type', ...fields])) fail('INVALID_MESSAGE');
  if (m.type !== 'ping' && !identifier(m.requestId)) fail('INVALID_MESSAGE');
  if (fields.includes('matchId') && !identifier(m.matchId)) fail('INVALID_MESSAGE');
  if (m.type === 'ready' && typeof m.ready !== 'boolean') fail('INVALID_MESSAGE');
  if (m.type === 'action' && (!Number.isSafeInteger(m.expectedRevision) || m.expectedRevision < 0 || !isObject(m.action))) fail('INVALID_MESSAGE');
  return m;
}
