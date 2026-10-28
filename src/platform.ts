/** Public miniTool bridge contract, verified against the 2026-10-22 docs. */
declare const __CHEERBOARD_BROWSER_PREVIEW__: boolean;
// Vite replaces this guard at build time, removing browser-only capabilities
// from the uploaded package. The typeof guard also supports the Node tests.
const browserPreview = typeof __CHEERBOARD_BROWSER_PREVIEW__ !== 'undefined' && __CHEERBOARD_BROWSER_PREVIEW__;
type NativeResult = Record<string, unknown>;
type NativeOptions = Record<string, unknown> & {
  success?: (result: NativeResult) => void;
  fail?: (error: unknown) => void;
};
type NativeMethod = (options?: NativeOptions) => unknown;
type MethodName = 'getLaunchOptions' | 'getWindowInfo' | 'getStorage' | 'setStorage'
  | 'writeTempFile' | 'saveImageToPhotosAlbum' | 'postNote' | 'interactionOpenApi'
  | 'followAuthor' | 'getFollowStatus';
type MiniTool = Partial<Record<MethodName, NativeMethod>>;
interface XhsSdk {
  miniTool?: MiniTool;
  launchOptions?: NativeResult;
}
type XhsWindow = Window & { xhs?: XhsSdk };
export interface Insets { top: number; right: number; bottom: number; left: number }
const storageWrites = new Map<string, Promise<void>>();
let versionProbe: { bridge: MiniTool; promise: Promise<number>; expires: number } | null = null;

class NativeCallError extends Error {
  readonly nativeMessage: string;
  constructor(message: string, nativeMessage: string) {
    super(message);
    this.nativeMessage = nativeMessage;
    this.name = 'NativeCallError';
  }
}

export class NativeUnavailableError extends Error {
  constructor(message = '请在支持此功能的小红书客户端中打开；设计仍保留在当前页面。') {
    super(message);
    this.name = 'NativeUnavailableError';
  }
}

function sdk(): XhsSdk | undefined {
  return (window as XhsWindow).xhs;
}

export function isNative(): boolean {
  return Boolean(sdk());
}

export function isBrowserPreview(): boolean {
  return browserPreview && !isNative();
}

function asRecord(value: unknown): NativeResult {
  return value !== null && typeof value === 'object' ? value as NativeResult : {};
}

function parseStoredData(value: unknown): unknown {
  if (value === null || typeof value === 'undefined') return null;
  if (typeof value !== 'string') return value;
  let source = value.replace(/^\uFEFF/, '').trim();
  if (!source) return null;
  for (let depth = 0; depth < 3; depth++) {
    const parsed = JSON.parse(source) as unknown;
    if (typeof parsed !== 'string') return parsed;
    source = parsed.replace(/^\uFEFF/, '').trim();
  }
  return JSON.parse(source) as unknown;
}

function platformError(error: unknown): Error {
  if (error instanceof Error) return error;
  const details = asRecord(error);
  const message = typeof details.errMsg === 'string' ? details.errMsg : '';
  // The public docs do not assign universal permission/cancel error codes.
  // Do not interpret unrelated API-specific codes as album authorization errors.
  if (/permission|auth.*den|deny|denied|拒绝|权限|未授权/i.test(message)) {
    return new Error('未获得所需权限，请在系统设置中检查小红书的相册权限后重试。');
  }
  if (/cancel|取消/i.test(message)) return new Error('操作已取消，设计已保留。');
  return new NativeCallError('操作未完成，请稍后重试或先保存图片。' + (message ? '（' + message + '）' : ''), message);
}

function hasMethod(name: MethodName): boolean {
  const bridge = sdk()?.miniTool;
  return Boolean(bridge && typeof bridge[name] === 'function');
}

async function waitForMethod(name: MethodName, timeout = 2_000): Promise<boolean> {
  if (hasMethod(name) || browserPreview || typeof document === 'undefined') return hasMethod(name);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline && !hasMethod(name)) {
    await new Promise<void>(resolve => window.setTimeout(resolve, 50));
  }
  return hasMethod(name);
}

