#!/usr/bin/env python3
"""R4N's signature, for the stamped booking form (js/signature.js).

A fast, slanted, one-go "R4N": a tall spiky R with a loop, a sharp zig-zag 4, an N that runs into
a long swash, and a quick underline. It is drawn as a filled shape, thick on the downstrokes and
thin on the upstrokes (a broad nib held at an angle), tapering to hairlines at the ends, the way
an ink pen signature looks; not as a line of one width.

  python3 scripts/make-signature.py            writes js/signature.js
  python3 scripts/make-signature.py prev.png   and a preview

Each stroke is a list of points a smooth curve goes through (a repeated point makes a sharp
turn), in a 300 x 120 box (y down), before the slant.
"""
import math
import sys
from pathlib import Path

import numpy as np

STROKES = [
    # one joined stroke: R (in from below, up and down the stem, a loop at its foot, round the
    # bowl, a little loop, out along the leg), into the 4 (diagonal, loop, bar, loop, upright,
    # loop), into the N, and away in a long soft swash
    [
        (8, 98), (20, 90), (32, 64), (40, 32), (46, 16), (52, 16),
        (48, 44), (42, 72), (36, 96), (30, 104), (24, 99), (29, 90), (38, 70),
        (46, 40), (56, 18), (72, 10), (86, 18), (82, 34), (66, 45), (51, 48),
        (47, 44), (53, 41), (60, 47),
        (68, 64), (76, 86), (86, 97), (98, 97),
        (106, 82), (110, 56), (113, 34), (116, 26), (117, 32),
        (113, 50), (111, 64), (116, 70), (128, 68), (146, 66), (154, 60), (155, 46), (150, 32), (143, 24), (137, 27), (135, 40),
        (133, 62), (130, 86), (129, 99), (133, 104), (140, 98),
        (146, 76), (151, 48), (155, 30), (160, 26), (164, 36),
        (170, 60), (177, 84), (183, 95), (188, 88), (193, 62), (198, 38), (203, 22),
        (212, 14), (232, 9), (258, 10), (284, 16), (300, 26),
    ],
    # the underline: a quick, light flick rising to the right
    [(16, 113), (80, 108), (160, 101), (236, 92), (282, 78)],
]
# how long each stroke takes to write (seconds), and the pause before it
TIMING = [(1.25, 0.0), (0.3, 0.08)]
SLANT = 0.3           # forward lean (x += SLANT * (baseline - y))
BASE = 100
NIB = math.radians(38)  # the nib's angle: strokes across it are thickest
WMAX, WMIN = 5.0, 1.5


def catmull(pts, per=14):
    """A centripetal Catmull-Rom curve through the points (repeats give sharp corners)."""
    p = [np.array(pts[0])] + [np.array(q, float) for q in pts] + [np.array(pts[-1])]
    out = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        if np.allclose(p1, p2):
            continue
        def tj(ti, a, b):
            return ti + max(np.linalg.norm(b - a), 1e-6) ** 0.5
        t0 = 0.0; t1 = tj(t0, p0, p1); t2 = tj(t1, p1, p2); t3 = tj(t2, p2, p3)
        n = max(4, int(per * np.linalg.norm(p2 - p1) / 20))
        for t in np.linspace(t1, t2, n, endpoint=False):
            a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1 if t1 > t0 else p1
            a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3 if t3 > t2 else p2
            b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
            b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
            out.append((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2)
    out.append(p[-1])
    return np.array(out)


def resample(c, step=1.6):
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(c, axis=0), axis=1))]
    s = np.arange(0, d[-1], step)
    return np.c_[np.interp(s, d, c[:, 0]), np.interp(s, d, c[:, 1])]


def slant(c):
    return np.c_[c[:, 0] + SLANT * (BASE - c[:, 1]) - 4, c[:, 1]]


