export function backendOrigin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) throw new Error('Ungültige Backend-Konfiguration.');
  return url.origin;
}

export function createApi(config, fetchImpl = globalThis.fetch) {
  const origin = backendOrigin(config.backendUrl);
  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchImpl(new URL(path, origin), {
        ...options, credentials: 'omit', cache: 'no-store', signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Die Anfrage wurde abgelehnt.');
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Der Server antwortet nicht. Bitte erneut versuchen.');
      if (error instanceof TypeError) throw new Error('Der Server ist nicht erreichbar. Bitte die Internetverbindung prüfen.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  return Object.freeze({
    games: () => request('/api/games'),
    stats: () => request('/api/stats'),
    createRoom: (roomCode, gameId) => request('/api/rooms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode, gameId, config: {} }),
    }),
  });
}
