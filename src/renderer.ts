import { getTemplate, type Design } from './catalog.ts';
import { normalizeDotEmoji, MIN_DOT_DENSITY, MAX_DOT_DENSITY, MIN_FONT_SCALE, MAX_FONT_SCALE } from './design-values.ts';
import { getBoardFont, TUBE_FONT } from './fonts.ts';
import { getTextLines } from './text-layout.ts';

export type RenderOptions = { width?: number; height?: number; offset?: number; repeatGap?: number };
type RenderResult = { fontSize: number; overflow: boolean; textWidth: number };
type Context = CanvasRenderingContext2D;
const FONT = '"Arial Black", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
const INK = '#172657';
let dotMask: HTMLCanvasElement | null = null;
let dotMaskKey = '';
let dotMaskPixels: Uint8ClampedArray | null = null;
let ghostLayer: HTMLCanvasElement | null = null;
let ghostLayerKey = '';
const MAX_GHOST_EDGE = 2048;
const MAX_GHOST_PIXELS = 2_000_000;
const dotSprites = new Map<string, HTMLCanvasElement>();
const MAX_DOT_SPRITES = 32;
const DOT_SAMPLE_SCALE = 4;
const MAX_REPEAT_COPIES = 54;
type TextBounds = { x: number; y: number; width: number; height: number };
type Paint = string | CanvasGradient;

/** Bitmap-pixel period shared with the scene's offset wrapping. */
export function resolveRepeatPeriod(textWidth: number, gap: number, viewportWidth: number): number {
  const limit = Number.MAX_SAFE_INTEGER / 4;
  const width = bounded(textWidth, 0, limit, 0);
  const safeGap = bounded(gap, 4, limit, 4);
  const viewport = bounded(viewportWidth, 1, limit, 1);
  return Math.max(width + safeGap, viewport / 48);
}

function visibleTextCenters(x: number, textWidth: number, viewportWidth: number, period: number): number[] {
  if (!period) return [x];
  const first = Math.ceil((-textWidth / 2 - x) / period) - 1;
  const last = Math.floor((viewportWidth + textWidth / 2 - x) / period) + 1;
  const count = Math.max(0, Math.min(MAX_REPEAT_COPIES, last - first + 1));
  return Array.from({ length: count }, (_, index) => x + (first + index) * period);
}

export function invalidateFontCache(): void {
  dotMaskKey = '';
  dotMaskPixels = null;
  ghostLayerKey = '';
}

function boardFont(design: Design, size: number): string {
  const font = design.templateId === 'L4' ? TUBE_FONT : getBoardFont(design.fontId);
  const weight = design.templateId === 'L3' ? 400 : font.weight || 700;
  return weight + ' ' + size + 'px ' + font.family;
}

