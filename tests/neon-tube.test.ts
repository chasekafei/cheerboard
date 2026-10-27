import assert from 'node:assert/strict';
import test from 'node:test';
import { clearNeonTubeCache, drawSoftNeonTube, type SoftNeonTubeOptions } from '../src/neon-tube.ts';

type Call = { name: string; args: unknown[]; state: Record<string, unknown> };
type Pixels = { width: number; height: number; data: Uint8ClampedArray };
type Surface = { canvas: HTMLCanvasElement; calls: Call[]; pixels: Pixels | null; widthWrites: number; heightWrites: number };

function environment(alpha: (x: number, y: number) => number = (x, y) => x >= 189 && x <= 194 && y >= 112 && y <= 271 ? 255 : 0,
  measure: (text: string) => number = text => Array.from(text).length * 320) {
  clearNeonTubeCache();
  const surfaces: Surface[] = [];
  const create = () => {
    const calls: Call[] = [];
    let width = 300, height = 150;
    const surface = { calls, pixels: null, widthWrites: 0, heightWrites: 0 } as unknown as Surface;
    const ctx = {
      font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic', fillStyle: '#000000',
      setTransform: (...args: unknown[]) => calls.push({ name: 'setTransform', args, state: {} }),
      clearRect: (...args: unknown[]) => calls.push({ name: 'clearRect', args, state: {} }),
      measureText(text: string) { calls.push({ name: 'measureText', args: [text], state: {} }); return { width: measure(text) }; },
      fillText(...args: unknown[]) { calls.push({ name: 'fillText', args, state: { font: this.font } }); },
      getImageData(x: number, y: number, w: number, h: number) {
        calls.push({ name: 'getImageData', args: [x, y, w, h], state: {} });
        const data = new Uint8ClampedArray(w * h * 4);
        for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) data[(py * w + px) * 4 + 3] = alpha(px, py);
        return { width: w, height: h, data };
      },
      createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (pixels: Pixels) => { surface.pixels = pixels; calls.push({ name: 'putImageData', args: [pixels], state: {} }); },
    };
    surface.canvas = {
      get width() { return width; }, set width(value: number) { width = value; surface.widthWrites++; },
      get height() { return height; }, set height(value: number) { height = value; surface.heightWrites++; },
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
    surfaces.push(surface);
    return surface.canvas;
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: create } });
  return { surfaces };
}

function target() {
  const calls: Call[] = [];
  let state: Record<string, unknown> = { globalAlpha: 0.75, globalCompositeOperation: 'multiply', shadowBlur: 2, shadowOffsetX: 1, shadowOffsetY: 3 };
  const original = { ...state }, stack: Record<string, unknown>[] = [];
  const ctx = new Proxy({}, {
    get(_target, property) {
      if (String(property) in state) return state[String(property)];
      return (...args: unknown[]) => {
        const name = String(property);
        calls.push({ name, args, state: { ...state } });
        if (name === 'save') stack.push({ ...state });
        if (name === 'restore') state = stack.pop() || state;
      };
    },
    set(_target, property, value) { state[String(property)] = value; return true; },
  }) as CanvasRenderingContext2D;
  return { ctx, calls, original, read: () => state };
}

const options: SoftNeonTubeOptions = { foreground: '#FF2255', viewportWidth: 720, viewportHeight: 405 };
const draws = (calls: Call[]) => calls.filter(call => call.name === 'drawImage');
const rasterReads = (surfaces: Surface[]) => surfaces.flatMap(surface => surface.calls).filter(call => call.name === 'getImageData');

test('soft tube reports unavailable raster APIs before drawing and accepts an empty line', () => {
  Object.defineProperty(globalThis, 'document', { configurable: true, value: undefined });
  clearNeonTubeCache();
  const env = target();
  assert.equal(drawSoftNeonTube(env.ctx, '', 360, 200, 100, options), true);
  assert.equal(drawSoftNeonTube(env.ctx, '加油', 360, 200, 100, options), false);
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 192 }), fillText() {}, setTransform() {}, clearRect() {}, getImageData: () => undefined }) }) } });
  assert.equal(drawSoftNeonTube(env.ctx, '加油', 360, 200, 100, options), false);
  assert.equal(draws(env.calls).length, 0);
});

