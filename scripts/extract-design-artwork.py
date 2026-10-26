#!/usr/bin/env python3
"""Extract the four original homepage artwork assets from its design reference.

Requires Pillow and NumPy. The normal application build uses the checked-in WebP
files and does not run this script. See docs/design/ARTWORK.md for provenance.
"""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE_SIZE = (871, 1806)
PAPER_RGB = np.array([253.0, 251.0, 244.0])


def paper_alpha(rgb: np.ndarray) -> np.ndarray:
    """Remove the original cream paper while retaining the drawn marks."""
    return np.clip((np.max(PAPER_RGB - rgb, axis=2) - 16) / 65, 0, 1)


def write_webp(image: Image.Image, alpha: np.ndarray, path: Path) -> None:
    image.putalpha(Image.fromarray(np.uint8(alpha * 255)))
    image.save(path, format="WEBP", quality=96, alpha_quality=100, method=6)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    print(f"{path.name} {image.width}x{image.height} {path.stat().st_size} bytes sha256={digest}")


def extract_paper(
    source: Image.Image,
    output: Path,
    box: tuple[int, int, int, int],
    name: str,
    protected: tuple[tuple[int, int], ...] = (),
    erase: tuple[tuple[int, int, int, int], ...] = (),
) -> None:
    image = source.crop(box).convert("RGBA")
    rgb = np.asarray(image)[:, :, :3].astype(float)
    alpha = paper_alpha(rgb)
    if protected:
        keep = Image.new("L", image.size)
        ImageDraw.Draw(keep).polygon(
            [(x - box[0], y - box[1]) for x, y in protected], fill=255
        )
        alpha = np.maximum(alpha, np.asarray(keep) / 255)
    for x0, y0, x1, y1 in erase:
        alpha[y0:y1, x0:x1] = 0
    write_webp(image, alpha, output / name)


def extract_banner(source: Image.Image, output: Path) -> None:
    image = source.crop((20, 1470, 565, 1760)).convert("RGBA")
    rgb = np.asarray(image)[:, :, :3].astype(float)
    red, green, blue = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    purple = (
        (blue - red > -3)
        & (blue - green > 9)
        & (red > 155)
        & (green > 125)
        & (blue > 175)
    )
    alpha = np.ones(red.shape)
    alpha[purple] = np.clip((175 - red[purple]) / 20, 0, 1)

    # This is the original full purple panel in crop-local coordinates. Its right
    # edge intentionally extends beyond this artwork crop, which ends at x=545.
    panel = Image.new("L", image.size)
    ImageDraw.Draw(panel).rounded_rectangle((20, 8, 812, 286), radius=35, fill=255)
    outside = np.asarray(panel) == 0
    alpha[outside] = np.minimum(alpha[outside], paper_alpha(rgb)[outside])
    # The original purple panel ends before this crop's bottom edge. Remove its
    # bright paper strip, retaining the dark pole and saturated drawn details.
    bottom_paper = (red > 220) & (green > 220) & (blue > 210)
    bottom_paper[:275] = False
    alpha[bottom_paper] = np.minimum(alpha[bottom_paper], paper_alpha(rgb)[bottom_paper])
    alpha[140:, 535:] = 0  # Remove the tiny fragment of the original CTA button.
    write_webp(image, alpha, output / "design-banner.webp")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source", type=Path,
        default=REPO_ROOT / "docs/design/CheerBoard-01-home.png",
        help="871×1806 homepage reference PNG (default: repository design reference)",
    )
    parser.add_argument(
        "--out", type=Path, default=REPO_ROOT / "public/artwork",
        help="directory for the four WebP files (default: public/artwork)",
    )
    args = parser.parse_args()
    with Image.open(args.source) as original:
        if original.size != SOURCE_SIZE:
            parser.error(
                f"source must be {SOURCE_SIZE[0]}×{SOURCE_SIZE[1]}, "
                f"got {original.width}×{original.height}; crop coordinates are fixed"
            )
        source = original.convert("RGB")
    args.out.mkdir(parents=True, exist_ok=True)

    extract_paper(
        source, args.out, (32, 103, 838, 300), "design-brand.webp",
        erase=((720, 0, 806, 61),),
    )
    extract_paper(source, args.out, (775, 106, 831, 166), "design-settings.webp")
    extract_paper(
        source, args.out, (20, 482, 850, 925), "design-hero.webp",
        protected=((96, 566), (756, 522), (770, 804), (99, 826)),
        erase=((80, 370, 750, 443),),
    )
    extract_banner(source, args.out)


if __name__ == "__main__":
    main()
