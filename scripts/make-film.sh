#!/usr/bin/env bash
# Makes the passport's film (assets/film/r4n-live.mp4) from a video: black and white, cut into four
# paper tones like paper cut-outs, six frames a second with now and then a frame held longer, each
# frame nudged a pixel or two (the grain and flicker are added live, in the passport).
#
#   bash scripts/make-film.sh video.mp4 [start-end start-end ...]
#   e.g. bash scripts/make-film.sh show.mp4 0-14 85-92     (seconds; default: the whole video)
#
# Needs ffmpeg and python3 with numpy and Pillow.
set -euo pipefail
src=$1; shift
parts=("${@:-0-99999}")
here=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
mkdir -p "$work/raw" "$work/cut"
i=0
for p in "${parts[@]}"; do
  a=${p%-*}; b=${p#*-}
  # each part filled to the film's shape (360 x 424), grey
  ffmpeg -v error -y -ss "$a" -to "$b" -i "$src" \
    -vf "fps=6,scale=360:424:force_original_aspect_ratio=increase,crop=360:424,format=gray" \
    "$work/raw/$(printf %02d $i)_%04d.png"
  i=$((i + 1))
done
python3 - "$work" <<'PY'
import sys, glob, random
import numpy as np
from PIL import Image, ImageFilter
work = sys.argv[1]
random.seed(51)
TONES = np.array([18, 84, 160, 236], dtype=np.uint8)
out = []
for f in sorted(glob.glob(f"{work}/raw/*.png")):
    a = np.asarray(Image.open(f).convert("L").filter(ImageFilter.GaussianBlur(1.6))).astype(np.float32)
    # four tones at the frame's own brightness quantiles, so dark and bright shots both read
    q = np.maximum(np.quantile(a, [0.42, 0.7, 0.89]), [a.min() + 6, a.min() + 14, a.min() + 24])
    lev = np.digitize(a, q)
    lev = np.asarray(Image.fromarray((lev * 60).astype(np.uint8)).filter(ImageFilter.ModeFilter(5))).astype(np.int32) // 60
    img = TONES[lev].astype(np.int16)
    up = np.zeros_like(lev); up[1:, 1:] = lev[:-1, :-1]
    img[up > lev] -= 26  # each paper layer's shadow on the one below
    fr = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    dx, dy = random.randint(-2, 2), random.randint(-2, 2)
    out.append(fr.transform(fr.size, Image.AFFINE, (1, 0, dx, 0, 1, dy), fillcolor=18))
k = 0
for fr in out:
    for _ in range(2 if random.random() < 0.18 else 1):
        fr.save(f"{work}/cut/{k:04d}.png"); k += 1
print(k, "frames")
PY
mkdir -p "$here/assets/film"
ffmpeg -v error -y -framerate 6 -i "$work/cut/%04d.png" -c:v libx264 -preset veryslow -crf 27 -tune grain \
  -pix_fmt yuv420p -movflags +faststart -an "$here/assets/film/r4n-live.mp4"
ffmpeg -v error -y -i "$work/cut/0040.png" -q:v 4 "$here/assets/film/r4n-live.jpg" 2>/dev/null || ffmpeg -v error -y -i "$work/cut/0000.png" -q:v 4 "$here/assets/film/r4n-live.jpg"
rm -rf "$work"
echo "assets/film/r4n-live.mp4"
