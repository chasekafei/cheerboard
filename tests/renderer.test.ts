import assert from 'node:assert/strict';
import test from 'node:test';
import { createDesign, type Design } from '../src/catalog.ts';
import { invalidateFontCache, measureBoard, renderBoard, renderExport, resolveRepeatPeriod } from '../src/renderer.ts';

type Call = { name: string; args: unknown[]; state: Record<string, unknown> };
type SizeWrite = { dimension: 'width' | 'height'; value: number };
const allCanvases: Array<{ canvas: HTMLCanvasElement; calls: Call[]; readState: () => Record<string, unknown>; sizeWrites: SizeWrite[] }> = [];
let rasterAlpha: ((x: number, y: number) => number) | undefined;

function canvasEnvironment(alpha?: (x: number, y: number) => number) {
  rasterAlpha = alpha;
  invalidateFontCache();
  // Renderer caches deliberately survive frames and test environments.
  const canvases = allCanvases;
  function makeCanvas() {
    const calls: Call[] = [];
    const sizeWrites: SizeWrite[] = [];
    let canvasWidth = 300;
    let canvasHeight = 150;
    let state: Record<string, unknown> = { font: '10px sans-serif', shadowBlur: 0, globalAlpha: 1, globalCompositeOperation: 'source-over' };
    const stack: Record<string, unknown>[] = [];
    const context = new Proxy({}, {
      get(_target, property) {
        const name = String(property);
        if (name in state) return state[name];
        return (...args: unknown[]) => {
          calls.push({ name, args, state: { ...state } });
          if (name === 'save') stack.push({ ...state });
          if (name === 'restore') state = stack.pop() || state;
          if (name === 'measureText') {
            const size = Number(/([\d.]+)px/.exec(String(state.font))?.[1] || 10);
            return { width: Array.from(String(args[0])).length * size * 0.56 };
          }
          if (name === 'getImageData') {
            const width = Number(args[2]);
            const height = Number(args[3]);
            const data = new Uint8ClampedArray(width * height * 4).fill(255);
            if (rasterAlpha) {
              for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) data[(y * width + x) * 4 + 3] = rasterAlpha(x, y);
              }
            }
            return { data };
          }
          if (name === 'createLinearGradient') {
            const stops: Array<[number, string]> = [];
            return { stops, addColorStop: (offset: number, color: string) => stops.push([offset, color]) };
          }
        };
      },
      set(_target, property, value) { state[String(property)] = value; return true; },
    });
    const canvas = {
      get width() { return canvasWidth; },
      set width(value: number) { canvasWidth = value; sizeWrites.push({ dimension: 'width', value }); },
      get height() { return canvasHeight; },
      set height(value: number) { canvasHeight = value; sizeWrites.push({ dimension: 'height', value }); },
      getContext: () => context,
    };
    const result = { canvas: canvas as unknown as HTMLCanvasElement, calls, readState: () => ({ ...state }), sizeWrites };
    canvases.push(result);
    return result;
  }
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: (tag: string) => { assert.equal(tag, 'canvas'); return makeCanvas().canvas; } },
  });
  return { canvases, makeCanvas };
}

function light(template: Design['templateId']): Design {
  return { ...createDesign(template), text: '加油', layout: 'single', gradient: false, sticker: 'none', border: false };
}

test('layout measurement does not draw or resize, and scaled scrolling metrics match rendering', () => {
  const { makeCanvas } = canvasEnvironment();
  const { canvas, calls } = makeCanvas();
  const design = { ...light('L3'), scroll: true, fontScale: 130 };
  const options = { width: 1280, height: 720 };
  const measured = measureBoard(canvas, design, options);
  assert.equal(canvas.width, 300);
  assert.equal(canvas.height, 150);
  assert.ok(calls.length > 0);
  assert.ok(calls.every(call => call.name === 'measureText'));
  assert.deepEqual(renderBoard(canvas, design, options), measured);
  const smaller = measureBoard(canvas, { ...design, fontScale: 70 }, options);
  assert.ok(measured.fontSize > smaller.fontSize);
  assert.ok(measured.fontSize * 1.08 <= options.height * 0.91 + 1);
});

