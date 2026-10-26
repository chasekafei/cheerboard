import type { Design } from './catalog.ts';
import { measureBoard, renderBoard, resolveRepeatPeriod } from './renderer.ts';

/** CSS pixels per second, using the unrotated board's displayed CSS height. */
export function scrollPixelsPerSecond(speed: number, boardHeight: number): number {
  const level = Number.isFinite(speed) ? Math.max(1, Math.min(5, Math.round(speed))) : 1;
  const height = Number.isFinite(boardHeight) ? Math.max(0, boardHeight) : 0;
  return [100, 170, 260, 380, 540][level - 1] * height / 720;
}

export function lightGeometry(width: number, height: number, orientation: Design['orientation'], dpr = 1) {
  const viewportWidth = Math.max(1, width);
  const viewportHeight = Math.max(1, height);
  const rotate = (orientation === 'landscape') !== (viewportWidth >= viewportHeight);
  const cssWidth = rotate ? viewportHeight : viewportWidth;
  const cssHeight = rotate ? viewportWidth : viewportHeight;
  const ratio = Math.min(Math.max(1, dpr), 2, 2048 / Math.max(cssWidth, cssHeight), Math.sqrt(2097152 / (cssWidth * cssHeight)));
  return { cssWidth, cssHeight, rotation: rotate ? 90 : 0, width: Math.max(1, Math.round(cssWidth * ratio)), height: Math.max(1, Math.round(cssHeight * ratio)) };
}

function visualKey(design: Design): string {
  return JSON.stringify([design.text, design.templateId, design.paletteId, design.foreground,
    design.background, design.accent, design.dotShape, design.dotEmoji, design.dotDensity,
    design.glow, design.fontScale, design.fontId, design.gradient, design.gradientEnd,
    design.gradientAngle, design.layout, design.sticker, design.border, design.scroll]);
}

export function mountLightScene(root: HTMLElement, getDesign: () => Design, toggleControls: () => void) {
  const canvas = root.querySelector<HTMLCanvasElement>('#light-board')!;
  let frame = 0;
  let obscured = false;
  let disposed = false;
  let completed = false;
  // Keep position in CSS pixels so DPR changes never change the apparent speed.
  let offset = 0;
  let previous: number | null = null;
  let distance = 0;
  let repeatGap = 0;
  let cycle = 0;
  let geometry = lightGeometry(1, 1, 'landscape');
  let current: Design | null = null;
  let lastVisualKey = '';
  let lastGeometryKey = '';
  let lastMeasureKey = '';
  let lastMotionKey = '';

  const canAnimate = () => !disposed && !obscured && !document.hidden && Boolean(current?.scroll) && !completed;
  const cancel = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    previous = null;
  };
  const draw = () => {
    if (!current || disposed) return;
    if (completed) renderBoard(canvas, { ...current, scroll: false }, geometry);
    else renderBoard(canvas, current, { ...geometry, offset: offset * geometry.width / geometry.cssWidth,
      ...(current.scroll && current.loop ? { repeatGap } : {}) });
  };
  const schedule = () => {
    if (!frame && canAnimate()) frame = requestAnimationFrame(paint);
  };
  const paint = (time: number) => {
    frame = 0;
    if (!canAnimate() || !current) { previous = null; return; }
    if (previous !== null) {
      const elapsed = Math.max(0, Math.min(100, time - previous)) / 1000;
      const direction = current.direction === 'left' ? -1 : 1;
      offset += elapsed * scrollPixelsPerSecond(current.speed, geometry.cssHeight) * direction;
      if (current.loop) {
        // Neighboring copies are one sentence plus a small gap apart, so a
        // whole-period phase change is visually identical in either direction.
        if (cycle > 0) offset %= cycle;
      } else if (direction < 0 ? offset <= -distance : offset >= distance) {
        completed = true;
        offset = 0;
      }
    }
    previous = completed ? null : time;
    draw();
    schedule();
  };
  /** Force a measurement after asynchronously loaded fonts change glyph metrics. */
  const repaint = (force = false) => {
    if (disposed) return;
    const design = { ...getDesign() };
    const nextGeometry = lightGeometry(root.clientWidth, root.clientHeight, design.orientation, window.devicePixelRatio || 1);
    const geometryKey = JSON.stringify(nextGeometry);
    const nextVisualKey = visualKey(design);
    const measureKey = JSON.stringify([nextGeometry.width, nextGeometry.height, design.text,
      design.templateId, design.layout, design.fontScale, design.fontId, design.scroll]);
    const motionKey = JSON.stringify([design.speed, design.direction, design.loop]);
    const changed = force || geometryKey !== lastGeometryKey || nextVisualKey !== lastVisualKey || motionKey !== lastMotionKey;
    if (!changed) { schedule(); return; }

    cancel();
    const geometryChanged = geometryKey !== lastGeometryKey;
    const reset = !current || current.scroll !== design.scroll || current.text !== design.text || current.layout !== design.layout;
    const restart = completed && motionKey !== lastMotionKey;
    geometry = nextGeometry;
    if (geometryChanged) {
      canvas.style.width = geometry.cssWidth + 'px';
      canvas.style.height = geometry.cssHeight + 'px';
      canvas.style.transform = 'translate(-50%, -50%) rotate(' + geometry.rotation + 'deg)';
    }
    if (force || measureKey !== lastMeasureKey) {
      const measured = measureBoard(canvas, design, geometry);
      distance = ((geometry.width + measured.textWidth) / 2 + measured.fontSize * 0.25) * geometry.cssWidth / geometry.width;
      repeatGap = measured.fontSize * 0.38;
      // Renderer owns the same minimum period used to bound very small glyphs.
      cycle = resolveRepeatPeriod(measured.textWidth, repeatGap, geometry.width) * geometry.cssWidth / geometry.width;
    }
    if (reset || restart) { offset = 0; completed = false; }
    else if (design.scroll && design.loop && cycle > 0) offset %= cycle;
    else if (distance > 0) offset = Math.max(-distance, Math.min(distance, offset));
    current = design;
    lastVisualKey = nextVisualKey;
    lastGeometryKey = geometryKey;
    lastMeasureKey = measureKey;
    lastMotionKey = motionKey;
    draw();
    schedule();
  };
  const resize = () => repaint();
  const visibility = () => {
    if (document.hidden) cancel();
    else repaint();
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
    setObscured(value: boolean) {
      if (disposed || obscured === value) return;
      obscured = value;
      // A sheet freezes the current scrolling frame; it never changes the layout
      // to fit the complete sentence. Edits may still repaint that frozen frame.
      if (obscured) cancel();
      else repaint();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      cancel();
      canvas.removeEventListener('click', toggleControls);
      canvas.removeEventListener('keydown', keyboard);
      window.removeEventListener('resize', resize);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
    },
  };
}
