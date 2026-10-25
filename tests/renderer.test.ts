import assert from 'node:assert/strict';
import test from 'node:test';
import { createDesign, type Design } from '../src/catalog.ts';
import { measureBoard, renderBoard, renderExport } from '../src/renderer.ts';

type Call = { name: string; args: unknown[]; state: Record<string, unknown> };
const allCanvases: Array<{ canvas: HTMLCanvasElement; calls: Call[] }> = [];

function canvasEnvironment() {
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
            return { data: new Uint8ClampedArray(Number(args[2]) * Number(args[3]) * 4).fill(255) };
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
  return { ...createDesign(template), text: '加油', sticker: 'none', border: false };
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

test('outline and neon are distinct; zero glow keeps the neon tube and narrow bright core', () => {
  const { makeCanvas } = canvasEnvironment();
  const outline = makeCanvas();
  renderBoard(outline.canvas, { ...light('L2'), accent: '#EE3355' }, { width: 720, height: 405 });
  assert.equal(outline.calls.find(call => call.name === 'strokeText')?.state.strokeStyle, '#EE3355');
  assert.equal(outline.calls.filter(call => call.name === 'fillText').length, 1);
  for (const glow of [0, 100]) {
    const neon = makeCanvas();
    renderBoard(neon.canvas, { ...light('L4'), foreground: '#62F7FF', accent: '#FF1199', background: '#121212', glow }, { width: 720, height: 405 });
    assert.equal(neon.calls.find(call => call.name === 'fillRect')?.state.fillStyle, '#121212');
    assert.equal(neon.calls.filter(call => call.name === 'fillText').length, 0);
    const strokes = neon.calls.filter(call => call.name === 'strokeText');
    assert.ok(strokes.length >= 2);
    const core = strokes[strokes.length - 1];
    const tube = strokes[strokes.length - 2];
    assert.ok(Number(core.state.lineWidth) < Number(tube.state.lineWidth));
    assert.notEqual(core.state.strokeStyle, tube.state.strokeStyle);
    assert.equal(core.state.shadowBlur, 0);
    assert.ok(strokes.slice(0, -1).every(call => call.state.strokeStyle === '#62F7FF' && call.state.shadowColor === '#62F7FF'));
    assert.equal(strokes.some(call => Number(call.state.shadowBlur) > 0), glow > 0);
  }
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
  assert.ok(samples.every(call => Number(call.args[2]) <= 384 && Number(call.args[3]) <= 192));
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
  const textPasses = (calls: Call[]) => calls.filter(call => call.name === 'strokeText').map(call => ({
    args: call.args, color: call.state.strokeStyle, width: call.state.lineWidth, blur: call.state.shadowBlur,
  }));
  assert.deepEqual(textPasses(exportCalls), textPasses(preview.calls));
});
