// Öffentliche Vorlage für modulare Entwicklungsquellen; keine Secrets.
// Für file:// gemeinsam mit der App in ein klassisches Bundle (z. B. IIFE)
// bündeln. Im Release kein type="module", keine Laufzeit-Imports und keine
// lokale JSON-Konfiguration per fetch laden. Änderungen erfordern neuen Build.
export const CONFIG = Object.freeze({
  backendUrl: 'https://multiplayer-games.haldimann-joel.workers.dev',
  protocolVersion: 1,
});

// Erwartet bereits nach dem dokumentierten Vertrag normalisierte Eingaben.
// encodeURIComponent kodiert das einzelne Pfadsegment; searchParams den Namen.
export function roomWebSocketUrl(roomCode, displayName) {
  const url = new URL(`/api/rooms/${encodeURIComponent(roomCode)}/ws`, CONFIG.backendUrl);
  url.searchParams.set('name', displayName);
  if (url.protocol === 'https:') url.protocol = 'wss:';
  else if (url.protocol === 'http:') url.protocol = 'ws:';
  else throw new Error('Backend muss HTTP oder HTTPS verwenden.');
  return url.href;
}

// Keine verbindlichen Serverfristen hier duplizieren. Nach welcome insbesondere
// settings.heartbeatIntervalMs für den Ping-Timer verwenden; weitere Grenzen
// aus welcome.settings lesen. HTTP-Aufrufe mit credentials: 'omit' senden.
