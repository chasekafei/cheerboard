import { TUBE_FONT } from './fonts.ts';

export type NeonGradientBounds = { x: number; y: number; width: number; height: number };
export type SoftNeonTubeOptions = {
  foreground: string;
  gradientEnd?: string;
  gradientAngle?: number;
  /** Text coordinates before the caller's horizontal compression. */
  gradientBounds?: NeonGradientBounds;
  viewportWidth: number;
  viewportHeight: number;
  /** The caller already applies this scale around the supplied text center x. */
  textScaleX?: number;
};

const EM = 320;
const SIDE = 384;
const CENTER = SIDE / 2;
const DISTANCE_SCALE = 128;
const MAX_GEOMETRY = 32;
const MAX_GEOMETRY_BYTES = 4 * 1024 * 1024;
const MAX_SPRITES = 32;
const MAX_SPRITE_BYTES = 8 * 1024 * 1024;
const MAX_LAYOUTS = 16;
const MAX_LAYOUT_GLYPHS = 8000;
const EDGE_SIGMA = EM * 0.005;
const PADDING = Math.ceil(EDGE_SIGMA * 4 + 2);
const INF = 1e9;
type RGB = [number, number, number];
type Glyph = { field: Int16Array; left: number; top: number; width: number; height: number; bytes: number };
type Sprite = { canvas: HTMLCanvasElement; bytes: number };
type Layout = { glyphs: { text: string; center: number; advance: number }[]; width: number; unsupported: boolean };
type Preparation = { glyphs: Set<Glyph>; sprites: Set<Sprite>; glyphBytes: number; spriteBytes: number };
const geometry = new Map<string, Glyph>();
const sprites = new Map<string, Sprite>();
const layouts = new Map<string, Layout>();
let geometryBytes = 0;
let spriteBytes = 0;
let layoutGlyphs = 0;
let raster: HTMLCanvasElement | null = null;

/** Call after packaged fonts become ready, alongside the board metrics reset. */
export function clearNeonTubeCache(): void {
  geometry.clear(); sprites.clear(); layouts.clear();
  geometryBytes = 0; spriteBytes = 0; layoutGlyphs = 0;
  raster = null;
}

function canvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  try {
    const result = document.createElement('canvas');
    return typeof result.getContext === 'function' ? result : null;
  } catch { return null; }
}

function rasterContext(): CanvasRenderingContext2D | null {
  if (!raster) {
    raster = canvas();
    if (!raster) return null;
    raster.width = SIDE; raster.height = SIDE;
  }
  return raster.getContext('2d', { willReadFrequently: true });
}

function clusters(text: string): string[] {
  const result: string[] = [];
  let join = false, regional = false;
  for (const char of Array.from(text)) {
    const cp = char.codePointAt(0)!;
    const flag = cp >= 0x1F1E6 && cp <= 0x1F1FF;
    const extending = cp === 0x200D || cp === 0xFE0F || cp === 0xFE0E || cp === 0x20E3
      || cp >= 0x300 && cp <= 0x36F || cp >= 0x1F3FB && cp <= 0x1F3FF;
    if (result.length && (join || extending || flag && regional)) result[result.length - 1] += char;
    else result.push(char);
    join = cp === 0x200D; regional = flag && !regional;
  }
  return result;
}

function lineLayout(ctx: CanvasRenderingContext2D, line: string): Layout {
  const cached = layouts.get(line);
  if (cached) { layouts.delete(line); layouts.set(line, cached); return cached; }
  ctx.font = `${TUBE_FONT.weight} ${EM}px ${TUBE_FONT.family}`;
  let pen = 0;
  const glyphs = clusters(line).map(text => {
    const advance = ctx.measureText(text).width;
    const item = { text, center: pen + advance / 2, advance };
    pen += advance; return item;
  });
  const width = ctx.measureText(line).width;
  // CJK without joiners has no contextual kerning here. Avoid shaping all
  // 2000 increasing prefixes on this common path; Latin uses actual prefix
  // ends, because distributing total kerning equally moves the first glyph.
  if (!/^[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]+$/u.test(line) || Math.abs(pen - width) > 0.001) {
    let prefix = '';
    glyphs.forEach(item => {
      prefix += item.text;
      item.center = ctx.measureText(prefix).width - item.advance / 2;
    });
  }
  const unsupported = !Number.isFinite(width) || glyphs.some(item => !Number.isFinite(item.advance) || item.advance > SIDE - PADDING * 2);
  const result = { glyphs, width, unsupported };
  if (glyphs.length <= MAX_LAYOUT_GLYPHS) {
    while (layouts.size && (layouts.size >= MAX_LAYOUTS || layoutGlyphs + glyphs.length > MAX_LAYOUT_GLYPHS)) {
      const key = layouts.keys().next().value!;
      layoutGlyphs -= layouts.get(key)!.glyphs.length; layouts.delete(key);
    }
    layouts.set(line, result); layoutGlyphs += glyphs.length;
  }
  return result;
}