test('solid text stays one color even with the former split red-blue palette', () => {
  const { makeCanvas } = canvasEnvironment();
  const { canvas, calls } = makeCanvas();
  const design = { ...light('L1'), paletteId: 'red-blue', foreground: '#FFFFFF', accent: '#FF0000' };
  renderBoard(canvas, design, { width: 720, height: 405 });
  const fills = calls.filter(call => call.name === 'fillText');
  assert.equal(fills.length, 1);
  assert.equal(fills[0].state.fillStyle, '#FFFFFF');
  assert.equal(calls.filter(call => call.name === 'strokeText' || call.name === 'createLinearGradient').length, 0);
});

test('outline and neon are distinct; zero glow keeps a thin-font tube and bright filled core', () => {
  const { makeCanvas } = canvasEnvironment();
  const outline = makeCanvas();
  renderBoard(outline.canvas, { ...light('L2'), accent: '#EE3355' }, { width: 720, height: 405 });
  assert.equal(outline.calls.find(call => call.name === 'strokeText')?.state.strokeStyle, '#EE3355');
  assert.equal(outline.calls.filter(call => call.name === 'fillText').length, 1);
  for (const glow of [0, 100]) {
    const neon = makeCanvas();
    renderBoard(neon.canvas, { ...light('L4'), foreground: '#62F7FF', accent: '#FF1199', background: '#121212', glow }, { width: 720, height: 405 });
    assert.equal(neon.calls.find(call => call.name === 'fillRect')?.state.fillStyle, '#121212');
    const strokes = neon.calls.filter(call => call.name === 'strokeText');
    const fills = neon.calls.filter(call => call.name === 'fillText');
    assert.equal(strokes.length, 2);
    assert.ok(fills.length >= 2);
    const core = fills[fills.length - 1];
    assert.match(String(core.state.font), /^100 /);
    assert.notEqual(core.state.fillStyle, strokes[0].state.strokeStyle);
    assert.equal(core.state.shadowBlur, 0);
    assert.equal(strokes[0].state.strokeStyle, '#62F7FF');
    assert.equal(strokes[1].state.strokeStyle, core.state.fillStyle);
    assert.ok(Number(strokes[1].state.lineWidth) < Number(strokes[0].state.lineWidth) / 4);
    assert.equal(strokes[1].state.lineJoin, 'round');
    assert.equal(fills.some(call => Number(call.state.shadowBlur) > 0), glow > 0);
    const projection = fills.find(call => Number(call.state.shadowOffsetY) > 0);
    assert.equal(Boolean(projection), glow > 0);
    if (projection) {
      assert.equal(projection.state.shadowColor, '#62F7FF');
      assert.ok(Number(projection.state.shadowBlur) > 0);
      assert.ok(Number(projection.state.globalAlpha) > 0 && Number(projection.state.globalAlpha) < 1);
      assert.deepEqual(projection.args, core.args);
    }
  }
});

test('neon always uses the real Thin tube font while point masks retain regular Sans', () => {
  const { makeCanvas, canvases } = canvasEnvironment();
  for (const fontId of ['sans', 'serif', 'handwritten'] as const) {
    const target = makeCanvas();
    const design = { ...light('L4'), fontId };
    const options = { width: 720, height: 405 };
    measureBoard(target.canvas, design, options);
    renderBoard(target.canvas, design, options);
    const textCalls = target.calls.filter(call => ['measureText', 'strokeText', 'fillText'].includes(call.name));
    assert.ok(textCalls.length > 0);
    for (const call of textCalls) {
      assert.match(String(call.state.font), /^100 /);
      assert.match(String(call.state.font), /"Cheerboard Tube"/);
      assert.match(String(call.state.font), /"Cheerboard Sans"/);
      assert.doesNotMatch(String(call.state.font), /Handwriting|Songti|SimSun|Noto Serif|Kaiti|KaiTi/);
    }
  }
  const points = makeCanvas();
  const text = 'POINT-MASK-CHECK';
  renderBoard(points.canvas, { ...light('L3'), text, fontId: 'sans' }, { width: 720, height: 405 });
  const raster = canvases.flatMap(item => item.calls).find(call => call.name === 'fillText' && call.args[0] === text)!;
  assert.match(String(raster.state.font), /^400 /);
  assert.match(String(raster.state.font), /"Cheerboard Sans"/);
  assert.doesNotMatch(String(raster.state.font), /Cheerboard Tube/);
});

