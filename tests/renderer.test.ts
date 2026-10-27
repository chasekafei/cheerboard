import assert from 'node:assert/strict';
import test from 'node:test';
import { createDesign, type Design } from '../src/catalog.ts';
import { invalidateFontCache, measureBoard, renderBoard, renderExport, resolveRepeatPeriod, sampleStrokeCenterline } from '../src/renderer.ts';
import { getBoardDecorationLayout } from '../src/decorations.ts';

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
  return { ...createDesign(template), text: '加油', layout: 'single', gradient: false, sticker: 'none', border: false, dotStyle: 'classic', dotDensity: 2, decorationId: 'none', scroll: false };
}

function imageDestination(call: Call): number[] {
  return call.args.slice(call.args.length === 9 ? 5 : 1).map(Number);
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

test('outline and soft neon remain distinct, including with ambient glow disabled', () => {
  const { makeCanvas } = canvasEnvironment();
  const outline = makeCanvas();
  renderBoard(outline.canvas, { ...light('L2'), accent: '#EE3355' }, { width: 720, height: 405 });
  assert.equal(outline.calls.find(call => call.name === 'strokeText')?.state.strokeStyle, '#EE3355');
  assert.equal(outline.calls.filter(call => call.name === 'fillText').length, 1);
  for (const glow of [0, 100]) {
    const neon = makeCanvas();
    renderBoard(neon.canvas, { ...light('L4'), foreground: '#62F7FF', accent: '#FF1199', background: '#121212', glow }, { width: 720, height: 405 });
    assert.equal(neon.calls.find(call => call.name === 'fillRect')?.state.fillStyle, '#121212');
    const fills = neon.calls.filter(call => call.name === 'fillText');
    assert.ok(fills.length >= 2);
    const core = fills[fills.length - 1];
    assert.match(String(core.state.font), /^100 /);
    assert.notEqual(core.state.fillStyle, '#62F7FF');
    assert.ok(Number(core.state.shadowBlur) < 2, 'local edge softness is independent of ambient glow');
    const visibleY = (call: Call) => Number(call.args[2]) + Number(call.state.shadowOffsetY || 0);
    const projection = fills.slice(0, -1).find(call => visibleY(call) > visibleY(core) + 3);
    const projectionImage = neon.calls.find(call => {
      if (call.name !== 'drawImage') return false;
      const destination = imageDestination(call);
      return destination.length === 4 && destination[1] + destination[3] / 2 > visibleY(core) + 3;
    });
    assert.equal(Boolean(projection || projectionImage), glow > 0);
    if (projection) {
      if (Number(projection.state.shadowBlur) > 2) assert.equal(projection.state.shadowColor, '#62F7FF');
      assert.ok(Number(projection.state.shadowBlur) >= 0);
      assert.ok(Number(projection.state.globalAlpha) > 0 && Number(projection.state.globalAlpha) < 1);
      assert.equal(projection.args[0], core.args[0]);
      assert.ok(Math.abs(Number(projection.args[1]) - 360) < 20);
      assert.ok(visibleY(projection) - visibleY(core) > 10);
    } else if (projectionImage) {
      assert.ok(projectionImage.args.length === 9);
      assert.ok(Number(projectionImage.state.globalAlpha) > 0 && Number(projectionImage.state.globalAlpha) < 1);
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
  for (const dotStyle of ['fluorescent', 'fine'] as const) {
    const next = makeCanvas();
    const beforeStyle = glyphFills().length;
    renderBoard(next.canvas, { ...design, dotStyle }, options);
    assert.ok(next.calls.filter(call => call.name === 'drawImage').every(call => call.args.length === 5));
    assert.ok(glyphFills().length <= beforeStyle + 1);
    const cachedCount = glyphFills().length;
    renderBoard(next.canvas, { ...design, dotStyle }, options);
    assert.equal(glyphFills().length, cachedCount);
  }
});

test('fluorescent LEDs keep their glow outside the cell and a bright core independently of glow strength', () => {
  const { makeCanvas, canvases } = canvasEnvironment();
  const design = { ...light('L3'), foreground: '#FFF12A', dotShape: 'circle' as const, dotDensity: 1 };
  const classic = makeCanvas();
  renderBoard(classic.canvas, { ...design, dotStyle: 'classic', glow: 100 }, { width: 1280, height: 720 });
  const oldStamp = classic.calls.find(call => call.name === 'drawImage')!;
  for (const glow of [0, 100]) {
    const target = makeCanvas();
    renderBoard(target.canvas, { ...design, dotStyle: 'fluorescent', glow }, { width: 1280, height: 720 });
    const stamp = target.calls.find(call => call.name === 'drawImage')!;
    assert.ok(imageDestination(stamp)[2] > imageDestination(oldStamp)[2] * 3);
    assert.ok(imageDestination(stamp)[0] < imageDestination(oldStamp)[0]);
    const sprite = canvases.find(item => item.canvas === stamp.args[0])!;
    assert.ok(sprite.canvas.width <= 128 && sprite.canvas.height <= 128);
    const fills = sprite.calls.filter(call => call.name === 'fill');
    assert.ok(fills.some(call => call.state.fillStyle === '#FFFFFF' && call.state.shadowBlur === 0));
    const arcs = sprite.calls.filter(call => call.name === 'arc');
    assert.ok(Math.abs(Number(arcs[arcs.length - 1].args[2]) / Number(arcs[0].args[2]) - 0.7) < 0.000001);
    assert.equal(fills.filter(call => Number(call.state.shadowBlur) > 0).length, glow ? 2 : 0);
    assert.equal(fills.some(call => Number(call.state.shadowBlur) > 0), glow > 0);
    const stamps = target.calls.filter(call => call.name === 'drawImage');
    const firstCore = stamps.findIndex(call => Number(call.args[2]) > 0);
    assert.ok(firstCore > 0);
    assert.equal(stamps.length, firstCore * 2);
    assert.ok(stamps.slice(0, firstCore).every(call => call.args.length === 9 && call.args[2] === 0));
    assert.ok(stamps.slice(firstCore).every(call => Number(call.args[2]) > 0 && call.state.globalAlpha === 1 && call.state.globalCompositeOperation === 'source-over'));
    assert.ok(sprite.calls.some(call => call.name === 'rect' && call.args[0] === 0 && call.args[1] === 0 && call.args[2] === sprite.canvas.width));
  }
});

test('fine points follow cached glyph centerlines with large two-pass LEDs and stable scrolling', () => {
  const { makeCanvas, canvases } = canvasEnvironment((x, y) => x >= 44 && x <= 50 && y >= 20 && y <= 76 ? 255 : 0);
  const fine = makeCanvas();
  const before = new Set(canvases.flatMap(item => item.calls));
  const design = { ...light('L3'), text: '重围颖钦', dotStyle: 'fine' as const, fontId: 'serif' as const, scroll: true };
  renderBoard(fine.canvas, design, { width: 1280, height: 720 });
  assert.ok(fine.calls.some(call => call.name === 'drawImage'));
  const pointPasses = fine.calls.filter(call => call.name === 'drawImage');
  const firstCore = pointPasses.findIndex(call => Number(call.args[2]) > 0);
  assert.ok(firstCore > 0);
  assert.equal(pointPasses.length, firstCore * 2);
  assert.ok(pointPasses.slice(firstCore).every(call => Number(call.args[2]) > 0));
  const fineSprite = canvases.find(item => item.canvas === pointPasses[0].args[0])!;
  const fineArcs = fineSprite.calls.filter(call => call.name === 'arc');
  assert.ok(Math.abs(Number(fineArcs[fineArcs.length - 1].args[2]) / Number(fineArcs[0].args[2]) - 0.68) < 0.000001);
  const raster = canvases.flatMap(item => item.calls).filter(call => !before.has(call));
  const glyphs = raster.filter(call => call.name === 'fillText' && '重围颖钦'.includes(String(call.args[0])));
  assert.ok(glyphs.length >= 2);
  assert.ok(glyphs.every(call => String(call.args[0]).length === 1));
  assert.ok(glyphs.every(call => /^400 .*Cheerboard Sans/.test(String(call.state.font))));
  const reads = raster.filter(call => call.name === 'getImageData');
  assert.equal(reads.length, glyphs.length);
  assert.ok(reads.every(call => Number(call.args[2]) === 96 && Number(call.args[3]) === 96));
  const shifted = makeCanvas();
  const after = new Set(canvases.flatMap(item => item.calls));
  renderBoard(shifted.canvas, { ...design, fontId: 'handwritten' }, { width: 1280, height: 720, offset: 3.25 });
  assert.equal(canvases.flatMap(item => item.calls).filter(call => !after.has(call) && call.name === 'getImageData').length, 0);
  const shiftedStamps = shifted.calls.filter(call => call.name === 'drawImage');
  assert.equal(shiftedStamps.length, pointPasses.length);
  pointPasses.forEach((call, index) => {
    const original = imageDestination(call), translated = imageDestination(shiftedStamps[index]);
    assert.ok(Math.abs(translated[0] - original[0] - 3.25) < 0.00001);
    assert.deepEqual(translated.slice(1), original.slice(1));
  });
  for (const dotStyle of ['classic', 'fluorescent'] as const) {
    const target = makeCanvas();
    const prior = new Set(canvases.flatMap(item => item.calls));
    renderBoard(target.canvas, { ...light('L3'), text: '常规点阵', dotStyle, fontId: 'sans' }, { width: 1280, height: 720 });
    const regular = canvases.flatMap(item => item.calls).find(call => !prior.has(call) && call.name === 'fillText' && call.args[0] === '常规点阵');
    // Classic/fluorescent share the same glyph mask, so the second profile
    // may reuse it; any new raster still has to retain the regular font.
    if (regular) assert.match(String(regular.state.font), /^400 .*Cheerboard Sans/);
  }
});

test('stroke centerlines turn a thick stroke into one LED column and keep endpoints', () => {
  const width = 64, height = 64;
  const alpha = new Uint8Array(width * height);
  for (let y = 8; y <= 55; y++) for (let x = 28; x <= 36; x++) alpha[y * width + x] = 255;
  const points = sampleStrokeCenterline(alpha, width, height, 7);
  assert.ok(points.length / 3 >= 6 && points.length / 3 <= 9);
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < points.length; i += 3) { xs.push(points[i]); ys.push(points[i + 1]); assert.ok(points[i + 2] > 0.8); }
  assert.ok(Math.max(...xs) - Math.min(...xs) <= 1, 'one thick stroke must not become several parallel LED columns');
  assert.ok(Math.min(...ys) <= 13 && Math.max(...ys) >= 49, 'the stroke endpoints survive thinning');
  assert.equal(sampleStrokeCenterline(alpha, 256, 256, 7).length, 0);
});

test('stroke-center LEDs preserve a closed counter, inner cross and nearby distinct strokes', () => {
  const width = 80, height = 80;
  const alpha = new Uint8Array(width * height);
  const rect = (left: number, top: number, right: number, bottom: number) => {
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) alpha[y * width + x] = 255;
  };
  // A 围-like enclosure: all four counters must stay open around its cross.
  rect(8, 8, 12, 70); rect(8, 8, 70, 12); rect(66, 8, 70, 70); rect(8, 66, 70, 70);
  rect(24, 37, 54, 41); rect(37, 24, 41, 54);
  const points = sampleStrokeCenterline(alpha, width, height, 6);
  const xy: number[][] = [];
  for (let i = 0; i < points.length; i += 3) xy.push([points[i], points[i + 1]]);
  for (const [cx, cy] of [[25, 25], [53, 25], [25, 53], [53, 53]]) {
    assert.ok(xy.every(([x, y]) => Math.hypot(x - cx, y - cy) > 7), 'a counter must not gain LEDs inside its gap');
  }
  assert.ok(xy.some(([x, y]) => Math.abs(x - 39) < 2 && Math.abs(y - 39) < 2));
  assert.ok(xy.some(([x, y]) => x < 13 && y > 20 && y < 60));
  assert.ok(xy.some(([x, y]) => x > 65 && y > 20 && y < 60));
  assert.deepEqual(sampleStrokeCenterline(alpha, width, height, 6), points, 'arc-length phase must be deterministic');
});

test('fine junctions merge neighboring branch endpoints into one full-size LED', () => {
  const width = 64, alpha = new Uint8Array(width * width);
  const ink = (x: number, y: number) => { alpha[y * width + x] = 255; };
  // Five arms create several graph nodes only one pixel apart, as in 我.
  for (let i = 9; i <= 54; i++) { ink(i, 31); ink(31, i); }
  for (let i = 32; i < 52; i++) ink(i, i);
  const points = sampleStrokeCenterline(alpha, width, width, 7);
  const junction: number[][] = [];
  for (let i = 0; i < points.length; i += 3) {
    assert.equal(points[i + 2], 1, 'crossing branches must not turn into undersized twin LEDs');
    if (Math.hypot(points[i] - 31, points[i + 1] - 31) < 4) junction.push([points[i], points[i + 1]]);
  }
  assert.equal(junction.length, 1, 'the crossing has one shared LED');
  for (const [x, y] of [[10, 31], [54, 31], [31, 10], [31, 54], [51, 51]]) {
    assert.ok(Array.from({ length: points.length / 3 }, (_, i) => Math.hypot(points[i * 3] - x, points[i * 3 + 1] - y)).some(distance => distance < 2), 'a real branch endpoint must survive junction consolidation');
  }
  assert.deepEqual(sampleStrokeCenterline(alpha, width, width, 7), points);
});

test('fine consolidation keeps close parallel strokes on both sides of a narrow counter', () => {
  const width = 64, alpha = new Uint8Array(width * width);
  for (let y = 8; y <= 55; y++) { alpha[y * width + 28] = 255; alpha[y * width + 32] = 255; }
  // These sides are connected at the ends, but not across their middle gap.
  for (let x = 28; x <= 32; x++) { alpha[8 * width + x] = 255; alpha[55 * width + x] = 255; }
  const points = sampleStrokeCenterline(alpha, width, width, 8);
  let left = 0, right = 0;
  for (let i = 0; i < points.length; i += 3) {
    assert.equal(points[i + 2], 1);
    if (points[i + 1] < 18 || points[i + 1] > 45) continue;
    assert.ok(points[i] < 29 || points[i] > 31, 'do not merge parallel sides into a dot inside the counter');
    if (points[i] < 29) left++; else right++;
  }
  assert.ok(left >= 3 && right >= 3, 'both nearby sides must remain visible');
});

test('fine scrolling rasterizes only visible glyphs and reuses its fixed small mask across offsets', () => {
  const { makeCanvas, canvases } = canvasEnvironment((x, y) => x >= 44 && x <= 50 && y >= 20 && y <= 76 ? 255 : 0);
  const target = makeCanvas();
  const text = Array.from({ length: 180 }, (_, index) => String.fromCodePoint(0x4E00 + index)).join('');
  const design = { ...light('L3'), dotStyle: 'fine' as const, text, scroll: true, loop: true };
  const prior = new Set(canvases.flatMap(item => item.calls));
  renderBoard(target.canvas, design, { width: 720, height: 405, repeatGap: 30 });
  const fresh = () => canvases.flatMap(item => item.calls).filter(call => !prior.has(call));
  const reads = fresh().filter(call => call.name === 'getImageData');
  assert.ok(reads.length > 0 && reads.length < 12, 'offscreen text must not rasterize all 180 glyphs');
  const masks = canvases.filter(item => item.calls.some(call => reads.includes(call)));
  assert.equal(masks.length, 1);
  assert.equal(masks[0].canvas.width, 96);
  assert.equal(masks[0].canvas.height, 96);
  const sizes = masks[0].sizeWrites.length;
  renderBoard(target.canvas, design, { width: 720, height: 405, repeatGap: 30, offset: 0.25 });
  assert.equal(fresh().filter(call => call.name === 'getImageData').length, reads.length);
  assert.equal(masks[0].sizeWrites.length, sizes);
  invalidateFontCache();
  renderBoard(target.canvas, design, { width: 720, height: 405, repeatGap: 30, offset: 0.25 });
  assert.equal(fresh().filter(call => call.name === 'getImageData').length, reads.length * 2);
  assert.equal(masks[0].sizeWrites.length, sizes, 'font readiness clears vectors, not the bitmap allocation');
});

test('fine preview and export share centerline positions and all effects ignore saved font choices', () => {
  const { makeCanvas, canvases } = canvasEnvironment((x, y) => x >= 44 && x <= 50 && y >= 20 && y <= 76 ? 255 : 0);
  const design = { ...light('L3'), dotStyle: 'fine' as const, fontId: 'serif' as const, gradient: true, gradientEnd: '#FF3399' };
  const preview = makeCanvas();
  renderBoard(preview.canvas, design, { width: 1920, height: 1080 });
  const exported = renderExport(design, 'board');
  const output = canvases.find(item => item.canvas === exported)!;
  const stamps = (calls: Call[]) => calls.filter(call => call.name === 'drawImage').map(call => call.args);
  assert.deepEqual(stamps(output.calls), stamps(preview.calls));
  const corePasses = preview.calls.filter(call => call.name === 'drawImage' && Number(call.args[2]) > 0);
  assert.equal(new Set(corePasses.map(call => Number(call.args[7]).toFixed(6))).size, 1, 'every centerline LED has the same diameter');
  for (const templateId of ['L1', 'L2', 'L3', 'L4', 'L5', 'H1', 'H2', 'H3'] as const) {
    const base = createDesign(templateId);
    const target = makeCanvas();
    const metrics = ['sans', 'serif', 'handwritten'].map(fontId => measureBoard(target.canvas, { ...base, fontId: fontId as Design['fontId'] }, { width: 1280, height: 720 }));
    assert.deepEqual(metrics[1], metrics[0]);
    assert.deepEqual(metrics[2], metrics[0]);
    const fonts = new Set(target.calls.filter(call => call.name === 'measureText').map(call => call.state.font));
    assert.ok([...fonts].every(font => templateId === 'H2' ? /Handwriting/.test(String(font)) : !/Handwriting|Songti|SimSun/.test(String(font))));
  }
});

test('new rich decorations replace the legacy corner icon and export the same seeded edge layout', () => {
  const { makeCanvas, canvases } = canvasEnvironment();
  const options = { width: 1920, height: 1080 };
  const design = { ...light('L1'), text: '莎莎加油', decorationId: 'hearts' as const, decorationSeed: 1, sticker: 'fries' as const };
  const preview = makeCanvas();
  const metrics = renderBoard(preview.canvas, design, options);
  const placements = getBoardDecorationLayout(design, { ...options, textBounds: {
    left: (options.width - metrics.textWidth) / 2, right: (options.width + metrics.textWidth) / 2,
    top: options.height * 0.51 - metrics.fontSize / 2, bottom: options.height * 0.51 + metrics.fontSize / 2,
  } });
  assert.ok(placements.length > 1);
  assert.equal(preview.calls.filter(call => call.name === 'rotate').length, placements.length * 2);
  assert.equal(preview.calls.filter(call => call.name === 'stroke').length, 0);
  assert.ok(preview.calls.filter(call => call.name === 'drawImage').length > 20);
  const exported = renderExport(design, 'board');
  const output = canvases.find(item => item.canvas === exported)!;
  const transforms = (calls: Call[]) => calls.filter(call => call.name === 'rotate' || call.name === 'translate').map(call => [call.name, ...call.args]);
  assert.deepEqual(transforms(output.calls), transforms(preview.calls));
  const plain = measureBoard(makeCanvas().canvas, { ...design, decorationId: 'none', sticker: 'none' }, options);
  assert.ok(metrics.fontSize > plain.fontSize * 0.6);
});

test('rich decorations remain fixed while repeated text uses one bounded viewport read', () => {
  const { makeCanvas, canvases } = canvasEnvironment();
  const design = { ...light('L3'), dotStyle: 'fluorescent' as const, decorationId: 'hearts' as const, scroll: true, loop: true, decorationSeed: 5 };
  const transforms: unknown[][] = [];
  for (const offset of [-70, 80]) {
    const target = makeCanvas();
    const prior = new Set(canvases.flatMap(item => item.calls));
    renderBoard(target.canvas, design, { width: 1280, height: 720, offset, repeatGap: 50 });
    assert.equal(target.calls.some(call => call.name === 'clip'), false);
    const fresh = canvases.flatMap(item => item.calls).filter(call => !prior.has(call));
    assert.ok(fresh.filter(call => call.name === 'getImageData').length <= 1);
    transforms.push(target.calls.filter(call => call.name === 'rotate' || call.name === 'translate').map(call => [call.name, ...call.args]));
  }
  assert.deepEqual(transforms[0], transforms[1]);
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

test('legacy font choices do not change the point raster; font readiness still invalidates it', () => {
  const { makeCanvas, canvases } = canvasEnvironment();
  const target = makeCanvas();
  const pixels = () => canvases.flatMap(item => item.calls).filter(call => call.name === 'getImageData').length;
  const design = light('L3');
  renderBoard(target.canvas, design, { width: 720, height: 405 });
  const before = pixels();
  renderBoard(target.canvas, { ...design, fontId: 'handwritten' }, { width: 720, height: 405 });
  assert.equal(pixels(), before);
  invalidateFontCache();
  renderBoard(target.canvas, { ...design, fontId: 'handwritten' }, { width: 720, height: 405 });
  assert.equal(pixels(), before + 1);
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