def widths(c, taper_in=0.05, taper_out=0.2):
    d = np.gradient(c, axis=0)
    ang = np.arctan2(d[:, 1], d[:, 0])
    w = WMIN + (WMAX - WMIN) * np.abs(np.sin(ang - NIB)) ** 1.3
    # the pen presses on the way down and barely touches on the way up
    down = d[:, 1] / (np.linalg.norm(d, axis=1) + 1e-9)
    w *= np.interp(down, [-1, -0.2, 0.3, 1], [0.55, 0.65, 0.92, 1.0])
    # and lifts into every sharp turn, so each one ends in a point
    t = d / (np.linalg.norm(d, axis=1, keepdims=True) + 1e-9)
    k = 3
    turn = np.zeros(len(c))
    turn[k:-k] = np.degrees(np.arccos(np.clip(np.sum(t[:-2 * k] * t[2 * k:], axis=1), -1, 1)))
    corners = np.where(turn > 150)[0]
    if len(corners):
        dist = np.min(np.abs(np.arange(len(c))[:, None] - corners[None, :]), axis=1) * 1.6  # in px
        w *= 0.6 + 0.4 * np.clip(dist / 11, 0, 1) ** 0.75
    w = np.convolve(np.r_[[w[0]] * 3, w, [w[-1]] * 3], np.ones(7) / 7, "valid")
    u = np.linspace(0, 1, len(c))
    ease = lambda x: x * x * (3 - 2 * x)
    w *= ease(np.clip(u / taper_in, 0, 1)) ** 0.6 * ease(np.clip((1 - u) / taper_out, 0, 1)) ** 0.8
    return np.maximum(w, 0.25)


def shape_widths(i, c):
    if i == len(STROKES) - 1:  # the underline: light
        return widths(c, 0.12, 0.45) * 0.62
    return widths(c, 0.04, 0.16)


def outline(c, w, chunk=36):
    """The filled shape: overlapping strips along the line, all wound the same way, so they add up
    (nonzero fill) even where the line crosses itself."""
    d = np.gradient(c, axis=0)
    n = np.c_[-d[:, 1], d[:, 0]]
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
    left, right = c + n * (w / 2)[:, None], c - n * (w / 2)[:, None]
    parts = []
    for a in range(0, len(c) - 1, chunk):
        b = min(len(c), a + chunk + 2)
        parts.append(np.r_[left[a:b], right[a:b][::-1]])
    return parts


def fmt(v):
    s = f"{v:.1f}"
    return s[:-2] if s.endswith(".0") else s


def path_of(poly):
    return "M" + " L".join(f"{fmt(x)} {fmt(y)}" for x, y in poly) + "Z"


def line_of(c):
    return "M" + " L".join(f"{fmt(x)} {fmt(y)}" for x, y in c[::3]) + f" L{fmt(c[-1][0])} {fmt(c[-1][1])}"


def main():
    shapes, lines = [], []
    for i, pts in enumerate(STROKES):
        c = slant(resample(catmull(pts)))
        w = shape_widths(i, c)
        shapes.append(" ".join(path_of(p) for p in outline(c, w)))
        lines.append(line_of(c))
    root = Path(__file__).resolve().parent.parent
    js = (
        "// R4N's signature (made by scripts/make-signature.py; change it there): a filled ink shape\n"
        "// for each stroke, the line it follows (to write it in, through a mask), and how long each\n"
        "// stroke takes and waits, in seconds. In a 300 x 120 box.\n"
        "export const SIGNATURE = {\n"
        "  box: [300, 120],\n"
        f"  shapes: {repr(shapes).replace(chr(39), chr(34))},\n"
        f"  lines: {repr(lines).replace(chr(39), chr(34))},\n"
        f"  timing: {[list(t) for t in TIMING]},\n"
        "};\n"
    )
    (root / "js" / "signature.js").write_text(js)
    print("js/signature.js", len(js), "bytes")
    if len(sys.argv) > 1:
        from PIL import Image, ImageDraw
        k = 4
        img = Image.new("RGB", (300 * k, 120 * k), (243, 236, 222))
        g = ImageDraw.Draw(img)
        for i, pts in enumerate(STROKES):
            c = slant(resample(catmull(pts)))
            w = shape_widths(i, c)
            for p in outline(c, w):
                g.polygon([(x * k, y * k) for x, y in p], fill=(26, 34, 76))
        img.save(sys.argv[1])
        print(sys.argv[1])


if __name__ == "__main__":
    main()
