# 设计重构、菜单与单列点阵校验摘要

本轮 89/89 自动测试、TypeScript、ES2017 classic IIFE 与离线发布门禁通过。官方 Node／Python 目录及 ZIP 体积审计均通过，无错误；ZIP 保留一条超过 2 MiB 建议值的提示。Ego 完成开发及最终生产构建的实际截图／交互验证。浏览器结果不等于小红书平台和真机验收。

## 本轮九项调整

1. 首页右上改为提醒铃铛，入口为「使用提醒与场馆提示」，不再把提醒当作设置。品牌、灯牌和 Lion heart 仍使用原稿提取素材；[素材来源及复现](../design/ARTWORK.md)不变。
2. 首页手机紧凑排版，空态／三存档都保留底部 Banner。375×812、390×844、435×903 含 top44／bottom34 安全区和 1200×800 桌面均一屏完成，无横向溢出；触控按钮至少 44px。320×640 仍自然滚动 30–54px，短横屏也自然滚动，不裁切或缩小触控。
3. 首页增加分段轻移入场、纸旗慢浮动；按钮有 hover／按下反馈，菜单有滑入过渡。动效只用 transform／opacity，不闪烁；prefers-reduced-motion 时关闭。hover 只面向支持 hover 的精细指针。
4. 工具栏和文字／样式 sheet 均覆盖在原牌面上，显示／收起不再预留工具栏区域，也不重排上方小预览。真实静态 Canvas 的位图字节、bitmap 大小及 CSS 几何在菜单打开前后完全一致。
5. 默认提示改为「点击屏幕查看菜单」，菜单可见时提示「点击屏幕隐藏菜单」。只对旧版两条完全匹配的系统提示做迁移，自填文字、近似文字和手幅原文保留。
6. 工具栏「保存」改为「我的」，使用书签图标，仍保存当前牌到我的牌；aria-label 保留明确的保存含义。
7. 「纤细」改成真正的笔画线心大光点：Sans400 字形 → 保拓扑骨架 → 沿笔画按弧长采样单列大点，保留端点、分叉与内孔。经典／荧光保持原路径。移除所有字体选择，固定 L3 Sans400、L4 Tube100 无衬线、H2 Handwriting300、其余 Sans700。旧 fontId 仅兼容读写，不再影响测量和绘制。
8. 打开文字／样式 sheet 不设置场景暂停，滚动、速度和方向继续。菜单打开或随机切换装饰后，已实际观察到主 Canvas 持续刷新，尺寸不变。分享等完整覆盖流程仍可暂停并在关闭后续播。
9. 查询层显式按 priority 降序排列，同级按当前清单索引稳定排序，兼容旧内核不稳定 Array.sort。「其他」首位固定 C039「祝中国乒乓球队\n越来越好」，换行原样保留。用户七条文字／分类修改全部保留，未用旧表重新生成覆盖。

## 文案与保留功能

当前 165 组主文案：孙颖莎 17、王楚钦 34、莎头 82、其他 32，优先级 2 共 25 组；59 种异写继续可搜索。此前查询只按清单物理位置分页，priority2 仅因旧表预排序而偶然在前，这次已修正查询逻辑。当前手工清单 `src/slogans.ts` 是后续修订依据；旧 JSON／XLSX 未回写。

5 种灯牌、3 款手幅、语义分行、70–200% 字号、左右连续滚动及五档速度、五套装饰／随机 seed、最近五份存档、原图／A4／评论卡／笔记卡／返图卡均保留。Emoji 使用自身颜色，文字色与渐变真实禁用，背景可改。霓虹仍为真实 Thin100 无衬线、宽柔光晕和向下柔彩投影；重影仍仅青色左上和红色右下两层在透明隔离层 lighter 加色，没有第三层白字。

## 线心点阵与资源边界

fine 使用单一 96×96 离屏 mask、64px 单字栅格，骨架最多 96 轮；逐字 LRU128 项、行度量16项，只为可见字的缓存 miss 读取小 mask。滚动命中缓存时只平移既有点位，不读像素或重设 bitmap 尺寸；180字滚动、0.25／3.25px 平移、字体 ready 清缓存和预览／导出坐标一致性均有回归。

旧网格点阵仍为 1536×768 mask／384×192 逻辑网格、32 sprite、12 档渐变；同 viewport mask 最多一次读回。主画布约200万像素、最长边2048，连续铺排最多54副本。fine atlas≤78×110，荧光 atlas≤94×126；装饰最多16 sprite、8个边角锚点。未新增整板像素缓存；实际低端机首绘、内存和帧率仍待真机测试。

