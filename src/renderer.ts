import { getTemplate, type Design } from './catalog.ts';
import { normalizeDotEmoji, MIN_DOT_DENSITY, MAX_DOT_DENSITY, MIN_FONT_SCALE, MAX_FONT_SCALE } from './design-values.ts';
import { getEffectFont } from './fonts.ts';
import { getTextLines } from './text-layout.ts';
import { drawBoardDecorations } from './decorations.ts';
import { drawNeonText, clearNeonBlurCache } from './neon.ts';
import { clearNeonTubeCache } from './neon-tube.ts';
import { shareAsset } from './share-assets.ts';

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
type SpriteRect = { x: number; y: number; width: number; height: number };
type DotSprite = { canvas: HTMLCanvasElement; bleed: number; span: number; halo: SpriteRect; core: SpriteRect | null };
const dotSprites = new Map<string, DotSprite>();
const MAX_DOT_SPRITES = 32;
const DOT_SAMPLE_SCALE = 4;
const MAX_REPEAT_COPIES = 54;
const FINE_EM = 64;
const FINE_SIDE = 96;
const MAX_FINE_GLYPHS = 128;
const MAX_FINE_LINES = 16;
let fineMask: HTMLCanvasElement | null = null;
type FineGlyph = { points: Float32Array; pitch: number };
type FineLine = { glyphs: { text: string; center: number; advance: number }[]; width: number };
const fineGlyphs = new Map<string, FineGlyph>();
const fineLines = new Map<string, FineLine>();
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
  fineGlyphs.clear();
  fineLines.clear();
  clearNeonBlurCache();
  clearNeonTubeCache();
}

function boardFont(design: Design, size: number): string {
  const font = getEffectFont(design.templateId);
  return font.weight + ' ' + size + 'px ' + font.family;
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

function styledText(ctx: Context, design: Design, line: string, x: number, y: number, fontSize: number, accent: string, paint: Paint, core: Paint, viewportWidth: number, viewportHeight: number, textScaleX: number, gradientBounds: TextBounds): void {
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
    drawNeonText(ctx, line, x, y, fontSize, {
      glow: design.glow, paint, core,
      glowColor: design.gradient ? mixedColor(design.foreground, design.gradientEnd, 0.5) : design.foreground,
      foreground: design.foreground,
      gradientEnd: design.gradient ? design.gradientEnd : undefined,
      gradientAngle: design.gradientAngle, gradientBounds,
      viewportWidth, viewportHeight, textScaleX,
    });
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

function dotSprite(design: Design, spacing: number, color: string): DotSprite {
  const shape = ['square', 'heart', 'star', 'emoji'].includes(design.dotShape) ? design.dotShape : 'circle';
  const emoji = shape === 'emoji' ? normalizeDotEmoji(design.dotEmoji) : '';
  const vivid = shape !== 'emoji' && design.dotStyle === 'fluorescent';
  const luminous = shape !== 'emoji' && (design.dotStyle === 'fluorescent' || design.dotStyle === 'fine');
  const base = Math.max(8, Math.min(luminous ? 32 : 128, Math.ceil(spacing)));
  const margin = luminous ? Math.ceil(base * (vivid ? 0.95 : 0.7)) : 0;
  const side = base + margin * 2;
  const glow = shape === 'emoji' ? 0 : bounded(design.glow, 0, 100, 65);
  const key = JSON.stringify([shape, emoji, base, luminous, shape === 'emoji' ? 'emoji' : design.dotStyle, shape === 'emoji' ? '' : color, glow]);
  const cached = dotSprites.get(key);
  if (cached) return cached;
  const sprite = document.createElement('canvas');
  sprite.width = side;
  sprite.height = side + (luminous ? base : 0);
  const ctx = sprite.getContext('2d');
  if (ctx) {
    const middle = side / 2;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = base * (vivid ? 0.75 : luminous ? 0.5 : 0.07) * glow / 100;
    if (shape === 'emoji') {
      ctx.font = Math.round(side * 0.7) + 'px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, middle, middle, side * 0.8);
    } else {
      const paintShape = (scale: number, fill: string, cx = middle, cy = middle) => {
        ctx.fillStyle = fill;
        if (shape === 'square') ctx.fillRect(cx - base * 0.32 * scale, cy - base * 0.32 * scale, base * 0.64 * scale, base * 0.64 * scale);
        else if (shape === 'heart') heart(ctx, cx, cy, base * 0.27 * scale, fill, fill);
        else if (shape === 'star') star(ctx, cx, cy, base * 0.36 * scale, fill, fill);
        else { ctx.beginPath(); ctx.arc(cx, cy, base * (luminous && !vivid ? 0.31 : 0.34) * scale, 0, Math.PI * 2); ctx.fill(); }
      };
      if (luminous) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, side, side); ctx.clip(); }
      paintShape(1, color);
      if (vivid && glow > 0) {
        ctx.shadowBlur = base * 0.28 * glow / 100;
        paintShape(1, color);
      }
      if (luminous) {
        ctx.restore();
        ctx.shadowBlur = 0;
        // The lower atlas cell is strictly core-only. It is drawn only after
        // all LED halos have been composited on the board.
        paintShape(design.dotStyle === 'fine' ? 0.68 : 0.7, '#FFFFFF', base / 2, side + base / 2);
      }
    }
  }
  if (dotSprites.size >= MAX_DOT_SPRITES) {
    const oldest = dotSprites.keys().next().value;
    if (typeof oldest === 'string') dotSprites.delete(oldest);
  }
  const result = { canvas: sprite, bleed: margin / base, span: side / base,
    halo: { x: 0, y: 0, width: side, height: side },
    core: luminous ? { x: 0, y: side, width: base, height: base } : null };
  dotSprites.set(key, result);
  return result;
}

