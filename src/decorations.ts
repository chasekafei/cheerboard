import type { Design } from './catalog.ts';

export const DECORATION_SETS = [
  { id: 'none', name: '无装饰', description: '把画面留给文字' },
  { id: 'hearts', name: '爱心星芒', description: '四角点状爱心，边缘细星芒' },
  { id: 'stars', name: '四角星光', description: '大小星芒围住这句话' },
  { id: 'rally', name: '乒乓轨迹', description: '球拍、橙球与细碎轨迹' },
  { id: 'orbit', name: '环绕星轨', description: '发光轨迹和小小星球' },
  { id: 'confetti', name: '缤纷碎光', description: '边角散落的光点纸屑' },
] as const;
export type DecorationId = typeof DECORATION_SETS[number]['id'];
type Motif = 'heart' | 'spark' | 'paddle' | 'ball' | 'orbit' | 'confetti';
export type BoardDecorationGeometry = {
  width: number;
  height: number;
  textBounds?: { left: number; top: number; right: number; bottom: number };
};
export type DecorationPlacement = { motif: Motif; x: number; y: number; radius: number; rotation: number; color: string; opacity: number };
type LedSprite = { canvas: HTMLCanvasElement; bleed: number; span: number; haloSide: number; coreSize: number };
const ledSprites = new Map<string, LedSprite>();

