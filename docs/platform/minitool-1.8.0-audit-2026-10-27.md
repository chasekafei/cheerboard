# 柔边霓虹灯管与发布校验

日期：2026-10-27。109/109 自动测试、TypeScript、ES2017 classic IIFE、离线发布检查及官方 Node/Python 体积审计通过。ZIP保留一条超过2MiB建议值的提示，无错误。原生平台验收仍待用户完成。

## 本轮修复

旧实现用彩色strokeText包住近白fillText，形成明显的彩色轮廓。本轮主管体改为Tube100字形距离场：中心高光、渐变至有色管边，再以连续alpha衰减到透明。光晕源也整体模糊，不再从软管下漏出实心字。主管体没有叠加完整的二值白字或独立彩色描边。

按用户追加意见，单独恢复管芯亮度并补偿有效发光宽度；中心白混上限.86，但仅随字形内距连续变化，不铺满字形。几何距离统一加.003em光学宽度，alpha和高光共用同一平滑场。此前已确认的投影参数保留：下移(.08+.06s)em、模糊(.03+.04s)em、透明度.62s（s=glow/100），完整字形投影仍在底层。

高采样与亚像素EDT修正减少放大后的斜边台阶：源EM320、384²画布，alpha覆盖直接初始化边界距离，双轴半源像素tent平滑。复杂字的交叉和内孔保留；Latin使用真实prefix-end定位修正To字距；过宽ZWJ簇整句降级，避免静默裁字。

## 缓存与兼容

- 字形几何最多32条/4MiB，着色RGBA贴图最多32条/8MiB；本帧准备集pin住对象且在分配前计费，超预算时在绘制任何管体前返回原生柔化路径。静态长句全部可见也不会绕过LRU预算。
- 单字源与贴图边长≤384，行度量最多16条/8000字簇；只处理可见字，滚动平移和等比导出复用几何/着色贴图，没有整词位图。字体ready后清缓存。
- 主管渐变按整句bounds重建，不按每个字重启。水平压缩沿用原坐标和clip。
- 没有Canvas filter时，光晕与投影只让柔化shadow进入可视区，锐利源移出clip；没有像素API的管体使用模糊填充，连filter也缺失时使用小卷积tap回退，保留完整原文和渐变。
- glow0只关闭外部光晕和下投影，主管边缘仍连续柔和。当前应用缓存计费上限不能证明浏览器内部GPU层的峰值。

## 验证结果

Ego space15成功重新获取官方在线文档，但UI验证阶段返回`task space not found: 15`，未另开会话或绕过该停止。效果验证已在会话失效前用隔离Chrome临时配置完成；低能力fallback另用CPU Skia验证，不将其称为浏览器或真机验收。

- 相同1200×560画布的修改前/后截图实际查看，并裁切同一位置放大比较：原彩边消失，管边连续变暗；红/青色、数字11:54、复杂字、渐变与glow0均检查。
- 实际Canvas像素采样：红/青色、glow0/65/100、DPR1/2共12种；从管芯向两侧无亮度反弹，截面有7–25级亮度，远处glow0回到黑色。主体实际使用RGBA贴图而非native硬填充。
- 与已提交旧版helper同字形、同字号/颜色直接比较：峰值亮度约100.5–102.0%；常用65光晕下固定截面区间的总亮度约97.3–99.9%。这是局部像素证据，不是设备曝光或远距离识读基准。
- 同尺寸预览与board导出实际PNG逐字节相同；A4实际编码3508×2480，2000字滚动实际编码786×388，均成功。
- 无filter时CPU Skia实际绘制：SDF主管仍显示，所有锐利halo源位于clip外、柔光实际可见；无像素与filter时整句fallback仍可编码PNG。
- 109项测试包含连续截面、亚像素254→255稳定、字孔/交叉、真实kerning、宽簇fallback、仅可见字、offset/2倍导出复用、缓存及准备集预算、字体清缓存，以及已有滚动、存档、文案和SDK/发布约束。

本轮临时证据：`/tmp/cheerboard-soft-tube-before-gallery.png`、`/tmp/cheerboard-soft-tube-after-gallery.png`、`/tmp/cheerboard-soft-tube-final-comparison.png`。QA脚本和截图不进入Git/ZIP。

## 保留行为

首页原稿素材/提醒/一屏布局与动效，菜单「文案/收藏」，菜单覆盖且编辑继续滚动，fine交点合并和统一点径，165组文案的人工修订/priority2及国乒祝福置顶，固定字体和五种灯牌均保留。分享仍默认笔记卡，按笔记/评论/观赛打卡/原图/A4全部平铺；竖向原图按方向导出；48px关闭与双主按钮固定在滚动区外。红蓝重影仍是隔离的两层加色，没有第三层白字。

## 规范与当前产物

沿用[官方Skill1.8.0](../../.codex/minitool-zip-builder/SKILL.md)。任务开始先读本地API基线，再以Ego重新获取[在线规范](https://miniapp-sandbox.xiaohongshu.com/minitool/doc)，28420字符、最后更新2026-10-22，与上轮去空白后全文相同。未新增平台能力、联网资源、系统全屏、方向锁或发布构建下载分支。

- [cheerboard.zip](../../release/cheerboard.zip)：2,594,852字节，约2.47MiB。
- SHA-256：`792c8c134c545f28a0b0820a452747f93684e8959b813db1fe9ef90b58268068`。
- 11个文件，解压后2,728,139字节；ZIP完整性、文件集合与dist逐字节一致性通过。
- [逐文件SHA清单](minitool-artifact-2026-10-27.json)。

| 文件 | 字节 |
| --- | ---: |
| `artwork/design-banner.webp` | 36,510 |
| `artwork/design-brand.webp` | 33,992 |
| `artwork/design-hero.webp` | 78,514 |
| `artwork/design-settings.webp` | 2,158 |
| `assets/app.css` | 44,186 |
| `assets/app.js` | 132,290 |
| `fonts/CheerboardHandwriting.woff2` | 1,084,100 |
| `fonts/CheerboardSans.woff2` | 671,696 |
| `fonts/CheerboardTube.woff2` | 628,168 |
| `fonts/licenses.json` | 15,832 |
| `index.html` | 693 |

Node目录PASS11/0 warnings，ZIP PASS1/1 warning（Node仅审ZIP体积）；Python目录PASS11/0 warnings，ZIP PASS11/1 warning。提示只为超过2MiB建议值，仍低于10MiB官方硬上限和3MiB项目预算，未调整阈值。

## 待用户验证

请用本次相同ZIP分别完成创服平台模拟器、Android与iOS真机扫码验证。本轮未登录创服、上传ZIP或真实发笔记。重点为字形/Emoji、软键盘/安全区、滚动帧率/电量、A4和首次字形生成峰值内存、相册拒绝/取消及发布返回。Chrome61实机兼容与低端机性能未实测；A4单RGBA画布约33.2MiB，原生filter内部临时层仍需真机测量。待验不阻塞静态包交付。
