// Millisekunden; gemeinsam für Transport, Räume und spätere Clients.
export const SETTINGS = Object.freeze({
  emptyRoomTtlMs: 300000,
  heartbeatIntervalMs: 25000,
  connectionTimeoutMs: 120000,
  maxMessageBytes: 16384,
  maxHttpBodyBytes: 16384,
  rateWindowMs: 10000,
  maxMessagesPerWindow: 60,
  dedupeEntriesPerPlayer: 64,
  statsRetryBaseMs: 1000,
  statsRetryMaxMs: 60000,
});
export const CLOSE = Object.freeze({ REPLACED: 4001, TIMEOUT: 4002, EXPIRED: 4003 });
