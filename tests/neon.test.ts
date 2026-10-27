import assert from 'node:assert/strict';
import test from 'node:test';
import { drawNeonText, type NeonTextOptions } from '../src/neon.ts';

type Call = { name: string; args: unknown[]; state: Record<string, unknown> };

function context(filter: 'native' | 'absent' | 'ignored' | 'throwing' = 'native', fail = false) {
  const calls: Call[] = [];
  let state: Record<string, unknown> = {
    font: '700 20px serif', globalAlpha: 0.8, globalCompositeOperation: 'multiply',
    fillStyle: '#123456', strokeStyle: '#654321', shadowBlur: 4, shadowOffsetX: 2, shadowOffsetY: 3,
    ...(filter === 'absent' ? {} : { filter: 'none' }),
  };
  const original = { ...state };
  const stack: Record<string, unknown>[] = [];
  const ctx = new Proxy({}, {
    get(_target, property) {
      const name = String(property);
      if (name in state) return state[name];
      if (name === 'filter') return undefined;
      return (...args: unknown[]) => {
        calls.push({ name, args, state: { ...state } });
        if (name === 'save') stack.push({ ...state });
        if (name === 'restore') state = stack.pop() || state;
        if (fail && name === 'fillText') throw new Error('draw failed');
      };
    },
    set(_target, property, value) {
      if (property === 'filter' && filter === 'throwing') throw new Error('unsupported filter setter');
      if (property !== 'filter' || filter !== 'ignored') state[String(property)] = value;
      return true;
    },
  }) as CanvasRenderingContext2D;
  return { ctx, calls, original, read: () => ({ ...state }) };
}

const options: NeonTextOptions = {
  glow: 100, paint: '#62F7FF', core: '#E9FEFF', glowColor: '#62F7FF',
  viewportWidth: 720, viewportHeight: 405,
};

