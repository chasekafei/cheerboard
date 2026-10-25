import assert from 'node:assert/strict';
import test from 'node:test';
import { createDesign, getTemplate, TEMPLATES, type TemplateId } from '../src/catalog.ts';
import { normalizeDotEmoji } from '../src/design-values.ts';
import { readRecords, validateDesign, writeRecord } from '../src/records.ts';

const legacyDraft = {
  id: 'legacy-board-1',
  text: '原来的草稿\n👨‍👩‍👧‍👦 自填文字',
  templateId: 'L2',
  paletteId: 'ice-pink',
  foreground: '#aBcDeF',
  background: '#123456',
  layout: 'double',
  sticker: 'fries',
  border: true,
  scroll: true,
  speed: 4,
  direction: 'right',
  loop: false,
  friendly: false,
  updatedAt: 123456789,
};

test('legacy drafts keep their content and settings while receiving new design values', () => {
  const migrated = validateDesign(legacyDraft)!;
  assert.ok(migrated);
  for (const [key, value] of Object.entries(legacyDraft)) {
    assert.equal(migrated[key as keyof typeof migrated], value, key);
  }
  assert.equal(migrated.accent, '#64D9FF');
  assert.equal(migrated.dotShape, 'circle');
  assert.equal(migrated.dotEmoji, '🏓');
  assert.equal(migrated.dotDensity, 2);
  assert.equal(migrated.glow, 65);
  assert.equal(migrated.fontScale, 100);
  assert.equal(migrated.fontId, 'sans');
  assert.equal(migrated.gradient, false);
  assert.equal(migrated.gradientEnd, '#64D9FF');
  assert.equal(migrated.gradientAngle, 0);
  assert.equal(migrated.orientation, 'landscape');
  assert.equal(validateDesign({ ...legacyDraft, paletteId: 'custom' })!.accent, getTemplate('L2').palettes[0].accent);
});

test('existing template IDs remain valid and new light defaults do not migrate old choices', () => {
  for (const templateId of ['L1', 'L2', 'L3', 'H1', 'H2', 'H3'] as TemplateId[]) {
    const migrated = validateDesign({ ...legacyDraft, templateId })!;
    assert.equal(migrated.templateId, templateId);
    assert.equal(migrated.text, legacyDraft.text);
    assert.equal(migrated.border, true);
    assert.equal(migrated.sticker, 'fries');
  }
  assert.equal(validateDesign({ ...legacyDraft, templateId: 'unknown' }), null);
  assert.deepEqual(TEMPLATES.map(template => template.id), ['L3', 'L2', 'L4', 'L5', 'L1', 'H1', 'H2', 'H3']);
  assert.equal(createDesign().templateId, 'L3');
  assert.equal(createDesign().text, '点击屏幕修改文案或样式');
  assert.equal(createDesign().layout, 'single');
  assert.equal(getTemplate('unknown' as TemplateId).id, 'L3');
  for (const templateId of ['L1', 'L2', 'L3', 'L4', 'L5'] as TemplateId[]) {
    const design = createDesign(templateId);
    assert.equal(design.background, '#000000');
    assert.equal(design.sticker, 'none');
    assert.equal(design.border, false);
    assert.equal(design.text, '点击屏幕修改文案或样式');
  }
  assert.equal(createDesign('L1').foreground, '#FFFFFF');
  assert.equal(createDesign('L5').foreground, '#25F4EE');
  const oldText = '点击屏幕编辑文案和样式';
  assert.equal(validateDesign({ ...legacyDraft, text: oldText })!.text, oldText);
});

