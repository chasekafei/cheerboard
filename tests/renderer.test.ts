import assert from 'node:assert/strict';
import test from 'node:test';
import { createDesign, type Design } from '../src/catalog.ts';
import { invalidateFontCache, measureBoard, renderBoard, renderExport } from '../src/renderer.ts';

type Call = { name: string; args: unknown[]; state: Record<string, unknown> };
const allCanvases: Array<{ canvas: HTMLCanvasElement; calls: Call[] }> = [];
let rasterAlpha: ((x: number, y: number) => number) | undefined;

function canvasEnvironment(alpha?: (x: number, y: number) => number) {
  rasterAlpha = alpha;
  invalidateFontCache();
  // Renderer caches deliberately survive frames and test environments.
  const canvases = allCanvases;
  function makeCanvas() {
    const calls: Call[] = [];
    let state: Record<string, unknown> = { font: '10px sans-serif', shadowBlur: 0, globalAlpha: 1 };
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
      width: 300,
      height: 150,
      getContext: () => context,
    };
    const result = { canvas: canvas as unknown as HTMLCanvasElement, calls };
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
  assert.ok(Math.abs(measured.fontSize / smaller.fontSize - 130 / 70) < 0.000001);
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
    assert.equal(strokes.length, 1);
    assert.ok(fills.length >= 2);
    const core = fills[fills.length - 1];
    assert.match(String(core.state.font), /^100 /);
    assert.notEqual(core.state.fillStyle, strokes[0].state.strokeStyle);
    assert.equal(core.state.shadowBlur, 0);
    assert.equal(strokes[0].state.strokeStyle, '#62F7FF');
    assert.equal(fills.some(call => Number(call.state.shadowBlur) > 0), glow > 0);
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
  for (const id of ['L1', 'L2', 'L3', 'L4'] as const) {
    const target = makeCanvas();
    const design = { ...light(id), text: '重围颖钦'.repeat(80), fontScale: 130 };
    const metrics = renderBoard(target.canvas, design, { width: 1080, height: 1920 });
    assert.equal(metrics.overflow, false);
    assert.ok(metrics.fontSize > 0 && metrics.textWidth < 1080);
  }
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