function bounded(value: number, minimum: number, maximum: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function brightCore(color: string): string {
  const hex = /^#([a-f\d]{6})$/i.exec(color);
  if (!hex) return '#FFFDFB';
  const rgb = [0, 2, 4].map(offset => Math.round(parseInt(hex[1].slice(offset, offset + 2), 16) * 0.14 + 255 * 0.86));
  return 'rgb(' + rgb.join(',') + ')';
}

function colorChannels(color: string): number[] {
  const hex = /^#([a-f\d]{6})$/i.exec(color);
  return hex ? [0, 2, 4].map(offset => parseInt(hex[1].slice(offset, offset + 2), 16)) : [255, 255, 255];
}

function mixedColor(start: string, end: string, progress: number): string {
  const from = colorChannels(start);
  const to = colorChannels(end);
  return '#' + from.map((value, index) => Math.round(value + (to[index] - value) * progress).toString(16).padStart(2, '0')).join('');
}

function gradientVector(design: Design, bounds: TextBounds) {
  const radians = bounded(design.gradientAngle, 0, 360, 0) * Math.PI / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const span = Math.max(1, Math.abs(dx) * bounds.width + Math.abs(dy) * bounds.height);
  return { dx, dy, span };
}

function textPaint(ctx: Context, design: Design, bounds: TextBounds, core = false): Paint {
  const start = core ? brightCore(design.foreground) : design.foreground;
  if (!design.gradient) return start;
  const end = core ? brightCore(design.gradientEnd) : design.gradientEnd;
  const { dx, dy, span } = gradientVector(design, bounds);
  const paint = ctx.createLinearGradient(bounds.x - dx * span / 2, bounds.y - dy * span / 2,
    bounds.x + dx * span / 2, bounds.y + dy * span / 2);
  paint.addColorStop(0, start);
  paint.addColorStop(1, end);
  return paint;
}

function roundedRect(ctx: Context, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function polygon(ctx: Context, points: number[][], fill: string): void {
  ctx.beginPath();
  points.forEach((point, index) => index === 0 ? ctx.moveTo(point[0], point[1]) : ctx.lineTo(point[0], point[1]));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function star(ctx: Context, x: number, y: number, radius: number, fill: string, outline: string, rotation = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = radius * (i % 2 === 0 ? 1 : 0.44);
    if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = radius * 0.13;
  ctx.strokeStyle = outline;
  ctx.fillStyle = fill;
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

function heart(ctx: Context, x: number, y: number, radius: number, fill: string, outline: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.13);
  ctx.beginPath();
  ctx.moveTo(0, radius * 0.78);
  ctx.bezierCurveTo(-radius * 1.65, -radius * 0.18, -radius * 0.65, -radius * 1.27, 0, -radius * 0.52);
  ctx.bezierCurveTo(radius * 0.65, -radius * 1.27, radius * 1.65, -radius * 0.18, 0, radius * 0.78);
  ctx.lineJoin = 'round';
  ctx.lineWidth = radius * 0.13;
  ctx.fillStyle = fill;
  ctx.strokeStyle = outline;
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

function fries(ctx: Context, x: number, y: number, radius: number, outline: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.1);
  ctx.lineJoin = 'round';
  ctx.lineWidth = radius * 0.08;
  ctx.strokeStyle = outline;
  for (let i = 0; i < 5; i++) {
    const bx = (i - 2) * radius * 0.26;
    const by = -radius * (0.83 + (i % 2) * 0.18);
    roundedRect(ctx, bx - radius * 0.1, by, radius * 0.2, radius * 1.3, radius * 0.04);
    ctx.fillStyle = '#FFDA69';
    ctx.stroke();
    ctx.fill();
  }
  polygon(ctx, [[-radius * 0.82, -radius * 0.1], [radius * 0.82, -radius * 0.1], [radius * 0.6, radius * 0.9], [-radius * 0.6, radius * 0.9]], '#FF7859');
  ctx.stroke();
  ctx.strokeStyle = '#FFF3D0';
  ctx.lineWidth = radius * 0.1;
  ctx.beginPath();
  ctx.arc(0, radius * 0.28, radius * 0.29, 0.15, Math.PI - 0.15);
  ctx.stroke();
  ctx.restore();
}

function pingPongBall(ctx: Context, x: number, y: number, radius: number, outline: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#FFA541';
  ctx.strokeStyle = outline;
  ctx.lineWidth = radius * 0.09;
  ctx.stroke();
  ctx.fill();
  ctx.strokeStyle = '#FFE3B4';
  ctx.lineWidth = radius * 0.12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.66, Math.PI * 1.08, Math.PI * 1.55);
  ctx.stroke();
  ctx.restore();
}

function pingPongPaddle(ctx: Context, x: number, y: number, radius: number, outline: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.48);
  ctx.lineWidth = radius * 0.08;
  ctx.strokeStyle = outline;
  roundedRect(ctx, -radius * 0.14, radius * 0.25, radius * 0.28, radius * 0.77, radius * 0.08);
  ctx.fillStyle = '#F0CA91';
  ctx.stroke();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -radius * 0.22, radius * 0.68, radius * 0.78, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#FF6655';
  ctx.stroke();
  ctx.fill();
  ctx.strokeStyle = '#FFB39A';
  ctx.lineWidth = radius * 0.055;
  ctx.beginPath();
  ctx.ellipse(0, -radius * 0.22, radius * 0.51, radius * 0.61, 0, Math.PI * 0.95, Math.PI * 1.6);
  ctx.stroke();
  ctx.restore();
  pingPongBall(ctx, x + radius * 0.67, y - radius * 0.65, radius * 0.28, outline);
}

function sticker(ctx: Context, design: Design, x: number, y: number, radius: number, accent: string, outline: string): void {
  if (design.sticker === 'none') return;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.12)';
  ctx.shadowBlur = radius * 0.03;
  ctx.shadowOffsetY = radius * 0.07;
  if (design.sticker === 'star') star(ctx, x, y, radius, accent, outline, 0.17);
  else if (design.sticker === 'heart') heart(ctx, x, y, radius, accent, outline);
  else if (design.sticker === 'paddle') pingPongPaddle(ctx, x, y, radius, outline);
  else if (design.sticker === 'ball') pingPongBall(ctx, x, y, radius * 0.84, outline);
  else fries(ctx, x, y, radius, outline);
  ctx.restore();
}

