import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isNative, loadLocal, saveLocal, saveImage, shareImage, getInsets, NativeUnavailableError,
  getFollowStatus, followAuthor,
} from '../src/platform.ts';
import { localDateInputValue } from '../src/export-view.ts';

test('memory-card dates use the local calendar at both ends of the day', () => {
  assert.equal(localDateInputValue(new Date(2026, 0, 1, 0, 15)), '2026-01-01');
  assert.equal(localDateInputValue(new Date(2026, 11, 31, 23, 45)), '2026-12-31');
});

type Result = Record<string, unknown>;
type Options = Record<string, unknown> & {
  success: (result: Result) => void;
  fail: (error: unknown) => void;
};
type Bridge = Record<string, (options: Options) => unknown>;

function environment(bridge?: Bridge, version: number | null = 9490001) {
  const browserStore = new Map<string, string>();
  const mockWindow: {
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
    xhs?: { miniTool?: Bridge; launchOptions?: Result };
  } = { setTimeout, clearTimeout };
  if (bridge) mockWindow.xhs = {
    miniTool: bridge,
    ...(version === null ? {} : { launchOptions: { miniToolEnv: { buildVersion: version } } }),
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: mockWindow });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Browser preview' } });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => browserStore.get(key) ?? null,
      setItem: (key: string, value: string) => { browserStore.set(key, value); },
    },
  });
  return { mockWindow, browserStore };
}

const image = 'data:image/png;base64,AA==';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test('browser storage handles absent data and reports failed writes honestly', async () => {
  environment();
  assert.equal(isNative(), false);
  assert.equal(await loadLocal('test-missing-browser'), null);
  await saveLocal('test-browser', { text: '加油' });
  assert.deepEqual(await loadLocal('test-browser'), { text: '加油' });
  localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  await assert.rejects(saveLocal('test-browser-failed', { text: '加油' }), /本地保存失败/);
});

test('callback storage migrates valid low-version data after an upgrade', async () => {
  const nativeStore = new Map<string, string>();
  const { browserStore } = environment({
    getStorage: options => options.success({ data: nativeStore.get(String(options.key)) ?? null }),
    setStorage: options => {
      nativeStore.set(String(options.key), String(options.data));
      options.success({ errMsg: 'setStorage:ok' });
    },
  });
  browserStore.set('test-migration', JSON.stringify({ text: '王楚钦加油' }));
  assert.deepEqual(await loadLocal('test-migration'), { text: '王楚钦加油' });
  assert.deepEqual(JSON.parse(nativeStore.get('test-migration')!), { text: '王楚钦加油' });
  await saveLocal('test-migration', { text: '孙颖莎加油' });
  assert.deepEqual(await loadLocal('test-migration'), { text: '孙颖莎加油' });
});

test('explicit missing-key errors are empty data; unknown and permission errors remain errors', async () => {
  const bridge: Bridge = {
    getStorage: options => options.fail({ errMsg: 'getStorage:fail data not found' }),
  };
  environment(bridge);
  assert.equal(await loadLocal('test-missing-native'), null);
  bridge.getStorage = options => options.fail({ errMsg: 'getStorage:fail unknown' });
  await assert.rejects(loadLocal('test-unknown-failure'), /操作未完成/);
  bridge.getStorage = options => options.fail({ errMsg: 'getStorage:fail permission denied' });
  await assert.rejects(loadLocal('test-permission-failure'), /权限/);
  bridge.getStorage = options => options.success({ data: '{broken' });
  await assert.rejects(loadLocal('test-corrupt-data'), /无法读取/);
});

test('storage reads tolerate BOM, double-encoded JSON and object bridge values', async () => {
  const bridge: Bridge = { getStorage: options => options.success({ data: '\uFEFF' + JSON.stringify(JSON.stringify({ text: '历史牌' })) }) };
  environment(bridge);
  assert.deepEqual(await loadLocal('test-legacy-encoded'), { text: '历史牌' });
  bridge.getStorage = options => options.success({ data: { text: '桥接对象' } });
  assert.deepEqual(await loadLocal('test-object-value'), { text: '桥接对象' });
  bridge.getStorage = options => options.success({ data: '' });
  assert.equal(await loadLocal('test-empty-value'), null);
});

