// Nur lokale Platzierungshilfe. Bestätigte Flotten und Schüsse prüft stets der Server.
export const FLEET = Object.freeze([
  Object.freeze({ label: 'Eckschiff', size: 5 }), Object.freeze({ label: '4er', size: 4 }),
  Object.freeze({ label: '3er I', size: 3 }), Object.freeze({ label: '3er II', size: 3 }), Object.freeze({ label: '2er', size: 2 }),
]);
export function shapeOffsets(index, rotation = 0) {
  let offsets = index === 0 ? [[0,0],[0,1],[0,2],[1,0],[2,0]] : Array.from({ length: FLEET[index].size }, (_, column) => [0, column]);
  for (let turn = 0; turn < rotation; turn++) offsets = offsets.map(([row, column]) => [column, -row]);
  const minRow = Math.min(...offsets.map(([row]) => row)), minColumn = Math.min(...offsets.map(([, column]) => column));
  return offsets.map(([row, column]) => [row - minRow, column - minColumn]);
}
export function placementCells(index, placement) {
  if (!placement || !Number.isInteger(placement.cell) || placement.cell < 0 || placement.cell >= 100 ||
      !Number.isInteger(placement.rotation) || placement.rotation < 0 || placement.rotation > 3) return null;
  const row = Math.floor(placement.cell / 10), column = placement.cell % 10;
  const offsets = shapeOffsets(index, placement.rotation);
  if (offsets.some(([r, c]) => row + r >= 10 || column + c >= 10)) return null;
  return offsets.map(([r, c]) => (row + r) * 10 + column + c).sort((a, b) => a - b);
}
export function canPlace(placements, index, placement) {
  const cells = placementCells(index, placement);
  if (!cells) return false;
  const occupied = new Set(placements.flatMap((other, i) => i === index ? [] : placementCells(i, other) || []));
  return cells.every(cell => !occupied.has(cell));
}
export function completeFleet(placements) {
  return Array.isArray(placements) && placements.length === FLEET.length && placements.every((placement, index) =>
    placement !== null && canPlace(placements, index, placement));
}
export function randomFleet(random = () => {
  const value = new Uint32Array(1); crypto.getRandomValues(value); return value[0] / 2 ** 32;
}) {
  const placements = Array(FLEET.length).fill(null);
  function place(index) {
    if (index === FLEET.length) return true;
    const candidates = [];
    for (let rotation = 0; rotation < 4; rotation++) for (let cell = 0; cell < 100; cell++) candidates.push({ cell, rotation });
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const candidate of candidates) if (canPlace(placements, index, candidate)) {
      placements[index] = candidate;
      if (place(index + 1)) return true;
    }
    placements[index] = null;
    return false;
  }
  if (!place(0)) throw new Error('Die Flotte konnte nicht platziert werden. Bitte erneut versuchen.');
  return placements;
}