function drawBackground(ctx: Context, design: Design, width: number, height: number, accent: string): void {
  const unit = Math.min(width, height);
  const id = design.templateId;
  ctx.fillStyle = design.background;
  ctx.fillRect(0, 0, width, height);
  if (id === 'H1') {
    polygon(ctx, [[0, height * 0.75], [width * 0.32, height], [0, height]], design.foreground);
    polygon(ctx, [[width * 0.77, 0], [width, 0], [width, height * 0.31]], accent);
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#FFF8CE';
    ctx.lineWidth = unit * 0.0015;
    const grid = unit * 0.09;
    for (let x = 0; x < width; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 0; y < height; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = design.foreground;
    ctx.lineWidth = unit * 0.011;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(width * 0.07, height * 0.18);
    ctx.quadraticCurveTo(width * 0.095, height * 0.05, width * 0.13, height * 0.18);
    ctx.quadraticCurveTo(width * 0.16, height * 0.28, width * 0.19, height * 0.14);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width * 0.76, height * 0.85);
    ctx.lineTo(width * 0.85, height * 0.81);
    ctx.moveTo(width * 0.78, height * 0.89);
    ctx.lineTo(width * 0.89, height * 0.85);
    ctx.stroke();
  } else if (id === 'H2') {
    ctx.save();
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.32;
    ctx.beginPath(); ctx.ellipse(width * 0.04, height * 0.88, width * 0.27, height * 0.3, -0.15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(width * 0.93, height * 0.11, width * 0.22, height * 0.32, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(width * 0.15, height * 0.13);
    ctx.rotate(-0.14);
    ctx.fillStyle = '#F6D675';
    ctx.globalAlpha = 0.8;
    ctx.fillRect(-width * 0.065, -height * 0.027, width * 0.13, height * 0.054);
    ctx.restore();
    ctx.save();
    ctx.translate(width * 0.81, height * 0.89);
    ctx.rotate(0.12);
    ctx.strokeStyle = design.foreground;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = unit * 0.004;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * unit * 0.026, -unit * 0.04);
      ctx.lineTo(i * unit * 0.026 - unit * 0.03, unit * 0.04);
      ctx.stroke();
    }
    ctx.restore();
  } else if (id === 'H3') {
    polygon(ctx, [[width * 0.2, 0], [width, 0], [width * 0.8, height], [0, height]], accent);
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = design.foreground;
    ctx.lineWidth = unit * 0.002;
    for (let x = -height; x < width + height; x += unit * 0.07) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - height * 0.4, height); ctx.stroke();
    }
    ctx.restore();
    polygon(ctx, [[width * 0.06, height * 0.08], [width * 0.19, height * 0.08], [width * 0.175, height * 0.13], [width * 0.045, height * 0.13]], design.foreground);
    polygon(ctx, [[width * 0.81, height * 0.87], [width * 0.94, height * 0.87], [width * 0.925, height * 0.92], [width * 0.795, height * 0.92]], design.foreground);
  }
  if (design.border) {
    ctx.save();
    const inset = unit * 0.037;
    ctx.lineWidth = unit * (id === 'H1' ? 0.009 : 0.0045);
    ctx.strokeStyle = id === 'H1' ? design.foreground : id === 'H2' ? accent : design.foreground;
    ctx.globalAlpha = id === 'L1' || id === 'L3' ? 0.35 : 0.8;
    if (id === 'H2') ctx.setLineDash([unit * 0.016, unit * 0.012]);
    roundedRect(ctx, inset, inset, width - inset * 2, height - inset * 2, id === 'H3' ? unit * 0.003 : unit * 0.04);
    ctx.stroke();
    ctx.restore();
  }
}