test('dot masks stay within the viewport grid budget for every cell shape and density', () => {
  const { makeCanvas, canvases } = canvasEnvironment();
  const target = makeCanvas();
  for (const dotShape of ['circle', 'square', 'heart', 'star', 'emoji'] as const) {
    for (const dotDensity of [1, 3]) {
      const start = target.calls.length;
      renderBoard(target.canvas, { ...light('L3'), dotShape, dotDensity, foreground: '#FFFFFF', accent: '#FF0000' }, { width: 16000, height: 900 });
      const stamps = target.calls.slice(start).filter(call => call.name === 'drawImage');
      assert.ok(stamps.length > 0);
      assert.equal(new Set(stamps.map(call => call.args[0])).size, 1);
    }
  }
  const samples = canvases.flatMap(item => item.calls.filter(call => call.name === 'getImageData'));
  assert.ok(samples.length > 0);
  assert.ok(samples.every(call => Number(call.args[2]) <= 1536 && Number(call.args[3]) <= 768));
  assert.ok(target.calls.some(call => call.name === 'drawImage'));
});

test('emoji dots cache a complete joined glyph rather than filling text for every LED or frame', () => {
  const { makeCanvas, canvases } = canvasEnvironment();
  const target = makeCanvas();
  const emoji = '🧑🏽‍🚀';
  const design = { ...light('L3'), dotShape: 'emoji' as const, dotEmoji: emoji };
  const options = { width: 1080, height: 608 };
  renderBoard(target.canvas, design, options);
  const glyphFills = () => canvases.flatMap(item => item.calls).filter(call => call.name === 'fillText' && call.args[0] === emoji);
  assert.equal(glyphFills().length, 1);
  const pixelReads = () => canvases.flatMap(item => item.calls).filter(call => call.name === 'getImageData').length;
  const reads = pixelReads();
  renderBoard(target.canvas, design, options);
  assert.equal(glyphFills().length, 1);
  assert.equal(pixelReads(), reads);
  assert.ok(target.calls.filter(call => call.name === 'drawImage').length > 10);
  assert.equal(target.calls.filter(call => call.name === 'fillText').length, 0);
});

test('board export uses the same neon renderer and layout as preview', () => {
  const { makeCanvas, canvases } = canvasEnvironment();
  const design = light('L4');
  const preview = makeCanvas();
  renderBoard(preview.canvas, design, { width: 1920, height: 1080 });
  const exported = renderExport(design, 'board');
  const exportCalls = canvases.find(item => item.canvas === exported)!.calls;
  const textPasses = (calls: Call[]) => calls.filter(call => call.name === 'strokeText' || call.name === 'fillText').map(call => ({
    name: call.name, args: call.args, color: call.state.strokeStyle, fill: call.state.fillStyle, width: call.state.lineWidth, blur: call.state.shadowBlur,
  }));
  assert.deepEqual(textPasses(exportCalls), textPasses(preview.calls));
});

test('dot sampling ignores bright cell-edge fringes and preserves opaque adjacent cells', () => {
  const { makeCanvas } = canvasEnvironment((x, y) => x % 4 === 0 || x % 4 === 3 || y % 4 === 0 || y % 4 === 3 ? 255 : 0);
  const target = makeCanvas();
  const design = light('L3');
  renderBoard(target.canvas, design, { width: 720, height: 405 });
  assert.equal(target.calls.filter(call => call.name === 'drawImage').length, 0);
  rasterAlpha = () => 255;
  invalidateFontCache();
  renderBoard(target.canvas, design, { width: 720, height: 405 });
  assert.ok(target.calls.filter(call => call.name === 'drawImage').length > 10);
});

test('font changes and asynchronous font invalidation refresh the point raster', () => {
  const { makeCanvas, canvases } = canvasEnvironment();
  const target = makeCanvas();
  const pixels = () => canvases.flatMap(item => item.calls).filter(call => call.name === 'getImageData').length;
  const design = light('L3');
  renderBoard(target.canvas, design, { width: 720, height: 405 });
  const before = pixels();
  renderBoard(target.canvas, { ...design, fontId: 'handwritten' }, { width: 720, height: 405 });
  assert.equal(pixels(), before + 1);
  invalidateFontCache();
  renderBoard(target.canvas, { ...design, fontId: 'handwritten' }, { width: 720, height: 405 });
  assert.equal(pixels(), before + 2);
});

