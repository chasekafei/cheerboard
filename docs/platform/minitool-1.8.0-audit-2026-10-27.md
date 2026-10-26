# 交点光点、霓虹投影与分享类型校验

日期：2026-10-27。98/98 自动测试、TypeScript、ES2017 classic IIFE 与离线发布门禁通过。官方 Node／Python 目录和 ZIP 审计通过，无错误；保留一条超过 2MiB 建议值的提示。实际 Ego 开发及最终生产构建、隔离浏览器的图像／交互验证通过；不替代小红书容器验收。

## 本轮行为

- 灯牌菜单「文字」改为「文案」，对应 sheet 标题和 aria 一并更新；「我的」改为「收藏」，仍保存当前设计到我的牌。
- fine 交点原来因短支路接点过近而输出两颗约0.239倍直径的小点。现以0.62pitch邻域、骨架最短路径≤0.9pitch+1像素聚合交点，输出点径全部为1；跨字孔／独立平行笔画不会误合并。「我」实字由50点变49个标准点，窄孔、五叉交点和端点保留有回归。96×96 mask、128字缓存、16行缓存及滚动平移不变。
- 新增 `src/neon.ts`，霓虹使用完整同字形副本的彩色投影，再降透明度、模糊并下移，先于主灯管绘制。按用户最后微调，投影比初版更柔、更淡、更近：强度s=glow/100时下移(0.08+0.06s)em，模糊(0.03+0.04s)em，原生filter透明度0.62s。仅投影描边为主灯管的1.35倍，主细管／白彩芯保持原宽度。
- 宽、中、紧光晕共同形成更明显发光，宽晕最高0.75em；真实Thin100无衬线、圆角线条、既有渐变保留。glow0不画投影或光晕。Canvas filter缺失、忽略或setter抛错时使用同完整位移字形加shadow的回退；绘制结束恢复上下文状态。
- 分享类型在图片上方平铺，宽面板5列，窄屏3+2两行，全部直接可见、每项至少48px。顺序为笔记分享卡／评论晒图卡／观赛打卡／横版图片／A4打印图，首次与重新打开均默认笔记分享卡；按手动竖向导出时原图仍如实显示「竖版图片」。没有折叠或横滑隐藏后续选项。
- 分享48px关闭按钮及「保存到相册／发布图文」footer仍在body滚动区外；观赛打卡保留本地日期、地点编辑。收藏、文案库排序、菜单覆盖／持续滚动、字体固定及原稿首页等上轮行为保留。

## 验证证据

Ego space14用于在线规范及开发／生产实际操作，未清理用户浏览器数据。重复尺寸、绘制及PNG读回使用隔离临时Chrome配置，未安装新依赖或引入运行库；Browser插件未提供，Ego仍为主验证入口。

- 390×844分享实际显示5个48px按钮，默认note且唯一aria-pressed=true，顺序为note/comment/memory/board/a4，details数量0；截图实际查看通过。
- 五种图片类型实际切换尺寸分别为1080×1440、1080×1080、1080×1440、1920×1080、3508×2480；日期是本地当天。PNG实际下载成功，关闭后重新打开仍默认note。
- 390×844、786×388、1200×800及390×200检查无横向溢出；body滚动时关闭按钮位置不变，footer保留。所有类型通过真实预览生成，不以静态缩略图代替结果。
- 点阵图对照用户「我们来日方长」截图，交点光点直径统一；「重围颖钦」复杂笔画和字孔仍清晰。霓虹0／65／100、青色／粉色与完整下移副本均以实际Canvas截图查看，并按用户追加意见再次降低透明度、加模糊、拉近。
- 最终生产构建中重新操作菜单／分享，确认默认note。实际霓虹A4调用了PNG编码，预览解码为3508×2480；另对2000字符滚动霓虹在786×388画布实际PNG编码成功，未创建超宽应用画布。这不等于帧率、耗电或峰值内存基准。
- 样式面板打开时霓虹继续滚动。页面错误列表为空；98项自动测试覆盖交点合并／平行笔画保留、统一点径、完整投影与glow0、filter三种回退、渐变／压缩／状态恢复，以及既有字体、语义换行、存档／SDK和发布约束。

本轮截图在 `/tmp/cheerboard-detail-render-gallery.png`、`/tmp/cheerboard-detail-neon-closer-ego.png`、`/tmp/cheerboard-detail-share-final-ego.png`；实际下载为 `/tmp/cheerboard-detail-note-export.png`。临时QA文件不进入Git或ZIP。

## 规范与产物

使用[官方Skill1.8.0](../../.codex/minitool-zip-builder/SKILL.md)。任务开始已先读本地API基线，再以Ego取得[当前在线规范](https://miniapp-sandbox.xiaohongshu.com/minitool/doc)：28,420字符、更新仍为2026-10-22，与上轮去空白后完全相同。未新增平台能力、联网资源、全屏、方向锁或发布构建下载分支。

- [发布包](../../release/cheerboard.zip)：2,592,032字节，约2.47MiB。
- SHA-256：`2b32ea40618b6a4ba04e815e42a2755781769678c83cb45b4cb7f9f75b5abab8`。
- 11个文件，解压后2,719,925字节；ZIP完整性、文件集合与dist逐字节一致性通过。
- [逐文件SHA清单](minitool-artifact-2026-10-27.json)。

| 文件 | 字节 |
| --- | ---: |
| `artwork/design-banner.webp` | 36,510 |
| `artwork/design-brand.webp` | 33,992 |
| `artwork/design-hero.webp` | 78,514 |
| `artwork/design-settings.webp` | 2,158 |
| `assets/app.css` | 44,186 |
| `assets/app.js` | 124,076 |
| `fonts/CheerboardHandwriting.woff2` | 1,084,100 |
| `fonts/CheerboardSans.woff2` | 671,696 |
| `fonts/CheerboardTube.woff2` | 628,168 |
| `fonts/licenses.json` | 15,832 |
| `index.html` | 693 |

官方Node目录PASS11／0 warnings，ZIP PASS1／1 warning（Node ZIP仅检查体积）；Python目录PASS11／0 warnings，ZIP PASS11／1 warning。唯一提示为超过2MiB建议值，低于10MiB官方硬上限和3MiB项目预算，未修改审计阈值。

## 待用户验证

请将本次相同ZIP分别在创服平台模拟器、Android和iOS真机扫码验证。本轮没有登录创服、上传包或真实发布笔记。重点是字体／Emoji、原生安全区／软键盘、滚动帧率／耗电、相册拒绝／取消、发布返回及霓虹A4峰值内存。原生filter内部临时GPU层的峰值不由应用画布尺寸证明；Chrome61实际设备和低端机性能仍待测。A4单个RGBA画布约33.2MiB。上述待验不阻塞静态包交付。