test('the complete displaced projection precedes a soft tube fallback and restores state', () => {
  const env = context();
  drawNeonText(env.ctx, '莎出重围', 360, 200, 100, options);
  const fills = env.calls.filter(call => call.name === 'fillText');
  const projection = fills.find(call => String(call.state.filter).startsWith('blur('))!;
  assert.ok(projection);
  assert.equal(projection.args[0], '莎出重围');
  assert.equal(projection.args[1], 360);
  assert.ok(Number(projection.args[2]) > 200 && Number(projection.args[2]) < 220,
    'the displaced projection stays close to the tube');
  assert.ok(Number(projection.state.globalAlpha) > 0 && Number(projection.state.globalAlpha) < Number(env.original.globalAlpha));
  const projectionBlur = parseFloat(String(projection.state.filter).slice(5));
  assert.ok(projectionBlur > 0 && projectionBlur < Number(projection.args[2]) - 200,
    'the softened projection retains a distinct downward displacement');
  const core = fills[fills.length - 1];
  assert.equal(projection.state.font, core.state.font);
  assert.match(String(core.state.font), /^100 100px .*"Cheerboard Tube"/);
  assert.match(String(core.state.filter), /^blur\(/);
  assert.equal(core.state.shadowBlur, 0);
  assert.deepEqual(core.args, ['莎出重围', 360, 200]);
  assert.equal(core.state.fillStyle, options.core);
  const blur = (call: Call) => Number(call.state.shadowBlur) || parseFloat(String(call.state.filter).slice(5)) || 0;
  assert.ok(fills.some(call => call.args[2] === 200 && blur(call) > 3 && blur(call) < 15),
    'a middle halo bridges the sharp tube and softer inner glow');
  assert.ok(fills.some(call => blur(call) > 20), 'the ambient halo remains wider than the tube');
  assert.deepEqual(env.read(), env.original);
});

test('zero glow keeps the tube edge soft while disabling projection and ambient halo', () => {
  const env = context();
  drawNeonText(env.ctx, '加油', 360, 200, 100, { ...options, glow: 0 });
  const text = env.calls.filter(call => call.name === 'fillText' || call.name === 'strokeText');
  assert.ok(text.length > 0);
  assert.ok(text.every(call => call.args[2] === 200 && call.state.shadowBlur === 0));
  assert.ok(text.every(call => parseFloat(String(call.state.filter).slice(5)) > 0
    && parseFloat(String(call.state.filter).slice(5)) < 2));
  assert.equal(text[0].state.lineJoin, 'round');
  assert.equal(text[0].state.lineCap, 'round');
  assert.deepEqual(env.read(), env.original);
});

test('the soft-fill fallback retains supplied gradient paints', () => {
  const paint = { stops: [[0, '#FF76D5'], [1, '#75DFFF']] } as unknown as CanvasGradient;
  const core = { stops: [[0, '#FFF2FB'], [1, '#F1FCFF']] } as unknown as CanvasGradient;
  const env = context();
  drawNeonText(env.ctx, 'SUN HOPE', 360, 200, 100, { ...options, paint, core });
  const fills = env.calls.filter(call => call.name === 'fillText');
  assert.ok(fills.slice(0, -1).every(call => call.state.fillStyle === paint));
  assert.equal(fills[fills.length - 1].state.fillStyle, core);
});

test('missing, ignored or throwing Canvas filter setters use the same displaced glyph with a shadow fallback', () => {
  for (const support of ['absent', 'ignored', 'throwing'] as const) {
    const env = context(support);
    drawNeonText(env.ctx, '加油', 360, 200, 100, options);
    const projection = env.calls.find(call => call.name === 'fillText' && Number(call.state.shadowBlur) > 0
      && Number(call.args[2]) + Number(call.state.shadowOffsetY) > 201)!;
    assert.ok(projection);
    assert.ok(Number(projection.state.shadowBlur) > 0);
    assert.equal(projection.state.shadowColor, options.glowColor);
    assert.ok(Number(projection.state.globalAlpha) > 0 && Number(projection.state.globalAlpha) < 0.8);
    const softSources = env.calls.filter(call => call.name === 'fillText' && Number(call.state.shadowBlur) > 0);
    assert.ok(softSources.every(call => Number(call.args[2]) < 0), 'only the blurred shadow reaches the viewport');
    assert.deepEqual(env.read(), env.original);
  }
});

test('compression keeps a viewport-sized clip and bitmap scaling scales the projection with its glyph', () => {
  const projections: Call[] = [];
  for (const bitmapScale of [1, 2]) {
    const env = context();
    drawNeonText(env.ctx, '加油', 360 * bitmapScale, 200 * bitmapScale, 100 * bitmapScale,
      { ...options, viewportWidth: 720 * bitmapScale, viewportHeight: 405 * bitmapScale, textScaleX: 0.82 });
    const clip = env.calls.find(call => call.name === 'rect')!;
    assert.ok(Math.abs(Number(clip.args[2]) * 0.82 - 720 * bitmapScale) < 0.000001);
    assert.ok(Math.abs(Number(clip.args[0]) - (360 - 360 / 0.82) * bitmapScale) < 0.000001);
    assert.ok(!env.calls.some(call => ['setTransform', 'resetTransform', 'scale', 'translate'].includes(call.name)));
    projections.push(env.calls.find(call => call.name === 'fillText' && Number(call.args[2]) > 200 * bitmapScale)!);
  }
  assert.equal(Number(projections[1].args[2]), Number(projections[0].args[2]) * 2);
  assert.equal(parseFloat(String(projections[1].state.filter).slice(5)), parseFloat(String(projections[0].state.filter).slice(5)) * 2);
});

test('the native fallback keeps long text drawing passes fixed and retains the viewport clip', () => {
  const short = context();
  const long = context();
  drawNeonText(short.ctx, '加油', 360, 200, 100, options);
  drawNeonText(long.ctx, '加油'.repeat(1000), -100000, 200, 100, options);
  assert.equal(long.calls.length, short.calls.length);
  assert.deepEqual(long.calls.find(call => call.name === 'rect')?.args, [0, 0, 720, 405]);
  assert.ok(!long.calls.some(call => ['measureText', 'getImageData', 'drawImage'].includes(call.name)));
});

test('invalid geometry is ignored and drawing failures still restore caller state', () => {
  const invalid = context();
  for (const [x, y, size] of [[NaN, 10, 100], [10, Infinity, 100], [10, 10, 0]]) {
    drawNeonText(invalid.ctx, '加油', x, y, size, options);
  }
  assert.equal(invalid.calls.length, 0);
  const broken = context('native', true);
  assert.throws(() => drawNeonText(broken.ctx, '加油', 360, 200, 100, options), /draw failed/);
  assert.deepEqual(broken.read(), broken.original);
});
