import { TUBE_FONT } from './fonts.ts';
import { drawSoftNeonTube, type NeonGradientBounds } from './neon-tube.ts';

type Paint = CanvasRenderingContext2D['fillStyle'];

export type NeonTextOptions = {
  glow: number;
  paint: Paint;
  core: Paint;
  glowColor: string;
  foreground?: string;
  gradientEnd?: string;
  gradientAngle?: number;
  gradientBounds?: NeonGradientBounds;
  /** Bitmap dimensions, before the caller's horizontal text compression. */
  viewportWidth: number;
  viewportHeight: number;
  /** The caller scales horizontally around the supplied text center x. */
  textScaleX?: number;
};

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clearFilter(ctx: CanvasRenderingContext2D): boolean {
  if (typeof ctx.filter !== 'string') return false;
  try {
    ctx.filter = 'none';
    return ctx.filter === 'none';
  } catch {
    return false;
  }
}

let visualBlurSupport: boolean | null = null;
type BlurSurface = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  blurred: HTMLCanvasElement;
  blurredContext: CanvasRenderingContext2D;
  width: number;
  height: number;
};
const blurSurfaces = new Map<string, BlurSurface>();
const MAX_BLUR_SURFACES = 24;

/** Clear reusable fallback layers after packaged fonts become ready. */
export function clearNeonBlurCache(): void {
  blurSurfaces.clear();
}

/**
 * Some embedded WebViews expose a writable `filter` property but ignore it
 * while painting. A round-trip setter check therefore is not enough: the
 * displaced projection would become a sharp, overly bright duplicate. Probe a
 * tiny local canvas once and use the direct convolution fallback when pixels do
 * not spread.
 */
function hasVisualBlur(): boolean {
  if (visualBlurSupport !== null) return visualBlurSupport;
  // The node test double has no DOM. Keep its filter contract testable while
  // real browser canvases go through the pixel probe below.
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return true;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 7; canvas.height = 7;
    const probe = canvas.getContext('2d');
    if (!probe || typeof probe.filter !== 'string') { visualBlurSupport = false; return false; }
    probe.clearRect(0, 0, 7, 7);
    probe.filter = 'blur(1px)';
    if (!String(probe.filter).startsWith('blur(')) { visualBlurSupport = false; return false; }
    probe.fillStyle = '#fff';
    probe.fillRect(3, 3, 1, 1);
    probe.filter = 'none';
    const pixels = probe.getImageData(0, 0, 7, 7).data;
    const alphaAt = (x: number, y: number) => pixels[(y * 7 + x) * 4 + 3];
    visualBlurSupport = alphaAt(2, 3) > 0 || alphaAt(4, 3) > 0 || alphaAt(3, 2) > 0 || alphaAt(3, 4) > 0;
  } catch {
    visualBlurSupport = false;
  }
  return visualBlurSupport;
}

/** Setting an unknown Canvas property is allowed, so verify the native setter. */
function acceptsBlur(ctx: CanvasRenderingContext2D, blur: number): boolean {
  if (typeof ctx.filter !== 'string') return false;
  try {
    ctx.filter = `blur(${blur}px)`;
    const accepted = ctx.filter.indexOf('blur(') === 0 && hasVisualBlur();
    ctx.filter = 'none';
    return accepted;
  } catch {
    return false;
  }
}

/** Small Gaussian convolution fallback when neither pixel masks nor native blur work. */
function softenedFill(ctx: CanvasRenderingContext2D, line: string, x: number, y: number,
  radius: number, alpha: number): void {
  // A 5x5 separable Gaussian avoids the blocky copies produced by a 3x3
  // cross while staying small enough for scrolling WebViews.
  const taps = [1, 4, 6, 4, 1];
  ctx.shadowBlur = 0;
  for (let row = 0; row < 5; row++) for (let column = 0; column < 5; column++) {
    ctx.globalAlpha = 1 - Math.exp(-alpha * taps[row] * taps[column] / 128);
    ctx.fillText(line, x + (column - 2) * radius * 0.5, y + (row - 2) * radius * 0.5);
  }
}

/**
 * Blur a glyph through a small reusable bitmap. Downsampling before the
 * source-over draw gives iOS a real soft edge even when Canvas `filter` and
 * shadow alpha are unreliable. The caller's transform and clip stay intact.
 */