/** Exact separable squared distance transform with antialiased edge seeds. */
function distances(alpha: Uint8Array, inside: boolean): Float32Array {
  const intermediate = new Float32Array(SIDE * SIDE);
  const output = new Float32Array(SIDE * SIDE);
  const values = new Float64Array(SIDE), transformed = new Float64Array(SIDE);
  const sites = new Int32Array(SIDE), edges = new Float64Array(SIDE + 1);
  const transform = () => {
    let k = 0;
    sites[0] = 0; edges[0] = -Infinity; edges[1] = Infinity;
    for (let q = 1; q < SIDE; q++) {
      let site = sites[k];
      let crossing = ((values[q] + q * q) - (values[site] + site * site)) / (2 * (q - site));
      while (crossing <= edges[k]) {
        site = sites[--k];
        crossing = ((values[q] + q * q) - (values[site] + site * site)) / (2 * (q - site));
      }
      sites[++k] = q; edges[k] = crossing; edges[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < SIDE; q++) {
      while (edges[k + 1] < q) k++;
      transformed[q] = (q - sites[k]) ** 2 + values[sites[k]];
    }
  };
  for (let y = 0; y < SIDE; y++) {
    for (let x = 0; x < SIDE; x++) {
      const coverage = alpha[y * SIDE + x] / 255;
      // Fractional coverage initializes the subpixel boundary distance. Both
      // opaque and partly covered pixels then follow the same EDT path;
      // switching formulas at alpha=255 would create jagged diagonal bands.
      let seed = inside
        ? coverage === 0 ? INF : Math.max(0, 0.5 - coverage) ** 2
        : coverage === 1 ? INF : Math.max(0, coverage - 0.5) ** 2;
      if (seed === INF) {
        // Fully clear/opaque boundary pixels also need fractional seeds.
        // Otherwise alpha 254→255 would jump from 0.496px to a full pixel.
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || x + dx < 0 || x + dx >= SIDE || y + dy < 0 || y + dy >= SIDE) continue;
          const neighbor = alpha[(y + dy) * SIDE + x + dx] / 255;
          if (inside ? neighbor < 0.5 : neighbor > 0.5) continue;
          const fraction = Math.abs(coverage - 0.5) / Math.abs(coverage - neighbor);
          seed = Math.min(seed, fraction * fraction * (dx * dx + dy * dy));
        }
      }
      values[x] = seed;
    }
    transform();
    for (let x = 0; x < SIDE; x++) intermediate[y * SIDE + x] = transformed[x];
  }
  for (let x = 0; x < SIDE; x++) {
    for (let y = 0; y < SIDE; y++) values[y] = intermediate[y * SIDE + x];
    transform();
    for (let y = 0; y < SIDE; y++) output[y * SIDE + x] = transformed[y];
  }
  return output;
}

function pinGlyph(glyph: Glyph, held: Preparation): boolean {
  if (held.glyphs.has(glyph)) return true;
  if (held.glyphs.size >= MAX_GEOMETRY || held.glyphBytes + glyph.bytes > MAX_GEOMETRY_BYTES) return false;
  held.glyphs.add(glyph); held.glyphBytes += glyph.bytes;
  return true;
}

function reserveGeometry(bytes: number, held: Preparation): boolean {
  if (held.glyphs.size >= MAX_GEOMETRY || held.glyphBytes + bytes > MAX_GEOMETRY_BYTES) return false;
  while (geometry.size >= MAX_GEOMETRY || geometryBytes + bytes > MAX_GEOMETRY_BYTES) {
    const oldest = [...geometry].find(([, glyph]) => !held.glyphs.has(glyph));
    if (!oldest) return false;
    geometry.delete(oldest[0]); geometryBytes -= oldest[1].bytes;
  }
  return true;
}