/** Callback options are intentional: documented SDK then returns undefined. */
function invoke(name: MethodName, options: NativeResult = {}, timeout = 60_000): Promise<NativeResult> {
  const bridge = sdk()?.miniTool;
  const method = bridge && bridge[name];
  if (typeof method !== 'function') return Promise.reject(new NativeUnavailableError());
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('暂未收到操作结果，请先检查相册或发布页；设计已保留。'));
    }, timeout);
    const success = (result: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      const record = asRecord(result);
      if (typeof record.errMsg === 'string' && /:fail\b/.test(record.errMsg)) {
        reject(platformError(record));
      } else {
        resolve(record);
      }
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(platformError(error));
    };
    try {
      const result = method.call(bridge, { ...options, success, fail });
      // Also accommodate Promise implementations and faithful browser mocks.
      if (result && typeof asRecord(result).then === 'function') {
        Promise.resolve(result).then(success, fail);
      }
    } catch (error) {
      fail(error);
    }
  });
}

function readClientVersion(options: unknown): number {
  const build = Number(asRecord(asRecord(options).miniToolEnv).buildVersion);
  return Number.isFinite(build) && build > 0 ? Math.floor(build / 1000) : 0;
}

async function clientVersion(): Promise<number> {
  const sync = readClientVersion(sdk()?.launchOptions);
  if (sync) return sync;
  const bridge = sdk()?.miniTool;
  if (!bridge || !hasMethod('getLaunchOptions')) return 0;
  if (versionProbe && versionProbe.bridge === bridge && versionProbe.expires > Date.now()) return versionProbe.promise;
  const probe = { bridge, promise: Promise.resolve(0), expires: Infinity };
  versionProbe = probe;
  probe.promise = invoke('getLaunchOptions', {}, 2_500)
    .then(readClientVersion, () => 0)
    .then(version => {
      // Share the initial request, then cache a valid version for this SDK
      // instance. A failed probe gets a short cooldown, never a permanent 0.
      probe.expires = version ? Infinity : Date.now() + 30_000;
      return version;
    });
  return probe.promise;
}

/** A failed native write is surfaced, never silently replaced by another store. */
export async function saveLocal(key: string, value: unknown): Promise<void> {
  let data: string | undefined;
  try {
    data = JSON.stringify(value);
  } catch {
    throw new Error('这个设计无法保存，请先保存图片。');
  }
  if (typeof data !== 'string') throw new Error('这个设计无法保存，请先保存图片。');
  const serialized = data;
  const previous = storageWrites.get(key) || Promise.resolve();
  const write = previous.catch(() => {}).then(() => writeLocal(key, serialized));
  storageWrites.set(key, write);
  try {
    await write;
  } finally {
    if (storageWrites.get(key) === write) storageWrites.delete(key);
  }
}

async function writeLocal(key: string, data: string): Promise<void> {
  // The container only exposes this method on clients that support the
  // Storage API. Prefer capability detection so a slow or missing launch
  // options probe cannot make a working native store look unavailable.
  if (await waitForMethod('setStorage')) {
    await invoke('setStorage', { key, data, encrypt: false }, 8_000);
    return;
  }
  try {
    localStorage.setItem(key, data);
  } catch {
    throw new Error('本地保存失败，请先保存图片，避免设计丢失。');
  }
}

