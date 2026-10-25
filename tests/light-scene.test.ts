import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createDesign, type Design } from '../src/catalog.ts';
import { lightGeometry, mountLightScene, scrollPixelsPerSecond } from '../src/light-scene.ts';

test('manual orientation swaps the canvas geometry without relying on device rotation', () => {
  const horizontal = lightGeometry(390, 844, 'landscape');
  assert.deepEqual([horizontal.cssWidth, horizontal.cssHeight, horizontal.rotation], [844, 390, 90]);
  const vertical = lightGeometry(390, 844, 'portrait');
  assert.deepEqual([vertical.cssWidth, vertical.cssHeight, vertical.rotation], [390, 844, 0]);
  const lockedHorizontalViewport = lightGeometry(844, 390, 'portrait');
  assert.deepEqual([lockedHorizontalViewport.cssWidth, lockedHorizontalViewport.cssHeight, lockedHorizontalViewport.rotation], [390, 844, 90]);
  assert.equal(lightGeometry(844, 390, 'landscape').rotation, 0);
});

test('large screens and high pixel ratios keep a bounded canvas allocation', () => {
  for (const [width, height, dpr] of [[390, 844, 3], [3840, 2160, 4], [16000, 900, 2], [1, 1, 1]]) {
    const result = lightGeometry(width, height, 'landscape', dpr);
    assert.ok(result.width > 0 && result.height > 0);
    assert.ok(Math.max(result.width, result.height) <= 2048);
    assert.ok(result.width * result.height <= 2099200);
    assert.ok(Math.abs(result.width / result.height - result.cssWidth / result.cssHeight) < 0.1);
  }
});

test('the five faster speed levels scale with CSS board height', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(speed => scrollPixelsPerSecond(speed, 720)), [100, 170, 260, 380, 540]);
  assert.equal(scrollPixelsPerSecond(3, 360), 130);
  assert.equal(scrollPixelsPerSecond(0, 720), 100);
  assert.equal(scrollPixelsPerSecond(6, 720), 540);
  assert.equal(scrollPixelsPerSecond(NaN, 720), 100);
  assert.equal(scrollPixelsPerSecond(3, -1), 0);
  assert.equal(scrollPixelsPerSecond(3, Infinity), 0);
});

type Draw = { x: number; font: string; text: string };

