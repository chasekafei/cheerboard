# 小红书小工具在线文档快照

来源：https://miniapp-sandbox.xiaohongshu.com/minitool/doc
获取日期：2026-10-25
页面标题：小工具容器能力清单 · 小红书

小红书 · 小工具开发者文档
小工具容器 · 能力清单

面向小工具开发者，说明小红书小工具容器内 哪些 Web 能力可用、哪些不可用，以及容器提供的 平台 JS API（AI 文本生成 / 发笔记 / 关注作者 / 存相册 / 本地缓存 / 文件系统 / 评论区 / 窗口信息 / 定位 / 振动 / 陀螺仪）。
创作或改写小工具时，请先复制小工具上传页提供的完整改写口令，交给 AI 助手按口令执行。

适用 iOS / Android 双端（除注明外一致） · 最后更新 2026-10-22
目 录
1. 运行环境
2. 可用能力
2.1 页面与渲染
2.2 JS / CSS 兼容基线
2.3 媒体与文件
2.4 数据存储
2.5 交互
2.6 资源加载规则
3. 平台 JS API
3.1 调用约定
3.2 API 一览
3.3 发布笔记
3.4 保存图片到相册
3.5 临时文件
3.6 客户端版本判断
3.7 小工具本地缓存
3.8 文件系统
3.9 发布评论
3.10 AI 文本生成
3.11 窗口信息
3.12 定位
3.13 振动反馈
3.14 陀螺仪
3.15 关注作者
4. 不可用能力
4.1 禁用 Web API
4.2 禁用行为
4.3 移动端不支持
5. WebGL / 图形计算边界
6. 常见问题 FAQ
01
运行环境

小工具是运行在受限沙箱环境里的纯 Web 应用（HTML / CSS / JS），请把它当作一个"能力受限的浏览器页面"来开发。

📋
创作入口：使用小工具上传页的改写口令。
无论从零创作还是改写现有 H5，都应在上传页“第一步：调整为符合小红书规范的代码格式”中 完整复制当前口令并发送给工作区内的 AI 助手。AI 助手须按口令下载对应版本 Skill、 解压到指定目录、读取 SKILL.md，再对当前产物进行校验、修复和打包；完成后将生成的 zip 用于上传页第二步。本能力清单用于解释容器边界，不能代替上传页口令，也不要沿用手工保存的旧口令。
技术栈
标准 Web 技术栈

使用标准 HTML / CSS / JS 与标准 Web API 开发，最终产物须符合 Chrome 61 兼容基线。

兼容性
Android 8.1 / Chrome 61

Android 端按出厂 Chrome / WebView 61 的最低能力交付；iOS 支持的额外能力仅作增强。

平台能力
JS API（window.xhs）

容器自动注入 JS API SDK，可调用 AI 文本生成、发布笔记、关注作者、保存相册、 窗口信息、定位、振动和陀螺仪等能力（详见 §3），无需自行引入脚本。

沙箱
安全沙箱

容器对部分敏感 Web 能力做了限制（详见下文），并对文件选择、页面跳转等做了统一管控。

隔离
独立隔离

每个小工具拥有独立的存储与运行环境，小工具之间互相隔离、无法访问彼此数据，也无法互相通信。

网络边界
页面不能主动联网

页面、脚本、图片、字体等资源必须打包在小工具内，网页不能直接请求外部服务。 可用平台能力以 §3 的公开说明为准。

02
可用能力
2.1 页面与渲染
能力	说明
HTML / CSS / JS	支持 Chrome 61 基线内的标准能力；新语法、新 API 与现代 CSS 须转译、检测或降级，详见 §2.2
内联样式	<style> 与 style="" 均可用
页面内脚本	页面自带的脚本可正常执行
Canvas 2D	canvas.getContext('2d')，完整支持
WebGL	getContext('webgl' / 'webgl2')，纯渲染可用（能力边界见 §5）
文本选择	不限制
2.2 JS / CSS 兼容基线

小工具最低兼容 Android 8.1 出厂 Chrome / WebView 61，iOS 最低支持 iOS 18.4。

JavaScript：最终交付代码须编译到 ES2017 / Chrome 61；更高版本语法由构建工具转译。
CSS：最终样式须兼容 Chrome 61；更高版本 CSS 只能作为增强，并保留基础样式。
能力检测：使用 Chrome 61 基线外的高级 Web API 或 CSS 能力前，必须先检测是否支持； 支持时启用增强，不支持时走降级路径。

开发方式：请复制小工具上传页提供的完整改写口令，让 AI 助手加载对应版本 Skill， 并严格按照 SKILL.md 完成开发、兼容处理、校验和打包。具体开发规则以 Skill 为准。

2.3 媒体与文件
能力	用法	说明
摄像头	getUserMedia({ video })	需用户在系统弹窗中授权
麦克风	getUserMedia({ audio })	需用户在系统弹窗中授权
选择图片 / 拍照	<input type="file">	系统选择器接管，仅支持选择图片和视频（无论 accept 如何设置）
音视频播放	<video> / <audio>	支持内联播放
2.4 数据存储
能力	说明
Storage JS API	推荐的小工具本地缓存方案；版本要求与判断见 §3.6，API 见 §3.7
文件系统 JS API	用于持久文件和二进制数据；客户端 9.49+ 可用，API 见 §3.8
localStorage / sessionStorage / IndexedDB / Cookie / Cache API	仅作为未满足 §3.6 版本条件时的兼容降级方案
⚠️
不要把浏览器自带存储当作可靠的持久化方案。 小工具容器无法保证 localStorage、sessionStorage、 IndexedDB、Cookie 或 Cache API 始终可用，也无法保证其数据持续有效。 兼容低版本客户端时，所有读写都要做异常处理，并能容忍数据缺失、失效或被清理。 客户端从低版本升级到支持 Storage JS API 的版本时，开发者需自行维护不同存储方案之间的数据迁移与一致性。
数据仅属于当前小工具，其他小工具与外部无法访问。请勿假设数据永久持久化。
2.5 交互
能力	说明
alert() / confirm()	可用，以原生 UI 展示
振动反馈	使用平台 JS API vibrateShort / vibrateLong， 参数与设备差异见 §3.13
2.6 资源加载规则