/** Topology-preserving thinning, followed by arc-length LED sampling.
 * Input is one alpha value per pixel; output triples are x, y, uniform LED size.
 * A glyph-sized 96² ceiling bounds both the thinning work and graph storage.
 */
export function sampleStrokeCenterline(alpha: ArrayLike<number>, width: number, height: number, pitch: number): Float32Array {
  if (width < 3 || height < 3 || width > FINE_SIDE || height > FINE_SIDE || alpha.length !== width * height) return new Float32Array();
  const count = width * height;
  const ink = new Uint8Array(count);
  let left = width - 1, right = 1, top = height - 1, bottom = 1;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (alpha[y * width + x] < 96) continue;
      ink[y * width + x] = 1;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  const remove = new Int32Array(count);
  const offsets = [-width, -width + 1, 1, width + 1, width, width - 1, -1, -width - 1];
  // Zhang–Suen deletes only simple boundary pixels. Endpoints and counters
  // survive; this is not a threshold that erodes away narrow real strokes.
  for (let iteration = 0; iteration < FINE_SIDE; iteration++) {
    let changed = false;
    for (let phase = 0; phase < 2; phase++) {
      let removals = 0;
      for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
          const index = y * width + x;
          if (!ink[index]) continue;
          const p = offsets.map(offset => ink[index + offset]);
          const neighbors = p.reduce((sum, value) => sum + value, 0);
          if (neighbors < 2 || neighbors > 6) continue;
          let transitions = 0;
          for (let i = 0; i < 8; i++) if (!p[i] && p[(i + 1) % 8]) transitions++;
          if (transitions !== 1) continue;
          if (phase === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6] : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]) continue;
          remove[removals++] = index;
        }
      }
      for (let i = 0; i < removals; i++) ink[remove[i]] = 0;
      changed ||= removals > 0;
    }
    if (!changed) break;
  }
  const neighbors = (index: number) => {
    const adjacent: number[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const next = index + dy * width + dx;
        if (!ink[next]) continue;
        // Avoid triangular graph edges at right-angle corners/junctions.
        if (dx && dy && (ink[index + dx] || ink[index + dy * width])) continue;
        adjacent.push(next);
      }
    }
    return adjacent;
  };
  const graph = new Map<number, number[]>();
  for (let i = 0; i < count; i++) if (ink[i]) graph.set(i, neighbors(i));
  const visited = new Set<number>();
  const edge = (a: number, b: number) => Math.min(a, b) * count + Math.max(a, b);
  const paths: number[][] = [];
  const walk = (start: number, next: number) => {
    const path = [start];
    let previous = start;
    let current = next;
    for (let step = 0; step < count; step++) {
      visited.add(edge(previous, current)); path.push(current);
      const choices = graph.get(current)!;
      if (current === start || choices.length !== 2) break;
      const following = choices[0] === previous ? choices[1] : choices[0];
      if (visited.has(edge(current, following))) break;
      previous = current; current = following;
    }
    paths.push(path);
  };
  graph.forEach((adjacent, index) => {
    if (!adjacent.length) paths.push([index]);
    if (adjacent.length === 2) return;
    adjacent.forEach(next => { if (!visited.has(edge(index, next))) walk(index, next); });
  });
  graph.forEach((adjacent, index) => adjacent.forEach(next => { if (!visited.has(edge(index, next))) walk(index, next); }));
  const spacing = bounded(pitch, 2, FINE_EM, FINE_EM / 11);
  const points: number[][] = [];
  const unique = new Set<string>();
  const add = (x: number, y: number, node: number) => {
    const key = Math.round(x * 4) + ':' + Math.round(y * 4);
    if (!unique.has(key)) { unique.add(key); points.push([x, y, node]); }
  };
  for (const path of paths) {
    const coordinates = path.map(index => [index % width, Math.floor(index / width)]);
    const lengths = [0];
    for (let i = 1; i < coordinates.length; i++) lengths.push(lengths[i - 1] + Math.hypot(coordinates[i][0] - coordinates[i - 1][0], coordinates[i][1] - coordinates[i - 1][1]));
    const total = lengths[lengths.length - 1];
    const closed = path.length > 2 && path[0] === path[path.length - 1];
    const steps = Math.max(closed ? 4 : 1, Math.round(total / spacing));
    let segment = 1;
    for (let i = 0; i <= (closed ? steps - 1 : steps); i++) {
      const distance = total * i / steps;
      while (segment < lengths.length - 1 && lengths[segment] < distance) segment++;
      const before = Math.max(0, segment - 1);
      const after = Math.min(segment, coordinates.length - 1);
      const fraction = (distance - lengths[before]) / (lengths[after] - lengths[before] || 1);
      add(coordinates[before][0] + (coordinates[after][0] - coordinates[before][0]) * fraction,
        coordinates[before][1] + (coordinates[after][1] - coordinates[before][1]) * fraction,
        path[fraction < 0.5 ? before : after]);
    }
  }
  // Several graph branches can end a pixel apart at the same junction.
  // Merge that local cluster instead of shrinking it into twin pinpricks.
  // Euclidean proximity alone is insufficient: parallel strokes across a
  // counter may be close on screen but far apart along the real skeleton.
  const buckets = new Map<string, number[]>();
  points.forEach((point, index) => {
    const key = Math.floor(point[0] / spacing) + ':' + Math.floor(point[1] / spacing);
    const bucket = buckets.get(key) || []; bucket.push(index); buckets.set(key, bucket);
  });
  const parents = points.map((_, index) => index);
  const root = (index: number): number => {
    while (parents[index] !== index) { parents[index] = parents[parents[index]]; index = parents[index]; }
    return index;
  };
  const mergeDistance = spacing * 0.62;
  const graphLimit = spacing * 0.9 + 1;
  points.forEach((point, index) => {
    let localDistances: Map<number, number> | null = null;
    const connectedLocally = (other: number) => {
      if (!localDistances) {
        localDistances = new Map([[point[2], 0]]);
        const queue = [point[2]];
        for (let at = 0; at < queue.length; at++) {
          const node = queue[at], distance = localDistances.get(node)!;
          for (const next of graph.get(node) || []) {
            const diagonal = Math.abs(node % width - next % width) && Math.abs(Math.floor(node / width) - Math.floor(next / width));
            const nextDistance = distance + (diagonal ? Math.SQRT2 : 1);
            if (nextDistance > graphLimit || nextDistance >= (localDistances.get(next) ?? Infinity)) continue;
            localDistances.set(next, nextDistance); queue.push(next);
          }
        }
      }
      return localDistances.has(points[other][2]);
    };
    const bx = Math.floor(point[0] / spacing), by = Math.floor(point[1] / spacing);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      (buckets.get((bx + dx) + ':' + (by + dy)) || []).forEach(other => {
        if (other <= index || Math.hypot(point[0] - points[other][0], point[1] - points[other][1]) >= mergeDistance || !connectedLocally(other)) return;
        const a = root(index), b = root(other);
        parents[Math.max(a, b)] = Math.min(a, b);
      });
    }
  });
  const groups = new Map<number, { x: number; y: number; count: number }>();
  points.forEach((point, index) => {
    const key = root(index), group = groups.get(key) || { x: 0, y: 0, count: 0 };
    group.x += point[0]; group.y += point[1]; group.count++;
    groups.set(key, group);
  });
  const sampled = new Float32Array(groups.size * 3);
  let position = 0;
  groups.forEach(group => {
    sampled[position++] = group.x / group.count;
    sampled[position++] = group.y / group.count;
    sampled[position++] = 1;
  });
  return sampled;
}

