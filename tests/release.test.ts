import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyDirectory } from '../scripts/verify.mjs';

const html = '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><link rel="stylesheet" href="./assets/app.css"></head><body><script src="./assets/app.js" defer></script></body></html>';

test('release validation rejects disabled capabilities even when guarded', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cheerboard-release-'));
  try {
    await mkdir(join(directory, 'assets'));
    await writeFile(join(directory, 'index.html'), html);
    await writeFile(join(directory, 'assets/app.css'), 'body{margin:0}');
    const script = join(directory, 'assets/app.js');
    await writeFile(script, 'window.cheerboardReady = true;');
    await verifyDirectory(directory);
    for (const code of [
      'if (window.preview) { document.createElement("a").download = "image.png"; }',
      'document.createElement("a").setAttribute("download", "image.png");',
      'window.navigator.geolocation.getCurrentPosition(function () {});',
      'document.execCommand("copy");',
      'window.prompt("name");',
      'window.markup = "<a download>save</a>";',
      'window.markup = `<img onclick="run()">`;',
    ]) {
      await writeFile(script, code);
      await assert.rejects(verifyDirectory(directory), /发布检查失败/);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('release entry requires viewport safety settings and container-managed CSP', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cheerboard-entry-'));
  try {
    await mkdir(join(directory, 'assets'));
    await writeFile(join(directory, 'assets/app.css'), 'body{margin:0}');
    await writeFile(join(directory, 'assets/app.js'), 'window.cheerboardReady = true;');
    await writeFile(join(directory, 'index.html'), html.replace(', viewport-fit=cover', ''));
    await assert.rejects(verifyDirectory(directory), /viewport/);
    await writeFile(join(directory, 'index.html'), html.replace('</head>', '<meta http-equiv="Content-Security-Policy" content="default-src none"></head>'));
    await assert.rejects(verifyDirectory(directory), /CSP/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