function blurFill(ctx: CanvasRenderingContext2D, line: string, x: number, y: number,
  fontSize: number, paint: Paint, glowColor: string, radius: number, alpha: number,
  stroke = false, lineWidth = 0): boolean {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return false;
  try {
    const metrics = ctx.measureText(line);
    const textWidth = Number.isFinite(metrics.width) ? Math.max(1, metrics.width) : Math.max(1, fontSize * Array.from(line).length);
    const spread = Math.max(2, radius * 2);
    const destinationWidth = Math.ceil(textWidth + spread * 2);
    const destinationHeight = Math.ceil(fontSize * 1.7 + spread * 2);
    // Draw at a reduced resolution, then blur that small source with a
    // weighted image pass before scaling it back up. The low-resolution blur
    // keeps the target sigma proportional to the requested radius without
    // allocating a full-size per-frame surface.
    const reduction = Math.max(1, Math.min(24, Math.round(Math.max(1, radius) / 4)));
    const sourceWidth = Math.max(1, Math.ceil(destinationWidth / reduction));
    const sourceHeight = Math.max(1, Math.ceil(destinationHeight / reduction));
    const color = typeof paint === 'string' ? paint : glowColor;
    const key = JSON.stringify([ctx.font, line, color, Math.round(radius * 100) / 100, stroke, Math.round(lineWidth * 100) / 100, sourceWidth, sourceHeight]);
    let surface = blurSurfaces.get(key);
    if (!surface || surface.width !== sourceWidth || surface.height !== sourceHeight) {
      const canvas = document.createElement('canvas');
      canvas.width = sourceWidth; canvas.height = sourceHeight;
      const context = canvas.getContext('2d');
      if (!context) return false;
      const blurred = document.createElement('canvas');
      blurred.width = sourceWidth; blurred.height = sourceHeight;
      const blurredContext = blurred.getContext('2d');
      if (!blurredContext) return false;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, sourceWidth, sourceHeight);
      context.save();
      context.scale(1 / reduction, 1 / reduction);
      context.font = ctx.font;
      context.textAlign = 'center'; context.textBaseline = 'middle';
      context.lineJoin = 'round'; context.lineCap = 'round'; context.miterLimit = 2;
      context.fillStyle = color; context.strokeStyle = color; context.lineWidth = lineWidth;
      context.globalAlpha = 1;
      const centerX = destinationWidth / 2, centerY = destinationHeight / 2;
      if (stroke) context.strokeText(line, centerX, centerY);
      context.fillText(line, centerX, centerY);
      context.restore();
      blurredContext.setTransform(1, 0, 0, 1, 0, 0);
      blurredContext.clearRect(0, 0, sourceWidth, sourceHeight);
      blurredContext.imageSmoothingEnabled = true;
      blurredContext.imageSmoothingQuality = 'high';
      const step = Math.max(0.5, (radius / 2) / reduction);
      const taps = [1, 4, 6, 4, 1];
      for (let row = 0; row < 5; row++) for (let column = 0; column < 5; column++) {
        blurredContext.globalAlpha = taps[row] * taps[column] / 256;
        blurredContext.drawImage(canvas, (column - 2) * step, (row - 2) * step);
      }
      blurredContext.globalAlpha = 1;
      surface = { canvas, context, blurred, blurredContext, width: sourceWidth, height: sourceHeight };
      if (blurSurfaces.size >= MAX_BLUR_SURFACES) blurSurfaces.delete(blurSurfaces.keys().next().value!);
      blurSurfaces.set(key, surface);
    } else {
      blurSurfaces.delete(key); blurSurfaces.set(key, surface);
    }
    ctx.save();
    try {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = alpha;
      ctx.drawImage(surface.blurred, 0, 0, sourceWidth, sourceHeight,
        x - destinationWidth / 2, y - destinationHeight / 2, destinationWidth, destinationHeight);
    } finally { ctx.restore(); }
    return true;
  } catch { return false; }
}

/**
 * Draw the same Thin glyph as a soft, displaced projection and a bright tube.
 * The body uses small cached glyph distance fields, with a continuous color
 * and alpha falloff instead of a white filled glyph inside a colored outline.
 * Keep the caller's transform/clip intact so preview and export share this path.
 */
