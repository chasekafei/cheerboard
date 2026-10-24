# 小红书小工具接入核验

核验日期：2026-10-25（Asia/Shanghai）。公开官方能力文档最后更新：2026-10-22。

来源：[小工具容器能力清单](https://miniapp-sandbox.xiaohongshu.com/minitool/doc)。以下为项目接入摘要，具体以该页各节及上传页当前口令为准。

## 构建与容器

- §1–2：Chrome 61 / ES2017 基线；Android 8.1、iOS 18.4。资源全部随包提供，外置经典脚本、`addEventListener` 绑定事件。
- §4：不联网；不使用内联脚本、动态代码执行、WASM、Worker、外部资源或剪贴板。`requestFullscreen` 明确禁用；页面展示层不能描述为系统全屏。
- 原调研的 10MB 上限、2MB 建议来自旧 Skill，本轮公开能力页没有重新给出上传大小；项目以更小体积为目标，上传前用当前口令再次校验。

## SDK 契约与实现

SDK 由容器注入，入口 `window.xhs.miniTool`，不加载第三方 SDK。参数带任一回调则返回 `undefined`；不带回调则返回 Promise。方法存在仍可能失败（§3.1）。项目适配器支持这两种返回形式。

| 用途 | 入参与结果 | 约束 |
| --- | --- | --- |
| Storage（§3.6–3.7） | `setStorage({key,data})`；`getStorage({key}) → {data}` | 9.46+；`data` 为 JSON 字符串。每 key 1MB，总计 10MB |
| 临时图片（§3.5） | `writeTempFile({data: dataUrl}) → {filePath}` | 路径即用即弃，不存档 |
| 相册（§3.4） | `saveImageToPhotosAlbum({filePath})` | 用户点击触发；接受 data URI 或临时路径；拒绝权限会失败 |
| 笔记（§3.3） | `postNote({title,content,mediaInfo:{image_resources:[{url:filePath}]}})` | 标题 20 字、正文 1000 字、1–18 张图；公开参数无工具挂载字段 |
| 评论（§3.9） | `interactionOpenApi({payload:{action:'post_comment',content,media_bean:[{media_type:'image',cover_image_url:filePath}],miniToolSnapshotInfo},saveToAlbum:false})` | 9.49+；必须本地句柄，不能传 data URI、网络 URL 或自行构造绝对路径；快照 JSON 最大 2KB |
| 安全区（§3.11） | `getWindowInfo() → {windowWidth,windowHeight,safeArea,menuButtons,...}` | 9.49+；容器逻辑像素；顶部按钮可能为 null |

客户端版本由同步 `xhs.launchOptions` 或异步 `getLaunchOptions()` 的 `miniToolEnv.buildVersion` 取得；先除以 1000 向下取整，再与 `9460` / `9490` 比较。取不到版本按不支持新版能力处理。

项目 `src/platform.ts` 对底层失败抛错；原生存储失败不假装成功或偷偷写另一份数据。低版本才降级浏览器存储，升级后会迁移有效旧数据。普通浏览器可以下载图片；容器缺 SDK 时不走下载伪降级。评论入口只把 `routed: true` 当作草稿路由成功，不当作评论发布成功。笔记接口完成也不能代表审核通过。

## 尚需真机验证

1. 当前上传页口令及 Skill 版本；官方要求从上传页取得，旧版下载地址不能代替。
2. `writeTempFile` 句柄在评论侧的实际兼容情况；若被拒绝，后续按官方文件系统接口转换，不能伪造句柄。
3. 评论快照在再次启动时的确切读取路径：公开页只说明可恢复，没有声明启动参数字段路径。
4. 笔记是否自动挂工具、返回工具后的状态及相册权限弹窗行为。
5. iOS / Android 横屏、安全区、原生按钮、图片大图内存与 A4 导出表现。

本轮用官方公开网页核验；ego-browser 启动遇到 macOS HIServices 连接失败，未读取账号后台、未上传、未发布。适配器的回调/Promise、权限失败和缺失 SDK 路径以本地模拟验证，不能代替以上真机验收。
