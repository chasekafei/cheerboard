import type { Design } from './catalog.ts';
import { measureBoard, renderBoard } from './renderer.ts';

export function lightGeometry(width: number, height: number, orientation: Design['orientation'], dpr = 1) {
  const viewportWidth = Math.max(1, width);
  const viewportHeight = Math.max(1, height);
  const rotate = (orientation === 'landscape') !== (viewportWidth >= viewportHeight);
  const cssWidth = rotate ? viewportHeight : viewportWidth;
  const cssHeight = rotate ? viewportWidth : viewportHeight;
  const ratio = Math.min(Math.max(1, dpr), 2, 2048 / Math.max(cssWidth, cssHeight), Math.sqrt(2097152 / (cssWidth * cssHeight)));
  return { cssWidth, cssHeight, rotation: rotate ? 90 : 0, width: Math.max(1, Math.round(cssWidth * ratio)), height: Math.max(1, Math.round(cssHeight * ratio)) };
}

export function mountLightScene(root: HTMLElement, getDesign: () => Design, toggleControls: () => void) {
  const canvas = root.querySelector<HTMLCanvasElement>('#light-board')!;
  let frame = 0;
  let obscured = false;
  let disposed = false;
  let progress = 0;
  let previous = 0;
  let distance = 0;
  let geometry = lightGeometry(1, 1, 'landscape');
  let measured = { fontSize: 0, textWidth: 0 };

  const paint = (time: number) => {
    if (disposed) return;
    const design = getDesign();
    const scrolling = design.scroll && !obscured && !document.hidden;
    if (scrolling) {
      if (previous) progress += Math.min(60, time - previous) / 1000 * [0, 55, 85, 120, 170, 230][design.speed] * geometry.height / 720;
      if (progress >= distance * 2) {
        if (design.loop) progress = 0;
        else { renderBoard(canvas, { ...design, scroll: false }, geometry); previous = 0; return; }
      }
      renderBoard(canvas, design, { ...geometry, offset: (distance - progress) * (design.direction === 'left' ? 1 : -1) });
      previous = time;
      if (design.loop || progress < distance * 2) frame = requestAnimationFrame(paint);
    } else renderBoard(canvas, { ...design, scroll: false }, geometry);
  };
  const repaint = () => {
    if (disposed) return;
    cancelAnimationFrame(frame);
    const design = getDesign();
    geometry = lightGeometry(root.clientWidth, root.clientHeight, design.orientation, window.devicePixelRatio || 1);
    canvas.style.width = geometry.cssWidth + 'px';
    canvas.style.height = geometry.cssHeight + 'px';
    canvas.style.transform = 'translate(-50%, -50%) rotate(' + geometry.rotation + 'deg)';
    measured = measureBoard(canvas, design, geometry);
    distance = (geometry.width + measured.textWidth) / 2 + measured.fontSize * 0.25;
    progress = distance;
    previous = 0;
    paint(0);
  };
  const resize = () => repaint();
  const visibility = () => {
    cancelAnimationFrame(frame);
    previous = 0;
    if (!document.hidden) repaint();
  };
  const keyboard = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleControls(); }
  };
  canvas.addEventListener('click', toggleControls);
  canvas.addEventListener('keydown', keyboard);
  window.addEventListener('resize', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', visibility);
  repaint();
  return {
    repaint,
    setObscured(value: boolean) { obscured = value; repaint(); },
    destroy() {
      disposed = true;
      cancelAnimationFrame(frame);
      canvas.removeEventListener('click', toggleControls);
      canvas.removeEventListener('keydown', keyboard);
      window.removeEventListener('resize', resize);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
    },
  };
}