export function drawNeonText(ctx: CanvasRenderingContext2D, line: string, x: number, y: number,
  fontSize: number, options: NeonTextOptions): void {
  if (!line || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(fontSize) || fontSize <= 0) return;
  const strength = Math.max(0, Math.min(100, finite(options.glow, 65))) / 100;
  const width = Math.max(1, finite(options.viewportWidth, 1));
  const height = Math.max(1, finite(options.viewportHeight, 1));
  const scaleX = Math.max(0.01, finite(options.textScaleX ?? 1, 1));
  const alpha = Math.max(0, Math.min(1, finite(ctx.globalAlpha, 1)));
  const tubeWidth = Math.max(0.6, fontSize * 0.016);

  ctx.save();
  try {
    ctx.font = `${TUBE_FONT.weight} ${fontSize}px ${TUBE_FONT.family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.miterLimit = 2;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowColor = options.glowColor;
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    const hasFilter = clearFilter(ctx);
    // Compression is applied around x by renderBoard. Convert only the clip
    // back to that local space; never replace the caller's transform.
    ctx.beginPath();
    ctx.rect(x - x / scaleX, 0, width / scaleX, height);
    ctx.clip();
    ctx.fillStyle = options.paint;
    ctx.strokeStyle = options.paint;
    ctx.lineWidth = tubeWidth;

    if (strength > 0) {
      const projectionY = y + fontSize * (0.08 + strength * 0.06);
      const projectionBlur = fontSize * (0.03 + strength * 0.04);
      ctx.lineWidth = tubeWidth * 1.35;
      const nativeBlur = hasFilter && acceptsBlur(ctx, projectionBlur);
      if (nativeBlur) {
        // This is the complete colored glyph moved downward, rather than
        // merely a shadow trailing from the sharp upper glyph.
        ctx.filter = `blur(${projectionBlur * 0.7}px)`;
        ctx.globalAlpha = alpha * strength * 0.55;
        ctx.strokeText(line, x, projectionY);
        ctx.fillText(line, x, projectionY);
      } else {
        // Do not use Canvas shadows here. iOS can ignore globalAlpha on a
        // shadow and turn this into an opaque duplicate. A small direct
        // convolution keeps the displacement and respects alpha reliably.
        if (!blurFill(ctx, line, x, projectionY, fontSize, options.paint, options.glowColor,
          Math.max(1, projectionBlur * 1.2), alpha * strength * 0.22, true, ctx.lineWidth)) {
          ctx.fillStyle = options.paint;
          softenedFill(ctx, line, x, projectionY, Math.max(0.5, projectionBlur * 0.35), alpha * strength * 0.22);
        }
      }
      if (hasFilter) ctx.filter = 'none';
      ctx.lineWidth = tubeWidth;

      // Blur the entire light source. A shadow alone would also leave a sharp
      // solid glyph underneath the softly shaded tube.
      for (const [blur, opacity] of [
        [fontSize * (0.3 + strength * 0.45), 0.8],
        [fontSize * (0.1 + strength * 0.2), 0.9],
        [fontSize * (0.035 + strength * 0.08), 0.95],
      ]) {
        const filter = nativeBlur && acceptsBlur(ctx, blur / 2);
        // A direct convolution is more predictable than Canvas shadows on
        // iOS, so use a smaller radius and a quarter of the native opacity.
        ctx.globalAlpha = alpha * strength * opacity;
        if (filter) {
          ctx.filter = `blur(${blur / 2}px)`;
          ctx.shadowBlur = 0;
          ctx.fillText(line, x, y);
        } else {
          if (!blurFill(ctx, line, x, y, fontSize, options.paint, options.glowColor,
            Math.max(1, blur * 0.75), alpha * strength * opacity * 0.42)) {
            ctx.fillStyle = options.paint;
            softenedFill(ctx, line, x, y, Math.max(0.5, blur * 0.08), alpha * strength * opacity * 0.25);
          }
        }
        if (hasFilter) ctx.filter = 'none';
      }
    }

    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 0;
    if (!drawSoftNeonTube(ctx, line, x, y, fontSize, {
      foreground: options.foreground || (typeof options.paint === 'string' ? options.paint : options.glowColor),
      gradientEnd: options.gradientEnd, gradientAngle: options.gradientAngle,
      gradientBounds: options.gradientBounds,
      viewportWidth: width, viewportHeight: height, textScaleX: scaleX,
    })) {
      // Pixel APIs can be unavailable in a restricted webview. Keep the same
      // fills softly blended; never restore the hard colored outline.
      const soften = Math.max(0.5, fontSize * 0.004);
      if (hasFilter && acceptsBlur(ctx, soften)) {
        ctx.filter = `blur(${soften}px)`;
        ctx.fillStyle = options.paint;
        ctx.globalAlpha = alpha * 0.92;
        ctx.fillText(line, x, y);
        ctx.fillStyle = options.core;
        ctx.globalAlpha = alpha * 0.4;
        ctx.fillText(line, x, y);
      } else {
        ctx.fillStyle = options.paint;
        softenedFill(ctx, line, x, y, soften, alpha);
        ctx.fillStyle = options.core;
        softenedFill(ctx, line, x, y, soften * 0.6, alpha * 0.6);
      }
    }
  } finally {
    ctx.restore();
  }
}
