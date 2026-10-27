import { registry } from './games/registry.js';
import { normalizePlayerName, normalizeRoomCode } from '../../shared/normalization.js';
import { exactKeys, isObject } from './protocol/messages.js';
import { fail, AppError } from './protocol/errors.js';
import { CORS, json, httpError, readJson } from './protocol/http.js';
import { validatedConfig } from './core/engine.js';
export { GameRoom } from './rooms/game-room.js';
export { GlobalStats } from './stats/global-stats.js';

export function createWorker(engines = registry) {
  return {
    async fetch(request, env) {
      let allow;
      try {
        const url = new URL(request.url);
        const wsMatch = /^\/api\/rooms\/([^/]+)\/ws$/.exec(url.pathname);
        const method = url.pathname === '/health' || url.pathname === '/api/games' || url.pathname === '/api/stats' || wsMatch
          ? 'GET' : url.pathname === '/api/rooms' ? 'POST' : null;
        if (!method) fail('NOT_FOUND');
        allow = `${method}, OPTIONS`;
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, Allow: allow } });
        if (request.method !== method) throw new AppError('METHOD_NOT_ALLOWED');
        if (url.pathname === '/health') return json({ ok: true });
        if (url.pathname === '/api/games') return json(engines.list());
        if (url.pathname === '/api/stats') return json(await env.GLOBAL_STATS.getByName('global').list());
        if (url.pathname === '/api/rooms') {
          const body = await readJson(request);
          if (!exactKeys(body, ['roomCode', 'gameId', 'config']) || typeof body.gameId !== 'string' || !isObject(body.config)) fail('INVALID_MESSAGE');
          const roomCode = normalizeRoomCode(body.roomCode);
          const config = validatedConfig(engines.get(body.gameId), body.config);
          const response = await env.GAME_ROOMS.getByName(roomCode).create({ roomCode, gameId: body.gameId, config });
          return json(response.body, response.status);
        }
        let rawCode;
        try { rawCode = decodeURIComponent(wsMatch[1]); } catch { fail('INVALID_ROOM_CODE'); }
        const roomCode = normalizeRoomCode(rawCode);
        normalizePlayerName(url.searchParams.get('name'));
        if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') fail('UPGRADE_REQUIRED');
        return await env.GAME_ROOMS.getByName(roomCode).fetch(request);
      } catch (error) {
        return httpError(error, error instanceof AppError && error.code === 'METHOD_NOT_ALLOWED'
          ? { Allow: allow === 'GET, OPTIONS' ? 'GET' : 'POST' } : {});
      }
    },
  };
}
export default createWorker();