小工具页面资源本地运行、不能直接联网，容器对页面如何加载各类资源有明确约束（对应浏览器 CSP 限制）。所有资源须打包在小工具内（下表"包内资源"），另按类型额外允许 data: / blob: 等内存来源。

资源类型	允许的加载方式	不允许
脚本 <script>	✅ 引用包内脚本 <script src="./app.js">（同源外链）	🔴 内联 <script>...</script>
🔴 行内事件 onclick="..." 等、javascript: URI
🔴 eval() / new Function()、WebAssembly
🔴 外部域名脚本、data: / blob: 脚本
样式 <style> / <link>	✅ 内联 <style>、style="..." 行内样式
✅ 引用包内样式表	🔴 外部域名样式表
图片 <img> / CSS 背景图	✅ 包内图片 <img src="./a.png">
✅ data: URI（base64 内嵌）
✅ blob:（createObjectURL 内存对象，如选图预览）	🔴 外部域名图片
字体 @font-face	✅ 包内字体文件	🔴 外部域名字体
iframe / object	🔴 全部禁止	—
支持的文件类型

小工具包内仅支持以下文件类型：

文件类型	原因
.html	小工具主体，必须有且只有一个入口文件
.css	样式文件，虽然口令要求内联，但不排除用户分开放
.js	脚本文件，同上
.png / .jpg / .jpeg / .gif / .webp / .svg	图片资源，内联 base64 太大时用户可能分开放
.woff / .woff2	字体文件，本地字体场景
.json	静态数据文件，部分小工具需要读取本地配置数据
实践要点
脚本必须外置：容器禁止内联脚本与行内事件处理器，请把 JS 写进包内 .js 文件用 <script src> 引入，事件绑定改用 addEventListener（不要用 onclick= 属性）。
样式可内联：<style> 和 style="..." 都能用，无需外置。
选图预览用 <img src> 配 data: 或 blob: 均可显示（如 FileReader.readAsDataURL 或 URL.createObjectURL）。
💡
外部 CDN 一律加载不到，所有资源请全部打包进小工具。
03
平台 JS API

除标准 Web 能力外，容器会自动注入 JS API SDK，小工具可通过 window.xhs.miniTool.* 调用 App 原生能力：发布笔记、保存图片到相册、 本地缓存、文件读写、发布评论、关注作者、窗口信息、定位、振动和陀螺仪； 通过 window.xhs.AI 调用平台对话模型。 无需在包内引入任何 SDK 脚本。

3.1 miniTool 调用约定
项	规则
唯一入口	端能力只能通过本文公开的 window.xhs.miniTool 方法调用，参数形式见各节；未列出的能力不受支持
一次性异步调用	通过 <apiName>(options) 调用。 传入 success / fail / complete 任一回调时返回 undefined；都不传则返回 Promise
异步调用成功	resolve / success 收到结果对象，含 errMsg: "<api>:ok" 及该 API 的业务字段
异步调用失败	reject / fail 收到 { errMsg: "<api>:fail ...", errCode? }；参数不合法时会在本地直接失败，不上行
事件监听	onGyroscopeChange(callback) / offGyroscopeChange(callback?) 直接接收监听函数，同步返回 undefined，不接受 success / fail / complete。数据回调收到 { x, y, z }，不带 errMsg；生命周期见 §3.14
参数校验	按各接口声明传入字段、类型和枚举值，表中未声明的字段不要传。 事件监听方法传入非法回调参数时会同步抛出 TypeError
可用性判断	调用前用 window.xhs && window.xhs.miniTool 判空， 再检查具体方法是否为函数；方法存在时仍需处理调用失败，并准备降级路径
// Promise 形态
async function saveImage(filePath) {
  const miniTool = window.xhs && window.xhs.miniTool;
  if (!miniTool || typeof miniTool.saveImageToPhotosAlbum !== "function") return;

  try {
    await miniTool.saveImageToPhotosAlbum({ filePath });
  } catch (err) {
    console.log(err.errMsg); // "saveImageToPhotosAlbum:fail ..."
  }
}

// 回调形态（返回 undefined）
function saveImageWithCallbacks(filePath) {
  const miniTool = window.xhs && window.xhs.miniTool;
  if (!miniTool || typeof miniTool.saveImageToPhotosAlbum !== "function") return;

  miniTool.saveImageToPhotosAlbum({
    filePath,
    success: (res) => console.log(res.errMsg),
    fail: (err) => console.log(err.errMsg),
    complete: () => {},
  });
}
3.2 API 一览
API	能力	可替代 / 适用场景	形态
postNote	唤起笔记发布页，带入标题 / 正文 / 图片 / 视频	网页无法直接发布笔记时使用	异步
saveImageToPhotosAlbum	保存图片到系统相册	替代 <a download> / Blob 下载保存图片	异步
writeTempFile	把 base64 数据写成容器内临时文件，换取 filePath	需要向其他端 API 传本地路径时使用	异步
getLaunchOptions	异步获取客户端启动参数	读取 miniToolEnv.buildVersion 做客户端版本判断	异步
setStorage / getStorage /
getStorageInfo / removeStorage / clearStorage	小工具本地缓存（版本要求见 §3.6）	替代 localStorage / IndexedDB / Cookie / Cache API	异步
saveFile / writeFile /
appendFile / readFile / readDir /
statFile / unlink / mkdir /
getFileStorageInfo	小工具本地文件的保存、读写、查询与管理	持久文件、二进制数据和大文件分片读写（客户端 9.49+）	异步
interactionOpenApi	携带评论草稿打开评论编辑器	分享小工具生成的文本或图片（客户端 9.49+）	异步
AI.createModel(...).generateText(...)	调用平台对话模型生成文本	AI 对话、文案生成、灵感辅助与个性化解读（内测加白）	Promise / 非流式
getWindowInfo	获取容器窗口尺寸、安全区和顶部按钮位置	页面布局与原生按钮避让（客户端 9.49+）	异步
getLocation	获取单次定位	替代网页 navigator.geolocation（客户端 9.49+）	异步
vibrateShort	触发短振动，指定轻 / 中 / 重强度	点击等操作的触感反馈（客户端 9.50+）	异步
vibrateLong	触发长振动	需要长振动的交互反馈（客户端 9.50+）	异步
startGyroscope	开始陀螺仪采集	获取角速度前启动采集（客户端 9.50+）	异步
stopGyroscope	停止陀螺仪采集	结束使用时停止采集（客户端 9.50+）	异步
onGyroscopeChange	注册角速度数据监听	接收 x / y / z 数据（客户端 9.50+）	同步注册监听
offGyroscopeChange	移除角速度数据监听	解除指定或全部监听（客户端 9.50+）	同步移除监听
followAuthor	引导关注当前小工具作者	关注作者及刷新关注按钮状态（客户端 9.51+）	异步
getFollowStatus	查询当前用户与小工具作者的关注状态	渲染关注 / 已关注状态（客户端 9.51+）	异步
💡
媒体类字段（图片 / 视频 / 封面）只接受 data: base64 或本地文件路径（容器不联网，网络地址不可用）。体积较大的 base64 建议先用 writeTempFile 换成 filePath 再传。
3.3 postNote — 发布笔记