function fineContext(): Context | null {
  const mask = fineMask || (fineMask = document.createElement('canvas'));
  if (mask.width !== FINE_SIDE) mask.width = FINE_SIDE;
  if (mask.height !== FINE_SIDE) mask.height = FINE_SIDE;
  return mask.getContext('2d', { willReadFrequently: true });
}

function fineClusters(text: string): string[] {
  const result: string[] = [];
  let join = false;
  let regional = false;
  for (const char of Array.from(text)) {
    const cp = char.codePointAt(0)!;
    const flag = cp >= 0x1F1E6 && cp <= 0x1F1FF;
    const extending = cp === 0x200D || cp === 0xFE0F || cp === 0xFE0E || cp === 0x20E3
      || cp >= 0x300 && cp <= 0x36F || cp >= 0x1F3FB && cp <= 0x1F3FF;
    if (result.length && (join || extending || flag && regional)) result[result.length - 1] += char;
    else result.push(char);
    join = cp === 0x200D;
    regional = flag && !regional;
  }
  return result;
}

function fineLine(ctx: Context, design: Design, text: string): FineLine {
  const cached = fineLines.get(text);
  if (cached) return cached;
  ctx.font = boardFont(design, FINE_EM);
  let pen = 0;
  const glyphs = fineClusters(text).map(text => {
    const advance = ctx.measureText(text).width;
    const glyph = { text, center: pen + advance / 2, advance };
    pen += advance; return glyph;
  });
  const width = ctx.measureText(text).width;
  const kerning = pen ? width / pen : 1;
  glyphs.forEach(glyph => { glyph.center *= kerning; glyph.advance *= kerning; });
  const line = { glyphs, width };
  if (fineLines.size >= MAX_FINE_LINES) fineLines.delete(fineLines.keys().next().value!);
  fineLines.set(text, line);
  return line;
}

