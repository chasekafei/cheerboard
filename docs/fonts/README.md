# 牌面字体

2026-10-26 更新：本地打包三份 WOFF2。清晰黑体使用 Noto Sans CJK SC Regular 2.004（400），手写文楷使用 LXGW WenKai Light 1.530（300），霓虹专用的无衬线灯管使用真实静态 Noto Sans CJK SC Thin 2.004（100）。Thin 经实际 Canvas 对比后加入，普通无衬线仍使用 Regular；只请求低 CSS 字重不会把 Regular 的实际字形变细。文楷由 Regular 替换为 Light，保留原选项 ID、family、文件名和「手写文楷」名称。字体均来自项目官方 GitHub，采用 SIL Open Font License 1.1。宋体选项使用设备自带字体，界面明确标注为系统字体。

| 选项 | 包内 family | 字体文件 | 字节 |
| --- | --- | --- | ---: |
| 清晰黑体 | Cheerboard Sans | `public/fonts/CheerboardSans.woff2` | 671,696 |
| 手写文楷 | Cheerboard Handwriting | `public/fonts/CheerboardHandwriting.woff2` | 1,084,100 |
| 无衬线灯管（霓虹专用） | Cheerboard Tube | `public/fonts/CheerboardTube.woff2` | 628,168 |

当前三份字体合计 **2,383,964 字节**，保留相同覆盖范围；主流程将项目自设预算调整至 3 MiB，平台硬上限仍为 10 MiB。2026-10-25 曾用 Sans Regular 与文楷 Regular 制作完整 GB2312 加文案的试制版本，合计 2,764,248 字节，超过当时项目自设的 2 MiB 门禁；该历史试制不代表 Light 或 Thin 的体积。实际版本采用 GB2312 一级常用汉字、GB2312 非汉字、ASCII、常用标点，以及当前审核表全部 446 行和内置库全部主句及选中异写的字符并集。三份字体都覆盖该批文案出现的全部中日韩统一汉字；Emoji、未收录生僻字等由设备系统字体补足。用户输入不作删字或字符转换。

实际请求的 4,858 码点字符清单见 [subset-unicodes.txt](subset-unicodes.txt)；原始版本、下载地址、SHA-256、具体裁剪参数与输出校验值见 [sources.json](sources.json)。文楷 Light 与此前文楷 Regular 实际覆盖同为 4,769 个码点；Sans Thin 与 Sans Regular 实际覆盖同为 4,749 个码点。字体通过 fontTools 子集化并用已安装的 Brotli 压缩；移除 hinting，保留常规拉丁排版特性与原版权、许可记录。原始约 16 MB 的 Sans Regular、约 15 MB 的 Thin、约 29 MB 的 Light 及历史文楷 Regular 只用于临时构建，不放入仓库或发布包。

为避免修改版字体保留名歧义，子集内部的 family、full name 和 PostScript 名已改为 `Cheerboard Sans` / `Cheerboard Handwriting` / `Cheerboard Tube`；原始版权与完整 OFL 仍保留在字体内部及随包分发的 [licenses.json](../../public/fonts/licenses.json)。字体许可不改变应用代码及用户导出图片的许可。

官方来源：[Noto Sans CJK SC Regular](https://github.com/notofonts/noto-cjk/blob/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf)、[Noto Sans CJK SC Thin](https://github.com/notofonts/noto-cjk/blob/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Thin.otf)、[Noto OFL](https://github.com/notofonts/noto-cjk/blob/main/Sans/LICENSE)、[LXGW WenKai Light 1.530](https://github.com/lxgw/LxgwWenKai/releases/download/v1.530/LXGWWenKai-Light.ttf)、[LXGW OFL](https://github.com/lxgw/LxgwWenKai/blob/v1.530/OFL.txt)。

`src/fonts.css` 仅引用包内文件，分别声明 Sans 400、文楷 300 与灯管 100；`loadBoardFonts()` 按相同字重使用 `document.fonts.load` 显式加载，不调用网页网络 API。`BOARD_FONTS` 仍为 sans / serif / handwritten 三个选项；`TUBE_FONT` 复用 sans ID，仅为霓虹渲染提供真实 Thin family，不改变已保存的 fontId。无 FontFaceSet 或加载失败时安全保留系统字体。Canvas 字体加载后的缓存失效与重绘由页面和渲染器处理。