唤起 App 笔记发布页，并带入小工具产出的内容与媒体。用户在发布页可继续编辑或取消。

字段	类型	必填	说明
title	string	否	标题，最长 20 字
content	string	否	正文，最长 1000 字
pageType	string	否	页面类型：video_publish / photo_publish / slides_edit（客户端 9.43+）
mediaInfo	object	是	媒体信息，下列三种资源至少传一种，可同时传
mediaInfo.image_resources	{ url }[]	否	图片，1–18 张；url 为 base64 或本地路径
mediaInfo.video_resources	{ video_url, cover_url? }	否	单个视频，cover_url 为可选封面
mediaInfo.live_photo_sources	{ url, video_url }[]	否	实况照片，1–18 组；url 为封面，video_url 为视频（客户端 9.43+）
// 图文笔记
await window.xhs.miniTool.postNote({
  title: "我的作品",
  content: "用小工具生成的",
  pageType: "photo_publish",
  mediaInfo: {
    image_resources: [{ url: "data:image/png;base64,iVBORw0KGgo..." }],
  },
});

// 视频笔记
await window.xhs.miniTool.postNote({
  pageType: "video_publish",
  mediaInfo: {
    video_resources: { video_url: videoPath, cover_url: coverPath },
  },
});

// 实况笔记（客户端 9.43+）
await window.xhs.miniTool.postNote({
  pageType: "slides_edit",
  mediaInfo: {
    live_photo_sources: [{ url: coverPath, video_url: videoPath }],
  },
});
⚠️
成功回调只代表发布页已被唤起并由用户点击发布，不代表笔记最终审核通过。请勿依赖它做强一致的业务状态。
3.4 saveImageToPhotosAlbum — 保存图片到相册
字段	类型	必填	说明
filePath	string	是	本地图片：data: base64 或 writeTempFile 返回的路径；不支持 http(s):// 网络地址
// Canvas 导出直接保存
const dataUrl = canvas.toDataURL("image/png");
await window.xhs.miniTool.saveImageToPhotosAlbum({ filePath: dataUrl });
需由用户主动操作（点击等）触发，首次调用可能弹出系统相册权限弹窗；用户拒绝授权会走失败回调。
大图建议先 writeTempFile 落成文件再保存，避免超长 base64 上行。
3.5 writeTempFile — base64 转临时文件

把内存里的 base64（Canvas 导出、选图预览结果等）写成容器内的临时文件，换取可传给其他 JS API 的 filePath。

字段	类型	必填	说明
data	string	是	base64 数据（支持带 data: 前缀的 data URI）
filePath（返回）	string	—	写入后的临时文件路径
const { filePath } = await window.xhs.miniTool.writeTempFile({
  data: canvas.toDataURL("image/png"),
});

await window.xhs.miniTool.saveImageToPhotosAlbum({ filePath });
// 或带入发布页
await window.xhs.miniTool.postNote({
  mediaInfo: { image_resources: [{ url: filePath }] },
});
返回的是临时文件，不保证长期有效，请即用即弃，不要持久化保存该路径。
仅支持常见图片 / 视频类型（png、jpeg、webp、gif、mp4），其他类型会失败。
3.6 客户端版本判断
💡
buildVersion 的末 3 位是编译 / 打包序号，判断客户端版本时必须忽略。 例如 9462004 表示客户端 9.46.2、编译序号 004。

window.xhs、launchOptions、miniToolEnv 和 buildVersion 都可能缺失，同步读取时必须逐级判空。同步值不存在时， 在确认 window.xhs.miniTool.getLaunchOptions 是函数后，再异步获取客户端值。 两种方式都无法取到版本号时，按不支持 Storage JS API 处理。

function readBuildVersion(launchOptions) {
  const miniToolEnv = launchOptions && launchOptions.miniToolEnv;
  return Number(miniToolEnv && miniToolEnv.buildVersion) || 0;
}

async function getBuildVersion() {
  const xhs = window.xhs;
  const syncBuildVersion = readBuildVersion(xhs && xhs.launchOptions);
  if (syncBuildVersion) return syncBuildVersion;

  const miniTool = xhs && xhs.miniTool;
  if (!miniTool || typeof miniTool.getLaunchOptions !== "function") return 0;

  try {
    const launchOptions = await miniTool.getLaunchOptions();
    return readBuildVersion(launchOptions);
  } catch (error) {
    return 0;
  }
}

function getClientVersion(buildVersion) {
  // 例如 9462004 / 1000 取整后为 9462，即客户端 9.46.2
  return Math.floor(buildVersion / 1000);
}