function ghostText(ctx: Context, design: Design, line: string, x: number, y: number, fontSize: number,
  accent: string, viewportWidth: number, viewportHeight: number, textScaleX: number): void {
  ctx.save();
  try {
    const font = boardFont(design, fontSize);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const metrics = ctx.measureText(line);
    const shift = fontSize * 0.02;
    const leftInk = Number.isFinite(metrics.actualBoundingBoxLeft) ? Math.max(metrics.width / 2, metrics.actualBoundingBoxLeft) : metrics.width / 2;
    const rightInk = Number.isFinite(metrics.actualBoundingBoxRight) ? Math.max(metrics.width / 2, metrics.actualBoundingBoxRight) : metrics.width / 2;
    const ascent = Number.isFinite(metrics.actualBoundingBoxAscent) ? Math.max(0, metrics.actualBoundingBoxAscent) : fontSize * 0.75;
    const descent = Number.isFinite(metrics.actualBoundingBoxDescent) ? Math.max(0, metrics.actualBoundingBoxDescent) : fontSize * 0.75;
    // The caller scales around x. Convert the viewport back into those local
    // coordinates before clipping, so compressed-but-fitting letters survive.
    const visibleLeft = x - x / textScaleX;
    const visibleRight = x + (viewportWidth - x) / textScaleX;
    const left = Math.max(visibleLeft, x - leftInk - shift - 2);
    const right = Math.min(visibleRight, x + rightInk + shift + 2);
    const top = Math.max(0, y - ascent - shift - 2);
    const bottom = Math.min(viewportHeight, y + descent + shift + 2);
    const width = right - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) return;
    // Capacity depends only on the viewport and its horizontal scale, never on
    // the current line's length or scrolling offset. Unequal lines can reuse
    // the same bitmap without repeatedly reallocating it within each frame.
    const visibleWidth = viewportWidth / textScaleX;
    const sampleScale = Math.min(1, MAX_GHOST_EDGE / visibleWidth, MAX_GHOST_EDGE / viewportHeight,
      Math.sqrt(MAX_GHOST_PIXELS / (visibleWidth * viewportHeight)));
    const capacityWidth = Math.max(1, Math.floor(visibleWidth * sampleScale));
    const capacityHeight = Math.max(1, Math.floor(viewportHeight * sampleScale));
    const pixelsWide = Math.min(capacityWidth, Math.max(1, Math.ceil(width * sampleScale)));
    const pixelsHigh = Math.min(capacityHeight, Math.max(1, Math.ceil(height * sampleScale)));
    const layer = ghostLayer || (ghostLayer = document.createElement('canvas'));
    if (layer.width !== capacityWidth) layer.width = capacityWidth;
    if (layer.height !== capacityHeight) layer.height = capacityHeight;
    const layerContext = layer.getContext('2d');
    if (!layerContext) return;
    const key = JSON.stringify([font, line, design.foreground, accent, x, y, left, top, width, height,
      capacityWidth, capacityHeight, pixelsWide, pixelsHigh]);
    if (key !== ghostLayerKey) {
      layerContext.save();
      try {
        layerContext.setTransform(1, 0, 0, 1, 0, 0);
        layerContext.clearRect(0, 0, pixelsWide, pixelsHigh);
        layerContext.scale(pixelsWide / width, pixelsHigh / height);
        layerContext.translate(-left, -top);
        layerContext.font = font;
        layerContext.textAlign = 'center';
        layerContext.textBaseline = 'middle';
        layerContext.globalAlpha = 1;
        layerContext.shadowBlur = 0;
        layerContext.globalCompositeOperation = 'lighter';
        layerContext.fillStyle = design.foreground;
        layerContext.fillText(line, x - shift, y - shift);
        layerContext.fillStyle = accent;
        layerContext.fillText(line, x + shift, y + shift);
      } finally {
        layerContext.restore();
      }
      ghostLayerKey = key;
    }
    // The background never participates in the additive mix: flatten the
    // isolated transparent text layer with ordinary source-over compositing.
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    ctx.drawImage(layer, 0, 0, pixelsWide, pixelsHigh, left, top, width, height);
  } finally {
    ctx.restore();
  }
}