## 实际浏览器证据

Ego space13 用于本轮官方文档、开发预览及生产预览；没有清除用户站点数据。重复尺寸及夹具回归使用隔离临时 Chrome 配置；Browser 插件未提供，Ego 仍为主验证入口。临时三张存档仅在测试浏览器内，不写入产品默认数据。

- 静态牌面 → 轻点菜单 → 文字 sheet：对主 Canvas 比较实际 data URL、width／height 和 style，完全相同。工具栏为「我的」，提示随可见状态切换。
- 真实 fine 单列大点截图已对照附件查看：「加油」、孙颖莎、王楚钦、莎出重围、两行国乒祝福及英文数字均保持单列笔画和内孔。全程使用包内真实字库，没有以静态示例替代编辑牌面。
- 滚动 → 样式 sheet → 随机装饰：实际拦截主 Canvas clearRect 计数观察，打开面板期间持续绘制，bitmap／CSS 几何相同，存档 scroll=true。开发和最终生产 dist 均验证。
- 「其他」第一句点选后为原文两行且切换双行；字体下拉数量为0。Emoji 禁色、速度方向、我的存档／重开、四秒自动隐藏、实际 PNG 下载均通过。
- 所有尺寸无横向溢出；手机375／390／435与桌面1200一屏，最小主要触控44px。hover 及 reduced-motion 两种媒体偏好实际检查通过。页面错误列表为空。
- 源码和生产包均无额外网络资源／SDK变化。89项自动测试覆盖骨架单列与内孔、可见字缓存／平移、固定字体、用户文案改动／排序、迁移、滚动生命周期／DPR／方向、SDK保存和postNote版本降级、发布结构约束；原生SDK使用mock，未真实发笔记。

截图保存在本次临时目录：`/tmp/cheerboard-polish-home-safearea.png`、`/tmp/cheerboard-polish-home-small.png`、`/tmp/cheerboard-centerline-browser.png`、`/tmp/cheerboard-polish-fine-clean-ego.png`、`/tmp/cheerboard-polish-overlay-final-ego.png`。实际开发导出为 `/tmp/cheerboard-polish-fine-export.png`。临时 QA 产物不进入 Git 或发布 ZIP。

## 规范与产物

继续使用上传页指定的[官方 Skill 1.8.0](../../.codex/minitool-zip-builder/SKILL.md)。本任务开始通过 Ego 重新获取[在线规范](https://miniapp-sandbox.xiaohongshu.com/minitool/doc)，28,420字符，页面更新仍为2026-10-22，与上轮副本去空白后完全一致；没有新增公开能力／参数更新。未新增平台 API、联网、系统全屏、方向锁或发布构建下载分支。

- [cheerboard.zip](../../release/cheerboard.zip)：2,591,305 字节，约 2.47 MiB。
- SHA-256：`31a0d4f330c82c77540e3008f78244617c1f015e7ca8d9874b4c73e3ebb70a3b`。
- 11 个文件，共 2,717,619 字节；ZIP 完整性、文件集合、每个文件与 dist 逐字节一致性通过。
- [逐文件 SHA 与清单](minitool-artifact-2026-10-26.json)。

| 文件 | 字节 |
| --- | ---: |
| `artwork/design-banner.webp` | 36,510 |
| `artwork/design-brand.webp` | 33,992 |
| `artwork/design-hero.webp` | 78,514 |
| `artwork/design-settings.webp` | 2,158 |
| `assets/app.css` | 43,748 |
| `assets/app.js` | 122,208 |
| `fonts/CheerboardHandwriting.woff2` | 1,084,100 |
| `fonts/CheerboardSans.woff2` | 671,696 |
| `fonts/CheerboardTube.woff2` | 628,168 |
| `fonts/licenses.json` | 15,832 |
| `index.html` | 693 |

Node目录 PASS11／0 warnings，ZIP PASS1／1 warning（Node只审ZIP大小）；Python目录 PASS11／0 warnings，ZIP PASS11／1 warning。唯一提示为 ZIP 超过官方2MiB建议值，低于官方10MiB硬上限和项目3MiB预算，未修改阈值。

## 待用户验证

请用本次同一个 ZIP 在创服平台模拟器、Android和iOS真机扫码分别验证。本轮未登录创服、上传包或启动真机流程。重点为字体与Emoji、软键盘／安全区、细线点阵远距离识读、滚动帧率／耗电、存档重进、相册拒绝／取消及发布返回。浏览器模拟不证明Chrome61真机兼容或原生调用成功；A4单画布约33.2MiB，峰值仍需真机验证。上述待验不阻塞静态包交付。
