import { createDesign, getTemplate, TEMPLATES, type Design } from './catalog.ts';
import { normalizeDotEmoji, MIN_DOT_DENSITY, MAX_DOT_DENSITY, MIN_FONT_SCALE, MAX_FONT_SCALE } from './design-values.ts';
import { BOARD_FONTS } from './fonts.ts';
import { loadLocal, saveLocal } from './platform.ts';

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value) ? value : fallback;
}

function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, Math.round(value))) : fallback;
}

export function validateDesign(value: unknown): Design | null {
  if (!value || typeof value !== 'object') return null;
  const d = value as Partial<Design>;
  if (!TEMPLATES.some(t => t.id === d.templateId) || typeof d.text !== 'string' || d.text.length > 2000) return null;
  const base = createDesign(d.templateId);
  const palette = getTemplate(base.templateId).palettes.find(p => p.id === d.paletteId);
  // Upgrade the former three-pass default without changing user copy or custom colors.
  const legacyGhost = base.templateId === 'L5' && d.paletteId === 'red-cyan'
    && typeof d.foreground === 'string' && d.foreground.toUpperCase() === '#FFFFFF'
    && typeof d.accent === 'string' && d.accent.toUpperCase() === '#42D7FF';
  return {
    ...base,
    id: typeof d.id === 'string' && /^[\w-]{1,100}$/.test(d.id) ? d.id : base.id,
    text: d.text,
    paletteId: typeof d.paletteId === 'string' ? d.paletteId : base.paletteId,
    foreground: legacyGhost ? base.foreground : color(d.foreground, base.foreground),
    background: color(d.background, base.background),
    accent: legacyGhost ? base.accent : color(d.accent, palette?.accent || base.accent),
    dotShape: ['circle', 'square', 'heart', 'star', 'emoji'].indexOf(d.dotShape || '') >= 0 ? d.dotShape! : base.dotShape,
    dotEmoji: normalizeDotEmoji(d.dotEmoji),
    dotDensity: boundedNumber(d.dotDensity, MIN_DOT_DENSITY, MAX_DOT_DENSITY, base.dotDensity),
    glow: boundedNumber(d.glow, 0, 100, base.glow),
    fontScale: boundedNumber(d.fontScale, MIN_FONT_SCALE, MAX_FONT_SCALE, base.fontScale),
    fontId: base.templateId === 'L4' ? 'sans' : BOARD_FONTS.some(font => font.id === d.fontId) ? d.fontId! : base.fontId,
    gradient: base.templateId !== 'L5' && d.gradient === true,
    gradientEnd: color(d.gradientEnd, palette?.gradientEnd || palette?.accent || base.gradientEnd),
    gradientAngle: boundedNumber(d.gradientAngle, 0, 360, base.gradientAngle),
    orientation: d.orientation === 'portrait' ? 'portrait' : 'landscape',
    layout: d.layout === 'double' ? 'double' : 'single',
    sticker: ['star', 'heart', 'fries', 'paddle', 'ball', 'none'].indexOf(d.sticker || '') >= 0 ? d.sticker! : base.sticker,
    border: typeof d.border === 'boolean' ? d.border : base.border,
    scroll: d.scroll === true && String(d.templateId).charAt(0) === 'L',
    speed: boundedNumber(d.speed, 1, 5, base.speed),
    direction: d.direction === 'right' ? 'right' : 'left',
    loop: d.loop !== false,
    friendly: d.friendly !== false,
    updatedAt: typeof d.updatedAt === 'number' && Number.isFinite(d.updatedAt) ? d.updatedAt : Date.now(),
  };
}
export async function readRecords(): Promise<Design[]> {
  const value = await loadLocal('boards-v1');
  return Array.isArray(value) ? value.map(validateDesign).filter((d): d is Design => d !== null).slice(0, 5) : [];
}
export async function writeRecord(records: Design[], design: Design, asNew = false): Promise<Design[]> {
  const item = { ...design, id: asNew ? createDesign(design.templateId).id : design.id, updatedAt: Date.now() };
  const next = [item, ...records.filter(d => d.id !== item.id)].slice(0, 5);
  await saveLocal('boards-v1', next);
  return next;
}