function isClientVersionAtLeast(buildVersion, minimumClientVersion) {
  return getClientVersion(buildVersion) >= minimumClientVersion;
}
3.7 Storage — 小工具本地缓存
💡
客户端满足 §3.6 的版本条件时，使用 Storage JS API 持久化业务数据。 未满足版本条件时可按需降级到浏览器存储，但必须容忍写入失败或数据丢失。
const STORAGE_MIN_CLIENT_VERSION = 9460; // 客户端 9.46.0

async function setLocalData(key, data) {
  let serializedData;
  try {
    serializedData = JSON.stringify(data);
  } catch (error) {
    return false;
  }
  if (typeof serializedData !== "string") return false;

  const buildVersion = await getBuildVersion();
  const miniTool = window.xhs && window.xhs.miniTool;

  if (
    isClientVersionAtLeast(buildVersion, STORAGE_MIN_CLIENT_VERSION) &&
    miniTool &&
    typeof miniTool.setStorage === "function"
  ) {
    try {
      await miniTool.setStorage({ key, data: serializedData });
      return true;
    } catch (error) {
      return false;
    }
  }

  // 仅用于兼容低版本客户端；容器不保证其可用性或持久性
  try {
    localStorage.setItem(key, serializedData);
    return true;
  } catch (error) {
    return false;
  }
}

调用方必须处理 setLocalData 返回 false 的情况， 不能假设数据已成功持久化。

API	参数	结果 / 说明
setStorage	key: string、data: string、encrypt?: boolean	写入或覆盖缓存；data 必须是 JSON 字符串
getStorage	key: string、encrypt?: boolean	返回 { data }；data 为 JSON 字符串，encrypt 须与写入时一致
getStorageInfo	无	返回 { keys, usedBytes, limitBytes }；usedBytes 为已用容量，limitBytes 为容量上限，单位均为字节
removeStorage	key: string	删除指定缓存
clearStorage	无	清空当前小工具的全部缓存
单个 key 最大 1 MB，当前小工具全部缓存最大 10 MB。
data 只支持 JSON 字符串。对象、数组等数据必须先用 JSON.stringify 序列化；读取后再用 JSON.parse 解析。
encrypt 默认为 false；读取时必须与写入时保持一致。
这些 API 同时支持 Promise 与 success / fail / complete 回调。
await window.xhs.miniTool.setStorage({
  key: "profile",
  data: JSON.stringify({ nickname: "小红薯" }),
});

const { data } = await window.xhs.miniTool.getStorage({ key: "profile" });
const profile = data === null ? null : JSON.parse(data);
const { keys, usedBytes, limitBytes } = await window.xhs.miniTool.getStorageInfo();

await window.xhs.miniTool.removeStorage({ key: "profile" });
await window.xhs.miniTool.clearStorage();
3.8 文件系统
💡
文件系统 API 需要客户端 9.49+。可复用 §3.6 的 getBuildVersion 与 isClientVersionAtLeast，以 9490 作为最低客户端版本判断。

文件和二进制数据使用文件系统保存。持久目录根路径由 launchOptions.miniToolEnv.userDataPath 提供；请只在该路径后拼接相对路径， 不要硬编码、解析或改写端上返回的文件句柄。

API	参数	结果 / 说明
saveFile	tempFilePath: string、filePath?: string | null	将临时文件移动到持久目录，返回 { savedFilePath }
writeFile	filePath: string、data: string、encoding: "utf8" | "base64"	覆盖写入，返回 { writtenBytes }
appendFile	filePath: string、data: string、encoding: "utf8" | "base64"	向文件末尾追加，返回 { writtenBytes }
readFile	filePath: string、encoding: "utf8" | "base64"、position?: number、length?: number	读取一个文件分片，返回 { data, bytesRead, eof }
readDir	dirPath: string	读取目录直接子项，返回 { files, truncated }
statFile	filePath: string	读取文件或目录信息，返回 { size, lastModified, isDir }
unlink	filePath: string	删除持久目录中的文件
mkdir	dirPath: string、recursive?: boolean	创建持久文件目录
getFileStorageInfo	无	返回 { usedBytes, limitBytes, fileCount, tmpUsedBytes, writeChunkMaxBytes, readChunkMaxBytes }
const miniTool = window.xhs && window.xhs.miniTool;
const launchOptions = await miniTool.getLaunchOptions();
const userDataPath = launchOptions.miniToolEnv.userDataPath;
const filePath = userDataPath + "/drafts/note.json";

await miniTool.writeFile({
  filePath,
  data: JSON.stringify({ title: "草稿" }),
  encoding: "utf8",
});

const { data } = await miniTool.readFile({
  filePath,
  encoding: "utf8",
});
writeFile 覆盖写入，appendFile 追加写入。大文件由业务自行分片：第一片用 writeFile，后续片串行调用 appendFile。
分片大小以 getFileStorageInfo 返回的 writeChunkMaxBytes 和 readChunkMaxBytes 为准，不要硬编码。
图片和视频渲染时直接使用文件句柄作为 img.src、video.src 或 CSS 资源；需要文件字节时才使用 readFile。
usr 是本地工作区而非备份空间。它不随容器关闭清空，但卸载、清数据或包清理后仍可能丢失，重要数据应可重建或引导用户导出。
3.9 interactionOpenApi — 发布评论
💡
评论区能力需要客户端 9.49+，并应由用户点击等主动操作触发。

用于唤起评论区并携带评论草稿；草稿字段遵循评论侧契约。容器会统一关闭小工具后再拉起评论区。

