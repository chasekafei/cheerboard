import assert from 'node:assert/strict';
import test from 'node:test';
import { SLOGANS } from '../src/slogans.ts';
import { getTextLines, SLOGAN_BREAK_PREFIXES, VARIANT_BREAK_PREFIXES } from '../src/text-layout.ts';

test('every reviewed primary and variant has an explicit layout decision without changing its words', () => {
  const variants = new Set(SLOGANS.flatMap(slogan => [...slogan.variants]));
  assert.deepEqual(Object.keys(SLOGAN_BREAK_PREFIXES).sort(), SLOGANS.map(slogan => slogan.id).sort());
  assert.deepEqual(Object.keys(VARIANT_BREAK_PREFIXES).sort(), [...variants].sort());
  for (const slogan of SLOGANS) {
    for (const text of [slogan.text, ...slogan.variants]) {
      const prefix = text === slogan.text ? SLOGAN_BREAK_PREFIXES[slogan.id] : VARIANT_BREAK_PREFIXES[text];
      if (prefix !== null) {
        assert.ok(text.startsWith(prefix), text);
        assert.ok(prefix.length < text.length, text);
      }
      const lines = getTextLines(text, 'double');
      assert.equal(lines.join('').replace(/\s/g, ''), text.replace(/\s/g, ''), text);
    }
  }
});

test('semantic lines preserve idioms, names, words and unequal clause lengths', () => {
  assert.deepEqual(getTextLines('我们来日方长', 'double'), ['我们', '来日方长']);
  assert.deepEqual(getTextLines('我们 来日方长', 'double'), ['我们', '来日方长']);
  assert.deepEqual(getTextLines('来日方长', 'double'), ['来日方长']);
  assert.deepEqual(getTextLines('SunYingsha', 'double'), ['SunYingsha']);
  assert.deepEqual(getTextLines('BE FIRM AND CONFIDENT', 'double'), ['BE FIRM', 'AND CONFIDENT']);
  assert.deepEqual(getTextLines('那就祝我们都有光明的未来 顶峰相见', 'double'), ['那就祝我们都有光明的未来', '顶峰相见']);
  assert.deepEqual(getTextLines('点击屏幕查看菜单', 'double'), ['点击屏幕', '查看菜单']);
});

test('explicit newlines retain every line and never merge the remaining manual text', () => {
  const text = '纵有千古\n横有八荒\n前途似海\n来日方长';
  assert.deepEqual(getTextLines(text, 'double'), text.split('\n'));
  assert.deepEqual(getTextLines('第一行\r\n第二行\r\n第三行', 'double'), ['第一行', '第二行', '第三行']);
  assert.deepEqual(getTextLines('\n来日方长\n', 'double'), ['', '来日方长', '']);
  assert.deepEqual(getTextLines('SUN\nHOPE', 'single'), ['SUN HOPE']);
  const blessing = SLOGANS.find(slogan => slogan.id === 'C039')!;
  assert.deepEqual(getTextLines(blessing.text, 'double'), ['祝中国乒乓球队', '越来越好']);
  assert.equal(blessing.text, '祝中国乒乓球队\n越来越好');
});

test('custom text protects known whole phrases and joined emoji without splitting English words', () => {
  const lines = getTextLines('我相信我们来日方长', 'double');
  assert.ok(lines.some(line => line.includes('来日方长')));
  assert.deepEqual(getTextLines('UNBROKENWORD', 'double'), ['UNBROKENWORD']);
  const emoji = '👨‍👩‍👧‍👦';
  const custom = getTextLines('一起加油' + emoji + '未来可期', 'double');
  assert.ok(custom.some(line => line.includes(emoji)));
  assert.equal(custom.join(''), '一起加油' + emoji + '未来可期');
});