export async function loadLocal(key: string): Promise<unknown> {
  // A read after a save must observe that write, rather than an older snapshot.
  const pendingWrite = storageWrites.get(key);
  if (pendingWrite) await pendingWrite;
  let data: unknown;
  if (await waitForMethod('getStorage')) {
    try {
      data = (await invoke('getStorage', { key, encrypt: false }, 8_000)).data;
    } catch (error) {
      const message = error instanceof NativeCallError ? error.nativeMessage : error instanceof Error ? error.message : '';
      // Some client builds report a missing key via fail. Only explicit absence
      // is an empty store: permission, timeout and generic fail must stay errors.
      if (/(?:key|data|value|item|缓存|数据).{0,40}(?:not[ _-]*(?:found|exist)|不存在|未找到)|no[ _-]*such[ _-]*key/i.test(message)) data = null;
      else throw error;
    }
    // Upgrade path: a missing native value may still exist in the previous
    // low-version browser store. Migrate only validated JSON, without clearing
    // the old copy or pretending that a failed migration succeeded.
    if ((data === null || typeof data === 'undefined') && hasMethod('setStorage')) {
      let previous: string | null = null;
      try {
        previous = localStorage.getItem(key);
      } catch {
        // Native storage can remain usable when browser storage is unavailable.
      }
      if (previous !== null) {
        try {
          parseStoredData(previous);
        } catch {
          throw new Error('本地设计数据无法读取，请重新制作。');
        }
        await invoke('setStorage', { key, data: previous, encrypt: false }, 8_000);
        data = previous;
      }
    }
  } else {
    try {
      data = localStorage.getItem(key);
    } catch {
      throw new Error('暂时无法读取本地设计；仍可制作新牌并保存图片。');
    }
  }
  try {
    return parseStoredData(data);
  } catch {
    throw new Error('本地设计数据无法读取，请重新制作。');
  }
}

function requireImage(dataUrl: string): void {
  if (!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(dataUrl)) {
    throw new Error('图片尚未生成，请返回编辑页后重试。');
  }
}

async function imagePath(dataUrl: string, required: boolean): Promise<string> {
  requireImage(dataUrl);
  if (!hasMethod('writeTempFile')) {
    if (required) throw new NativeUnavailableError('当前客户端不支持生成评论图片，请更新小红书或改为保存图片。');
    return dataUrl;
  }
  const result = await invoke('writeTempFile', { data: dataUrl });
  if (typeof result.filePath !== 'string' || !result.filePath) {
    throw new Error('图片文件生成失败，请重试。');
  }
  if (/^(data:|https?:)/i.test(result.filePath)) throw new Error('客户端未返回可用的本地图片文件，请改为保存图片。');
  if (required && (/^(?:file:|blob:)/i.test(result.filePath) || /^(?:[\\/]|[A-Za-z]:[\\/])/.test(result.filePath))) {
    throw new Error('客户端返回的路径不能用于评论，请改为保存图片。');
  }
  return result.filePath;
}

export async function saveImage(dataUrl: string): Promise<void> {
  requireImage(dataUrl);
  if (isNative()) {
    if (!hasMethod('saveImageToPhotosAlbum')) throw new NativeUnavailableError();
    const filePath = await imagePath(dataUrl, false);
    await invoke('saveImageToPhotosAlbum', { filePath });
    return;
  }
  if (browserPreview) {
    const link = document.createElement('a');
    if (!('download' in link)) throw new Error('此浏览器不支持下载，请在小红书中保存图片。');
    link.href = dataUrl;
    link.download = '手机手幅-' + Date.now() + '.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return;
  }
  throw new NativeUnavailableError();
}