function fineGlyph(ctx: Context, design: Design, text: string, density: number): FineGlyph {
  const key = density + ':' + text;
  const cached = fineGlyphs.get(key);
  if (cached) { fineGlyphs.delete(key); fineGlyphs.set(key, cached); return cached; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, FINE_SIDE, FINE_SIDE);
  ctx.font = boardFont(design, FINE_EM);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#FFFFFF';
  ctx.fillText(text, FINE_SIDE / 2, FINE_SIDE / 2);
  const rgba = ctx.getImageData(0, 0, FINE_SIDE, FINE_SIDE).data;
  const alpha = new Uint8Array(FINE_SIDE * FINE_SIDE);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  const pitch = FINE_EM / [8, 11, 15, 20][density];
  const points = sampleStrokeCenterline(alpha, FINE_SIDE, FINE_SIDE, pitch);
  for (let i = 0; i < points.length; i += 3) {
    points[i] = (points[i] - FINE_SIDE / 2) / FINE_EM;
    points[i + 1] = (points[i + 1] - FINE_SIDE / 2) / FINE_EM;
  }
  const glyph = { points, pitch: pitch / FINE_EM };
  if (fineGlyphs.size >= MAX_FINE_GLYPHS) fineGlyphs.delete(fineGlyphs.keys().next().value!);
  fineGlyphs.set(key, glyph);
  return glyph;
}