test('tube cross-section fades continuously in color and alpha without a white fill or colored contour', () => {
  const { surfaces } = environment();
  const env = target();
  assert.equal(drawSoftNeonTube(env.ctx, '加', 360, 200, 100, options), true);
  assert.equal(draws(env.calls).length, 1);
  assert.equal(env.calls.some(call => ['fillText', 'strokeText', 'getImageData', 'putImageData'].includes(call.name)), false);
  const glyph = surfaces.find(surface => surface.pixels)!;
  const pixels = glyph.pixels!;
  const row = Math.floor(pixels.height / 2);
  const cross = Array.from({ length: pixels.width }, (_, x) => Array.from(pixels.data.slice((row * pixels.width + x) * 4, (row * pixels.width + x) * 4 + 4)));
  const center = Math.floor(pixels.width / 2), left = cross.slice(0, center + 1);
  assert.ok(new Set(left.map(pixel => pixel[3])).size >= 5, 'the outer tube has a multi-step alpha falloff');
  assert.ok(new Set(left.filter(pixel => pixel[3] > 0).map(pixel => pixel[1])).size >= 4, 'center and edge have a continuous color transition');
  assert.ok(Math.max(...cross.map(pixel => pixel[1])) > 210, 'the restored highlight is visibly bright');
  assert.ok(cross.every(pixel => pixel[1] < 230), 'the bright center still retains its tube color rather than becoming a binary white fill');
  for (let x = 1; x < left.length; x++) {
    assert.ok(left[x][3] >= left[x - 1][3]);
    if (left[x - 1][3] > 0) assert.ok(left[x][1] >= left[x - 1][1]);
  }
  assert.deepEqual(env.read(), env.original);
  const source = surfaces.flatMap(surface => surface.calls).find(call => call.name === 'fillText')!;
  assert.match(String(source.state.font), /^100 320px .*Cheerboard Tube/);
});

test('distance shading retains thin crossing strokes and the open counters around them', () => {
  const { surfaces } = environment((x, y) => {
    const box = x >= 128 && x <= 256 && y >= 88 && y <= 296;
    const outline = box && (x <= 132 || x >= 252 || y <= 92 || y >= 292);
    const cross = box && (x >= 190 && x <= 194 || y >= 190 && y <= 194);
    return outline || cross ? 255 : 0;
  });
  const env = target();
  assert.equal(drawSoftNeonTube(env.ctx, '围', 360, 200, 100, options), true);
  const image = surfaces.find(surface => surface.pixels)!.pixels!;
  // The raster bounds are x128..256/y88..296 plus a nine-pixel feather.
  const opacity = (x: number, y: number) => image.data[((y - 79) * image.width + x - 119) * 4 + 3];
  assert.equal(opacity(192, 192), 255);
  assert.ok(opacity(130, 150) > 250 && opacity(192, 275) > 250);
  for (const [x, y] of [[160, 142], [224, 142], [160, 246], [224, 246]]) assert.equal(opacity(x, y), 0);
});

test('antialiased diagonal edges stay continuous as coverage reaches fully opaque', () => {
  const profile = (edge: number) => {
    const { surfaces } = environment((x, y) => {
      if (y < 96 || y > 286) return 0;
      const distance = x - (135 + (y - 96) * 0.43);
      if (distance > 0 && distance < 5) return 255;
      return distance >= -1 && distance <= 0 || distance >= 5 && distance < 6 ? edge : 0;
    });
    const env = target();
    assert.equal(drawSoftNeonTube(env.ctx, '方', 360, 200, 320, options), true);
    return surfaces.find(surface => surface.pixels)!.pixels!;
  };
  const nearly = profile(254), full = profile(255);
  assert.equal(nearly.width, full.width);
  assert.equal(nearly.height, full.height);
  let maximum = 0;
  for (let i = 0; i < nearly.data.length; i++) maximum = Math.max(maximum, Math.abs(nearly.data[i] - full.data[i]));
  // Allow a small corner interpolation difference; the old formula switched
  // by roughly a full distance pixel here, producing a much larger color band.
  assert.ok(maximum <= 14, `254→255 coverage must not create a new shading band (observed ${maximum})`);
});

