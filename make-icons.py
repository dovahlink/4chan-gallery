#!/usr/bin/env python3
"""Genereaza iconitele PWA (icon-180/192/512.png).

Se ruleaza o singura data; iconitele sunt commit-uite in repo.
    python make-icons.py

Deseneaza la 4x si micsoreaza, ca marginile sa iasa netede.
Glifa sta in zona centrala (~62%), ca sa supravietuiasca decuparii
"maskable" de pe Android si colturilor rotunjite de pe iOS.
"""

import os

from PIL import Image, ImageDraw

BG_TOP = (24, 29, 38)
BG_BOT = (14, 15, 18)
ACC = (79, 140, 255)
WHITE = (255, 255, 255)
SIZES = (180, 192, 512)
SS = 4  # supersampling


def rounded(draw, box, r, **kw):
    draw.rounded_rectangle(box, radius=r, **kw)


def build(size):
    S = size * SS
    img = Image.new("RGB", (S, S), BG_BOT)
    d = ImageDraw.Draw(img)

    # fundal: gradient vertical discret
    for y in range(S):
        t = y / max(S - 1, 1)
        d.line([(0, y), (S, y)], fill=(
            round(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t),
            round(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t),
            round(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t),
        ))

    side = S * 0.44          # latura unei "poze"
    r = S * 0.075            # raza colturilor
    w = max(int(S * 0.032), 1)  # grosime contur
    cx = cy = S / 2
    off = S * 0.055          # decalajul dintre cele doua poze

    # poza din spate: doar contur
    bx, by = cx - side / 2 - off, cy - side / 2 - off
    rounded(d, [bx, by, bx + side, by + side], r, outline=ACC, width=w)

    # poza din fata: plina
    fx, fy = cx - side / 2 + off, cy - side / 2 + off
    rounded(d, [fx, fy, fx + side, fy + side], r, fill=ACC)

    # triunghi de play, centrat in poza din fata
    tw = side * 0.34
    th = tw * 1.12
    tcx, tcy = fx + side / 2 + tw * 0.06, fy + side / 2
    d.polygon([
        (tcx - tw / 2, tcy - th / 2),
        (tcx - tw / 2, tcy + th / 2),
        (tcx + tw / 2, tcy),
    ], fill=WHITE)

    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    for s in SIZES:
        p = os.path.join(here, "icon-%d.png" % s)
        build(s).save(p, "PNG", optimize=True)
        print("scris %s (%d bytes)" % (os.path.basename(p), os.path.getsize(p)))