test('new persisted controls preserve valid values and bound invalid numeric input', () => {
  const saved = {
    ...legacyDraft,
    templateId: 'L4',
    accent: '#12ABef',
    dotShape: 'emoji',
    dotEmoji: '👩🏽‍🚀',
    dotDensity: 3,
    glow: 0,
    fontScale: 130,
    fontId: 'serif',
    gradient: true,
    gradientEnd: '#Ff7654',
    gradientAngle: 360,
    orientation: 'portrait',
  };
  const restored = validateDesign(saved)!;
  for (const key of ['accent', 'dotShape', 'dotEmoji', 'dotDensity', 'glow', 'fontScale', 'gradient', 'gradientEnd', 'gradientAngle', 'orientation'] as const) {
    assert.equal(restored[key], saved[key], key);
  }
  assert.equal(restored.fontId, 'sans');
  assert.equal(validateDesign({ ...saved, templateId: 'L1' })!.fontId, 'serif');
  const bounded = validateDesign({ ...saved, dotDensity: 1.7, glow: -5, fontScale: 999 })!;
  assert.equal(bounded.dotDensity, 2);
  assert.equal(bounded.glow, 0);
  assert.equal(bounded.fontScale, 200);
  for (const dotDensity of [0, 1, 2, 3]) {
    assert.equal(validateDesign({ ...saved, dotDensity })!.dotDensity, dotDensity);
  }
  const newControls = validateDesign({ ...saved, templateId: 'L5', dotDensity: 0, fontScale: 200 })!;
  assert.equal(newControls.templateId, 'L5');
  assert.equal(newControls.dotDensity, 0);
  assert.equal(newControls.fontScale, 200);
  for (const number of [NaN, Infinity, -Infinity, '3', null]) {
    const restoredInvalid = validateDesign({ ...saved, dotDensity: number, glow: number, fontScale: number, speed: number })!;
    assert.equal(restoredInvalid.dotDensity, 2);
    assert.equal(restoredInvalid.glow, 65);
    assert.equal(restoredInvalid.fontScale, 100);
    assert.equal(restoredInvalid.speed, 3);
  }
  const invalid = validateDesign({ ...saved, accent: 'red', dotShape: 'triangle', dotEmoji: '' })!;
  assert.equal(invalid.accent, getTemplate('L4').palettes[0].accent);
  assert.equal(invalid.dotShape, 'circle');
  assert.equal(invalid.dotEmoji, '🏓');
  for (const sticker of ['paddle', 'ball']) {
    assert.equal(validateDesign({ ...saved, sticker })!.sticker, sticker);
  }
  const invalidEffects = validateDesign({ ...saved, fontId: 'foreign-font', gradient: 'true', gradientEnd: 'red', gradientAngle: Infinity, orientation: 'sideways' })!;
  assert.equal(invalidEffects.fontId, 'sans');
  assert.equal(invalidEffects.gradient, false);
  assert.equal(invalidEffects.gradientEnd, getTemplate('L4').palettes[0].accent);
  assert.equal(invalidEffects.gradientAngle, 0);
  assert.equal(invalidEffects.orientation, 'landscape');
  assert.equal(validateDesign({ ...saved, gradientAngle: -1 })!.gradientAngle, 0);
  assert.equal(validateDesign({ ...saved, gradientAngle: 361 })!.gradientAngle, 360);
});

test('emoji labels retain a complete first cluster without depending on Intl.Segmenter', () => {
  for (const emoji of ['🏓', '❤️', '👍🏽', '👩🏽‍🚀', '👨‍👩‍👧‍👦', '🇨🇳', '1️⃣']) {
    assert.equal(normalizeDotEmoji(emoji + '⭐'), emoji);
    assert.equal(normalizeDotEmoji('  ' + emoji + '  '), emoji);
  }
  assert.equal(normalizeDotEmoji('🇨🇳🇫🇷'), '🇨🇳');
  for (const invalid of [null, undefined, 3, '', '   ', '\u200d', '🙂\u200d', '\uD800']) {
    assert.equal(normalizeDotEmoji(invalid), '🏓');
  }
  const limited = 'a' + '\u0301'.repeat(31);
  assert.equal(normalizeDotEmoji(limited), limited);
  assert.equal(normalizeDotEmoji(limited + '\u0301'), '🏓');
});

test('reading legacy records does not rewrite them and new control values survive save and reopen', async () => {
  const stored = new Map<string, string>();
  let writes = 0;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => { writes++; stored.set(key, value); },
    },
  });
  const original = JSON.stringify([null, ...Array.from({ length: 6 }, (_, index) => ({ ...legacyDraft, id: 'legacy-' + index }))]);
  stored.set('boards-v1', original);
  const migrated = await readRecords();
  assert.equal(migrated.length, 5);
  assert.equal(migrated[0].id, 'legacy-0');
  assert.equal(migrated[4].id, 'legacy-4');
  assert.equal(writes, 0);
  assert.equal(stored.get('boards-v1'), original);

  const design = { ...createDesign('L4'), id: 'new-neon', accent: '#AB1234', dotShape: 'heart' as const, dotEmoji: '👩🏽‍🚀', dotDensity: 1, glow: 42, fontScale: 85, fontId: 'sans' as const, gradient: true, gradientEnd: '#Ff7654', gradientAngle: 135, orientation: 'portrait' as const };
  const next = await writeRecord(migrated, design);
  assert.equal(next.length, 5);
  assert.equal(migrated[0].id, 'legacy-0');
  const reopened = await readRecords();
  assert.deepEqual(reopened[0], next[0]);
  assert.equal(reopened[1].text, legacyDraft.text);
});


test('the former ghost default upgrades to two colored layers while custom layer colors and copy survive', () => {
  const previous = { ...createDesign('L5'), paletteId: 'red-cyan', foreground: '#FFFFFF', accent: '#42D7FF', text: '我们来日方长', layout: 'double' as const, gradient: true };
  const restored = validateDesign(previous)!;
  assert.equal(restored.text, previous.text);
  assert.equal(restored.layout, 'double');
  assert.equal(restored.foreground, '#25F4EE');
  assert.equal(restored.accent, '#FE2C55');
  assert.equal(restored.gradient, false);
  const custom = validateDesign({ ...previous, paletteId: 'custom', foreground: '#123456', accent: '#ABCDEF' })!;
  assert.equal(custom.foreground, '#123456');
  assert.equal(custom.accent, '#ABCDEF');
});