function fineText(ctx: Context, design: Design, lines: string[], y: number, fontSize: number, gap: number,
  width: number, height: number, bounds: TextBounds, textScaleX: number, centers: readonly number[]): void {
  const mctx = fineContext();
  if (!mctx) return;
  const density = Math.round(bounded(design.dotDensity, MIN_DOT_DENSITY, MAX_DOT_DENSITY, 2));
  const spacing = fontSize / [8, 11, 15, 20][density];
  const gradient = design.gradient && design.dotShape !== 'emoji';
  const sprites = gradient
    ? Array.from({ length: 12 }, (_, i) => dotSprite(design, spacing, mixedColor(design.foreground, design.gradientEnd, i / 11)))
    : [dotSprite(design, spacing, design.foreground)];
  const vector = gradientVector(design, bounds);
  const stamps: number[] = [];
  lines.forEach((text, lineIndex) => {
    const line = fineLine(mctx, design, text);
    const baseline = y + (lineIndex - (lines.length - 1) / 2) * gap;
    if (baseline + fontSize < 0 || baseline - fontSize > height) return;
    centers.forEach(center => line.glyphs.forEach(item => {
      const glyphX = center + (item.center - line.width / 2) * fontSize / FINE_EM * textScaleX;
      const halfWidth = Math.max(item.advance / FINE_EM, 1) * fontSize * textScaleX;
      if (glyphX + halfWidth < 0 || glyphX - halfWidth > width || /^\s+$/.test(item.text)) return;
      const glyph = fineGlyph(mctx, design, item.text, density);
      for (let i = 0; i < glyph.points.length; i += 3) {
        const px = glyphX + glyph.points[i] * fontSize * textScaleX;
        const py = baseline + glyph.points[i + 1] * fontSize;
        const size = glyph.pitch * fontSize;
        if (size <= 0 || px + size < 0 || px - size > width || py + size < 0 || py - size > height) continue;
        const progress = gradient ? bounded(0.5 + ((px - center) * vector.dx + (py - bounds.y) * vector.dy) / vector.span, 0, 1, 0) : 0;
        stamps.push(px, py, size, Math.round(progress * (sprites.length - 1)));
      }
    }));
  });
  ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  for (let i = 0; i < stamps.length; i += 4) {
    const sprite = sprites[stamps[i + 3]], size = stamps[i + 2];
    const left = stamps[i] - size * (0.5 + sprite.bleed), top = stamps[i + 1] - size * (0.5 + sprite.bleed);
    if (sprite.core) ctx.drawImage(sprite.canvas, sprite.halo.x, sprite.halo.y, sprite.halo.width, sprite.halo.height,
      left, top, size * sprite.span, size * sprite.span);
    else ctx.drawImage(sprite.canvas, left, top, size * sprite.span, size * sprite.span);
  }
  const sprite = sprites[0], core = sprite.core;
  if (core) for (let i = 0; i < stamps.length; i += 4) {
    const size = stamps[i + 2];
    ctx.drawImage(sprite.canvas, core.x, core.y, core.width, core.height,
      stamps[i] - size / 2, stamps[i + 1] - size / 2, size, size);
  }
  ctx.restore();
}

