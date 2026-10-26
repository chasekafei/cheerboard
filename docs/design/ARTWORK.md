# 首页原稿艺术资产

更新日期：2026-10-26。

这四张图片直接提取自用户提供并指定使用的首页设计稿 [CheerBoard-01-home.png](./CheerBoard-01-home.png)，保留原稿的品牌艺术字、手绘线星、设置图标及 Lion heart 纸旗。它们经过裁切、透明蒙版和 WebP 编码，没有重新生图或矢量重画，也没有把整张页面截图放进应用。

源图尺寸为 **871 × 1806**，文件 **1,587,476 字节**，SHA-256：

```text
03a07bcebeeb74a2eec6a4b5f553494d025f49ea11679adbfad0ea49c56094ea
```

首页仍使用真实 HTML 实现页头结构、无障碍标题、分类、设置按钮、主 CTA、存档数量与卡片、手幅推广标题和 CTA。品牌艺术字显示为原稿图片，另有真实 HTML 标题供辅助技术读取；按钮有真实交互，不属于图片。灯牌首页 hero 显示原稿示例与外围原画，开始制作按钮单独实现；用户作品及手幅预览仍由应用 Canvas 绘制。

## 复现

提取脚本是 [scripts/extract-design-artwork.py](../../scripts/extract-design-artwork.py)。需要 Python 3、Pillow 和 NumPy；应用运行、常规构建与打包直接使用 `public/artwork/*.webp`，不依赖 Python，也不联网下载素材。

先在临时目录复现，避免改动已有资源：

```sh
python3 scripts/extract-design-artwork.py --out /tmp/cheerboard-artwork-repro
```

默认源图与输出目录均按脚本所在仓库定位，因此不依赖当前工作目录。也可以显式指定：

```sh
python3 scripts/extract-design-artwork.py \
  --source docs/design/CheerBoard-01-home.png \
  --out /tmp/cheerboard-artwork-repro
```

确认后运行不带参数的脚本，会覆盖 `public/artwork` 中这四个同名 WebP。脚本只输出这四张 WebP，不生成 PNG 中间文件；尺寸不是 871 × 1806 的源图会在写入前被拒绝。裁切坐标固定，替换源图时还须人工确认构图相同。

2026-10-26 在 **Pillow 12.1.1、NumPy 1.24.4、libwebp 1.6.0** 下复现，临时目录四个输出与当前资源逐字节一致。全部使用 `quality=96, alpha_quality=100, method=6` 编码，不附带源图元数据。不同编码库版本可能改变压缩字节，核对 SHA 时应使用上述版本。

| 文件（位于 `public/artwork/`） | 输出尺寸 | 字节 | SHA-256 |
| --- | --- | ---: | --- |
| `design-brand.webp` | 806 × 197 | 33,992 | `e271f2b2b87e4317be672066accf05abd6eefad321028cf833f1a254fd2265d7` |
| `design-settings.webp` | 56 × 60 | 2,158 | `fd4b287fdf986fc6eb8ef9fc8d9c86f4683b61e19fcbbd4c491db11a47213f61` |
| `design-hero.webp` | 830 × 443 | 78,514 | `f6a01c40d22e84b4b85216e8a00d7f0f05929e15a743cd31fc972dcb43988114` |
| `design-banner.webp` | 545 × 290 | 36,510 | `ac38a4ac11a1b875bb627d2a108acb0ad5d7f1167682a85b55deeb5cb218a112` |

## 裁切与透明度

源图裁切框使用 Pillow 的 `(left, top, right, bottom)`，右、下边界不包含在输出中；下表中的局部坐标以各裁切框左上角为原点。

| 文件 | 源图裁切框 | 处理 |
| --- | --- | --- |
| 品牌 `design-brand.webp` | `(32, 103, 838, 300)` | 纸底透明；清空局部矩形 `(720, 0, 806, 61)`，去掉进入品牌裁切区的设置齿轮。 |
| 设置 `design-settings.webp` | `(775, 106, 831, 166)` | 纸底透明，单独保留原稿齿轮。 |
| Hero `design-hero.webp` | `(20, 482, 850, 925)` | 纸底透明，保留外围原画；保护源图四边形 `((96,566), (756,522), (770,804), (99,826))`，使黑板内部完全不透明；清空局部矩形 `(80, 370, 750, 443)`，去掉原稿主按钮。 |
| 纸旗 `design-banner.webp` | `(20, 1470, 565, 1760)` | 使用下述紫色背景与纸底组合蒙版，保留原稿 Lion heart 纸旗。 |

前三张图片的纸底透明度按 RGB 浮点值计算，结果限制在 0–1：

```text
paperalpha = clip((max([253, 251, 244] - rgb, axis=2) - 16) / 65, 0, 1)
```

Hero 保护区用 Pillow 多边形蒙版与 `paperalpha` 取最大值。清除区域通过 NumPy 切片将 alpha 设为 0；最后 `uint8(alpha * 255)` 写入图片。

纸旗初始 alpha 为 1，随后执行：

```text
purple = (b-r > -3) & (b-g > 9) & (r > 155) & (g > 125) & (b > 175)
alpha[purple] = clip((175-r[purple]) / 20, 0, 1)
```

用 Pillow 圆角矩形定义原紫板区域：局部 `(20, 8, 812, 286)`、圆角半径 35。右边界 812 有意超出 545 像素宽的纸旗裁切区，沿用原整块紫板位置。在圆角矩形外，令 `alpha=min(alpha,paperalpha)`，去掉原背景白条。

原紫板实际在裁切底边前结束，因此还需移除板内残留的一条亮纸色横线：仅在局部 `y>=275` 且 `r>220, g>220, b>210` 的像素上取 `alpha=min(alpha,paperalpha)`，保留黑色旗杆和饱和彩色手绘。最后令 `alpha[140:,535:]=0`，去掉右下方原按钮微小残片。该组合蒙版是当前最终算法，早期临时脚本仅去紫底的版本不用于复现。

底边修正后的 alpha 检查：仅 3,971 个目标亮色像素发生变化，目标蒙版外没有 alpha 变化；局部 `y=280..289` 的非透明像素从 3,457 个降至 1 个，剩余单像素 alpha 为 11/255，不再形成白线。其余三张 WebP 与修正前逐字节相同。
