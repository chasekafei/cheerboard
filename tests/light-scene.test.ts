import assert from 'node:assert/strict';
import test from 'node:test';
import { lightGeometry } from '../src/light-scene.ts';

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