function dotText(ctx: Context, design: Design, lines: string[], x: number, y: number, fontSize: number, gap: number,
  width: number, height: number, bounds: TextBounds, textScaleX: number, centers: readonly number[], repeatPeriod: number): void {
  if (design.dotStyle === 'fine') { fineText(ctx, design, lines, y, fontSize, gap, width, height, bounds, textScaleX, centers); return; }
  // Keep enough cells across each glyph after auto-fitting, within a fixed
  // viewport budget. Supersampling preserves counters without eroding strokes.
  const density = Math.round(bounded(design.dotDensity, MIN_DOT_DENSITY, MAX_DOT_DENSITY, 2));
  const vivid = design.dotStyle === 'fluorescent';
  const glyphCells = (vivid ? [14, 20, 28, 36] : [18, 26, 34, 42])[density];
  const inkTop = Math.max(0, bounds.y - bounds.height / 2 - fontSize * 0.15);
  const inkBottom = Math.min(height, bounds.y + bounds.height / 2 + fontSize * 0.15);
  // A portrait viewport can be mostly empty above/below a fitted sentence.
  // Spend the row budget on its actual text band instead of those blank rows.
  const cellBudget = (vivid ? [0.075, 0.05, 0.035, 0.026] : [0.05, 0.03, 0.022, 0.015])[density];
  let spacing = Math.max(1, width / 384, Math.max(1, inkBottom - inkTop) / 190,
    Math.min(Math.min(width, height) * cellBudget, fontSize / glyphCells));
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
  if (sprites[0].core) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
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
      if (sprite.core) {
        ctx.drawImage(sprite.canvas, sprite.halo.x, sprite.halo.y, sprite.halo.width, sprite.halo.height,
          cellX - spacing * sprite.bleed, cellY - spacing * sprite.bleed, spacing * sprite.span, spacing * sprite.span);
      } else {
        ctx.drawImage(sprite.canvas, cellX - spacing * sprite.bleed, cellY - spacing * sprite.bleed,
          spacing * sprite.span, spacing * sprite.span);
      }
    }
  }
  const coreSprite = sprites[0];
  if (coreSprite.core) {
    const core = coreSprite.core;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        if (!pixels[row * columns + column]) continue;
        ctx.drawImage(coreSprite.canvas, core.x, core.y, core.width, core.height,
          column * spacing + shiftX, rasterTop + row * spacing, spacing, spacing);
      }
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
  const hasDecorations = Boolean(design.decorationId && design.decorationId !== 'none');
  const unit = Math.min(width, height);
  const lines = getTextLines(design.text, design.layout);
  const padding = light && hasDecorations ? width * (landscape ? 0.12 : 0.14)
    : unit * (light ? landscape ? 0.045 : 0.07 : 0.12);
  // Stickers stay in the corner, outside the text's quiet central band.
  const textAreaWidth = width - padding * 2;
  const textAreaHeight = height * (light ? hasDecorations ? landscape ? 0.62 : 0.66 : landscape ? 0.82 : 0.76 : 0.64);
  const lineHeight = light ? landscape ? 1.08 : 1.14 : 1.19;
  const maxFont = textAreaHeight / (lines.length * lineHeight);
  const minFont = Math.min(maxFont, height * (light ? 0.19 : 0.15));
  const maxSafeFont = height * (hasDecorations ? 0.84 : design.sticker === 'none' ? 0.91 : 0.8) / (lines.length * lineHeight);
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
  return { fontSize, overflow, textWidth, naturalTextWidth, textScaleX, light, scrolling, unit, lines, padding, lineHeight, hasDecorations };
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
  const { fontSize, overflow, textWidth, naturalTextWidth, textScaleX, light, scrolling, unit, lines, padding, lineHeight, hasDecorations } = boardLayout(ctx, design, width, height);
  const hasSticker = !hasDecorations && design.sticker !== 'none';
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
        lines.forEach((line, index) => styledText(ctx, design, line, copyX, y + (index - (lines.length - 1) / 2) * fontSize * lineHeight, fontSize, accent, paint, core, width, height, textScaleX, paintBounds));
      }
      ctx.restore();
    });
  }
  if (hasDecorations) {
    const textHeight = fontSize * (1 + (lines.length - 1) * lineHeight);
    drawBoardDecorations(ctx, design, { width, height, textBounds: {
      left: scrolling ? padding : (width - textWidth) / 2,
      right: scrolling ? width - padding : (width + textWidth) / 2,
      top: y - textHeight / 2,
      bottom: y + textHeight / 2,
    } });
  } else if (hasSticker) {
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

function centeredCardText(ctx: Context, text: string, x: number, y: number, size: number, color: string, weight = 600): void {
  ctx.font = weight + ' ' + size + 'px ' + FONT;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}

export function renderExport(design: Design, format: 'board' | 'comment' | 'note' | 'a4' | 'memory', meta?: { place: string; date: string; name: string }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const portrait = getTemplate(design.templateId).category === 'light' && design.orientation === 'portrait';
  const renderCompleteBoard = (target: HTMLCanvasElement, width: number, height: number) => {
    const result = renderBoard(target, { ...design, scroll: false }, { width, height });
    if (result.overflow) throw new Error('文字太长，图片放不下。请先改为双行或精简文字，再保存图片。');
  };
  if (format === 'board' || format === 'a4') {
    const long = format === 'a4' ? 3508 : 1920;
    const short = format === 'a4' ? 2480 : 1080;
    renderCompleteBoard(canvas, portrait ? short : long, portrait ? long : short);
    return canvas;
  }

  const board = document.createElement('canvas');
  renderCompleteBoard(board, portrait ? 1080 : 1920, portrait ? 1920 : 1080);
  const boardRatio = board.width / board.height;
  const template = shareAsset(format as 'note' | 'comment' | 'memory');
  if (template && template.naturalWidth > 0 && template.naturalHeight > 0) {
    canvas.width = template.naturalWidth; canvas.height = template.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const width = canvas.width, height = canvas.height;
    if (format === 'note') {
      // The approved note artwork uses transparent sticker cutouts. Share
      // images must stay opaque when saved from the mini-app.
      ctx.fillStyle = '#FAF7EE';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(template, 0, 0, width, height);
    const drawBoard = (x: number, y: number, slotWidth: number, slotHeight: number, radius = 0) => {
      // The generated cards reserve a fixed screen slot. Fill that slot exactly so
      // the board does not float in the middle of the frame or spill outside it.
      ctx.save();
      if (radius > 0) roundedRect(ctx, x, y, slotWidth, slotHeight, radius);
      else ctx.rect(x, y, slotWidth, slotHeight);
      ctx.clip();
      ctx.drawImage(board, x, y, slotWidth, slotHeight);
      ctx.restore();
    };
    if (format === 'note') {
      drawBoard(80, 478, 928, 374, 24);
    } else if (format === 'comment') {
      drawBoard(48, 168, 1440, 668, 28);
    } else {
      const now = new Date();
      const today = now.getFullYear() + '.' + String(now.getMonth() + 1).padStart(2, '0') + '.' + String(now.getDate()).padStart(2, '0');
      const date = (meta?.date?.trim() || today).replace(/-/g, '.');
      const place = meta?.place?.trim() || '地点';
      const name = meta?.name?.trim() || '观众姓名';
      // The clean ticket asset already contains the paper, labels and empty
      // value boxes. Draw the variable content directly into those boxes; do
      // not paint opaque rectangles over the paper texture.
      centeredCardText(ctx, '这个赛场见', 835, 174, 54, '#173E32', 900);
      const rows: Array<[string, string]> = [['日期', date], ['地点', place], ['观众姓名', name]];
      rows.forEach(([label, value], index) => {
        const y = 315 + index * 130;
        cardText(ctx, label, 388, y, index === 2 ? 27 : 30, '#FFFDF5', 900);
        fittedCardText(ctx, value, 650, y, index === 0 ? 38 : 32, 535, '#173E32');
      });
      cardText(ctx, '举个牌', 1352, 850, 18, '#B84A36', 900);
    }
    return canvas;
  }
  const comment = format === 'comment';
  const memory = format === 'memory';
  canvas.width = comment ? 1080 : memory ? 1920 : 1080;
  canvas.height = comment ? (portrait ? 1440 : 608) : memory ? 1080 : 1440;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const width = canvas.width, height = canvas.height;
  const paper = '#F7F4EA', ink = '#25352A', muted = '#7B8275';

  const drawLogo = (x: number, y: number, size = 16) => cardText(ctx, '举个牌', x, y, size, ink, 900);
  const drawBall = (x: number, y: number, radius: number, color: string) => {
    ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x - radius * .2, y - radius * .35, radius * .65, .2, 1.8); ctx.stroke(); ctx.restore();
  };
  const drawPaddle = (x: number, y: number, scale: number, color: string) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-.35); ctx.fillStyle = color; ctx.strokeStyle = ink; ctx.lineWidth = 3;
    roundedRect(ctx, -44 * scale, -62 * scale, 88 * scale, 124 * scale, 28 * scale); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#B98955'; ctx.fillRect(-10 * scale, 52 * scale, 20 * scale, 58 * scale); ctx.strokeRect(-10 * scale, 52 * scale, 20 * scale, 58 * scale); ctx.restore();
  };
  const drawBoard = (x: number, y: number, bw: number, bh: number, framed: boolean) => {
    ctx.save();
    if (framed) {
      ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = ink; ctx.lineWidth = 3;
      roundedRect(ctx, x - 10, y - 10, bw + 20, bh + 20, 20); ctx.fill(); ctx.stroke();
    }
    roundedRect(ctx, x, y, bw, bh, 12); ctx.clip(); ctx.drawImage(board, x, y, bw, bh); ctx.restore();
  };

  if (comment) {
    ctx.fillStyle = '#F7F4EA'; ctx.fillRect(0, 0, width, height);
    const pad = 24, maxW = width - pad * 2, maxH = height - pad * 2;
    const bw = Math.min(maxW, maxH * boardRatio), bh = bw / boardRatio;
    const bx = (width - bw) / 2, by = (height - bh) / 2;
    drawBoard(bx, by, bw, bh, false);
    ctx.strokeStyle = '#1D211D'; ctx.lineWidth = 3;
    roundedRect(ctx, bx, by, bw, bh, 16); ctx.stroke();
    ctx.fillStyle = 'rgba(247,244,234,.94)'; ctx.fillRect(width - 156, height - 48, 124, 30);
    cardText(ctx, '举个牌', width - 140, height - 33, 16, ink, 900);
    return canvas;
  }

  if (memory) {
    ctx.fillStyle = '#F7F3E9'; ctx.fillRect(0, 0, width, height);
    const ticketX = 42, ticketY = 42, ticketW = width - 84, ticketH = height - 84;
    ctx.fillStyle = '#FFFDF5'; ctx.strokeStyle = ink; ctx.lineWidth = 3;
    roundedRect(ctx, ticketX, ticketY, ticketW, ticketH, 18); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.fillStyle = '#F7F3E9';
    for (let y = ticketY + 42; y < ticketY + ticketH - 20; y += 58) {
      ctx.beginPath(); ctx.arc(ticketX, y, 11, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ticketX + ticketW, y, 11, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    const split = ticketX + ticketW * .72;
    ctx.strokeStyle = '#1E4A3A'; ctx.lineWidth = 3; ctx.setLineDash([9, 12]);
    ctx.beginPath(); ctx.moveTo(split, ticketY + 18); ctx.lineTo(split, ticketY + ticketH - 18); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#1E4A3A'; ctx.fillRect(ticketX, ticketY, 18, ticketH);
    cardText(ctx, 'MATCH LOG', ticketX + 48, ticketY + 56, 25, ink, 900);
    cardText(ctx, 'TABLE TENNIS / RECORD', ticketX + 48, ticketY + 88, 15, muted, 700);
    cardText(ctx, '这个赛场见', ticketX + 52, ticketY + 162, 58, ink, 900);
    ctx.strokeStyle = '#C66A50'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(ticketX + 54, ticketY + 200); ctx.lineTo(ticketX + 430, ticketY + 200); ctx.stroke();
    const fieldX = ticketX + 58, fieldW = split - fieldX - 55;
    const now = new Date();
    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const rawDate = meta?.date?.trim() || today;
    const date = rawDate.replace(/-/g, '.');
    const place = meta?.place?.trim() || '地点';
    const name = meta?.name?.trim() || '观众姓名';
    const rows: Array<[string, string]> = [['日期', date], ['地点', place], ['观众姓名', name]];
    rows.forEach(([label, value], index) => {
      const y = ticketY + 300 + index * 130;
      ctx.fillStyle = '#1E4A3A'; ctx.fillRect(fieldX, y - 30, 135, 60);
      cardText(ctx, label, fieldX + 18, y, 23, '#FFFDF5', 900);
      ctx.strokeStyle = '#B6A67D'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(fieldX + 150, y + 27); ctx.lineTo(fieldX + fieldW, y + 27); ctx.stroke();
      fittedCardText(ctx, value, fieldX + 155, y, 30, fieldW - 165, ink);
    });
    const imageX = split + 56, imageY = ticketY + 112, imageW = ticketX + ticketW - imageX - 56, imageH = 380;
    ctx.fillStyle = '#F2EEE1'; ctx.strokeStyle = '#AFA487'; ctx.lineWidth = 2;
    ctx.fillRect(imageX, imageY, imageW, imageH); ctx.strokeRect(imageX, imageY, imageW, imageH);
    drawPaddle(imageX + imageW * .42, imageY + imageH * .54, .78, '#D8543B');
    drawBall(imageX + imageW * .72, imageY + imageH * .38, 18, '#F4CA44');
    ctx.strokeStyle = '#C66A50'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(imageX + imageW * .5, imageY + imageH * .5, 88, 0, Math.PI * 2); ctx.stroke();
    cardText(ctx, 'OPTIONAL PHOTO', imageX + 18, imageY + imageH - 18, 14, muted, 700);
    ctx.strokeStyle = '#C66A50'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(imageX + imageW / 2, ticketY + 650, 78, 0, Math.PI * 2); ctx.stroke();
    cardText(ctx, '观赛记录', imageX + imageW / 2 - 54, ticketY + 657, 20, '#C66A50', 900);
    cardText(ctx, 'No. 000123', split + 56, ticketY + ticketH - 62, 20, muted, 700);
    return canvas;
  }

  ctx.fillStyle = paper; ctx.fillRect(0, 0, width, height);
  drawBall(74, 82, 18, '#F5D84A'); drawBall(width - 76, 128, 13, '#FF8F9E');
  cardText(ctx, '今天也要为喜欢的人加油', 70, 92, 25, ink, 700);
  const maxW = width - 112, maxH = height - 270;
  const scale = Math.min(maxW / board.width, maxH / board.height);
  const bw = board.width * scale, bh = board.height * scale;
  drawBoard((width - bw) / 2, 164, bw, bh, true);
  cardText(ctx, '这一牌，送给你', 70, 164 + bh + 62, 28, ink, 900);
  cardText(ctx, '把想说的那句，举给你看', 72, 164 + bh + 104, 19, muted, 600);
  ctx.strokeStyle = '#D9DCD0'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(72, height - 104); ctx.lineTo(width - 72, height - 104); ctx.stroke();
  drawLogo(width - 170, height - 62, 17); drawBall(width - 74, height - 58, 15, '#F5D84A');
  return canvas;
}