test('static light boards fit the whole long sentence even at a large requested size', () => {
  const { makeCanvas } = canvasEnvironment();
  for (const id of ['L1', 'L2', 'L3', 'L4', 'L5'] as const) {
    const target = makeCanvas();
    const design = { ...light(id), text: '重围颖钦'.repeat(80), fontScale: 200 };
    const metrics = renderBoard(target.canvas, design, { width: 1080, height: 1920 });
    assert.equal(metrics.overflow, false);
    assert.ok(metrics.fontSize > 0 && metrics.textWidth < 1080);
  }
});

test('landscape uses a larger text band and bounded horizontal compression without cropping', () => {
  const { makeCanvas } = canvasEnvironment();
  const target = makeCanvas();
  const design = { ...light('L1'), text: '我们来日方长', layout: 'double' as const };
  const normal = measureBoard(target.canvas, design, { width: 1280, height: 720 });
  assert.ok(normal.fontSize > (720 * 0.72 / (2 * 1.19)) * 1.2);
  const large = measureBoard(target.canvas, { ...design, fontScale: 200 }, { width: 1280, height: 720 });
  assert.ok(large.fontSize > normal.fontSize);
  assert.equal(large.overflow, false);
  const fitted = renderBoard(target.canvas, { ...light('L1'), text: '一二三四五六七八九十', fontScale: 200 }, { width: 1280, height: 720 });
  const scales = target.calls.filter(call => call.name === 'scale').map(call => Number(call.args[0]));
  assert.ok(scales.some(scale => scale >= 0.82 && scale < 1));
  assert.equal(fitted.overflow, false);
  assert.ok(fitted.textWidth < 1280);
});

test('extra-large point density is larger than legacy density one and stays inside the raster budget', () => {
  const { makeCanvas } = canvasEnvironment();
  const sizes: number[] = [];
  for (const dotDensity of [0, 1]) {
    const target = makeCanvas();
    renderBoard(target.canvas, { ...light('L3'), dotDensity }, { width: 1280, height: 720 });
    sizes.push(Number(target.calls.find(call => call.name === 'drawImage')!.args[3]));
  }
  assert.ok(sizes[0] > sizes[1] * 1.3);
});

test('ghost text uses only two diagonal additive layers isolated from every background and restores state', () => {
  const { makeCanvas, canvases } = canvasEnvironment();
  const pairs = [['#25F4EE', '#FE2C55'], ['#38A7D2', '#DD4050']];
  for (const [index, [foreground, accent]] of pairs.entries()) {
    const target = makeCanvas();
    const background = index ? '#F6E9C3' : '#123456';
    const context = target.canvas.getContext('2d')!;
    context.globalCompositeOperation = 'multiply';
    context.shadowBlur = 7;
    const priorCalls = new Set(canvases.flatMap(item => item.calls));
    renderBoard(target.canvas, { ...light('L5'), text: '重影' + index, foreground, accent, background, gradient: true }, { width: 1280, height: 720 });
    assert.equal(target.calls.find(call => call.name === 'fillRect')!.state.fillStyle, background);
    assert.equal(target.calls.filter(call => call.name === 'fillText').length, 0);
    assert.equal(target.calls.filter(call => call.name === 'createLinearGradient').length, 0);
    const stamp = target.calls.find(call => call.name === 'drawImage')!;
    assert.equal(stamp.state.globalCompositeOperation, 'source-over');
    const source = canvases.find(item => item.canvas === stamp.args[0])!;
    const passes = source.calls.filter(call => !priorCalls.has(call) && call.name === 'fillText');
    assert.equal(passes.length, 2);
    assert.deepEqual(passes.map(call => call.state.fillStyle), [foreground, accent]);
    assert.ok(passes.every(call => call.state.globalCompositeOperation === 'lighter'));
    const dx = Number(passes[1].args[1]) - Number(passes[0].args[1]);
    const dy = Number(passes[1].args[2]) - Number(passes[0].args[2]);
    assert.ok(dx > 0 && dy > 0 && Math.abs(dx - dy) < 0.000001);
    assert.ok(passes.every(call => !Number(call.state.shadowBlur)));
    assert.equal(source.calls.filter(call => call.name === 'fillRect' || call.name === 'getImageData').length, 0);
    assert.equal(source.readState().globalCompositeOperation, 'source-over');
    assert.equal(target.readState().globalCompositeOperation, 'multiply');
    assert.equal(target.readState().shadowBlur, 7);
  }
  const defaults = createDesign('L5');
  assert.equal(defaults.foreground, '#25F4EE');
  assert.equal(defaults.accent, '#FE2C55');
  for (const offset of [1, 3, 5]) {
    assert.ok(parseInt(defaults.foreground.slice(offset, offset + 2), 16) + parseInt(defaults.accent.slice(offset, offset + 2), 16) >= 255);
  }
});