字段	类型	必填	说明
payload	object	是	评论草稿；由评论侧定义字段
payload.action	string	按评论侧契约	发布评论时使用 post_comment
payload.content	string	否	评论文本
payload.media_bean	array	否	有序图片列表；媒体路径使用本地文件句柄
payload.miniToolSnapshotInfo	string	否	小工具附加状态的 JSON 字符串，最大 2KB；超限时该字段无效
saveToAlbum	boolean	否	是否将 payload 中的图片同步保存到相册，默认 true
const result = await window.xhs.miniTool.interactionOpenApi({
  payload: {
    action: "post_comment",
    content: "快来和我 PK！",
    media_bean: [{
      media_type: "image",
      cover_image_url: imageFilePath,
    }],
    miniToolSnapshotInfo: JSON.stringify({ page: "result" }),
  },
  saveToAlbum: true,
});

// { routed, savedToAlbum, albumFailReason? }
目前仅支持图片，使用 { media_type: "image", cover_image_url }；视频和实况图不支持。
媒体路径必须是容器可访问的本地文件句柄；网络 URL、data: URI 和绝对路径不可用。
miniToolSnapshotInfo 有效时，用户从评论区重新打开小工具可读取该数据，用于恢复对应业务状态；恢复逻辑由开发者自行实现。
routed 表示评论侧路由是否成功。请求保存相册但失败时，失败原因会通过可选字段 albumFailReason 返回。
3.10 AI 文本生成（内测）
✨
平台已提供对话模型。无需 API key、自定义模型服务地址或 token 费用。 AI 能力仅在小红书 App 小工具容器中有效；内测阶段需先在群内提交 uid，由平台为对应 appId 加白。 未加白时调用会返回 AI_NOT_ALLOWED。

经典脚本通过 window.xhs.AI 创建模型，再调用 generateText()。本期仅支持非流式文本生成，回复会整段一次性返回。

const ai = window.xhs && window.xhs.AI;
if (!ai) {
  // 提示用户在支持该能力的小红书 App 中打开
  return;
}

const model = ai.createModel("deepseek-v4-flash");
const result = await model.generateText({
  messages: [
    { role: "system", content: "你是一位简洁、友好的灵感助手。" },
    { role: "user", content: userInput },
  ],
});

const text = (result.choices &&
  result.choices[0] &&
  result.choices[0].message &&
  result.choices[0].message.content) || "";
模型与参数
项	说明
deepseek-v4-flash	默认推荐；通用对话能力，遵循人设指令，表现稳定
dots-3-note-prev	小红书自研“点点”模型，自带点点人格和小红书调性
messages	最多 40 条、总计最多 12000 字符；role 使用 system / user / assistant
max_output_tokens	最大 2048；超出时自动收敛
temperature	范围 0–1.5
有记忆的对话页

平台不会保存会话上下文。页面内用数组维护 messages，每次调用全量传入； 只保留 system prompt 和最近十几轮。需要下次打开继续聊时，使用 §3.7 的 setStorage / getStorage 保存裁剪后的历史。

const messages = [
  { role: "system", content: "你是一位小红书文案灵感助手。" },
];
const model = window.xhs.AI.createModel("deepseek-v4-flash");

async function sendMessage(content) {
  messages.push({ role: "user", content });
  sendButton.disabled = true;
  loadingBubble.hidden = false;

  try {
    const result = await model.generateText({
      messages: [messages[0]].concat(messages.slice(1).slice(-20)),
      max_output_tokens: 800,
      temperature: 0.8,
    });
    const reply = (result.choices &&
      result.choices[0] &&
      result.choices[0].message &&
      result.choices[0].message.content) || "";

    messages.push({ role: "assistant", content: reply });
    answerElement.textContent = reply; // 模型输出仅按纯文本渲染
    await window.xhs.miniTool.setStorage({
      key: "ai-chat-history",
      data: JSON.stringify([messages[0]].concat(messages.slice(1).slice(-20))),
    });
    console.log("AI request_id:", result.request_id);
  } finally {
    loadingBubble.hidden = true;
    sendButton.disabled = false;
  }
}
⚠️
配额与内容安全：内测期每个用户每天最多调用 100 次；次数用完返回 AI_QUOTA_EXCEEDED。system prompt、用户输入和模型输出都会经过内容审核，命中时返回 AI_CONTENT_BLOCKED。成功响应包含 request_id，排查问题时请一并提供。 choices 可能为空，业务必须处理空结果。
已有外部模型怎么迁移
移除小工具包内的 API key 和自定义模型 URL，避免密钥泄漏。
保留现有 prompt、人设、交互和消息裁剪，只把模型调用替换为 window.xhs.AI。
真机调用后检查成功响应的 request_id，或确认收到平台 AI 错误码，以判断链路已经接通。
3.11 getWindowInfo — 获取窗口信息
💡
需要客户端 9.49+，以 9490 作为最低客户端版本判断，方法见 §3.6。

获取容器当前的窗口尺寸、安全区和顶部按钮位置，用于页面布局与原生按钮避让。

调用：getWindowInfo(options?)。参数：无。 这是异步接口，Promise / 回调与通用结果遵循 §3.1。

成功结果
💡
尺寸与坐标使用逻辑像素（Android 为 dp，iOS 为 pt），保留小数。 pixelRatio 是无单位的像素比。
字段	类型	说明
pixelRatio	number	设备像素比 DPR，无单位
screenWidth / screenHeight	number	屏幕或当前承载窗口的逻辑宽高；分屏、折叠屏下不能假定为整块物理屏尺寸
windowWidth / windowHeight	number	容器实际页面视口的逻辑宽高
statusBarHeight	number	状态栏的逻辑高度
screenTop	number	容器顶部相对所在屏幕或承载窗口原点的 y 坐标
safeArea	object	安全区域矩形，结构见下文
menuButtons	object	始终存在，包含 back / me / share； 各按钮值为矩形对象，不可见时为 null

矩形对象包含 left / top / right / bottom / width / height， 均为 number，使用上述逻辑像素单位。safeArea 和按钮矩形均使用 容器坐标系，以容器左上角为原点。right / bottom 表示坐标，满足 left + width = right、 top + height = bottom。

