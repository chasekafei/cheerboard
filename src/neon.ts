import { TUBE_FONT } from './fonts.ts';

type Paint = CanvasRenderingContext2D['fillStyle'];

export type NeonTextOptions = {
  glow: number;
  paint: Paint;
  core: Paint;
  glowColor: string;
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

/**
 * Draw the same Thin glyph as a soft, displaced projection and a bright tube.
 * No application offscreen surface is allocated. The final effect is clipped
 * to the viewport even when a scrolling sentence is much wider than the board.
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
        ctx.globalAlpha = alpha * strength * 0.62;
      } else {
        // Chrome 61 supports Canvas filters; older engines still retain the
        // complete low-opacity projection with a soft shadow around its shape.
        ctx.shadowBlur = projectionBlur;
        ctx.globalAlpha = alpha * strength * 0.21;
      }
      ctx.strokeText(line, x, projectionY);
      ctx.fillText(line, x, projectionY);
      if (hasFilter) ctx.filter = 'none';
      ctx.lineWidth = tubeWidth;

      // A wide ambient glow and a denser inner halo make the light visible
      // beyond the tube, while the final two passes keep the glyph crisp.
      ctx.globalAlpha = alpha * strength * 0.8;
      ctx.shadowBlur = fontSize * (0.3 + strength * 0.45);
      ctx.fillText(line, x, y);
      ctx.globalAlpha = alpha * strength * 0.9;
      ctx.shadowBlur = fontSize * (0.1 + strength * 0.2);
      ctx.fillText(line, x, y);
      ctx.globalAlpha = alpha * strength * 0.95;
      ctx.shadowBlur = fontSize * (0.035 + strength * 0.08);
      ctx.fillText(line, x, y);
    }

    ctx.globalAlpha = alpha;
    ctx.shadowBlur = fontSize * 0.04 * strength;
    ctx.strokeText(line, x, y);
    ctx.fillText(line, x, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = options.core;
    ctx.strokeStyle = options.core;
    ctx.lineWidth = Math.max(0.35, fontSize * 0.0025);
    ctx.globalAlpha = alpha * 0.95;
    ctx.strokeText(line, x, y);
    ctx.fillText(line, x, y);
  } finally {
    ctx.restore();
  }
}