test('native storage capability avoids a launch-options probe', async () => {
  let launchCount = 0;
  environment({
    getLaunchOptions: options => { launchCount += 1; options.success({ miniToolEnv: { buildVersion: 9490001 } }); },
    getStorage: options => options.success({ data: null }),
    setStorage: options => options.success({ errMsg: 'setStorage:ok' }),
  }, null);
  const reads = Promise.all(['one', 'two', 'three'].map(key => loadLocal('test-version-' + key)));
  await tick();
  assert.equal(launchCount, 0);
  assert.deepEqual(await reads, [null, null, null]);
  await saveLocal('test-version-four', { text: '可以' });
  assert.equal(launchCount, 0);
});

test('missing native storage falls back without probing an unused version API', async () => {
  let launchCount = 0;
  const { browserStore } = environment({
    getLaunchOptions: options => { launchCount += 1; options.fail({ errMsg: 'getLaunchOptions:fail unknown' }); },
  }, null);
  browserStore.set('test-failed-probe', 'true');
  assert.equal(await loadLocal('test-failed-probe'), true);
  assert.equal(await loadLocal('test-failed-probe'), true);
  assert.equal(launchCount, 0);
});

test('same-key writes cannot finish in reverse order and reads await queued writes', async () => {
  const pending: Options[] = [];
  let current: string | null = null;
  environment({
    setStorage: options => { pending.push(options); },
    getStorage: options => options.success({ data: current }),
  });
  const first = saveLocal('test-ordered', { text: 'old' });
  const second = saveLocal('test-ordered', { text: 'new' });
  const read = loadLocal('test-ordered');
  await tick();
  assert.equal(pending.length, 1);
  current = String(pending[0].data);
  pending[0].success({ errMsg: 'setStorage:ok' });
  await first;
  await tick();
  assert.equal(pending.length, 2);
  assert.equal(JSON.parse(String(pending[1].data)).text, 'new');
  current = String(pending[1].data);
  pending[1].success({ errMsg: 'setStorage:ok' });
  await second;
  assert.deepEqual(await read, { text: 'new' });
});

test('a rejected write does not block the next queued write', async () => {
  let count = 0;
  environment({
    setStorage: options => {
      count += 1;
      if (count === 1) options.fail({ errMsg: 'setStorage:fail unknown' });
      else options.success({ errMsg: 'setStorage:ok' });
    },
  });
  const failed = saveLocal('test-write-recovery', { text: 'old' });
  const recovered = saveLocal('test-write-recovery', { text: 'new' });
  await assert.rejects(failed, /操作未完成/);
  await recovered;
  assert.equal(count, 2);
});

test('Promise APIs receive local file handles for album, note and comment', async () => {
  const calls: Array<[string, Options]> = [];
  environment({
    writeTempFile: options => {
      calls.push(['file', options]);
      return Promise.resolve({ filePath: 'xhsfile://tmp/image.png' });
    },
    saveImageToPhotosAlbum: options => {
      calls.push(['album', options]);
      return Promise.resolve({ errMsg: 'saveImageToPhotosAlbum:ok' });
    },
    postNote: options => {
      calls.push(['note', options]);
      return Promise.resolve({ errMsg: 'postNote:ok' });
    },
    interactionOpenApi: options => {
      calls.push(['comment', options]);
      return Promise.resolve({ routed: true });
    },
  });
  await saveImage(image);
  await shareImage(image, 'note');
  await shareImage(image, 'comment', { text: '加油' });
  assert.equal(calls.find(([kind]) => kind === 'album')![1].filePath, 'xhsfile://tmp/image.png');
  const note = calls.find(([kind]) => kind === 'note')![1];
  assert.equal(note.pageType, 'photo_publish');
  assert.equal(note.title, '做一块自己的灯牌或手幅');
  assert.match(String(note.content), /文案库/);
  assert.match(String(note.content), /配色、装饰、横竖屏与滚动/);
  assert.deepEqual(note.mediaInfo, { image_resources: [{ url: 'xhsfile://tmp/image.png' }] });
  const comment = calls.find(([kind]) => kind === 'comment')![1];
  const payload = comment.payload as Result;
  assert.match(String(payload.content), /灯牌和手幅都能选文案、换样式/);
  assert.deepEqual(payload.media_bean, [{ media_type: 'image', cover_image_url: 'xhsfile://tmp/image.png' }]);
  assert.deepEqual(JSON.parse(String(payload.miniToolSnapshotInfo)), { text: '加油' });
  assert.equal(comment.saveToAlbum, false);
});

