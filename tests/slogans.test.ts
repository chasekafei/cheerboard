import assert from 'node:assert/strict';
import test from 'node:test';
import { SLOGANS, getSloganPage } from '../src/slogans.ts';

test('pagination bounds DOM work and reaches every reviewed entry in priority order', () => {
  const first = getSloganPage();
  const collected: string[] = [];
  for (let page = 0; page < first.pageCount; page++) {
    const result = getSloganPage('全部', '', page);
    assert.equal(result.page, page);
    assert.ok(result.items.length > 0 && result.items.length <= 12);
    collected.push(...result.items.map(item => item.id));
  }
  assert.deepEqual(collected, SLOGANS.map(item => item.id));
  assert.equal(new Set(collected).size, SLOGANS.length);
  const last = getSloganPage('全部', '', 999);
  assert.equal(last.page, first.pageCount - 1);
  assert.deepEqual(getSloganPage('全部', '', -1).items, first.items);
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