test('ghost isolation includes compressed glyph edges and caps one reusable viewport surface', () => {
  const { makeCanvas, canvases } = canvasEnvironment();
  const target = makeCanvas();
  const width = 1280;
  renderBoard(target.canvas, { ...light('L5'), text: '一二三四五六七八九十', fontScale: 200 }, { width, height: 720 });
  const compression = Number(target.calls.find(call => call.name === 'scale')!.args[0]);
  assert.ok(compression < 1);
  const stamp = target.calls.find(call => call.name === 'drawImage')!;
  const left = Number(stamp.args[5]);
  const right = left + Number(stamp.args[7]);
  assert.ok(left < 0 && right > width);
  assert.ok((left - width / 2) * compression + width / 2 >= -0.000001);
  assert.ok((right - width / 2) * compression + width / 2 <= width + 0.000001);
  const scrolling = { ...light('L5'), text: '长句重影'.repeat(100), scroll: true };
  renderBoard(target.canvas, scrolling, { width: 6000, height: 6000 });
  const surfaceCount = canvases.length;
  const source = target.calls.filter(call => call.name === 'drawImage').at(-1)!.args[0] as HTMLCanvasElement;
  assert.ok(source.width <= 2048 && source.height <= 2048 && source.width * source.height <= 2_000_000);
  for (const offset of [10, 20, 30]) renderBoard(target.canvas, scrolling, { width: 6000, height: 6000, offset });
  assert.equal(canvases.length, surfaceCount);
  assert.equal(canvases.find(item => item.canvas === source)!.calls.filter(call => call.name === 'getImageData').length, 0);
});

test('ghost preview and export stamp the same isolated two-layer result', () => {
  const { makeCanvas, canvases } = canvasEnvironment();
  const design = { ...light('L5'), text: '同一块重影牌' };
  const preview = makeCanvas();
  renderBoard(preview.canvas, design, { width: 1920, height: 1080 });
  const expected = preview.calls.find(call => call.name === 'drawImage')!;
  const exported = renderExport(design, 'board');
  const actual = canvases.find(item => item.canvas === exported)!.calls.find(call => call.name === 'drawImage')!;
  assert.equal(actual.args[0], expected.args[0]);
  assert.deepEqual(actual.args.slice(1), expected.args.slice(1));
  assert.equal(actual.state.globalCompositeOperation, 'source-over');
});

test('unequal ghost lines and scrolling offsets share fixed bitmap capacity without repeated size assignments', () => {
  const { makeCanvas, canvases } = canvasEnvironment();
  const target = makeCanvas();
  const design = { ...light('L5'), text: '短句\n这一行比上面那行长很多', layout: 'double' as const, scroll: true };
  const before = new Map(canvases.map(item => [item.canvas, item.sizeWrites.length]));
  renderBoard(target.canvas, design, { width: 1280, height: 720 });
  const stamps = target.calls.filter(call => call.name === 'drawImage');
  assert.equal(stamps.length, 2);
  assert.equal(stamps[0].args[0], stamps[1].args[0]);
  assert.notEqual(stamps[0].args[3], stamps[1].args[3]);
  const source = canvases.find(item => item.canvas === stamps[0].args[0])!;
  const assignments = source.sizeWrites.slice(before.get(source.canvas) || 0);
  assert.ok(assignments.filter(item => item.dimension === 'width').length <= 1);
  assert.ok(assignments.filter(item => item.dimension === 'height').length <= 1);
  const count = source.sizeWrites.length;
  for (const offset of [-200, -40, 0, 40, 200]) {
    renderBoard(target.canvas, design, { width: 1280, height: 720, offset });
  }
  assert.equal(source.sizeWrites.length, count);
});

test('manual four-line text reaches the renderer without merging lines or changing content', () => {
  const { makeCanvas } = canvasEnvironment();
  const target = makeCanvas();
  const text = '纵有千古\n横有八荒\n前途似海\n来日方长';
  const design = { ...light('L1'), text, layout: 'double' as const, fontScale: 200 };
  const result = renderBoard(target.canvas, design, { width: 1280, height: 720 });
  assert.deepEqual(target.calls.filter(call => call.name === 'fillText').map(call => call.args[0]), text.split('\n'));
  assert.equal(result.overflow, false);
  assert.equal(design.text, text);
});

