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
        const methods = url.pathname === '/api/stats' ? ['GET', 'PUT']
          : url.pathname === '/health' || url.pathname === '/api/games' || wsMatch
            ? ['GET'] : url.pathname === '/api/rooms' ? ['POST'] : null;
        if (!methods) fail('NOT_FOUND');
        allow = methods.join(', ');
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, Allow: `${allow}, OPTIONS` } });
        if (!methods.includes(request.method)) throw new AppError('METHOD_NOT_ALLOWED');
        if (url.pathname === '/health') return json({ ok: true });
        if (url.pathname === '/api/games') return json(engines.list());
        if (url.pathname === '/api/stats') {
          const stats = env.GLOBAL_STATS.getByName('global');
          if (request.method === 'GET') return json(await stats.list());
          const result = await stats.setWins(await readJson(request));
          return json(result.body, result.status);
        }
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
          ? { Allow: allow } : {});
      }
    },
  };
}
export default createWorker();