function glyphField(ctx: CanvasRenderingContext2D, text: string, held: Preparation): Glyph | null {
  const cached = geometry.get(text);
  if (cached) {
    if (!pinGlyph(cached, held)) return null;
    geometry.delete(text); geometry.set(text, cached); return cached;
  }
  if (held.glyphs.size >= MAX_GEOMETRY) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, SIDE, SIDE);
  ctx.font = `${TUBE_FONT.weight} ${EM}px ${TUBE_FONT.family}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#FFFFFF';
  ctx.fillText(text, CENTER, CENTER);
  const rgba = ctx.getImageData(0, 0, SIDE, SIDE)?.data;
  if (!rgba || rgba.length !== SIDE * SIDE * 4) return null;
  const alpha = new Uint8Array(SIDE * SIDE);
  let left = SIDE, right = -1, top = SIDE, bottom = -1;
  for (let y = 0; y < SIDE; y++) for (let x = 0; x < SIDE; x++) {
    const value = rgba[(y * SIDE + x) * 4 + 3];
    alpha[y * SIDE + x] = value;
    if (!value) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  // Empty glyphs are valid (spaces, zero-width characters), but not failures.
  if (right < left) {
    const empty = { field: new Int16Array(), left: 0, top: 0, width: 0, height: 0, bytes: 0 };
    if (!reserveGeometry(0, held)) return null;
    geometry.set(text, empty); pinGlyph(empty, held); return empty;
  }
  left = Math.max(0, left - PADDING); right = Math.min(SIDE - 1, right + PADDING);
  top = Math.max(0, top - PADDING); bottom = Math.min(SIDE - 1, bottom + PADDING);
  const width = right - left + 1, height = bottom - top + 1;
  // Reserve before allocating the field or EDT workspaces. Entries already
  // prepared for this draw stay pinned in the LRU, so eviction cannot leave
  // uncounted strong references behind the cache's byte ceiling.
  if (!reserveGeometry(width * height * 2, held)) return null;
  const toInk = distances(alpha, true), toClear = distances(alpha, false);
  const raw = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (top + y) * SIDE + left + x;
    raw[y * width + x] = Math.sqrt(toClear[index]) - Math.sqrt(toInk[index]);
  }
  // A half-source-pixel tent softens the remaining grid direction without
  // deleting strokes, closing counters, or changing the canonical glyph.
  const horizontal = new Float32Array(raw.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    horizontal[index] = raw[index] * 0.75 + (raw[y * width + Math.max(0, x - 1)] + raw[y * width + Math.min(width - 1, x + 1)]) * 0.125;
  }
  const field = new Int16Array(raw.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    const signed = horizontal[index] * 0.75
      + (horizontal[Math.max(0, y - 1) * width + x] + horizontal[Math.min(height - 1, y + 1) * width + x]) * 0.125;
    field[index] = Math.max(-32768, Math.min(32767, Math.round(signed * DISTANCE_SCALE)));
  }
  const glyph = { field, left: left - CENTER, top: top - CENTER, width, height, bytes: field.byteLength };
  geometry.set(text, glyph); geometryBytes += glyph.bytes; pinGlyph(glyph, held);
  return glyph;
}

function color(value: string): RGB | null {
  const hex = /^#([\da-f]{6}|[\da-f]{3})$/i.exec(value);
  if (!hex) return null;
  const digits = hex[1].length === 3 ? Array.from(hex[1]).map(char => char + char).join('') : hex[1];
  return [0, 2, 4].map(start => parseInt(digits.slice(start, start + 2), 16)) as RGB;
}

type Gradient = { end: RGB; dx: number; dy: number; span: number; offsetX: number; offsetY: number };
function pinSprite(sprite: Sprite, held: Preparation): boolean {
  if (held.sprites.has(sprite)) return true;
  if (held.sprites.size >= MAX_SPRITES || held.spriteBytes + sprite.bytes > MAX_SPRITE_BYTES) return false;
  held.sprites.add(sprite); held.spriteBytes += sprite.bytes;
  return true;
}

function coloredSprite(text: string, glyph: Glyph, start: RGB, gradient: Gradient | null, held: Preparation): Sprite | null {
  const quantize = (value: number) => Math.round(value * 1e6);
  const key = JSON.stringify([text, start, gradient && [gradient.end, quantize(gradient.dx), quantize(gradient.dy),
    quantize(gradient.span), quantize(gradient.offsetX), quantize(gradient.offsetY)]]);
  const cached = sprites.get(key);
  if (cached) {
    if (!pinSprite(cached, held)) return null;
    sprites.delete(key); sprites.set(key, cached); return cached;
  }
  const bytes = glyph.width * glyph.height * 4;
  if (held.sprites.size >= MAX_SPRITES || held.spriteBytes + bytes > MAX_SPRITE_BYTES) return null;
  while (sprites.size >= MAX_SPRITES || spriteBytes + bytes > MAX_SPRITE_BYTES) {
    const oldest = [...sprites].find(([, sprite]) => !held.sprites.has(sprite));
    if (!oldest) return null;
    sprites.delete(oldest[0]); spriteBytes -= oldest[1].bytes;
  }
  const image = canvas();
  if (!image) return null;
  image.width = glyph.width; image.height = glyph.height;
  const ctx = image.getContext('2d');
  if (!ctx) return null;
  const pixels = ctx.createImageData(glyph.width, glyph.height);
  if (!pixels?.data || pixels.data.length !== glyph.width * glyph.height * 4) return null;
  for (let y = 0; y < glyph.height; y++) for (let x = 0; x < glyph.width; x++) {
    // Preserve the tube's emitted width as its formerly hard edge is softened.
    // Alpha and highlight use the same smooth field; this adds no contour.
    const index = y * glyph.width + x, distance = glyph.field[index] / DISTANCE_SCALE + EM * 0.003;
    const outside = Math.max(0, -distance);
    const opacity = Math.exp(-0.5 * (outside / EDGE_SIGMA) ** 2);
    if (opacity < 1 / 255) continue;
    // A modest central highlight rolls continuously into the colored tube.
    // There is no binary white fill and no separately outlined colored rim.
    const white = 0.86 * Math.exp(-0.5 * (Math.max(0, EM * 0.006 - distance) / (EM * 0.004)) ** 2);
    let progress = 0;
    if (gradient) progress = Math.max(0, Math.min(1, 0.5 + ((gradient.offsetX + (glyph.left + x) / EM) * gradient.dx
      + (gradient.offsetY + (glyph.top + y) / EM) * gradient.dy) / gradient.span));
    for (let channel = 0; channel < 3; channel++) {
      const base = start[channel] + (gradient ? (gradient.end[channel] - start[channel]) * progress : 0);
      pixels.data[index * 4 + channel] = Math.round(base + (255 - base) * white);
    }
    pixels.data[index * 4 + 3] = Math.round(opacity * 255);
  }
  ctx.putImageData(pixels, 0, 0);
  const sprite = { canvas: image, bytes };
  sprites.set(key, sprite); spriteBytes += bytes; pinSprite(sprite, held);
  return sprite;
}

/**
 * Draw a colored, softly graded Thin100 tube. The caller owns transforms/halo.
 * False means the geometry or pixel API was unavailable; no tube was drawn.
 * Gradient coordinates are normalized by font size, so a scrolling translation
 * does not invalidate colored sprites. No word-sized bitmap is allocated.
 */
export function drawSoftNeonTube(ctx: CanvasRenderingContext2D, line: string, x: number, y: number,
  fontSize: number, options: SoftNeonTubeOptions): boolean {
  if (!line) return true;
  if (![x, y, fontSize, options.viewportWidth, options.viewportHeight].every(Number.isFinite)
    || fontSize <= 0 || options.viewportWidth <= 0 || options.viewportHeight <= 0) return false;
  const start = color(options.foreground), end = options.gradientEnd ? color(options.gradientEnd) : null;
  if (!start || options.gradientEnd && !end) return false;
  try {
    const mask = rasterContext();
    if (!mask) return false;
    const layout = lineLayout(mask, line);
    if (layout.unsupported) return false;
    const scaleX = Number.isFinite(options.textScaleX) ? Math.max(0.01, options.textScaleX!) : 1;
    const clipLeft = x - x / scaleX, clipRight = clipLeft + options.viewportWidth / scaleX;
    const bounds = options.gradientBounds || { x, y, width: layout.width * fontSize / EM, height: fontSize };
    if (end && ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return false;
    const radians = (Number.isFinite(options.gradientAngle) ? options.gradientAngle! : 0) * Math.PI / 180;
    const dx = Math.cos(radians), dy = Math.sin(radians);
    const span = Math.max(1 / fontSize, (Math.abs(dx) * bounds.width + Math.abs(dy) * bounds.height) / fontSize);
    const prepared: { glyph: Glyph; sprite: Sprite; center: number }[] = [];
    const held: Preparation = { glyphs: new Set(), sprites: new Set(), glyphBytes: 0, spriteBytes: 0 };
    for (const item of layout.glyphs) {
      const center = x + (item.center - layout.width / 2) * fontSize / EM;
      // Conservative pre-raster culling includes glyph overhang and soft edge.
      const reach = Math.max(1, item.advance / EM) * fontSize;
      if (center + reach < clipLeft || center - reach > clipRight || y + fontSize < 0 || y - fontSize > options.viewportHeight || /^\s+$/.test(item.text)) continue;
      const glyph = glyphField(mask, item.text, held);
      if (!glyph) return false;
      if (!glyph.width || !glyph.height) continue;
      const gradient = end ? { end, dx, dy, span, offsetX: (center - bounds.x) / fontSize, offsetY: (y - bounds.y) / fontSize } : null;
      const sprite = coloredSprite(item.text, glyph, start, gradient, held);
      if (!sprite) return false;
      prepared.push({ glyph, sprite, center });
    }
    ctx.save();
    try {
      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.beginPath(); ctx.rect(clipLeft, 0, clipRight - clipLeft, options.viewportHeight); ctx.clip();
      for (const { glyph, sprite, center } of prepared) ctx.drawImage(sprite.canvas,
        center + glyph.left * fontSize / EM, y + glyph.top * fontSize / EM,
        glyph.width * fontSize / EM, glyph.height * fontSize / EM);
    } finally { ctx.restore(); }
    return true;
  } catch { return false; }
}
