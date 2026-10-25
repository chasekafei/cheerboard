# 小红书小工具官方规范校验摘要

校验日期：2026-10-25，已更新至四种灯牌与手机工具首页版本。结论：离线单页、外置经典脚本、ES2017 与 Chrome 61 构建基线保留；完成设计迭代后的类型检查、29 项回归测试、静态规范核对、官方体积审计及重新打包。平台与真机验收仍待完成。

## 依据与版本

- 上传页指定 Skill：[minitool-zip-builder 1.8.0](https://fe-static.xhscdn.com/minitool/20261015161653/minitool-zip-builder-1.8.0.skill)，已解压到 [SKILL.md](../../.codex/minitool-zip-builder/SKILL.md)。
- 下载压缩包 SHA-256：`05acf32fb278a0016e6c52a2449eb86784848b644c3c9256df45833cdad9384f`。包内 11 个文件，解压前已检查无绝对路径、目录逃逸和符号链接。
- 先读随包 `js-api.md`（2026-09-23 基线），再获取[当前在线规范](https://miniapp-sandbox.xiaohongshu.com/minitool/doc)。页面标注最后更新 2026-10-22；本次获取的[在线文档快照](minitool-online-2026-10-25.md)已保存。
- 完整核对随包 ZIP、端能力、JS、CSS、跨端与性能 reference。SDK 以本次在线公开契约为准。

## 在线能力比对

相对随包基线新增的公开能力已在实现前播报：

| 能力 | 当前条件 |
| --- | --- |
| `window.xhs.AI.createModel(...).generateText(...)` | App 容器、内测 appId 加白、非流式文本；每用户每天最多 100 次，最多 40 条消息／12000 字符，输出最多 2048 tokens |
| `getWindowInfo` | 客户端 9.49+；窗口尺寸、安全区及顶部按钮位置 |
| `getLocation` | 客户端 9.49+；单次定位 |
| `vibrateShort`、`vibrateLong` | 客户端 9.50+ |
| `startGyroscope`、`stopGyroscope`、`onGyroscopeChange`、`offGyroscopeChange` | 客户端 9.50+；后两者为同步监听接口 |
| `followAuthor`、`getFollowStatus` | 客户端 9.51+；仅针对当前小工具作者 |

其中窗口信息匹配现有安全区功能，当前已使用正确的 9.49 版本检查。其余能力没有现有需求，不新增对应功能。已用旧 API 的参数、配额及最低版本未发现契约变更。

## 本轮修复

| 项目 | 原问题 | 修复 |
| --- | --- | --- |
| 网页下载 | `isNative()` 守卫下仍有 `a.download` 代码进入发布 JS | 编译期区分普通浏览器开发模式和发布模式；网页下载只进入开发构建，发布只调用相册 API，无 SDK 时明确失败并保留设计 |
| 端能力识别 | 通过 UA 推测环境 | 以 SDK／方法是否存在及文档版本条件判断；发布能力不以 UA 猜测 |
| 评论快照 | `>= 2048` 会拒绝恰好 2KB | 改为仅 `> 2048` 拒绝，并加入 2048／2049 UTF-8 字节测试 |
| 评论媒体 | 未拦截绝对路径或浏览器对象 URL | 评论分支验证并拒绝绝对路径、`file:`、`blob:`；不改写 SDK 句柄，不误限相册允许的本地路径 |
| 长列表 | 一次性生成 165 组按钮 | 每页最多 12 组；类别／搜索重置页码，边界自动收敛；搜索键一次建立，输入 120ms 防抖 |
| CSS 间距 | Grid 与部分 Flex 间距缺少旧内核回退 | 当前 21 处 Grid 声明／断点有同值 `grid-gap`，34 类 Flex 间距有局部回退；Flex 使用一次真实布局检测及局部 margin 回退 |
| 焦点与颜色 | 依赖 `:focus-visible`，部分八位十六进制边框色保留在产物 | 明确 `:focus` 与透明开关焦点基线；边框使用 rgba；非百位字体粗细增加标准级别回退 |
| 安全区／视口 | PC 注入变量、SDK 底部留白、部分展示按钮未统一处理 | 合并 SDK、`--safe-area-inset-*` 和原生 env；`max()`／毛玻璃只放能力检测增强层；`visualViewport` 检测后维护高度变量，并保留 vh 回退 |
| 滚动绘制 | 每帧完整绘制两次，点阵缓存交替失效 | 提取纯排版测量，按尺寸缓存滚动指标，每帧仅绘制一次 |
| 导出图片 | 预览和交付重复 PNG 编码并持有导出画布 | 共用单次编码结果，关闭弹层释放引用 |
| 构建门禁 | 项目自检漏掉 JS 动态下载残留等形式 | 增加动态 HTML／下载、更多禁用 API、入口声明、CSP、静态 Base64 校验，并接入原版官方审计脚本 |

## 逐类静态核对

| 规范 | 核对结果与证据 |
| --- | --- |
| ZIP 结构与类型 | ZIP 根直接包含 `index.html`；仅 1 HTML／1 JS／1 CSS，无嵌套项目目录、依赖、构建配置、source map、参考图或开发垃圾 |
| HTML 与 CSP | HTML5、zh-CN、UTF-8、viewport 三项要求齐全；脚本外置、经典 IIFE、无 module／import／export／内联脚本／行内事件／自建 CSP／iframe／object／base |
| 资源与路径 | 所有静态资源使用包内相对路径，实际存在且不逃逸；无外部脚本、图片、字体或网络请求 |
| 端能力 | SDK 由容器注入；仅调用公开的方法，调用前检测；存储按 9.46、评论和窗口信息按 9.49 判断，保留错误、取消、低版本与无 SDK 分支 |
| 媒体／存储 | 图片临时文件即用即弃；评论仅用本地句柄；存储采用 JSON 字符串、低版本兼容和迁移；当前有限文案／五份设计存档规模不触及文档缓存上限 |
| 禁用能力 | 当前发布 JS 无动态下载成员或创建下载锚点；无网页网络请求、剪贴板、传感器、Worker、WebRTC、WASM、全屏、方向锁或外站跳转代码 |
| JS | Acorn 以 ES2017 classic script 解析通过；构建目标包含 Chrome 61／ES2017；新语法转译，非基础 API 做能力检测，未用整套 polyfill |
| CSS／跨端 | 最终 CSS 静态解析、Chrome61／iOS18.4 目标转换零警告；Grid、Flex、焦点、安全区、弹层高度、模糊及实际使用的新颜色／粗细均有基线或增强隔离；核心按钮不靠 hover 才能操作 |
| 性能设计 | 165 组及必要字段，未打入采集数据库；分页限制 DOM；无静态大 Base64／媒体；Canvas 2D，无 WebGL，不适用 WebGL 资源分档要求；已有隐藏停止与退出清理 |
| 正确性回归 | 29 项自动测试通过，包含存储／权限、旧设计迁移、Emoji 字簇、点阵网格与精灵预算、霓虹及导出一致性、评论边界、分页和发布约束；类型检查、构建、`git diff --check` 通过 |

以上为静态规范与代码层回归。普通浏览器直运行不作为小工具功能、兼容性或交付验收依据；本轮未据此宣称容器功能通过。

## 灯牌设计迭代复核

再次获取当前在线文档，与已存快照全文去空白比对一致，没有新的能力变化。四种灯牌、点阵形状、自定义 Emoji、颜色和光晕均使用本地 Canvas；没有增加端能力或外部资源。首页改为灯牌／手幅直接入口，旧模板 ID 保留，新增字段读取时补默认值。

- 点阵 mask 最大 384×192，精灵最多 16 个、单个最大 128×128；只采样视口，Emoji 不逐点重新排字。
- 新样式仍使用系统字体与 Canvas 2D；新增 CSS 具备 Grid/Flex 基线回退。
- `pnpm test` 29/29、`pnpm package`、目录和 ZIP 的原版 Node/Python 体积审计通过；最终 CSS 以 Chrome 61／iOS 18.4 静态转换零警告。
- ego-browser 在本地开发页验证 1280×900 桌面、390×844 手机、320×720 窄屏及844×390横屏：四样式、五种点阵、组合 Emoji、光晕0/100、配色、保存再打开、1920×1080下载、展示／暂停及手幅默认值。未见横向溢出、构建错误覆盖层或页面运行错误。浏览器结果仅用于界面回归，不是小红书容器验收。
- 测试产生的三项本地数据在独立的5174开发源上恢复至测试前状态，未动用户5173页面的本地数据。

## 官方体积审计与最终文件

原版脚本执行结果：

```text
node .codex/minitool-zip-builder/scripts/audit_artifact.mjs dist
PASS: 3 file(s), 0 warning(s)

node .codex/minitool-zip-builder/scripts/audit_artifact.mjs release/cheerboard.zip
PASS: 1 file(s), 0 warning(s)

python3 .codex/minitool-zip-builder/scripts/audit_artifact.py dist
PASS: 3 file(s), 0 warning(s)

python3 .codex/minitool-zip-builder/scripts/audit_artifact.py release/cheerboard.zip
PASS: 3 file(s), 0 warning(s)
```

官方脚本只检查确定性体积阈值，不检查 API／CSP／资源语义、路径或设备表现。Node 对 ZIP 仅审计压缩大小，因此同时审计压缩前目录；Python 另读取 ZIP 内部文本大小。项目规范检查和各 reference 的人工核对另行完成。

- [待上传 ZIP](../../release/cheerboard.zip)：33,256 字节，约 32.5 KiB。官方硬上限 10 MiB，低于 2 MiB 建议目标。
- ZIP SHA-256：`43b7a12d22e325934e664ac963951ac90414c471b1c1498b3482c874de16d910`。
- 解压后三个文本文件合计 108,123 字节，约 105.6 KiB。逐文件字节与当前 `dist/` 完全一致，ZIP 完整性检查通过。

| 文件 | 字节 |
| --- | ---: |
| `index.html` | 693 |
| `assets/app.css` | 33,407 |
| `assets/app.js` | 74,023 |

[产物与逐文件校验值](minitool-artifact-2026-10-25.json)。源码仍使用 TypeScript／Vite；上传本次 ZIP，不要将整个工作区或开发用的根 `index.html` 直接压缩上传。以后 `pnpm package` 会重新构建并执行项目检查、官方目录审计和官方 ZIP 体积审计。

## 待用户验证

必须使用上述同一 ZIP 完成以下三项，本轮没有登录创服平台、上传或启动真机验证：

| 验证环境 | 状态 | 重点 |
| --- | --- | --- |
| 创服平台模拟器 | 待用户验证 | 完整制作、四类文案与分页、存档、安全区、展示、导出及平台回调 |
| Android 真机扫码 | 待用户验证 | 同一产物；Chrome 61／Android 8.1 基线、触摸／键盘、权限拒绝、低版本及图片／评论／笔记流程 |
| iOS 真机扫码 | 待用户验证 | 同一产物；iOS 18.4+、安全区、软键盘、权限与分享返回状态 |

Chrome 61 CSS 兼容性未实测；真机首屏、帧率、内存及 A4 导出性能未实测。A4 单个 3508×2480 RGBA 画布约 33.2 MiB，虽已避免重复编码和长期持有，仍需真机确认峰值内存及耗时。上述待验项不阻塞静态 ZIP 交付，但不能据此声称已通过平台或真机验收。