test('gradient angles reach Canvas paints and point colors reuse a bounded sprite palette', () => {
  const { makeCanvas } = canvasEnvironment();
  for (const gradientAngle of [0, 90]) {
    const target = makeCanvas();
    renderBoard(target.canvas, { ...light('L1'), gradient: true, foreground: '#FF0000', gradientEnd: '#0000FF', gradientAngle }, { width: 720, height: 405 });
    const gradient = target.calls.find(call => call.name === 'createLinearGradient')!;
    if (gradientAngle === 0) assert.equal(gradient.args[1], gradient.args[3]);
    else assert.ok(Math.abs(Number(gradient.args[0]) - Number(gradient.args[2])) < 0.000001);
    const paint = target.calls.find(call => call.name === 'fillText')!.state.fillStyle as { stops: Array<[number, string]> };
    assert.deepEqual(paint.stops, [[0, '#FF0000'], [1, '#0000FF']]);
  }
  const target = makeCanvas();
  renderBoard(target.canvas, { ...light('L3'), gradient: true, foreground: '#FF0000', gradientEnd: '#0000FF' }, { width: 720, height: 405 });
  const sprites = new Set(target.calls.filter(call => call.name === 'drawImage').map(call => call.args[0]));
  assert.ok(sprites.size > 1 && sprites.size <= 12);
});

test('portrait orientation exports a true portrait board and preserves its ratio in sharing cards', () => {
  const { canvases } = canvasEnvironment();
  const design = { ...light('L4'), orientation: 'portrait' as const };
  const board = renderExport(design, 'board');
  assert.deepEqual([board.width, board.height], [1080, 1920]);
  const a4 = renderExport(design, 'a4');
  assert.deepEqual([a4.width, a4.height], [2480, 3508]);
  for (const format of ['comment', 'note', 'memory'] as const) {
    const card = renderExport(design, format);
    const call = canvases.find(item => item.canvas === card)!.calls.find(item => item.name === 'drawImage')!;
    const source = call.args[0] as HTMLCanvasElement;
    assert.deepEqual([source.width, source.height], [1080, 1920]);
    assert.ok(Math.abs(Number(call.args[3]) / Number(call.args[4]) - 9 / 16) < 0.000001);
  }
});