function styledText(ctx: Context, design: Design, line: string, x: number, y: number, fontSize: number, accent: string, paint: Paint, core: Paint): void {
  ctx.font = boardFont(design, fontSize);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  if (design.templateId === 'L2') {
    // A flat colored outline stays distinct from the luminous neon tube style.
    ctx.shadowBlur = 0;
    ctx.strokeStyle = accent;
    ctx.lineWidth = fontSize * 0.14;
    ctx.strokeText(line, x, y);
    ctx.strokeStyle = design.background;
    ctx.lineWidth = fontSize * 0.065;
    ctx.strokeText(line, x, y);
  } else if (design.templateId === 'L4') {
    const strength = bounded(design.glow, 0, 100, 65) / 100;
    ctx.save();
    const glowColor = design.gradient ? mixedColor(design.foreground, design.gradientEnd, 0.5) : design.foreground;
    // A thin font supplies the tube itself; avoid tracing both sides of a heavy
    // glyph as separate rectangular tubes. Soft light spreads beyond that tube.
    ctx.fillStyle = paint;
    ctx.shadowColor = glowColor;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    if (strength > 0) {
      // Project the same colored light downward onto the board, then soften
      // the tube's own halo. Only the shadow moves; the glyph never doubles.
      ctx.globalAlpha = strength * 0.6;
      ctx.shadowOffsetY = fontSize * (0.1 + strength * 0.1);
      ctx.shadowBlur = fontSize * (0.12 + strength * 0.18);
      ctx.fillText(line, x, y);
      ctx.shadowOffsetY = 0;
      ctx.globalAlpha = strength * 0.72;
      ctx.shadowBlur = fontSize * (0.22 + strength * 0.28);
      ctx.fillText(line, x, y);
      ctx.globalAlpha = strength * 0.8;
      ctx.shadowBlur = fontSize * (0.07 + strength * 0.1);
      ctx.fillText(line, x, y);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = paint;
    ctx.shadowBlur = fontSize * 0.025 * strength;
    ctx.lineWidth = Math.max(0.6, fontSize * 0.016);
    ctx.strokeText(line, x, y);
    ctx.fillText(line, x, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = core;
    ctx.strokeStyle = core;
    ctx.lineWidth = Math.max(0.35, fontSize * 0.0025);
    ctx.globalAlpha = 0.95;
    ctx.strokeText(line, x, y);
    ctx.fillText(line, x, y);
    ctx.restore();
    return;
  } else if (design.templateId === 'H1') {
    ctx.strokeStyle = INK;
    ctx.lineWidth = fontSize * 0.12;
    ctx.strokeText(line, x + fontSize * 0.018, y + fontSize * 0.045);
    ctx.strokeStyle = '#FFF9DC';
    ctx.lineWidth = fontSize * 0.075;
    ctx.strokeText(line, x, y);
    ctx.strokeStyle = INK;
    ctx.lineWidth = fontSize * 0.025;
    ctx.strokeText(line, x, y);
  } else if (design.templateId === 'H2') {
    ctx.strokeStyle = accent;
    ctx.lineWidth = fontSize * 0.15;
    ctx.strokeText(line, x + fontSize * 0.025, y + fontSize * 0.045);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = fontSize * 0.095;
    ctx.strokeText(line, x, y);
  } else if (design.templateId === 'H3') {
    ctx.strokeStyle = design.background;
    ctx.lineWidth = fontSize * 0.065;
    ctx.strokeText(line, x + fontSize * 0.025, y + fontSize * 0.035);
    ctx.strokeStyle = accent;
    ctx.lineWidth = fontSize * 0.025;
    ctx.strokeText(line, x, y);
  }
  ctx.fillStyle = paint;
  ctx.fillText(line, x, y);
}

function dotSprite(design: Design, spacing: number, color: string): HTMLCanvasElement {
  const shape = ['square', 'heart', 'star', 'emoji'].includes(design.dotShape) ? design.dotShape : 'circle';
  const emoji = shape === 'emoji' ? normalizeDotEmoji(design.dotEmoji) : '';
  const side = Math.max(8, Math.min(128, Math.ceil(spacing)));
  const glow = shape === 'emoji' ? 0 : bounded(design.glow, 0, 100, 65);
  const key = JSON.stringify([shape, emoji, side, shape === 'emoji' ? '' : color, glow]);
  const cached = dotSprites.get(key);
  if (cached) return cached;
  const sprite = document.createElement('canvas');
  sprite.width = side;
  sprite.height = side;
  const ctx = sprite.getContext('2d');
  if (ctx) {
    const middle = side / 2;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = side * 0.07 * glow / 100;
    if (shape === 'emoji') {
      ctx.font = Math.round(side * 0.7) + 'px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, middle, middle, side * 0.8);
    } else if (shape === 'square') ctx.fillRect(side * 0.18, side * 0.18, side * 0.64, side * 0.64);
    else if (shape === 'heart') heart(ctx, middle, middle, side * 0.27, color, color);
    else if (shape === 'star') star(ctx, middle, middle, side * 0.36, color, color);
    else { ctx.beginPath(); ctx.arc(middle, middle, side * 0.34, 0, Math.PI * 2); ctx.fill(); }
  }
  if (dotSprites.size >= MAX_DOT_SPRITES) {
    const oldest = dotSprites.keys().next().value;
    if (typeof oldest === 'string') dotSprites.delete(oldest);
  }
  dotSprites.set(key, sprite);
  return sprite;
}

function dotText(ctx: Context, design: Design, lines: string[], x: number, y: number, fontSize: number, gap: number,
  width: number, height: number, bounds: TextBounds, textScaleX: number, centers: readonly number[], repeatPeriod: number): void {
  // Keep enough cells across each glyph after auto-fitting, within a fixed
  // viewport budget. Supersampling preserves counters without eroding strokes.
  const density = Math.round(bounded(design.dotDensity, MIN_DOT_DENSITY, MAX_DOT_DENSITY, 2));
  const glyphCells = [18, 26, 34, 42][density];
  const inkTop = Math.max(0, bounds.y - bounds.height / 2 - fontSize * 0.15);
  const inkBottom = Math.min(height, bounds.y + bounds.height / 2 + fontSize * 0.15);
  // A portrait viewport can be mostly empty above/below a fitted sentence.
  // Spend the row budget on its actual text band instead of those blank rows.
  let spacing = Math.max(1, width / 384, Math.max(1, inkBottom - inkTop) / 190,
    Math.min(Math.min(width, height) * [0.05, 0.03, 0.022, 0.015][density], fontSize / glyphCells));
  // A whole period spans an integer number of cells, so wrapping the scene's
  // offset cannot change the phase of the repeated LED grid.
  if (repeatPeriod) spacing = repeatPeriod / Math.max(1, Math.floor(repeatPeriod / spacing));
  const rasterTop = Math.floor(inkTop / spacing) * spacing;
  const mask = dotMask || (dotMask = document.createElement('canvas'));
  const columns = Math.min(384, Math.max(1, Math.ceil(width / spacing)));
  const rows = Math.min(192, Math.max(1, Math.ceil((inkBottom - rasterTop) / spacing)));
  const maskWidth = columns * DOT_SAMPLE_SCALE;
  const maskHeight = rows * DOT_SAMPLE_SCALE;
  const sampleX = Math.round(x / spacing) * spacing;
  const shiftX = x - sampleX;
  const font = boardFont(design, fontSize);
  const copyOffsets = centers.map(center => (center - x) / textScaleX);
  const key = JSON.stringify([maskWidth, maskHeight, spacing, font, gap, sampleX, y, rasterTop, textScaleX, lines, copyOffsets]);
  if (mask.width !== maskWidth) mask.width = maskWidth;
  if (mask.height !== maskHeight) mask.height = maskHeight;
  const mctx = mask.getContext('2d', { willReadFrequently: true });
  if (!mctx) return;
  // LEDs advance on their own grid; reuse the mask between grid changes.
  if (key !== dotMaskKey || !dotMaskPixels) {
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, mask.width, mask.height);
    mctx.scale(DOT_SAMPLE_SCALE / spacing, DOT_SAMPLE_SCALE / spacing);
    mctx.translate(sampleX, y - rasterTop);
    mctx.scale(textScaleX, 1);
    mctx.font = font;
    mctx.textAlign = 'center';
    mctx.textBaseline = 'middle';
    mctx.fillStyle = '#FFFFFF';
    copyOffsets.forEach(copyX => {
      lines.forEach((line, index) => mctx.fillText(line, copyX, (index - (lines.length - 1) / 2) * gap));
    });
    const rgba = mctx.getImageData(0, 0, mask.width, mask.height).data;
    const cells = new Uint8ClampedArray(columns * rows);
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const sx = column * DOT_SAMPLE_SCALE + 1;
        const sy = row * DOT_SAMPLE_SCALE + 1;
        // Only the central quarter determines occupancy. Antialiasing on a
        // distant cell edge must not expand into a full bright LED.
        let coverage = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) coverage += rgba[((sy + dy) * maskWidth + sx + dx) * 4 + 3];
        }
        cells[row * columns + column] = coverage >= 4 * 128 ? 1 : 0;
      }
    }
    dotMaskPixels = cells;
    dotMaskKey = key;
  }
  const pixels = dotMaskPixels;
  const gradient = design.gradient && design.dotShape !== 'emoji';
  const sprites = gradient
    ? Array.from({ length: 12 }, (_, index) => dotSprite(design, spacing, mixedColor(design.foreground, design.gradientEnd, index / 11)))
    : [dotSprite(design, spacing, design.foreground)];
  const vector = gradientVector(design, bounds);
  ctx.save();
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (!pixels[row * columns + column]) continue;
      const cellX = column * spacing + shiftX;
      const cellY = rasterTop + row * spacing;
      let sprite = sprites[0];
      if (gradient) {
        const copyX = repeatPeriod ? bounds.x + Math.round((cellX + spacing / 2 - bounds.x) / repeatPeriod) * repeatPeriod : bounds.x;
        const progress = bounded(0.5 + ((cellX + spacing / 2 - copyX) * vector.dx
          + (cellY + spacing / 2 - bounds.y) * vector.dy) / vector.span, 0, 1, 0);
        sprite = sprites[Math.round(progress * (sprites.length - 1))];
      }
      // Keep sub-cell motion smooth while the much cheaper mask changes only
      // when the sentence crosses a grid boundary.
      ctx.drawImage(sprite, cellX, cellY, spacing, spacing);
    }
  }
  ctx.restore();
}

