# Macht aus Kevins gemaltem Kartenrahmen die Datei fürs Spiel.
#
# Aufruf (braucht Python mit Pillow, NumPy und SciPy):
#   python3 scripts/kartenrahmen.py kunst/rahmen/rahmen-grund.png
#   → src/assets/rahmen/rahmen-grund.webp
# Namen wie im Doc: rahmen-grund, rahmen-kurz, rahmen-<einmal|waffe|faehigkeit>-<gewoehnlich|selten|episch|legendaer>.
#
# Was passiert:
#   1. Die grüne Innenfläche (#00FF00) wird durchsichtig, grüner Schimmer an den Kanten verschwindet.
#   2. Der weiße Hintergrund außen wird durchsichtig, auch zwischen Stacheldraht und Papier.
#   3. Die Karte selbst (ohne überstehenden Draht) wird auf 1000 × 1400 gebracht, mit 50 Bildpunkten
#      Rand ringsum für Teile, die überstehen. Das Spiel legt den Rahmen deshalb 5 % breiter
#      und 3,57 % höher als die Karte (siehe .kc.painted::before in styles.css).
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

PAPER_W, PAPER_H, MARGIN = 1000, 1400, 50
OUT_SCALE = 0.55  # 1100 × 1500 → 605 × 825, reicht für die große Karte im Kartenbuch

src = sys.argv[1]
name = os.path.splitext(os.path.basename(src))[0]
dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join('src', 'assets', 'rahmen', name + '.webp')

rgb = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
H, W, _ = rgb.shape
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]

# 1. Grün: je grüner, desto durchsichtiger
greenness = g - np.maximum(r, b)
alpha_green = 1 - np.clip((greenness - 35) / 90, 0, 1)
spill = greenness > 0
g = np.where(spill, np.maximum(r, b) + 0.15 * np.clip(greenness, 0, 40), g)

# 2. Weiß außen: helle, farblose Flächen, die den Bildrand berühren oder außerhalb der Karte liegen
lo = np.minimum(np.minimum(r, g), b)
hi = np.maximum(np.maximum(r, g), b)
whiteish = (lo > 222) & (hi - lo < 28)
labels, n = ndimage.label(whiteish)
edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
bg = np.isin(labels, edge[edge > 0])
# Kartenfläche = alles, was nicht Hintergrund ist; Löcher darin (helle Stellen im Papier) gehören dazu
solid = ndimage.binary_fill_holes(~bg)
ys, xs = np.where(solid)
# Papierkante ohne überstehenden Draht: die Zeile/Spalte in der Mitte messen
mid_row = solid[H // 2]
mid_col = solid[:, W // 2]
px0, px1 = np.where(mid_row)[0][[0, -1]]
py0, py1 = np.where(mid_col)[0][[0, -1]]
# Weiße Taschen zwischen Draht und Papier: helle Flächen außerhalb der Papierkante
outside = np.ones_like(bg)
outside[py0 + 6:py1 - 6, px0 + 6:px1 - 6] = False
small_pockets = whiteish & outside
bg |= small_pockets
# Weiche Kante: im schmalen Saum neben dem Hintergrund nach Helligkeit abstufen
ring = ndimage.binary_dilation(bg, iterations=2) & ~bg
alpha_white = np.ones_like(r)
alpha_white[bg] = 0
alpha_white[ring] = np.clip((255 - lo[ring]) / 90, 0, 1)
alpha = np.minimum(alpha_green, alpha_white)
alpha = ndimage.gaussian_filter(alpha, 0.6)

# Farbe vom weißen Hintergrund lösen, damit kein heller Saum bleibt
a = np.clip(alpha, 1e-3, 1)[..., None]
col = np.stack([r, g, b], -1)
white_part = (1 - alpha_white)[..., None]
col = np.where(white_part > 0, (col - 255 * (1 - a)) / a, col)
col = np.clip(col, 0, 255)

rgba = np.dstack([col, alpha * 255]).astype(np.uint8)
im = Image.fromarray(rgba, 'RGBA')

# 3. Auf ein festes Maß bringen: Papier 1000 × 1400, ringsum 50 Rand
sx = PAPER_W / (px1 - px0)
sy = PAPER_H / (py1 - py0)
big = im.resize((round(W * sx), round(H * sy)), Image.LANCZOS)
ox, oy = round(px0 * sx) - MARGIN, round(py0 * sy) - MARGIN
canvas = Image.new('RGBA', (PAPER_W + 2 * MARGIN, PAPER_H + 2 * MARGIN), (0, 0, 0, 0))
canvas.paste(big.crop((ox, oy, ox + canvas.width, oy + canvas.height)), (0, 0))
out = canvas.resize((round(canvas.width * OUT_SCALE), round(canvas.height * OUT_SCALE)), Image.LANCZOS)

# Innenfläche melden, damit man sieht, ob der Rahmen zu den anderen passt
gy, gx = np.where(alpha_green < 0.5)
inner = ((gx.min() - px0) / (px1 - px0), (gy.min() - py0) / (py1 - py0), (px1 - gx.max()) / (px1 - px0), (py1 - gy.max()) / (py1 - py0))
os.makedirs(os.path.dirname(dst), exist_ok=True)
out.save(dst, 'WEBP', quality=86, method=6)
print(f'{dst}: {out.width} × {out.height}, {os.path.getsize(dst) // 1024} KB')
print('Innenfläche (links, oben, rechts, unten in % der Karte): ' + ', '.join(f'{v * 100:.1f}' for v in inner))
