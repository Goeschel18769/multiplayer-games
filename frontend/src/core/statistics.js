const validRows = rows => Array.isArray(rows) && rows.every(row =>
  typeof row.displayName === 'string' && typeof row.nameKey === 'string' && Number.isSafeInteger(row.wins) && row.wins >= 0);

// Unabhängig vom Raum: höchstens drei Abrufe nach einem Sieg, kein Dauer-Polling.
export class Statistics {
  constructor(api, onChange, timers = globalThis) {
    this.api = api; this.onChange = onChange; this.timers = timers;
    this.rows = []; this.message = 'Siegestatistik wird geladen …'; this.busy = false;
    this.generation = 0; this.timer = null; this.loaded = false;
    this.error = null; this.saving = false; this.refreshAfterSave = null;
  }
  async refresh(winnerKey = null) {
    if (this.saving) { this.refreshAfterSave = winnerKey || true; return; }
    const generation = ++this.generation;
    this.timers.clearTimeout(this.timer);
    const baseline = this.rows.find(row => row.nameKey === winnerKey)?.wins ?? 0;
    const target = this.loaded ? baseline + 1 : null;
    const attempt = async index => {
      this.busy = true; this.onChange(this);
      try {
        const rows = await this.api.stats();
        if (generation !== this.generation) return;
        if (!validRows(rows)) throw new Error('Die Statistik konnte nicht gelesen werden.');
        this.rows = rows; this.loaded = true; this.error = null;
        this.message = rows.length ? 'Globale Siege, nach Anzahl sortiert.' : 'Noch keine Siege eingetragen.';
      } catch (error) {
        if (generation !== this.generation) return;
        this.message = error.message || 'Die Statistik ist vorübergehend nicht erreichbar.';
        this.error = this.message;
      }
      if (generation !== this.generation) return;
      this.busy = false;
      const delivered = target !== null && (this.rows.find(row => row.nameKey === winnerKey)?.wins ?? 0) >= target;
      if (winnerKey && !delivered && index < 2) {
        this.message += ' Ein Sieg kann kurz verzögert eintreffen; wir laden noch einmal nach.';
        this.timer = this.timers.setTimeout(() => attempt(index + 1), [1000, 3000][index]);
      } else if (winnerKey && !delivered) this.message += ' Bei Bedarf später manuell aktualisieren.';
      this.onChange(this);
    };
    await attempt(0);
  }
  async save(scores) {
    const generation = ++this.generation;
    this.timers.clearTimeout(this.timer);
    this.busy = true; this.saving = true; this.onChange(this);
    try {
      const rows = await this.api.setStats(scores);
      if (generation !== this.generation) return false;
      if (!validRows(rows)) throw new Error('Der gespeicherte Siegestand konnte nicht bestätigt werden. Bitte neu laden.');
      this.rows = rows; this.loaded = true; this.error = null; this.message = 'Siegestand gespeichert.';
      return true;
    } finally {
      this.saving = false;
      if (generation === this.generation) {
        this.busy = false; this.onChange(this);
        const queued = this.refreshAfterSave;
        this.refreshAfterSave = null;
        if (queued) void this.refresh(typeof queued === 'string' ? queued : null);
      }
    }
  }
  dispose() { this.generation++; this.timers.clearTimeout(this.timer); }
}