function boardDimensions(canvas: HTMLCanvasElement, options: RenderOptions): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(options.width || canvas.width || 1920)),
    height: Math.max(1, Math.round(options.height || canvas.height || 1080)),
  };
}

function boardLayout(ctx: Context, design: Design, width: number, height: number) {
  const light = getTemplate(design.templateId).category === 'light';
  const scrolling = light && design.scroll;
  const landscape = light && width > height;
  const unit = Math.min(width, height);
  const lines = getTextLines(design.text, design.layout);
  const padding = unit * (light ? landscape ? 0.045 : 0.07 : 0.12);
  // Stickers stay in the corner, outside the text's quiet central band.
  const textAreaWidth = width - padding * 2;
  const textAreaHeight = height * (light ? landscape ? 0.82 : 0.76 : 0.64);
  const lineHeight = light ? landscape ? 1.08 : 1.14 : 1.19;
  const maxFont = textAreaHeight / (lines.length * lineHeight);
  const minFont = Math.min(maxFont, height * (light ? 0.19 : 0.15));
  const maxSafeFont = height * (design.sticker === 'none' ? 0.91 : 0.8) / (lines.length * lineHeight);
  const minimumScaleX = landscape && !scrolling ? 0.82 : 1;
  const outlineAllowance = design.templateId === 'L4' ? 0.36 : 0.18;
  let fontSize = maxFont;
  const measure = (size: number) => {
    ctx.font = boardFont(design, size);
    return Math.max(...lines.map((line) => ctx.measureText(line).width));
  };
  if (!scrolling) {
    const fit = (maximum: number, minimum: number) => {
      let low = minimum;
      let high = maximum;
      for (let i = 0; i < 20; i++) {
        const middle = (low + high) / 2;
        if ((measure(middle) + middle * outlineAllowance) * minimumScaleX <= textAreaWidth) low = middle;
        else high = middle;
      }
      return low;
    };
    fontSize = fit(maxFont, light ? 0 : minFont);
    const scale = bounded(design.fontScale, MIN_FONT_SCALE, MAX_FONT_SCALE, 100) / 100;
    // Static light boards always fit the complete sentence. The size control
    // can shrink it, or enlarge it only while there is still room.
    fontSize = light ? Math.min(fontSize * scale, fit(maxSafeFont, 0)) : fontSize * scale;
  } else fontSize = Math.max(minFont, maxFont * 0.86);
  if (scrolling) fontSize = Math.min(maxSafeFont, fontSize * bounded(design.fontScale, MIN_FONT_SCALE, MAX_FONT_SCALE, 100) / 100);
  const naturalTextWidth = measure(fontSize);
  const textScaleX = Math.max(minimumScaleX, Math.min(1, textAreaWidth / (naturalTextWidth + fontSize * outlineAllowance)));
  const textWidth = naturalTextWidth * textScaleX;
  const overflow = !scrolling && (naturalTextWidth + fontSize * outlineAllowance) * textScaleX > textAreaWidth + 1;
  return { fontSize, overflow, textWidth, naturalTextWidth, textScaleX, light, scrolling, unit, lines, padding, lineHeight };
}

