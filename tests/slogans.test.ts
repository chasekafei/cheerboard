import assert from 'node:assert/strict';
import test from 'node:test';
import { SLOGANS, findSlogans, getSloganPage } from '../src/slogans.ts';

test('pagination bounds DOM work and reaches every reviewed entry in priority order', () => {
  const first = getSloganPage();
  const collected: string[] = [];
  for (let page = 0; page < first.pageCount; page++) {
    const result = getSloganPage('全部', '', page);
    assert.equal(result.page, page);
    assert.ok(result.items.length > 0 && result.items.length <= 12);
    collected.push(...result.items.map(item => item.id));
  }
  const expected = [...SLOGANS.filter(item => item.priority === 2), ...SLOGANS.filter(item => item.priority === 1)];
  assert.deepEqual(collected, expected.map(item => item.id));
  assert.equal(new Set(collected).size, SLOGANS.length);
  const last = getSloganPage('全部', '', 999);
  assert.equal(last.page, first.pageCount - 1);
  assert.deepEqual(getSloganPage('全部', '', -1).items, first.items);
});

test('each category keeps priority 2 ahead of priority 1 and preserves current order within a priority', () => {
  for (const category of ['孙颖莎', '王楚钦', '莎头'] as const) {
    const current = SLOGANS.filter(item => item.category === category);
    const expected = [...current.filter(item => item.priority === 2), ...current.filter(item => item.priority === 1)];
    assert.deepEqual(findSlogans(category), expected);
  }
});

test('the edited national team blessing leads Other without rewriting its text or moving its category', () => {
  const first = getSloganPage('其他').items[0];
  assert.equal(first.id, 'C039');
  assert.equal(first.text, '祝中国乒乓球队\n越来越好');
  assert.equal(first.priority, 2);
  assert.equal(first.category, '其他');
  const rest = findSlogans('其他').slice(1);
  const current = SLOGANS.filter(item => item.category === '其他' && item.id !== first.id);
  assert.deepEqual(rest, [...current.filter(item => item.priority === 2), ...current.filter(item => item.priority === 1)]);
  assert.equal(findSlogans('其他', '中国乒乓球队越来越好')[0], first);
  assert.ok(!findSlogans('莎头').includes(first));
});

test('manual text and category corrections remain authoritative', () => {
  for (const id of ['C007', 'C130', 'C132', 'C146']) {
    assert.equal(SLOGANS.find(item => item.id === id)?.category, '王楚钦');
  }
  assert.equal(SLOGANS.find(item => item.id === 'C021')?.category, '莎头');
  assert.equal(SLOGANS.find(item => item.id === 'C046')?.text, '来！走！');
});

test('filtered pagination finds approved aliases and handles zero results', () => {
  const result = getSloganPage('王楚钦', 'WANG.C.Q', 20);
  assert.equal(result.total, 1);
  assert.equal(result.page, 0);
  assert.equal(result.items[0].text, '王楚钦');
  const empty = getSloganPage('孙颖莎', 'WANG.C.Q', 20);
  assert.deepEqual(empty.items, []);
  assert.equal(empty.pageCount, 0);
  assert.equal(empty.page, 0);
});
