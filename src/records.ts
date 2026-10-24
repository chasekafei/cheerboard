import { createDesign, TEMPLATES, type Design } from './catalog';
import { loadLocal, saveLocal } from './platform';

export function validateDesign(value: unknown): Design | null {
  if (!value || typeof value !== 'object') return null;
  const d = value as Partial<Design>;
  if (!TEMPLATES.some(t => t.id === d.templateId) || typeof d.text !== 'string' || d.text.length > 2000) return null;
  const base = createDesign(d.templateId);
  return {
    ...base,
    id: typeof d.id === 'string' && /^[\w-]{1,100}$/.test(d.id) ? d.id : base.id,
    text: d.text,
    paletteId: typeof d.paletteId === 'string' ? d.paletteId : base.paletteId,
    foreground: /^#[a-f\d]{6}$/i.test(d.foreground || '') ? d.foreground! : base.foreground,
    background: /^#[a-f\d]{6}$/i.test(d.background || '') ? d.background! : base.background,
    layout: d.layout === 'double' ? 'double' : 'single',
    sticker: ['star', 'heart', 'fries', 'none'].indexOf(d.sticker || '') >= 0 ? d.sticker! : base.sticker,
    border: typeof d.border === 'boolean' ? d.border : base.border,
    scroll: d.scroll === true && String(d.templateId).charAt(0) === 'L',
    speed: typeof d.speed === 'number' ? Math.max(1, Math.min(5, Math.round(d.speed))) : 3,
    direction: d.direction === 'right' ? 'right' : 'left',
    loop: d.loop !== false,
    friendly: d.friendly !== false,
    updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : Date.now(),
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