/** Measure layout without drawing, reading pixels or resizing the canvas bitmap. */
export function measureBoard(canvas: HTMLCanvasElement, design: Design, options: RenderOptions = {}): RenderResult {
  const { width, height } = boardDimensions(canvas, options);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { fontSize: 0, overflow: true, textWidth: 0 };
  const { fontSize, overflow, textWidth } = boardLayout(ctx, design, width, height);
  return { fontSize, overflow, textWidth };
}

export function renderBoard(canvas: HTMLCanvasElement, design: Design, options: RenderOptions = {}): RenderResult {
  const { width, height } = boardDimensions(canvas, options);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { fontSize: 0, overflow: true, textWidth: 0 };
  const template = getTemplate(design.templateId);
  const palette = template.palettes.find((item) => item.id === design.paletteId) || template.palettes[0];
  const accent = design.accent || palette.accent;
  const { fontSize, overflow, textWidth, naturalTextWidth, textScaleX, light, scrolling, unit, lines, padding, lineHeight } = boardLayout(ctx, design, width, height);
  const hasSticker = design.sticker !== 'none';
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  drawBackground(ctx, design, width, height, accent);
  const offset = scrolling && Number.isFinite(options.offset) ? options.offset! : 0;
  const repeatPeriod = scrolling && design.loop && Number.isFinite(options.repeatGap)
    ? resolveRepeatPeriod(textWidth, options.repeatGap!, width) : 0;
  const x = width / 2 + (repeatPeriod ? offset % repeatPeriod : offset);
  const centers = visibleTextCenters(x, textWidth, width, repeatPeriod);
  const y = height * (design.templateId === 'H2' ? 0.52 : 0.51);
  const bounds = { x, y, width: textWidth, height: fontSize * lineHeight * lines.length };
  if (design.templateId === 'L3') dotText(ctx, design, lines, x, y, fontSize, fontSize * lineHeight,
    width, height, bounds, textScaleX, centers, repeatPeriod);
  else {
    centers.forEach(copyX => {
      ctx.save();
      ctx.translate(copyX, y); ctx.scale(textScaleX, 1); ctx.translate(-copyX, -y);
      if (design.templateId === 'L5') {
        lines.forEach((line, index) => ghostText(ctx, design, line, copyX, y + (index - (lines.length - 1) / 2) * fontSize * lineHeight,
          fontSize, accent, width, height, textScaleX));
      } else {
        const paintBounds = { ...bounds, x: copyX, width: naturalTextWidth };
        const paint = textPaint(ctx, design, paintBounds);
        const core = design.templateId === 'L4' ? textPaint(ctx, design, paintBounds, true) : paint;
        if (design.templateId === 'H1') { ctx.translate(width / 2, height / 2); ctx.rotate(-0.025); ctx.translate(-width / 2, -height / 2); }
        if (design.templateId === 'H3') { ctx.translate(width / 2, height / 2); ctx.transform(1, 0, -0.1, 1, 0, 0); ctx.translate(-width / 2, -height / 2); }
        lines.forEach((line, index) => styledText(ctx, design, line, copyX, y + (index - (lines.length - 1) / 2) * fontSize * lineHeight, fontSize, accent, paint, core));
      }
      ctx.restore();
    });
  }
  if (hasSticker) {
    const stickerRadius = unit * (light ? 0.04 : 0.09);
    const stickerX = width - padding * 1.08;
    const stickerY = height * (light ? 0.065 : 0.2);
    sticker(ctx, design, stickerX, stickerY, stickerRadius, light ? accent : design.templateId === 'H2' ? accent : design.foreground, light ? design.foreground : design.templateId === 'H2' ? '#FFFFFF' : INK);
  }
  ctx.restore();
  return { fontSize, overflow, textWidth };
}