async function readWindowInfo() {
  const miniTool = window.xhs && window.xhs.miniTool;
  if (!miniTool || typeof miniTool.getWindowInfo !== "function") return;

  try {
    const info = await miniTool.getWindowInfo();
    console.log("容器逻辑尺寸", info.windowWidth, info.windowHeight);
    console.log("安全区域", info.safeArea);

    const shareButton = info.menuButtons && info.menuButtons.share;
    if (shareButton) {
      console.log("分享按钮区域", shareButton);
    }
    return info;
  } catch (err) {
    console.log(err.errMsg || err.message);
  }
}

readWindowInfo();
按返回的容器尺寸和矩形布局，避免硬编码状态栏高度、安全区或按钮位置。
读取顶部按钮前判断是否为 null；按钮隐藏时无需为其避让。
窗口形态或尺寸变化后，需要最新值时再次调用。
3.12 getLocation — 获取单次定位
💡
需要客户端 9.49+，以 9490 作为最低客户端版本判断，方法见 §3.6。

通过客户端获取一次定位。调用：getLocation(options?)， Promise / 回调与通用结果遵循 §3.1。

字段	类型	必填	说明
type	string	否	wgs84（GPS 坐标）或 gcj02（地图坐标）； 未传由客户端默认行为决定，地图场景显式传 gcj02
成功结果

除通用 errMsg 外，以下业务字段均可选，使用前先检查是否返回。

字段	类型	必有	说明
latitude	number	否	纬度，范围 [-90, 90]
longitude	number	否	经度，范围 [-180, 180]
speed	number	否	速度，单位 m/s
accuracy	number	否	位置精确度，单位 m
altitude	number	否	高度，单位 m
verticalAccuracy	number	否	垂直精度，单位 m；未返回时本次无该精度信息
horizontalAccuracy	number	否	水平精度，单位 m；未返回时本次无该精度信息
💡
双端均需兼容字段缺失：未返回的字段读取为 undefined，SDK 不会补齐为 0。精度字段返回 0，也不能据此认定定位完全精确。
async function locateOnce() {
  const miniTool = window.xhs && window.xhs.miniTool;
  if (!miniTool || typeof miniTool.getLocation !== "function") return;

  try {
    const location = await miniTool.getLocation({ type: "gcj02" });
    if (!Number.isFinite(location.latitude) ||
        !Number.isFinite(location.longitude)) {
      console.log("本次定位未返回完整经纬度");
      return;
    }

    if (!Number.isFinite(location.verticalAccuracy)) {
      console.log("本次无垂直精度信息");
    }
    if (!Number.isFinite(location.horizontalAccuracy)) {
      console.log("本次无水平精度信息");
    }

    // 精度字段不补成 0，返回 0 也不代表完全精确。
    // 在业务内存中使用原始结果，不打印精确坐标。
    return location;
  } catch (err) {
    console.log(err.errMsg || err.message, err.errCode);
  }
}

// 由用户发起定位的交互调用 locateOnce()，接收结果后交给业务使用。
授权、系统定位开关和相关失败由客户端处理，调用方需处理权限拒绝、定位失败等情况。
经纬度可能合法地为 0，用有限数检查，避免用真假值判断字段是否存在。
仅获取单次定位，不提供持续定位、后台定位或轨迹监听，避免轮询调用。
精确坐标只交给需要它的业务使用，不写入日志或埋点。
3.13 振动反馈
💡
vibrateShort / vibrateLong 需要客户端 9.50+， 以 9500 作为最低客户端版本判断，方法见 §3.6。

通过 vibrateShort / vibrateLong 提供触感反馈。 两者均为异步调用，遵循 §3.1；成功结果无额外业务字段。

API	参数	成功含义
vibrateShort({ type })	type 必填，指定短振动强度	已触发反馈，不表示振动已经结束
vibrateLong(options?)	无	已触发反馈，不表示振动已经结束
短振动参数
字段	类型	必填	说明
type	string	是	heavy 重 / medium 中 / light 轻； 无默认值
async function shortFeedback() {
  const miniTool = window.xhs && window.xhs.miniTool;
  if (!miniTool || typeof miniTool.vibrateShort !== "function") return;

  try {
    await miniTool.vibrateShort({ type: "medium" });
    // 调用成功不表示振动已经结束。
  } catch (err) {
    console.log(err.errMsg || err.message);
  }
}

async function longFeedback() {
  const miniTool = window.xhs && window.xhs.miniTool;
  if (!miniTool || typeof miniTool.vibrateLong !== "function") return;

  try {
    await miniTool.vibrateLong();
    // 调用成功不表示振动已经结束。
  } catch (err) {
    console.log(err.errMsg || err.message);
  }
}

// 短振、长振分别由相应的用户交互调用 shortFeedback() / longFeedback()。
无需申请运行时系统权限，建议结合用户交互使用并避免高频触发。
无马达或系统关闭触感反馈时，调用可能成功但无体感；不同强度的实际效果也受设备影响。
不支持自定义时长、波形或数值强度，长振动不承诺精确持续时长。
3.14 陀螺仪
💡
陀螺仪采集与监听接口均需要客户端 9.50+，以 9500 作为最低客户端版本判断，方法见 §3.6。

获取设备绕各轴旋转的角速度。采集启停与数据监听各自独立：先注册监听，再开始采集； 业务结束时停止采集并解除监听。

API	参数	返回与职责
startGyroscope(options?)	interval 可选，见下表	异步开始采集，遵循 §3.1
stopGyroscope(options?)	无	异步停止采集，遵循 §3.1，保留监听
onGyroscopeChange(callback)	必填函数	同步注册监听，返回 undefined；不启动采集
offGyroscopeChange(callback?)	可选函数	同步解除监听，返回 undefined；不停止采集
采样参数

startGyroscope 的 interval 为可选 string， 默认 normal。以下为采样档位，实际事件到达间隔受设备和运行状态影响。

interval	采样间隔	默认
ui	60 ms	否
normal	200 ms	是
监听数据

callback(frame) 每次收到一帧 { x, y, z }， 不带 errMsg；各字段表示角速度，不是姿态角。 startGyroscope / stopGyroscope 的成功结果无额外业务字段。