test('repeat periods preserve requested gaps and bound extreme tiny-text copy counts', () => {
  assert.equal(resolveRepeatPeriod(120, 30, 1280), 150);
  assert.equal(resolveRepeatPeriod(120, -5, 1280), 124);
  assert.equal(resolveRepeatPeriod(0, 0, 16000), 16000 / 48);
  for (const value of [NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
    assert.ok(Number.isFinite(resolveRepeatPeriod(value, value, value)));
  }
  const { makeCanvas } = canvasEnvironment();
  const target = makeCanvas();
  renderBoard(target.canvas, { ...light('L1'), scroll: true, loop: true }, { width: 16000, height: 1, repeatGap: 0, offset: Number.MAX_VALUE });
  const copies = target.calls.filter(call => call.name === 'fillText');
  assert.ok(copies.length > 2 && copies.length <= 54);
  assert.ok(copies.every(call => Number.isFinite(call.args[1])));
});

test('looping text fills the viewport with periodic copies for both signs and draws background and sticker once', () => {
  const { makeCanvas } = canvasEnvironment();
  const design = { ...light('L1'), text: '莎', scroll: true, loop: true, sticker: 'star' as const };
  const measured = measureBoard(makeCanvas().canvas, design, { width: 1280, height: 720 });
  const gap = measured.fontSize * 0.38;
  const period = resolveRepeatPeriod(measured.textWidth, gap, 1280);
  let baseline: number[] = [];
  for (const offset of [-47, 47, 47 + period * 100]) {
    const target = makeCanvas();
    renderBoard(target.canvas, design, { width: 1280, height: 720, offset, repeatGap: gap });
    const positions = target.calls.filter(call => call.name === 'fillText').map(call => Number(call.args[1])).sort((a, b) => a - b);
    assert.ok(positions.length > 2 && positions.length <= 54);
    for (let index = 1; index < positions.length; index++) assert.ok(Math.abs(positions[index] - positions[index - 1] - period) < 0.000001);
    assert.ok(positions[0] - measured.textWidth / 2 < 0);
    assert.ok(positions[positions.length - 1] + measured.textWidth / 2 > 1280);
    assert.equal(target.calls.filter(call => call.name === 'fillRect').length, 1);
    assert.equal(target.calls.filter(call => call.name === 'rotate').length, 1);
    if (offset === 47) baseline = positions;
    if (offset > period) {
      assert.equal(positions.length, baseline.length);
      positions.forEach((position, index) => assert.ok(Math.abs(position - baseline[index]) < 0.000001));
    }
  }
});

test('repeatGap never repeats static, non-looping, unspecified or exported text', () => {
  const { makeCanvas, canvases } = canvasEnvironment();
  for (const controls of [{ scroll: false, loop: true }, { scroll: true, loop: false }]) {
    const target = makeCanvas();
    renderBoard(target.canvas, { ...light('L1'), ...controls }, { width: 1280, height: 720, repeatGap: 20 });
    assert.equal(target.calls.filter(call => call.name === 'fillText').length, 1);
  }
  const design = { ...light('L1'), scroll: true, loop: true };
  const target = makeCanvas();
  renderBoard(target.canvas, design, { width: 1280, height: 720 });
  assert.equal(target.calls.filter(call => call.name === 'fillText').length, 1);
  const exported = renderExport(design, 'board');
  assert.equal(canvases.find(item => item.canvas === exported)!.calls.filter(call => call.name === 'fillText').length, 1);
});

test('repeated point text shares one bounded viewport raster and one pixel read per frame', () => {
  const { makeCanvas, canvases } = canvasEnvironment();
  const target = makeCanvas();
  const design = { ...light('L3'), text: '莎', scroll: true, loop: true };
  const metrics = measureBoard(target.canvas, design, { width: 16000, height: 720 });
  const gap = metrics.fontSize * 0.38;
  const prior = new Set(canvases.flatMap(item => item.calls));
  renderBoard(target.canvas, design, { width: 16000, height: 720, repeatGap: gap });
  const fresh = canvases.flatMap(item => item.calls).filter(call => !prior.has(call));
  const reads = fresh.filter(call => call.name === 'getImageData');
  assert.equal(reads.length, 1);
  assert.ok(Number(reads[0].args[2]) <= 1536 && Number(reads[0].args[3]) <= 768);
  const rasterCopies = fresh.filter(call => call.name === 'fillText' && call.args[0] === '莎');
  assert.ok(rasterCopies.length > 2 && rasterCopies.length <= 54);
  assert.equal(new Set(rasterCopies.map(call => call.state.font)).size, 1);
  assert.equal(target.calls.filter(call => call.name === 'fillRect').length, 1);
  const beforeSecond = new Set(canvases.flatMap(item => item.calls));
  renderBoard(target.canvas, design, { width: 16000, height: 720, repeatGap: gap, offset: 17 });
  assert.ok(canvases.flatMap(item => item.calls).filter(call => !beforeSecond.has(call) && call.name === 'getImageData').length <= 1);
});

test('repeated ghost text retains isolated two-color layers without new surfaces or pixel readbacks', () => {
  const { makeCanvas, canvases } = canvasEnvironment();
  const target = makeCanvas();
  const design = { ...light('L5'), text: '莎', scroll: true, loop: true };
  const prior = new Set(canvases.flatMap(item => item.calls));
  renderBoard(target.canvas, design, { width: 1600, height: 500, repeatGap: 60 });
  const stamps = target.calls.filter(call => call.name === 'drawImage');
  assert.ok(stamps.length > 1);
  assert.equal(new Set(stamps.map(call => call.args[0])).size, 1);
  const source = canvases.find(item => item.canvas === stamps[0].args[0])!;
  const textPasses = source.calls.filter(call => !prior.has(call) && call.name === 'fillText');
  assert.equal(textPasses.length, stamps.length * 2);
  assert.ok(textPasses.every(call => call.state.globalCompositeOperation === 'lighter'));
  assert.equal(target.calls.filter(call => call.name === 'fillRect').length, 1);
  assert.equal(source.calls.filter(call => call.name === 'getImageData').length, 0);
  const count = canvases.length;
  const assignments = source.sizeWrites.length;
  renderBoard(target.canvas, design, { width: 1600, height: 500, repeatGap: 60, offset: -30 });
  assert.equal(canvases.length, count);
  assert.equal(source.sizeWrites.length, assignments);
});
