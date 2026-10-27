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

/** Setting an unknown Canvas property is allowed, so verify the native setter. */
function acceptsBlur(ctx: CanvasRenderingContext2D, blur: number): boolean {
  if (typeof ctx.filter !== 'string') return false;
  try {
    ctx.filter = `blur(${blur}px)`;
    const accepted = ctx.filter.indexOf('blur(') === 0;
    ctx.filter = 'none';
    return accepted;
  } catch {
    return false;
  }
}

/** Move the sharp source outside the clip and bring only its soft shadow back. */
function shadowOnly(ctx: CanvasRenderingContext2D, line: string, x: number, y: number,
  blur: number, fontSize: number, viewportHeight: number, stroke = false): void {
  const shift = Math.ceil(viewportHeight + fontSize * 3 + blur * 6);
  ctx.save();
  try {
    ctx.shadowOffsetY = shift;
    ctx.shadowBlur = blur;
    if (stroke) ctx.strokeText(line, x, y - shift);
    else ctx.fillText(line, x, y - shift);
  } finally { ctx.restore(); }
}

/** Small convolution fallback when neither pixel masks nor native blur work. */
function softenedFill(ctx: CanvasRenderingContext2D, line: string, x: number, y: number,
  radius: number, alpha: number): void {
  const taps = [1, 2, 1];
  ctx.shadowBlur = 0;
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
    ctx.globalAlpha = 1 - Math.exp(-alpha * taps[row] * taps[column] / 8);
    ctx.fillText(line, x + (column - 1) * radius, y + (row - 1) * radius);
  }
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
      if (hasFilter && acceptsBlur(ctx, projectionBlur)) {
        // This is the complete colored glyph moved downward, rather than
        // merely a shadow trailing from the sharp upper glyph.
        ctx.filter = `blur(${projectionBlur}px)`;
        ctx.globalAlpha = alpha * strength * 0.38;
        ctx.strokeText(line, x, projectionY);
        ctx.fillText(line, x, projectionY);
      } else {
        ctx.globalAlpha = alpha * strength * 0.14;
        shadowOnly(ctx, line, x, projectionY, projectionBlur * 2, fontSize, height, true);
        shadowOnly(ctx, line, x, projectionY, projectionBlur * 2, fontSize, height);
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
        ctx.globalAlpha = alpha * strength * opacity;
        if (hasFilter && acceptsBlur(ctx, blur / 2)) {
          ctx.filter = `blur(${blur / 2}px)`;
          ctx.shadowBlur = 0;
          ctx.fillText(line, x, y);
        } else shadowOnly(ctx, line, x, y, blur, fontSize, height);
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