test('photo publishing sets pageType only on supported clients and keeps legacy image publishing available', async () => {
  for (const version of [9430001, 9429001, null]) {
    let note: Options | undefined;
    environment({
      postNote: options => { note = options; options.success({ errMsg: 'postNote:ok' }); },
    }, version);
    await shareImage(image, 'note');
    assert.ok(note);
    assert.deepEqual(note.mediaInfo, { image_resources: [{ url: image }] });
    if (version !== null && Math.floor(version / 1000) >= 9430) {
      assert.equal(note.pageType, 'photo_publish');
    } else {
      assert.equal(Object.prototype.hasOwnProperty.call(note, 'pageType'), false);
    }
  }
});

test('follow author uses the current mini-tool author status API', async () => {
  const calls: string[] = [];
  environment({
    getFollowStatus: options => { calls.push('status'); options.success({ follow_status: 0 }); },
    followAuthor: options => { calls.push('follow'); options.success({ follow_status: 1 }); },
  });
  assert.equal(await getFollowStatus(), 0);
  assert.equal(await followAuthor(), 1);
  assert.deepEqual(calls, ['status', 'follow']);
});

test('snapshot limits use UTF-8 bytes and prevent invalid native sharing', async () => {
  let writes = 0;
  environment({
    writeTempFile: options => { writes += 1; options.success({ filePath: 'xhsfile://tmp/image.png' }); },
    interactionOpenApi: options => options.success({ routed: true }),
  });
  await assert.rejects(shareImage(image, 'comment', { text: '加'.repeat(900) }), /太长/);
  assert.equal(writes, 0);
  await shareImage(image, 'comment', { text: '加'.repeat(100) });
  assert.equal(writes, 1);
});

test('comment snapshots accept exactly 2048 UTF-8 bytes and reject 2049', async () => {
  let comments = 0;
  environment({
    writeTempFile: options => options.success({ filePath: 'xhsfile://tmp/boundary.png' }),
    interactionOpenApi: options => { comments += 1; options.success({ routed: true }); },
  });
  const atLimit = { text: 'x'.repeat(2037) };
  assert.equal(new Blob([JSON.stringify(atLimit)]).size, 2048);
  await shareImage(image, 'comment', atLimit);
  await assert.rejects(shareImage(image, 'comment', { text: 'x'.repeat(2038) }), /太长/);
  assert.equal(comments, 1);
});

test('comment media rejects absolute and browser paths without rewriting native handles', async () => {
  for (const filePath of ['/tmp/image.png', 'file:///tmp/image.png', 'C:\\tmp\\image.png', '\\\\server\\image.png', 'blob:preview-image']) {
    let comments = 0;
    environment({
      writeTempFile: options => options.success({ filePath }),
      interactionOpenApi: options => { comments += 1; options.success({ routed: true }); },
    });
    await assert.rejects(shareImage(image, 'comment'), /不能用于评论/);
    assert.equal(comments, 0);
  }
  let received = '';
  environment({
    writeTempFile: options => options.success({ filePath: '/tmp/album-image.png' }),
    saveImageToPhotosAlbum: options => { received = String(options.filePath); options.success({}); },
  });
  await saveImage(image);
  assert.equal(received, '/tmp/album-image.png');
});

test('release behavior without an injected SDK never attempts a browser download', async () => {
  environment();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => { assert.fail('release must not create download elements'); },
  } });
  await assert.rejects(saveImage(image), NativeUnavailableError);
});

test('album denial and missing SDK never fall through to browser download', async () => {
  const { mockWindow } = environment({
    writeTempFile: options => options.success({ filePath: 'xhsfile://tmp/image.png' }),
    saveImageToPhotosAlbum: options => options.fail({ errMsg: 'saveImageToPhotosAlbum:fail auth deny' }),
  });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => { assert.fail('native failures must never create a download link'); },
  } });
  await assert.rejects(saveImage(image), /权限/);
  mockWindow.xhs = {};
  await assert.rejects(saveImage(image), NativeUnavailableError);
  mockWindow.xhs = undefined;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'XiaoHongShu/9.49' } });
  await assert.rejects(saveImage(image), NativeUnavailableError);
});

test('native insets combine safe-area edges and visible menu buttons', async () => {
  environment({
    getWindowInfo: options => options.success({
      windowWidth: 375, windowHeight: 812,
      safeArea: { top: 20, left: 16, right: 359, bottom: 778 },
      menuButtons: { back: null, me: null, share: { bottom: 44 } },
    }),
  });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    body: { appendChild: () => {} },
    createElement: () => ({ style: { cssText: '' }, remove: () => {} }),
  } });
  Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: () => ({
    paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px',
  }) });
  assert.deepEqual(await getInsets(), { top: 44, right: 16, bottom: 34, left: 16 });
});
