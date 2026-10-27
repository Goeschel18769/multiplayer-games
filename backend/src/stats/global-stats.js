import { DurableObject } from 'cloudflare:workers';
import { normalizePlayerName } from '../../../shared/normalization.js';
import { exactKeys } from '../protocol/messages.js';
import { fail } from '../protocol/errors.js';

export class GlobalStats extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS wins (name_key TEXT PRIMARY KEY, display_name TEXT NOT NULL, wins INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS processed_matches (match_id TEXT PRIMARY KEY, result TEXT NOT NULL)');
  }
  recordWin(event) {
    if (!exactKeys(event, ['matchId', 'displayName', 'nameKey']) ||
        typeof event.matchId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(event.matchId)) fail('INVALID_MESSAGE');
    const name = normalizePlayerName(event.displayName);
    if (name.nameKey !== event.nameKey || name.displayName !== event.displayName) fail('INVALID_NAME');
    // Anzeigename ist Teil des Ergebnisses: Wiederholungen müssen identisch sein.
    const result = JSON.stringify({ ...name, type: 'won' });
    return this.ctx.storage.transactionSync(() => {
      const previous = this.sql.exec('SELECT result FROM processed_matches WHERE match_id = ?', event.matchId).toArray()[0];
      if (previous) {
        if (previous.result !== result) fail('RESULT_CONFLICT');
        return { ok: true };
      }
      this.sql.exec('INSERT INTO processed_matches (match_id, result) VALUES (?, ?)', event.matchId, result);
      this.sql.exec('INSERT INTO wins (name_key, display_name, wins) VALUES (?, ?, 1) ON CONFLICT(name_key) DO UPDATE SET display_name = excluded.display_name, wins = wins.wins + 1', name.nameKey, name.displayName);
      return { ok: true };
    });
  }
  list() {
    return this.sql.exec('SELECT name_key AS nameKey, display_name AS displayName, wins FROM wins ORDER BY wins DESC, name_key COLLATE BINARY ASC').toArray();
  }
}