字段	类型	单位	说明
x	number	rad/s	绕 X 轴的角速度
y	number	rad/s	绕 Y 轴的角速度
z	number	rad/s	绕 Z 轴的角速度
function handleGyroscopeChange(frame) {
  // frame.x / frame.y / frame.z：角速度，单位 rad/s。
  // 在此更新业务状态，避免逐帧执行重任务。
}

function hasGyroscopeApi() {
  const miniTool = window.xhs && window.xhs.miniTool;
  return !!miniTool &&
    ["startGyroscope", "stopGyroscope",
     "onGyroscopeChange", "offGyroscopeChange"].every(function (name) {
      return typeof miniTool[name] === "function";
    });
}

async function startMotion() {
  if (!hasGyroscopeApi()) return;
  try {
    miniTool.onGyroscopeChange(handleGyroscopeChange);
    await miniTool.startGyroscope({ interval: "ui" });
  } catch (err) {
    miniTool.offGyroscopeChange(handleGyroscopeChange);
    console.log(err.errMsg || err.message);
  }
}

async function stopMotion() {
  if (!hasGyroscopeApi()) return;
  try {
    await miniTool.stopGyroscope();
  } catch (err) {
    console.log(err.errMsg || err.message);
  } finally {
    miniTool.offGyroscopeChange(handleGyroscopeChange);
  }
}

由单一业务管理上述示例的启停，按交互串行调用 startMotion() / stopMotion()，前一次操作结束后再执行下一次。业务结束时主动清理， 不依赖页面卸载阶段的异步调用完成。

stopGyroscope() 只停止采集，保留已注册的监听，再次开始后原监听继续收帧； 未开始时调用停止可正常成功。
同一函数引用重复注册会去重；offGyroscopeChange(callback) 移除对应监听， offGyroscopeChange() 清空全部监听。
on/off 不接受 success / fail / complete，不返回 Promise；非法回调参数会同步抛出 TypeError。
设备无陀螺仪等不支持情况通过开始采集失败暴露，errCode 为 10002。
已启动的采集在后台或页面隐藏时暂停，回前台自动续采。
多个组件共享陀螺仪时，统一协调采集启停，各组件只移除自己的监听。
3.15 关注作者
💡
关注 API 需要客户端 9.51+，可复用 §3.6 的版本判断方式， 以 9510 作为最低客户端版本判断值。

通过 window.xhs.miniTool 上的 followAuthor 引导关注当前小工具作者，并用 getFollowStatus 查询关注关系。两个方法都没有业务入参， 关注对象由平台绑定当前小工具作者，不能指定其他用户 ID。成功结果遵循 §3.1 的 Promise / 回调约定，并通过 follow_status 表达关注状态。

API	参数	结果与说明
followAuthor(options?)	无业务参数；options 可省略，用于传入可选回调	拉起平台关注确认流程。成功时返回 follow_status： 1 已关注、2 作者本人、-1 操作失败； 已关注或当前用户是作者本人时可直接返回状态，不一定弹窗。
getFollowStatus(options?)	无业务参数；options 可省略，用于传入可选回调	幂等查询当前用户与作者的关注关系。查询失败通过 follow_status: -1 返回，不走 fail / reject；失败结果不缓存， 后续调用会重新查询。
follow_status	说明
-1	接口失败（关注操作失败或查询失败）
0	未关注（包括未登录）
1	已关注，互相关注也归为此状态
2	当前用户是小工具作者本人

followAuthor 在交互取消或受频控限制时会 reject / 触发 fail：errCode: 20002 表示用户关闭确认框（包括点击蒙层） 或放弃登录， 15404 表示关注引导达到频次上限：同一账号对同一工具每天最多展示 10 次确认框，第 11 次调用会被频控拦截，次数按自然日重置；已关注或作者本人等不弹窗的调用不计数。 确认流程尚未结束时重复调用，会以 10003 失败。关注接口本身执行失败则 resolve， 通过 follow_status: -1 表达。使用 getFollowStatus 时，查询业务失败同样 resolve 为 follow_status: -1。

以下示例用两个页面元素显示状态并触发关注，可按页面结构调整：

<button id="followButton" type="button">关注作者</button>
<span id="followStatus" aria-live="polite"></span>
const followButton = document.getElementById("followButton");
const followStatusText = document.getElementById("followStatus");
let currentFollowStatus = -1;
let followPending = false;

function renderFollowStatus(status) {
  currentFollowStatus = status;
  if (followStatusText) {
    const labels = {
      "-1": "暂时无法获取关注状态",
      "0": "未关注",
      "1": "已关注",
      "2": "作者本人",
    };
    followStatusText.textContent = labels[String(status)] || "未知状态";
  }
  if (followButton) {
    followButton.disabled = followPending || (status === 1 || status === 2);
  }
}

async function refreshFollowStatus() {
  const miniTool = window.xhs && window.xhs.miniTool;
  if (!miniTool || typeof miniTool.getFollowStatus !== "function") return;

  try {
    const result = await miniTool.getFollowStatus();
    // -1 查询失败；0 未关注；1 已关注（含互关）；2 作者本人。
    renderFollowStatus(result.follow_status);
  } catch (err) {
    // 处理调用层异常；查询业务失败会通过 follow_status = -1 返回。
    console.log(err.errMsg || err.message);
  }
}

async function onFollowClick() {
  const miniTool = window.xhs && window.xhs.miniTool;
  if (!miniTool || typeof miniTool.followAuthor !== "function" || followPending) return;

  let followNotice = "";
  followPending = true;
  renderFollowStatus(currentFollowStatus);
  try {
    const result = await miniTool.followAuthor();
    renderFollowStatus(result.follow_status);
  } catch (err) {
    if (err.errCode === 20002) return; // 用户关闭确认框或拒绝授权。
    if (err.errCode === 15404) {
      followNotice = "今日关注引导次数已达上限";
      return;
    }
    if (err.errCode === 10003) return; // 关注确认流程仍在进行。
    console.log(err.errMsg || err.message);
  } finally {
    followPending = false;
    renderFollowStatus(currentFollowStatus);
    if (followNotice && followStatusText) {
      followStatusText.textContent = followNotice;
    }
  }
}

