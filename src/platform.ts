/** Public miniTool bridge contract, verified against the 2026-10-22 docs. */
type NativeResult = Record<string, unknown>;
type NativeOptions = Record<string, unknown> & {
  success?: (result: NativeResult) => void;
  fail?: (error: unknown) => void;
};
type NativeMethod = (options?: NativeOptions) => unknown;
type MethodName = 'getLaunchOptions' | 'getWindowInfo' | 'getStorage' | 'setStorage'
  | 'writeTempFile' | 'saveImageToPhotosAlbum' | 'postNote' | 'interactionOpenApi';
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
  return Boolean(sdk()) || /xiaohongshu|\bxhs\b|redapp/i.test(navigator.userAgent);
}

function asRecord(value: unknown): NativeResult {
  return value !== null && typeof value === 'object' ? value as NativeResult : {};
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
  if (await clientVersion() >= 9460 && hasMethod('setStorage')) {
    await invoke('setStorage', { key, data }, 8_000);
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
  if (await clientVersion() >= 9460 && hasMethod('getStorage')) {
    try {
      data = (await invoke('getStorage', { key }, 8_000)).data;
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
          JSON.parse(previous);
        } catch {
          throw new Error('本地设计数据无法读取，请重新制作。');
        }
        await invoke('setStorage', { key, data: previous }, 8_000);
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
  if (data === null || typeof data === 'undefined') return null;
  if (typeof data !== 'string') throw new Error('本地设计数据无效，请重新制作。');
  try {
    return JSON.parse(data) as unknown;
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
  // This path is exclusively for regular browser previews. a[download] is
  // prohibited in the miniTool sandbox and is never its native fallback.
  const link = document.createElement('a');
  if (!('download' in link)) throw new Error('此浏览器不支持下载，请在小红书中保存图片。');
  link.href = dataUrl;
  link.download = '手机手幅-' + Date.now() + '.png';
  document.body.appendChild(link);
  link.click();
  link.remove();
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
      content: '做好我的加油牌了！',
    };
    if (typeof snapshot !== 'undefined') {
      const serialized = JSON.stringify(snapshot);
      if (typeof serialized !== 'string' || new Blob([serialized]).size >= 2048) {
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
  await invoke('postNote', {
    title: '做一块自己的加油牌',
    content: '用手机手幅做的加油牌。现场使用请遵守当场规定，勿遮挡他人。发布前可检查并手动挂载小工具。',
    mediaInfo: { image_resources: [{ url: filePath }] },
  }, 180_000);
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
    + 'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);';
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
