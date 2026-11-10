import { FLEET, shapeOffsets } from './battleship-placement.js';

const namespace = 'http://www.w3.org/2000/svg';
let illustrationId = 0;
const painted = new WeakMap();
const svg = (tag, attributes = {}) => {
  const node = document.createElementNS(namespace, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
};

// Nur bekannte Schiffsgeometrie zeichnen. Die Darstellung errät keine fremden Positionen.
function geometry(index, cells) {
  const row = Math.min(...cells.map(cell => Math.floor(cell / 10))), column = Math.min(...cells.map(cell => cell % 10));
  const offsets = cells.map(cell => [Math.floor(cell / 10) - row, cell % 10 - column]);
  const signature = values => values.map(([r, c]) => r * 10 + c).sort((a, b) => a - b).join(',');
  const rotation = [0, 1, 2, 3].find(turn => signature(shapeOffsets(index, turn)) === signature(offsets));
  if (rotation === undefined) return null;
  return { row, column, rotation, width: Math.max(...offsets.map(([, c]) => c)) + 1, height: Math.max(...offsets.map(([r]) => r)) + 1 };
}

export function createShipIllustration(index, rotation = 0) {
  const length = FLEET[index].size * 100, baseWidth = index === 0 ? 300 : length, baseHeight = index === 0 ? 300 : 100;
  const width = rotation % 2 ? baseHeight : baseWidth, height = rotation % 2 ? baseWidth : baseHeight;
  const image = svg('svg', { class: 'bs-naval-ship', viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true', focusable: 'false' });
  const id = `naval-${++illustrationId}`, defs = svg('defs');
  for (const [name, start, middle, end] of [
    ['hull', '--bs-hull-dark', '--bs-hull', '--bs-hull-dark'],
    ['deck', '--bs-deck-light', '--bs-deck', '--bs-deck-dark'],
  ]) {
    const gradient = svg('linearGradient', { id: `${id}-${name}`, x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    for (const [offset, variable] of [['0%', start], ['45%', middle], ['100%', end]]) gradient.append(svg('stop', { offset, 'stop-color': `var(${variable})` }));
    defs.append(gradient);
  }
  image.append(defs);
  const transforms = ['', `translate(${baseHeight} 0) rotate(90)`, `translate(${baseWidth} ${baseHeight}) rotate(180)`, `translate(0 ${baseWidth}) rotate(270)`];
  const ship = svg('g', { transform: transforms[rotation] }); image.append(ship);
  const path = (d, fill = 'none', extra = {}) => { const item = svg('path', { d, fill, ...extra }); ship.append(item); return item; };
  const rect = (x, y, w, h, fill, extra = {}) => ship.append(svg('rect', { x, y, width: w, height: h, rx: 3, fill, ...extra }));
  const circle = (cx, cy, r, fill, extra = {}) => ship.append(svg('circle', { cx, cy, r, fill, ...extra }));
  const line = (d, color = '--bs-rail', strokeWidth = 2, extra = {}) => path(d, 'none', { stroke: `var(${color})`, 'stroke-width': strokeWidth, ...extra });
  const turret = (x, y, turn = 0, twin = true) => {
    const gun = svg('g', { transform: `translate(${x} ${y}) rotate(${turn})` });
    gun.append(svg('circle', { r: 19, fill: 'var(--bs-hull-dark)' }),
      svg('path', { d: 'M-13-13 L9-15 L18-8 V8 L9 15 L-13 13 Z', fill: 'var(--bs-deck-light)', stroke: 'var(--bs-hull-dark)', 'stroke-width': 2 }));
    for (const barrelY of twin ? [-5, 5] : [0]) {
      gun.append(svg('path', { d: `M9 ${barrelY} H42`, stroke: 'var(--bs-hull-dark)', 'stroke-width': 5 }),
        svg('path', { d: `M10 ${barrelY - 1} H39`, stroke: 'var(--bs-rail)', 'stroke-width': 1.5 }));
    }
    ship.append(gun);
  };
  const bridge = (x, y, w = 49, h = 40) => {
    rect(x - w / 2 + 2, y - h / 2 + 4, w, h, 'var(--bs-hull-dark)');
    rect(x - w / 2, y - h / 2, w, h, 'var(--bs-deck-light)', { stroke: 'var(--bs-hull-dark)', 'stroke-width': 2 });
    rect(x - w / 2 + 5, y - h / 2 + 6, w - 10, h - 12, 'var(--bs-deck)');
    rect(x + w / 2 - 11, y - h / 2 + 6, 5, h - 12, 'var(--bs-window)', { rx: 1 });
    line(`M${x - 9} ${y} H${x + 9} M${x} ${y - 14} V${y + 14}`, '--bs-hull-dark', 2);
    circle(x, y, 5, 'var(--bs-rail)');
    line(`M${x - 13} ${y - 10} L${x + 13} ${y - 10}`, '--bs-window', 3);
  };
  if (index === 0) {
    const hull = 'M24 16 H235 Q270 20 291 50 Q270 80 235 84 H101 Q84 84 84 101 V278 Q84 286 76 286 H24 Q16 286 16 278 V24 Q16 16 24 16 Z';
    path(hull, `url(#${id}-hull)`, { stroke: 'var(--bs-hull-dark)', 'stroke-width': 3 });
    path('M28 27 H231 Q259 29 276 50 Q259 71 231 73 H93 Q73 73 73 93 V273 H27 V28 Z', `url(#${id}-deck)`);
    line('M23 279 V25 H235 Q264 30 282 50 Q264 73 235 77 H97 Q77 77 77 97 V279', '--bs-rail', 1.5, { opacity: .8 });
    line('M32 92 V263 M92 33 H239', '--bs-hull-dark', 1, { opacity: .4 });
    turret(223, 50); turret(50, 229, 90);
    bridge(50, 50, 42, 42);
    for (const y of [114, 146]) { rect(35, y, 30, 24, 'var(--bs-hull-dark)'); rect(38, y + 3, 24, 15, 'var(--bs-deck-light)'); }
    for (const x of [110, 140]) { rect(x, 38, 20, 24, 'var(--bs-hull-dark)'); line(`M${x + 5} 41 V59 M${x + 13} 41 V59`, '--bs-deck-light', 4); }
    for (const y of [96, 180]) { rect(21, y, 6, 22, 'var(--bs-rail)'); rect(73, y, 6, 22, 'var(--bs-rail)'); }
  } else {
    const hull = `M21 14 H${length - 66} Q${length - 27} 18 ${length - 7} 50 Q${length - 27} 82 ${length - 66} 86 H21 Q12 86 12 77 V23 Q12 14 21 14 Z`;
    path(hull, `url(#${id}-hull)`, { stroke: 'var(--bs-hull-dark)', 'stroke-width': 3 });
    path(`M24 25 H${length - 70} Q${length - 38} 27 ${length - 22} 50 Q${length - 38} 73 ${length - 70} 75 H24 Z`, `url(#${id}-deck)`);
    line(`M19 78 V22 H${length - 68} Q${length - 32} 25 ${length - 15} 50 Q${length - 32} 77 ${length - 68} 78 Z`, '--bs-rail', 1.5, { opacity: .8 });
    line(`M28 31 H${length - 82} M28 69 H${length - 82}`, '--bs-hull-dark', 1, { opacity: .35 });
    if (index !== 4) {
      circle(46, 50, 17, 'none', { stroke: 'var(--bs-rail)', 'stroke-width': 1.5 });
      line('M40 41 V59 M52 41 V59 M40 50 H52', '--bs-rail', 2);
    } else rect(30, 34, 23, 32, 'var(--bs-hull-dark)');
    const center = length * (index === 4 ? .44 : .48);
    bridge(center, 50, index === 1 ? 60 : 43, 40);
    turret(length - (index === 4 ? 62 : 76), 50, 0, index !== 4);
    if (index === 1) turret(100, 50, 180);
    for (const x of [center - 43, center + 32]) {
      rect(x, 38, 16, 24, 'var(--bs-hull-dark)');
      line(`M${x + 4} 42 V58 M${x + 11} 42 V58`, '--bs-deck-light', 3);
    }
    for (const x of [center - 27, center + 22]) {
      rect(x, 19, 20, 7, 'var(--bs-rail)', { rx: 4 }); rect(x, 74, 20, 7, 'var(--bs-rail)', { rx: 4 });
    }
    circle(length - 29, 50, 3, 'var(--bs-hull-dark)');
  }
  return image;
}

export function renderFleetIllustrations(layer, ships) {
  const signature = JSON.stringify(ships);
  if (painted.get(layer) === signature) return;
  painted.set(layer, signature); layer.replaceChildren();
  for (const ship of ships) {
    const position = geometry(ship.index, ship.cells);
    if (!position) continue;
    const illustration = createShipIllustration(ship.index, position.rotation);
    illustration.dataset.ship = String(ship.index); illustration.dataset.sunk = String(ship.sunk);
    illustration.style.left = `${position.column * 10}%`; illustration.style.top = `${position.row * 10}%`;
    illustration.style.width = `${position.width * 10}%`; illustration.style.height = `${position.height * 10}%`;
    layer.append(illustration);
  }
}