if (followButton) {
  followButton.addEventListener("click", onFollowClick);
}

refreshFollowStatus();

两个方法均只针对当前小工具作者；不能通过传入用户 ID 改为关注或查询其他用户。
查询关注状态可用于刷新自绘关注按钮；follow_status: -1 表示暂时无法确认状态，可由后续查询重试。
04
不可用能力

以下 Web API 与行为在容器内已被禁用，调用会失败（抛出异常、返回空值或被拦截），请勿使用。 定位、陀螺仪可使用 §3 列出的平台 JS API。

4.1 已禁用的 Web API
分类	能力
定位	Web 地理定位 navigator.geolocation； 单次定位使用平台 getLocation
剪贴板	navigator.clipboard、execCommand('copy'/'cut'/'paste')
硬件连接	蓝牙、USB、HID、串口
传感器	Web 加速度计、陀螺仪、磁力计、环境光、设备运动 / 朝向； 陀螺仪角速度使用 平台陀螺仪 API
实时通信	WebRTC、WebSocket、EventSource（SSE）
后台运行	Web Worker、SharedWorker、Service Worker
屏幕	屏幕共享、全屏 requestFullscreen（全屏由容器统一管理）
设备信息	电池状态、网络信息、媒体设备枚举
存储进阶	持久化存储、跨域存储访问
凭据	WebAuthn / navigator.credentials、Web Locks
窗口	window.open（弹新窗口）、window.prompt
4.2 已禁用的行为
行为	说明
网络请求	fetch / XMLHttpRequest、加载外部图片 / 字体 / 媒体等网页联网请求。所有资源须打包在内
动态执行代码	eval()、new Function()
WebAssembly	WASM 编译执行（依赖 WASM 的库无法运行，见 §5）
iframe	页面内嵌 iframe / 被外部页面嵌入
表单跳转提交	<form> 提交跳转
插件	Flash 等浏览器插件
文件下载	a[download]、blob 下载等；保存图片请用 saveImageToPhotosAlbum（见 §3.4）
打开外链 / 新窗口	target="_blank"、跳转站外
跳转其他小工具	小工具间互相跳转
长按菜单	已禁用
4.3 移动端不支持

以下能力移动端 WebView 本身不支持，无法使用：支付 PaymentRequest、系统通知 / 推送、NFC、MIDI、XR / AR / VR、后台同步 / 下载、PWA 安装、窗口管理、指针 / 键盘锁定等。

05
WebGL / 图形计算边界

纯 WebGL 渲染可用，但组合能力受限：

场景	是否可用
本地资源 / Canvas / 内存对象作为纹理	✅ 可用
外部域名图片作为纹理	🔴 不可用（不支持网络请求，纹理须打包在内）
依赖 WASM 的加速库（如 Draco / Basis / ONNX / 抠图算法库）	🔴 不可用
依赖 Worker 的离屏渲染（OffscreenCanvas + Worker）	🔴 不可用
SharedArrayBuffer 多线程	🔴 不可用

WebGL 适合用打包在小工具内的资源做本地渲染。§3.10 的平台 AI 仅提供文本生成； AI 图像处理等重计算场景仍无法支持（既不能联网调用外部模型，也不能运行 WASM 模型）。

06
常见问题 FAQ
创作或改写小工具应该从哪里开始？
从小工具上传页开始。在“第一步：调整为符合小红书规范的代码格式”中完整复制改写口令， 发送给工作区内的 AI 助手执行。口令会指导 AI 下载当前版本 Skill、读取 SKILL.md、校验和修复代码并打包；不要只把本页能力清单当作改写提示词。
<input type="file" accept="video/*">
为什么只能选图片？
出于安全考虑，文件选择仅支持图片和视频，无论 accept 如何设置，此限制不可更改。
页面里的
<script>
不执行 / 报 CSP 错误？
容器禁止内联脚本与行内事件处理器（onclick="..."）。请把 JS 放进包内 .js 文件用 <script src="./app.js"> 引入，事件用 addEventListener 绑定。详见 §2.6。
能不能请求我自己的服务端接口 / 加载线上图片？
网页不能通过 fetch、XMLHttpRequest 等方式请求外部服务，线上资源也不能直接加载。 页面、脚本、图片、字体和静态数据必须打包在小工具内。
需要服务端实时推送怎么办？
不支持 WebSocket / SSE / WebRTC 或通过 fetch 轮询自建服务。 当前平台 AI 仅支持 §3.10 的非流式文本生成。
第三方库报安全错误 / 无法运行？
多半命中了 §4。请排查是否用到了 eval、WebAssembly、Worker，或发起了网络请求，改用容器允许的等价方案。
怎么把小工具生成的图片保存到相册 / 发成笔记？
用容器注入的 JS API：writeTempFile 把 base64 换成 filePath，再传给 saveImageToPhotosAlbum 或 postNote。详见 §3。
小工具能不能直接做 AI 对话、文案生成或灵感助手？
可以。使用 window.xhs.AI 调用平台对话模型，无需 API key 或自建服务。 当前是非流式文本生成，内测阶段需先完成 appId 加白；接入与限制见 §3.10。
window.xhs
是
undefined
？
说明当前环境未注入平台能力（如在普通浏览器中预览）。请按需检查 window.xhs && window.xhs.miniTool 或 window.xhs && window.xhs.AI，并为无 SDK 环境提供降级路径。
JS API 传网络图片地址为什么失败？
容器不联网，媒体字段只接受 data: base64 或 writeTempFile 返回的本地路径。
能不能调用文档里没列出的其他原生能力？
不能。§3.2 列出的即为全部可用 JS API，未列出的能力不受支持。
© 小红书 · 小工具容器 · 能力清单