function cardText(ctx: Context, text: string, x: number, y: number, size: number, color: string, weight = 600): void {
  ctx.font = weight + ' ' + size + 'px ' + FONT;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function fittedCardText(ctx: Context, text: string, x: number, y: number, maxSize: number, width: number, color: string): void {
  let size = maxSize;
  ctx.font = '600 ' + size + 'px ' + FONT;
  const measured = ctx.measureText(text).width;
  if (measured > width) size *= width / measured;
  cardText(ctx, text, x, y, size, color);
}

export function renderExport(design: Design, format: 'board' | 'comment' | 'note' | 'a4' | 'memory', meta?: { place: string; date: string }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const portrait = getTemplate(design.templateId).category === 'light' && design.orientation === 'portrait';
  const renderCompleteBoard = (target: HTMLCanvasElement, width: number, height: number) => {
    const result = renderBoard(target, { ...design, scroll: false }, { width, height });
    if (result.overflow) throw new Error('文字太长，图片放不下。请先改为双行或精简文字，再保存图片。');
  };
  if (format === 'board' || format === 'a4') {
    // A4 uses its own wider/taller layout calculation; it is never a stretched screenshot.
    const long = format === 'a4' ? 3508 : 1920;
    const short = format === 'a4' ? 2480 : 1080;
    renderCompleteBoard(canvas, portrait ? short : long, portrait ? long : short);
    return canvas;
  }
  canvas.width = 1080;
  canvas.height = format === 'comment' ? 1080 : 1440;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const width = canvas.width;
  const height = canvas.height;
  ctx.fillStyle = '#F7F5ED';
  ctx.fillRect(0, 0, width, height);
  // Original graphic accents are shared with the app; no event/location is invented.
  star(ctx, 957, 124, 36, '#E9F6B4', '#293F2F', 0.19);
  ctx.strokeStyle = '#D9DCD0';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(64, 186); ctx.lineTo(1016, 186); ctx.stroke();
  cardText(ctx, '手机手幅', 64, 95, 34, '#294635', 900);
  cardText(ctx, format === 'memory' ? '把这一刻，好好收藏' : '把喜欢，写成一块牌', 64, 146, 24, '#798174');
  const board = document.createElement('canvas');
  renderCompleteBoard(board, portrait ? 1080 : 1920, portrait ? 1920 : 1080);
  const ratio = board.width / board.height;
  const maxHeight = height * (format === 'comment' || format === 'memory' ? 0.5 : 0.56);
  const bw = portrait ? Math.min(width - 128, maxHeight * ratio) : width - 128;
  const bh = bw / ratio;
  const bx = (width - bw) / 2;
  const by = portrait ? (format === 'comment' ? 230 : 240) : format === 'comment' ? 246 : 280;
  ctx.save();
  ctx.translate(bx + bw / 2, by + bh / 2);
  ctx.rotate(-0.025);
  ctx.shadowColor = 'rgba(38,57,41,.12)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 16;
  roundedRect(ctx, -bw / 2 - 10, -bh / 2 - 10, bw + 20, bh + 20, 22);
  ctx.fillStyle = '#FFFFFF'; ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  roundedRect(ctx, -bw / 2, -bh / 2, bw, bh, 14); ctx.clip();
  ctx.drawImage(board, -bw / 2, -bh / 2, bw, bh);
  ctx.restore();
  const textTop = by + bh + (portrait ? 72 : format === 'comment' ? 84 : 104);
  if (format === 'memory') {
    cardText(ctx, '我的观赛记忆', 72, textTop, 38, '#294635', 900);
    // Meta is filled in by the user; empty fields remain blank instead of posing as a real trip.
    if (meta && meta.place.trim()) fittedCardText(ctx, meta.place.trim(), 74, textTop + 72, 29, width - 148, '#596A58');
    if (meta && meta.date.trim()) fittedCardText(ctx, meta.date.trim(), 74, textTop + 124, 26, width - 148, '#7C8575');
  } else {
    cardText(ctx, '今天，也想认真加油。', 72, textTop, 38, '#294635', 900);
    cardText(ctx, '选一句话，做一块自己的加油牌', 74, textTop + 62, 27, '#7B8275');
  }
  ctx.strokeStyle = '#D9DCD0';
  ctx.beginPath(); ctx.moveTo(64, height - 117); ctx.lineTo(width - 64, height - 117); ctx.stroke();
  cardText(ctx, '手机手幅  /  为热爱留一块位置', 64, height - 72, 22, '#71806C');
  cardText(ctx, format === 'memory' ? '我的记录' : '我的加油牌', width - 222, height - 72, 22, '#71806C');
  return canvas;
}