function randomSource(seed: number): () => number {
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

export function getBoardDecorationLayout(design: Design, geometry: BoardDecorationGeometry): DecorationPlacement[] {
  if (!design.decorationId || design.decorationId === 'none') return [];
  const { width, height, textBounds } = geometry;
  const unit = Math.min(width, height);
  const portrait = height > width;
  const foreground = design.foreground || '#FFF12A';
  const accent = design.accent || '#FF3C88';
  const random = randomSource(design.decorationSeed);
  const placements: DecorationPlacement[] = [];
  const place = (motif: Motif, nx: number, ny: number, size: number, color: string, rotation = 0) => {
    const noise = () => design.decorationSeed === 1 ? 0 : random() * 2 - 1;
    const x = (nx + noise() * 0.008) * width;
    const y = (ny + noise() * 0.012) * height;
    let radius = size * unit * (1 + noise() * 0.1);
    if (textBounds) {
      const dx = Math.max(textBounds.left - x, 0, x - textBounds.right);
      const dy = Math.max(textBounds.top - y, 0, y - textBounds.bottom);
      const footprint = motif === 'ball' ? 1.7 : motif === 'paddle' ? 1.35 : 1.2;
      const clearance = Math.sqrt(dx * dx + dy * dy) / footprint - unit * 0.008;
      if (clearance < radius * 0.4) return;
      radius = Math.min(radius, clearance);
    }
    placements.push({ motif, x, y, radius, rotation: rotation + noise() * 0.12, color, opacity: 0.96 });
  };
  const top = portrait ? 0.12 : 0.17;
  const bottom = portrait ? 0.88 : 0.79;
  const corners: Array<[number, number, number]> = [[0.09, top, -0.2], [0.91, top, 0.23], [0.085, bottom, 0.1], [0.915, bottom, -0.18]];
  if (design.decorationId === 'hearts') {
    corners.forEach(([x, y, turn]) => place('heart', x, y, 0.064, accent, turn));
    place('spark', 0.5, portrait ? 0.065 : 0.13, 0.035, foreground);
    place('spark', 0.5, portrait ? 0.94 : 0.86, 0.032, foreground);
    place('spark', 0.045, 0.5, 0.031, foreground);
    place('spark', 0.955, 0.5, 0.031, foreground);
  } else if (design.decorationId === 'stars') {
    corners.forEach(([x, y, turn], index) => place('spark', x, y, index % 2 ? 0.045 : 0.06, index % 2 ? accent : foreground, turn));
    place('spark', 0.36, 0.11, 0.025, accent, 0.3);
    place('spark', 0.64, 0.89, 0.026, foreground, -0.2);
    place('spark', 0.045, 0.52, 0.022, accent);
    place('spark', 0.955, 0.46, 0.024, foreground);
  } else if (design.decorationId === 'rally') {
    place('paddle', 0.09, top, 0.061, accent, -0.48);
    place('paddle', 0.91, bottom, 0.061, accent, 0.45);
    place('ball', 0.91, top, 0.04, '#FFAA39');
    place('ball', 0.085, bottom, 0.038, '#FFAA39');
    place('orbit', 0.37, 0.1, 0.045, foreground, -0.08);
    place('orbit', 0.63, 0.9, 0.045, foreground, Math.PI);
  } else if (design.decorationId === 'orbit') {
    corners.forEach(([x, y, turn], index) => place('orbit', x, y, 0.064, index % 2 ? accent : foreground, turn + index * 0.8));
    place('spark', 0.38, 0.095, 0.027, accent);
    place('spark', 0.62, 0.905, 0.025, foreground);
  } else if (design.decorationId === 'confetti') {
    corners.forEach(([x, y, turn], index) => place('confetti', x, y, 0.058, index % 2 ? accent : foreground, turn));
    place('confetti', 0.34, 0.1, 0.035, accent, 0.5);
    place('confetti', 0.67, 0.89, 0.034, foreground, -0.3);
    place('spark', 0.045, 0.51, 0.024, foreground);
    place('spark', 0.955, 0.49, 0.024, accent);
  }
  return placements;
}

function ledSprite(cell: number, color: string, glow: number): LedSprite {
  const base = Math.max(5, Math.min(32, Math.ceil(cell)));
  const margin = Math.ceil(base * 0.95);
  const side = base + margin * 2;
  const strength = Number.isFinite(glow) ? Math.max(0, Math.min(100, glow)) / 100 : 0.65;
  const key = JSON.stringify([base, color, strength]);
  const cached = ledSprites.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side + base;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const middle = side / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, side, side); ctx.clip();
    ctx.shadowColor = color;
    ctx.shadowBlur = base * 0.72 * strength;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(middle, middle, base * 0.34, 0, Math.PI * 2); ctx.fill();
    if (strength > 0) {
      ctx.shadowBlur = base * 0.26 * strength;
      ctx.beginPath(); ctx.arc(middle, middle, base * 0.34, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(base / 2, side + base / 2, base * 0.23, 0, Math.PI * 2); ctx.fill();
  }
  const sprite = { canvas, bleed: margin / base, span: side / base, haloSide: side, coreSize: base };
  if (ledSprites.size >= 16) {
    const oldest = ledSprites.keys().next().value;
    if (typeof oldest === 'string') ledSprites.delete(oldest);
  }
  ledSprites.set(key, sprite);
  return sprite;
}

function led(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, color: string, glow: number, core: boolean): void {
  const sprite = ledSprite(cell, color, glow);
  if (core) {
    ctx.drawImage(sprite.canvas, 0, sprite.haloSide, sprite.coreSize, sprite.coreSize,
      x - cell / 2, y - cell / 2, cell, cell);
  } else {
    const side = cell * sprite.span;
    ctx.drawImage(sprite.canvas, 0, 0, sprite.haloSide, sprite.haloSide,
      x - cell / 2 - cell * sprite.bleed, y - cell / 2 - cell * sprite.bleed, side, side);
  }
}

const HEART = ['011000110', '111101111', '111111111', '011111110', '001111100', '000111000', '000010000'];

function drawMotif(ctx: CanvasRenderingContext2D, item: DecorationPlacement, glow: number, core: boolean): void {
  const r = item.radius;
  const dot = (x: number, y: number, cell: number, color = item.color) => led(ctx, x, y, cell, color, glow, core);
  if (item.motif === 'heart') {
    const cell = r / 4.4;
    HEART.forEach((row, y) => Array.from(row).forEach((value, x) => { if (value === '1') dot((x - 4) * cell, (y - 2.8) * cell, cell); }));
  } else if (item.motif === 'spark') {
    const cell = r / 2.3;
    for (let i = -2; i <= 2; i++) { dot(i * cell, 0, cell * (i ? 0.8 : 1)); if (i) dot(0, i * cell, cell * 0.8); }
  } else if (item.motif === 'paddle') {
    for (let i = 0; i < 26; i++) {
      const angle = i / 26 * Math.PI * 2;
      dot(Math.cos(angle) * r * 0.62, Math.sin(angle) * r * 0.68 - r * 0.18, r * 0.15);
    }
    for (let i = 0; i < 5; i++) dot(0, r * (0.5 + i * 0.12), r * 0.16, '#FFCD63');
    dot(r * 0.82, -r * 0.7, r * 0.3, '#FFAA39');
  } else if (item.motif === 'ball') {
    for (let i = 0; i < 15; i++) {
      const angle = i / 15 * Math.PI * 2;
      dot(Math.cos(angle) * r * 0.7, Math.sin(angle) * r * 0.7, r * 0.2);
    }
    for (let i = 1; i <= 4; i++) dot(-r * (0.7 + i * 0.16), r * (0.3 + i * 0.1), r * (0.15 - i * 0.014));
  } else if (item.motif === 'orbit') {
    for (let i = 0; i < 25; i++) {
      const angle = -Math.PI * 0.9 + i / 24 * Math.PI * 1.55;
      dot(Math.cos(angle) * r * 0.9, Math.sin(angle) * r * 0.42, r * 0.12);
    }
    dot(r * 0.9, 0, r * 0.3);
  } else {
    for (let cluster = 0; cluster < 3; cluster++) {
      const x = (cluster - 1) * r * 0.65;
      const y = cluster % 2 ? -r * 0.45 : r * 0.2;
      for (let i = 0; i < 3; i++) dot(x + i * r * 0.13, y - i * r * 0.2, r * 0.2);
    }
  }
}

export function drawBoardDecorations(ctx: CanvasRenderingContext2D, design: Design, geometry: BoardDecorationGeometry): void {
  const placements = getBoardDecorationLayout(design, geometry);
  if (!placements.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  // Complete the entire halo pass before any white core, even across motifs.
  for (const core of [false, true]) {
    for (const item of placements) {
      ctx.save();
      ctx.globalAlpha = core ? 1 : item.opacity;
      ctx.translate(item.x, item.y);
      ctx.rotate(item.rotation);
      drawMotif(ctx, item, design.glow, core);
      ctx.restore();
    }
  }
  ctx.restore();
}