test('gradient phases span the complete line and colored sprites survive scrolling and export scaling', () => {
  const { surfaces } = environment();
  const first = target();
  const gradient = { ...options, foreground: '#FF0000', gradientEnd: '#0000FF', gradientAngle: 0,
    gradientBounds: { x: 360, y: 200, width: 200, height: 100 } };
  assert.equal(drawSoftNeonTube(first.ctx, '日日', 360, 200, 100, gradient), true);
  const firstDraws = draws(first.calls);
  assert.equal(firstDraws.length, 2);
  assert.notEqual(firstDraws[0].args[0], firstDraws[1].args[0]);
  const spritePixels = firstDraws.map(call => surfaces.find(surface => surface.canvas === call.args[0])!.pixels!);
  const sample = (image: Pixels) => {
    const index = (Math.floor(image.height / 2) * image.width + Math.floor(image.width / 2)) * 4;
    return Array.from(image.data.slice(index, index + 4));
  };
  assert.ok(sample(spritePixels[0])[0] > sample(spritePixels[1])[0]);
  assert.ok(sample(spritePixels[0])[2] < sample(spritePixels[1])[2]);
  const reads = rasterReads(surfaces).length, created = surfaces.length;
  const moved = target();
  assert.equal(drawSoftNeonTube(moved.ctx, '日日', 383.25, 210, 100,
    { ...gradient, gradientBounds: { ...gradient.gradientBounds, x: 383.25, y: 210 } }), true);
  assert.equal(rasterReads(surfaces).length, reads);
  assert.equal(surfaces.length, created);
  draws(moved.calls).forEach((call, index) => {
    assert.equal(call.args[0], firstDraws[index].args[0]);
    assert.ok(Math.abs(Number(call.args[1]) - Number(firstDraws[index].args[1]) - 23.25) < 1e-8);
    assert.ok(Math.abs(Number(call.args[2]) - Number(firstDraws[index].args[2]) - 10) < 1e-8);
  });
  const exported = target();
  assert.equal(drawSoftNeonTube(exported.ctx, '日日', 720, 400, 200,
    { ...gradient, viewportWidth: 1440, viewportHeight: 810, gradientBounds: { x: 720, y: 400, width: 400, height: 200 } }), true);
  draws(exported.calls).forEach((call, index) => {
    assert.equal(call.args[0], firstDraws[index].args[0]);
    call.args.slice(1).forEach((value, dimension) => assert.ok(Math.abs(Number(value) - Number(firstDraws[index].args[dimension + 1]) * 2) < 1e-8));
  });
});

test('only visible glyphs get bounded surfaces; horizontal compression preserves viewport edges', () => {
  const { surfaces } = environment();
  const env = target();
  const text = Array.from({ length: 2000 }, (_, index) => String.fromCodePoint(0x4E00 + index)).join('');
  assert.equal(drawSoftNeonTube(env.ctx, text, 360, 200, 100, { ...options, textScaleX: 0.82 }), true);
  assert.ok(rasterReads(surfaces).length > 0 && rasterReads(surfaces).length < 16);
  assert.ok(surfaces.every(surface => surface.canvas.width <= 384 && surface.canvas.height <= 384));
  assert.ok(rasterReads(surfaces).every(call => Number(call.args[2]) === 384 && Number(call.args[3]) === 384));
  const clip = env.calls.find(call => call.name === 'rect')!;
  assert.ok(Math.abs(Number(clip.args[0]) - (360 - 360 / 0.82)) < 1e-8);
  assert.ok(Math.abs(Number(clip.args[2]) * 0.82 - 720) < 1e-8);
  assert.equal(env.calls.some(call => ['setTransform', 'resetTransform', 'scale', 'translate'].includes(call.name)), false);
  const measurements = surfaces.flatMap(surface => surface.calls).filter(call => call.name === 'measureText');
  assert.ok(measurements.reduce((total, call) => total + String(call.args[0]).length, 0) <= text.length * 3,
    'a long CJK sentence must not shape all increasing prefixes');
});

