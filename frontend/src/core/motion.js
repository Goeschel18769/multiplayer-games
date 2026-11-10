// Dezente räumliche Reaktion; kein Dragging und keine dauerhafte Animationsschleife.
export function initMotion(root = document, viewport = window) {
  if (typeof root.querySelectorAll !== 'function' || typeof viewport.matchMedia !== 'function') return;
  const reduced = viewport.matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = viewport.matchMedia('(hover: hover) and (pointer: fine)');
  for (const tile of root.querySelectorAll('[data-tilt]')) {
    let frame = null;
    let bounds = null;
    const reset = () => {
      if (frame !== null) viewport.cancelAnimationFrame(frame);
      frame = null;
      bounds = null;
      for (const property of ['--tilt-x', '--tilt-y', '--glow-x', '--glow-y']) tile.style.removeProperty(property);
    };
    tile.addEventListener('pointerenter', () => { bounds = tile.getBoundingClientRect(); });
    tile.addEventListener('pointermove', event => {
      if (reduced.matches || !pointer.matches || tile.disabled || !bounds) return;
      if (frame !== null) viewport.cancelAnimationFrame(frame);
      const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
      const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
      frame = viewport.requestAnimationFrame(() => {
        const strength = root.documentElement.dataset.theme === 'office' ? .4 : 1;
        tile.style.setProperty('--tilt-x', `${(0.5 - y) * 4 * strength}deg`);
        tile.style.setProperty('--tilt-y', `${(x - 0.5) * 5 * strength}deg`);
        tile.style.setProperty('--glow-x', `${x * 100}%`);
        tile.style.setProperty('--glow-y', `${y * 100}%`);
        frame = null;
      });
    });
    tile.addEventListener('pointerleave', reset);
    tile.addEventListener('pointercancel', reset);
    reduced.addEventListener('change', reset);
    pointer.addEventListener('change', reset);
  }
}