function environment(t: TestContext, changes: Partial<Design> = {}, dpr = 1) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalRequest = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  const originalCancel = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame');
  const callbacks = new Map<number, FrameRequestCallback>();
  const draws: Draw[] = [];
  const stats = { measurements: 0, widthFactor: 0.56, toggles: 0 };
  let frameId = 0;
  let now = 0;
  let font = '10px sans-serif';
  const stack: string[] = [];
  const context = new Proxy({}, {
    get(_target, name) {
      if (name === 'font') return font;
      if (name === 'measureText') return (text: string) => {
        stats.measurements++;
        return { width: Array.from(text).length * Number(/([\d.]+)px/.exec(font)?.[1] || 10) * stats.widthFactor };
      };
      if (name === 'fillText') return (text: string, x: number) => draws.push({ text, x, font });
      if (name === 'save') return () => stack.push(font);
      if (name === 'restore') return () => { font = stack.pop() || font; };
      return () => {};
    },
    set(_target, name, value) { if (name === 'font') font = String(value); return true; },
  });
  const canvas = Object.assign(new EventTarget(), { width: 300, height: 150, style: {} as Record<string, string>, getContext: () => context });
  const root = { clientWidth: 1000, clientHeight: 500, querySelector: () => canvas };
  const document = Object.assign(new EventTarget(), { hidden: false });
  const window = Object.assign(new EventTarget(), { devicePixelRatio: dpr, visualViewport: new EventTarget() });
  const design: Design = { ...createDesign('L1'), text: '持续滚动的加油文案'.repeat(3), scroll: true, loop: true, sticker: 'none', border: false, ...changes };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (callback: FrameRequestCallback) => { callbacks.set(++frameId, callback); return frameId; } });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: (id: number) => callbacks.delete(id) });
  let mounted: ReturnType<typeof mountLightScene> | null = null;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    mounted?.destroy();
    for (const [name, descriptor] of [['window', originalWindow], ['document', originalDocument], ['requestAnimationFrame', originalRequest], ['cancelAnimationFrame', originalCancel]] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  };
  t.after(dispose);
  const scene = mountLightScene(root as unknown as HTMLElement, () => design, () => { stats.toggles++; });
  mounted = scene;
  const step = (milliseconds = 20) => {
    now += milliseconds;
    const pending = Array.from(callbacks.values());
    callbacks.clear();
    pending.forEach(callback => callback(now));
  };
  const advance = (milliseconds: number) => {
    for (let remaining = milliseconds; remaining > 0; remaining -= 20) step(Math.min(20, remaining));
  };
  const last = () => draws[draws.length - 1];
  const cssX = () => last().x * parseFloat(canvas.style.width) / canvas.width;
  const fontSize = () => Number(/([\d.]+)px/.exec(last().font)![1]) * parseFloat(canvas.style.height) / canvas.height;
  return { scene, design, root, window, document, canvas, callbacks, draws, stats, step, advance, last, cssX, fontSize, dispose };
}

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} should equal ${expected}`);
}

test('apparent speed stays the same across DPR and bitmap allocation limits', t => {
  for (const dpr of [1, 2, 4]) {
    const env = environment(t, {}, dpr);
    const start = env.cssX();
    env.step(0);
    env.advance(1000);
    close(start - env.cssX(), scrollPixelsPerSecond(3, 500));
    env.dispose();
  }
});

test('direction reversal and speed changes preserve the current position', t => {
  const env = environment(t);
  env.step(0);
  env.advance(400);
  const leftPosition = env.cssX();
  assert.ok(leftPosition < 500);
  env.design.direction = 'right';
  env.scene.repaint();
  close(env.cssX(), leftPosition);
  env.step(0);
  env.advance(400);
  close(env.cssX(), 500);
  env.design.speed = 5;
  env.scene.repaint();
  close(env.cssX(), 500);
  env.step(0);
  env.advance(200);
  close(env.cssX(), 500 + scrollPixelsPerSecond(5, 500) * .2);
});

test('unchanged UI repaints and metadata updates do not redraw or restart scrolling', t => {
  const env = environment(t);
  env.step(0);
  env.advance(200);
  const frames = Array.from(env.callbacks.keys());
  const measurements = env.stats.measurements;
  const draws = env.draws.length;
  env.design.updatedAt++;
  env.design.friendly = !env.design.friendly;
  env.scene.repaint();
  env.window.dispatchEvent(new Event('resize'));
  env.window.visualViewport.dispatchEvent(new Event('resize'));
  assert.equal(env.draws.length, draws);
  assert.equal(env.stats.measurements, measurements);
  assert.deepEqual(Array.from(env.callbacks.keys()), frames);
  env.advance(200);
  close(env.cssX(), 500 - scrollPixelsPerSecond(3, 500) * .4);
});

test('opening sheets freezes large scrolling text and resumes from the same position', t => {
  const env = environment(t);
  env.step(0);
  env.advance(300);
  const position = env.cssX();
  const size = env.fontSize();
  const draws = env.draws.length;
  env.scene.setObscured(true);
  env.scene.setObscured(true);
  env.scene.repaint();
  assert.equal(env.callbacks.size, 0);
  assert.equal(env.draws.length, draws);
  env.advance(10000);
  env.design.foreground = '#FF0000';
  env.scene.repaint();
  close(env.cssX(), position);
  close(env.fontSize(), size);
  assert.equal(env.callbacks.size, 0);
  env.scene.setObscured(false);
  close(env.cssX(), position);
  env.step(0);
  env.advance(200);
  close(env.cssX(), position - scrollPixelsPerSecond(3, 500) * .2);
});

test('DPR changes and explicit font refreshes preserve CSS position', t => {
  const env = environment(t);
  env.step(0);
  env.advance(300);
  const position = env.cssX();
  env.window.devicePixelRatio = 2;
  env.scene.repaint();
  close(env.cssX(), position);
  const measurements = env.stats.measurements;
  env.stats.widthFactor = .7;
  env.scene.repaint();
  assert.equal(env.stats.measurements, measurements);
  env.scene.repaint(true);
  assert.ok(env.stats.measurements > measurements);
  close(env.cssX(), position);
});

test('background visibility pauses without catch-up or phase reset', t => {
  const env = environment(t);
  env.step(0);
  env.advance(300);
  const position = env.cssX();
  const draws = env.draws.length;
  env.document.hidden = true;
  env.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(env.callbacks.size, 0);
  env.advance(30000);
  assert.equal(env.draws.length, draws);
  env.document.hidden = false;
  env.document.dispatchEvent(new Event('visibilitychange'));
  close(env.cssX(), position);
  env.step(0);
  env.advance(200);
  close(env.cssX(), position - scrollPixelsPerSecond(3, 500) * .2);
});

test('non-looping motion in both directions ends on a full static board and stays stopped', t => {
  for (const direction of ['left', 'right'] as const) {
    const env = environment(t, { direction, loop: false, speed: 5 });
    const scrollingSize = env.fontSize();
    env.step(0);
    env.advance(30000);
    assert.equal(env.callbacks.size, 0);
    close(env.cssX(), 500);
    assert.ok(env.fontSize() < scrollingSize);
    const draws = env.draws.length;
    env.scene.repaint();
    env.scene.setObscured(true);
    env.scene.setObscured(false);
    env.document.hidden = true;
    env.document.dispatchEvent(new Event('visibilitychange'));
    env.document.hidden = false;
    env.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(env.draws.length, draws);
    assert.equal(env.callbacks.size, 0);
    env.design.loop = true;
    env.scene.repaint();
    assert.equal(env.callbacks.size, 1);
    close(env.cssX(), 500);
    env.dispose();
  }
});

test('looping boards wrap at the edges in either direction', t => {
  for (const direction of ['left', 'right'] as const) {
    const env = environment(t, { text: '加油', direction, speed: 5 });
    env.step(0);
    const positions = [];
    for (let i = 0; i < 600; i++) { env.step(); positions.push(env.cssX()); }
    assert.ok(positions.some((position, index) => index && (direction === 'left' ? position > positions[index - 1] + 100 : position < positions[index - 1] - 100)));
    assert.equal(env.callbacks.size, 1);
    env.dispose();
  }
});

test('destroy cancels animation and detaches all input, resize and visibility listeners', t => {
  const env = environment(t);
  env.canvas.dispatchEvent(new Event('click'));
  assert.equal(env.stats.toggles, 1);
  const orphan = Array.from(env.callbacks.values())[0];
  env.scene.destroy();
  env.scene.destroy();
  const draws = env.draws.length;
  env.canvas.dispatchEvent(new Event('click'));
  const key = new Event('keydown', { cancelable: true });
  Object.defineProperty(key, 'key', { value: 'Enter' });
  env.canvas.dispatchEvent(key);
  env.window.dispatchEvent(new Event('resize'));
  env.window.visualViewport.dispatchEvent(new Event('resize'));
  env.document.dispatchEvent(new Event('visibilitychange'));
  env.scene.repaint(true);
  env.scene.setObscured(false);
  orphan(1000);
  assert.equal(env.stats.toggles, 1);
  assert.equal(env.draws.length, draws);
  assert.equal(env.callbacks.size, 0);
});