test('Latin kerning places each glyph from its actual prefix end and intrinsic advance', () => {
  const { surfaces } = environment(undefined, text => text === 'T' ? 200 : text === 'o' ? 180 : text === 'To' ? 330 : text.length * 320);
  const env = target();
  assert.equal(drawSoftNeonTube(env.ctx, 'To', 360, 200, 320, options), true);
  const stamps = draws(env.calls);
  assert.equal(stamps.length, 2);
  // prefix T ends at 200, prefix To at 330; their intrinsic half advances
  // are 100 and 90, so centers must be 100 and 240, not a uniform 330/380 fit.
  assert.ok(Math.abs(Number(stamps[1].args[1]) - Number(stamps[0].args[1]) - 140) < 1e-8);
  const measured = surfaces.flatMap(surface => surface.calls).filter(call => call.name === 'measureText').map(call => call.args[0]);
  assert.ok(measured.includes('T') && measured.includes('To'));
});

test('an overwide joined CJK cluster requests a whole-line fallback before rasterization', () => {
  const { surfaces } = environment();
  const env = target();
  assert.equal(drawSoftNeonTube(env.ctx, '王\u200d楚\u200d钦', 360, 200, 200, options), false);
  assert.equal(draws(env.calls).length, 0);
  assert.equal(rasterReads(surfaces).length, 0);
});

test('bounded glyph and sprite LRUs evict old entries, and font readiness clears both caches', () => {
  const { surfaces } = environment();
  const env = target();
  const render = (text: string, foreground = '#FF2255') => assert.equal(drawSoftNeonTube(env.ctx, text, 360, 200, 100, { ...options, foreground }), true);
  render('我');
  const reads = rasterReads(surfaces).length;
  render('我', '#22CCFF');
  assert.equal(rasterReads(surfaces).length, reads, 'colors reuse the distance geometry');
  for (let i = 0; i < 33; i++) render(String.fromCodePoint(0x4E00 + i));
  const afterEviction = rasterReads(surfaces).length;
  render('我');
  assert.equal(rasterReads(surfaces).length, afterEviction + 1);
  const raster = surfaces.find(surface => surface.calls.some(call => call.name === 'getImageData'))!;
  const sizeWrites = raster.widthWrites + raster.heightWrites;
  clearNeonTubeCache(); render('我');
  assert.equal(rasterReads(surfaces).length, afterEviction + 2);
  assert.equal(raster.widthWrites + raster.heightWrites, sizeWrites);
});

test('384-square worst-case fields respect the byte budgets before the 32-entry limit', () => {
  const { surfaces } = environment(() => 255);
  const env = target();
  const render = (text: string) => assert.equal(drawSoftNeonTube(env.ctx, text, 360, 200, 100, options), true);
  // 384²*2 per field and 384²*4 per sprite each exhaust their budgets
  // at fourteen entries, earlier than the thirty-two-entry count ceiling.
  const first = String.fromCodePoint(0x4E00);
  for (let i = 0; i < 15; i++) render(String.fromCodePoint(0x4E00 + i));
  const previous = draws(env.calls)[0].args[0];
  const reads = rasterReads(surfaces).length;
  render(first);
  assert.equal(rasterReads(surfaces).length, reads + 1);
  assert.notEqual(draws(env.calls)[draws(env.calls).length - 1].args[0], previous);
});

test('preparing many visible tiny glyphs stops before exceeding live field or sprite budgets', () => {
  const { surfaces } = environment(() => 255);
  const env = target();
  const text = Array.from({ length: 2000 }, (_, index) => String.fromCodePoint(0x4E00 + index)).join('');
  assert.equal(drawSoftNeonTube(env.ctx, text, 360, 200, 0.2, options), false);
  assert.equal(draws(env.calls).length, 0, 'fallback is selected before any partially prepared tube is painted');
  assert.ok(rasterReads(surfaces).length <= 15, 'stop at the first over-budget field, not after generating all 2000 glyphs');
  const payload = surfaces.filter(surface => surface.pixels).reduce((total, surface) => total + surface.pixels!.data.byteLength, 0);
  assert.ok(payload <= 8 * 1024 * 1024, 'prepared sprite references must remain inside the byte ceiling');
  assert.ok(surfaces.filter(surface => surface.pixels).length <= 14);
});
