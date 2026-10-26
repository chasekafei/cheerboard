import assert from 'node:assert/strict';
import test from 'node:test';
import { createDesign } from '../src/catalog.ts';
import { DECORATION_SETS, drawBoardDecorations, getBoardDecorationLayout } from '../src/decorations.ts';

test('six decoration choices include the reference heart corners and edge sparkles', () => {
  assert.deepEqual(DECORATION_SETS.map(set => set.id), ['none', 'hearts', 'stars', 'rally', 'orbit', 'confetti']);
  assert.ok(DECORATION_SETS.every(set => set.name));
  const design = createDesign('L3');
  const layout = getBoardDecorationLayout(design, { width: 760, height: 388 });
  assert.equal(layout.filter(item => item.motif === 'heart').length, 4);
  assert.equal(layout.filter(item => item.motif === 'spark').length, 4);
  assert.equal(layout[0].x, 760 * 0.09);
  assert.equal(layout[0].y, 388 * 0.17);
  assert.ok(layout.filter(item => item.motif === 'heart').every(item => item.color === '#FF3C88'));
  assert.ok(layout.filter(item => item.motif === 'spark').every(item => item.color === '#FFF12A'));
});

test('seeded layouts are deterministic and vary only around their edge anchors', () => {
  const base = createDesign('L3');
  const geometry = { width: 1280, height: 720 };
  for (const set of DECORATION_SETS) {
    const design = { ...base, decorationId: set.id, decorationSeed: 987654 };
    const first = getBoardDecorationLayout(design, geometry);
    assert.deepEqual(getBoardDecorationLayout(design, geometry), first);
    if (set.id === 'none') { assert.deepEqual(first, []); continue; }
    assert.notDeepEqual(getBoardDecorationLayout({ ...design, decorationSeed: 111222 }, geometry), first);
    const anchor = getBoardDecorationLayout({ ...design, decorationSeed: 1 }, geometry);
    assert.equal(first.length, anchor.length);
    first.forEach((item, index) => {
      assert.ok(Math.abs(item.x - anchor[index].x) <= geometry.width * 0.009);
      assert.ok(Math.abs(item.y - anchor[index].y) <= geometry.height * 0.013);
      assert.ok(item.radius > anchor[index].radius * 0.89 && item.radius < anchor[index].radius * 1.11);
    });
  }
});

test('every set stays off the central text in landscape and portrait and reduces crowded motifs', () => {
  const base = createDesign('L3');
  for (const [width, height] of [[1280, 720], [720, 1280]]) {
    const textBounds = { left: width * 0.19, right: width * 0.81, top: height * 0.28, bottom: height * 0.72 };
    for (const set of DECORATION_SETS.slice(1)) {
      const layout = getBoardDecorationLayout({ ...base, decorationId: set.id }, { width, height, textBounds });
      assert.ok(layout.length > 1);
      for (const item of layout) {
        const dx = Math.max(textBounds.left - item.x, 0, item.x - textBounds.right);
        const dy = Math.max(textBounds.top - item.y, 0, item.y - textBounds.bottom);
        assert.ok(Math.sqrt(dx * dx + dy * dy) >= item.radius * 1.2);
        assert.ok(item.x >= 0 && item.x <= width && item.y >= 0 && item.y <= height);
      }
    }
  }
  const geometry = { width: 760, height: 388 };
  const full = getBoardDecorationLayout(base, geometry);
  const crowded = getBoardDecorationLayout(base, { ...geometry, textBounds: { left: 760 * 0.12, right: 760 * 0.88, top: 20, bottom: 368 } });
  assert.ok(crowded.length < full.length || crowded.some(item => item.radius < full.find(original => original.motif === item.motif && original.x === item.x && original.y === item.y)!.radius));
});

test('decorations draw LED sprites without text emoji or pixel readbacks and restore canvas state', () => {
  const calls: Array<{ name: string; args: unknown[]; state: Record<string, unknown> }> = [];
  const images: HTMLCanvasElement[] = [];
  const makeContext = (record: typeof calls) => {
    let state: Record<string, unknown> = { globalCompositeOperation: 'multiply', shadowBlur: 8 };
    const stack: Record<string, unknown>[] = [];
    const context = new Proxy({}, {
      get(_target, property) {
        const name = String(property);
        if (name in state) return state[name];
        return (...args: unknown[]) => { record.push({ name, args, state: { ...state } }); if (name === 'save') stack.push({ ...state }); if (name === 'restore') state = stack.pop() || state; };
      },
      set(_target, property, value) { state[String(property)] = value; return true; },
    });
    return { context: context as CanvasRenderingContext2D, state: () => state };
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: (tag: string) => {
      assert.equal(tag, 'canvas');
      const sprite = { width: 300, height: 150, getContext: () => makeContext(calls).context } as unknown as HTMLCanvasElement;
      images.push(sprite);
      return sprite;
    },
  } });
  const main = makeContext(calls);
  const design = createDesign('L3');
  for (const set of DECORATION_SETS.slice(1)) {
    const before = calls.length;
    drawBoardDecorations(main.context, { ...design, decorationId: set.id }, { width: 1920, height: 1080 });
    const stamps = calls.slice(before).filter(call => call.name === 'drawImage');
    const firstCore = stamps.findIndex(call => Number(call.args[2]) > 0);
    assert.ok(firstCore > 0);
    assert.equal(stamps.length, firstCore * 2);
    assert.ok(stamps.slice(0, firstCore).every(call => call.args[2] === 0));
    assert.ok(stamps.slice(firstCore).every(call => Number(call.args[2]) > 0 && call.state.globalAlpha === 1));
    assert.ok(stamps.every(call => call.state.globalCompositeOperation === 'source-over'));
  }
  assert.ok(calls.filter(call => call.name === 'drawImage').length > 100);
  assert.equal(calls.filter(call => call.name === 'fillText' || call.name === 'getImageData').length, 0);
  assert.ok(images.every(image => image.width <= 128 && image.height <= 128));
  assert.equal(main.state().globalCompositeOperation, 'multiply');
  assert.equal(main.state().shadowBlur, 8);
});
