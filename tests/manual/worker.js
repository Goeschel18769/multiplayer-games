import { GameRoom as ProductionGameRoom } from '../../backend/src/rooms/game-room.js';
import { createWorker } from '../../backend/src/worker.js';
import { fixtureRegistry } from '../fixtures/engine.js';

// Nur die Registry ersetzen: echte Uhr, reguläre Alarme, keine Test-RPCs.
export class GameRoom extends ProductionGameRoom {
  get engines() { return fixtureRegistry; }
}
export { GlobalStats } from '../../backend/src/stats/global-stats.js';
export default createWorker(fixtureRegistry);
