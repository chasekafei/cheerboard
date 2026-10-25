import assert from 'node:assert/strict';
import test from 'node:test';
import { BOARD_FONTS, getBoardFont, loadBoardFonts, TUBE_FONT } from '../src/fonts.ts';

test('unknown saved font choices use the packaged sans fallback', () => {
  assert.equal(getBoardFont('unknown').id, 'sans');
  assert.match(getBoardFont('sans').family, /Cheerboard Sans/);
  assert.match(getBoardFont('handwritten').family, /Cheerboard Handwriting/);
  assert.equal(getBoardFont('handwritten').weight, 300);
  assert.doesNotMatch(getBoardFont('serif').family, /Cheerboard/);
  assert.equal(TUBE_FONT.id, 'sans');
  assert.equal(TUBE_FONT.weight, 100);
  assert.match(TUBE_FONT.family, /Cheerboard Tube/);
  assert.doesNotMatch(getBoardFont('sans').family, /Cheerboard Tube/);
  assert.deepEqual(BOARD_FONTS.map(font => font.id), ['sans', 'serif', 'handwritten']);
});

test('font loading is optional, cached, and safely resolves when a font fails', async () => {
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {} });
  await loadBoardFonts();
  const calls: [string, string][] = [];
  let releaseSans = () => {};
  const sansReady = new Promise<unknown[]>(resolve => { releaseSans = () => resolve([]); });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { fonts: { load: (font: string, sample: string) => {
      calls.push([font, sample]);
      return font.includes('Handwriting') ? Promise.reject(new Error('font unavailable')) : sansReady;
    } } },
  });
  const pending = loadBoardFonts();
  assert.equal(loadBoardFonts(), pending);
  let settled = false;
  void pending.then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false, 'one failed font must not finish loading while another font is still pending');
  releaseSans();
  await pending;
  assert.deepEqual(calls, [
    ['400 24px "Cheerboard Sans"', '莎出重围孙颖莎王楚钦'],
    ['300 24px "Cheerboard Handwriting"', '莎出重围孙颖莎王楚钦'],
    ['100 24px "Cheerboard Tube"', '莎出重围孙颖莎王楚钦'],
  ]);
});