export async function shareImage(dataUrl: string, kind: 'comment' | 'note', snapshot?: unknown): Promise<void> {
  requireImage(dataUrl);
  if (!isNative()) throw new NativeUnavailableError('评论与笔记分享需要在小红书中使用；浏览器预览可先保存图片。');
  const api = kind === 'comment' ? 'interactionOpenApi' : 'postNote';
  if (!hasMethod(api)) throw new NativeUnavailableError('当前客户端不支持此分享方式，请更新小红书或先保存图片。');
  if (kind === 'comment' && await clientVersion() < 9490) {
    throw new NativeUnavailableError('晒到评论需要小红书 9.49 或更新版本，请更新客户端或先保存图片。');
  }
  if (kind === 'comment') {
    const payload: NativeResult = {
      action: 'post_comment',
      content: '我准备举这个牌',
    };
    if (typeof snapshot !== 'undefined') {
      const serialized = JSON.stringify(snapshot);
      if (typeof serialized !== 'string' || new Blob([serialized]).size > 2048) {
        throw new Error('设计信息太长，暂时无法晒到评论，请精简文字或保存图片。');
      }
      payload.miniToolSnapshotInfo = serialized;
    }
    const filePath = await imagePath(dataUrl, true);
    payload.media_bean = [{ media_type: 'image', cover_image_url: filePath }];
    const result = await invoke('interactionOpenApi', { payload, saveToAlbum: false });
    if (result.routed !== true) throw new Error('评论编辑器未能打开，设计已保留，请重试或先保存图片。');
    return;
  }
  const filePath = await imagePath(dataUrl, false);
  const version = await clientVersion();
  await invoke('postNote', {
    title: '做一块自己的灯牌或手幅',
    content: '用手机手幅从文案库选一句，做一块自己的灯牌或手幅；点阵、描边、霓虹、纯色和红蓝重影都能换，配色、装饰、横竖屏与滚动也可以调整。可以保存到相册、晒到评论或发布成笔记。现场展示请以当场规定为准，回合中收起，勿遮挡他人。发布前请检查图片、正文和是否挂载小工具。',
    ...(version >= 9430 ? { pageType: 'photo_publish' } : {}),
    mediaInfo: { image_resources: [{ url: filePath }] },
  }, 180_000);
}

function followStatus(result: NativeResult): number {
  const value = Number(result.follow_status);
  return value === 0 || value === 1 || value === 2 ? value : -1;
}

/** The API can only target the author of the current mini-tool. */
export async function getFollowStatus(): Promise<number> {
  if (!(await waitForMethod('getFollowStatus'))) return -1;
  try { return followStatus(await invoke('getFollowStatus', {}, 8_000)); } catch { return -1; }
}

export async function followAuthor(): Promise<number> {
  if (!(await waitForMethod('followAuthor'))) throw new NativeUnavailableError('当前客户端暂不支持关注作者，请更新小红书后重试。');
  return followStatus(await invoke('followAuthor', {}, 30_000));
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function browserInsets(): Insets {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;'
    + 'padding:0;padding-top:constant(safe-area-inset-top);padding-right:constant(safe-area-inset-right);'
    + 'padding-bottom:constant(safe-area-inset-bottom);padding-left:constant(safe-area-inset-left);'
    + 'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);'
    + 'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);'
    + 'padding-top:var(--safe-area-inset-top,env(safe-area-inset-top,0px));'
    + 'padding-right:var(--safe-area-inset-right,env(safe-area-inset-right,0px));'
    + 'padding-bottom:var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px));'
    + 'padding-left:var(--safe-area-inset-left,env(safe-area-inset-left,0px));';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const result = {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
  probe.remove();
  return result;
}

export async function getInsets(): Promise<Insets> {
  const fallback = browserInsets();
  if (!hasMethod('getWindowInfo') || await clientVersion() < 9490) return fallback;
  try {
    const info = await invoke('getWindowInfo', {}, 8_000);
    const safe = asRecord(info.safeArea);
    const buttons = asRecord(info.menuButtons);
    const width = finite(info.windowWidth);
    const height = finite(info.windowHeight);
    const top = Math.max(fallback.top, finite(safe.top),
      ...['back', 'me', 'share'].map((name) => finite(asRecord(buttons[name]).bottom)));
    return {
      top: height > 0 ? Math.min(height, top) : top,
      right: Math.max(fallback.right, width > 0 && typeof safe.right === 'number' ? width - finite(safe.right) : 0),
      bottom: Math.max(fallback.bottom, height > 0 && typeof safe.bottom === 'number' ? height - finite(safe.bottom) : 0),
      left: Math.max(fallback.left, finite(safe.left)),
    };
  } catch {
    return fallback;
  }
}
