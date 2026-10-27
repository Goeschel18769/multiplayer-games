import { SETTINGS } from '../../../shared/settings.js';
import { AppError, safeError, fail } from './errors.js';

export const CORS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
});
export function json(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers: { ...CORS, ...headers } });
}
export function httpError(error, headers = {}) {
  return json(safeError(error), error instanceof AppError ? error.status : 500, headers);
}
export async function readJson(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') fail('INVALID_MESSAGE');
  const reader = request.body?.getReader();
  if (!reader) fail('INVALID_MESSAGE');
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > SETTINGS.maxHttpBodyBytes) {
        await reader.cancel();
        fail('MESSAGE_TOO_LARGE');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof AppError) throw error;
    fail('INVALID_MESSAGE');
  } finally { reader.releaseLock(); }
}
