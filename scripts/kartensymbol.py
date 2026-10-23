# Macht aus Kevins gemaltem Kartensymbol die Datei fürs Spiel: rund freigestellt, klein, als WebP.
#
# Aufruf (braucht Python mit Pillow):
#   python3 scripts/kartensymbol.py kunst/symbole/symbol-car.png
#   → src/assets/symbole/symbol-car.webp (160 × 160, außen durchsichtig)
# Namen: symbol-<art> wie im Doc (car, backpack, shed, …, zuhause, unbekannt).
import os
import sys
from PIL import Image, ImageDraw, ImageFilter

src = sys.argv[1]
name = os.path.splitext(os.path.basename(src))[0]
dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join('src', 'assets', 'symbole', name + '.webp')
SIZE = 160
im = Image.open(src).convert('RGB')
w, h = im.size
s = min(w, h)
im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((SIZE * 4, SIZE * 4), Image.LANCZOS)
# Runde Maske, etwas nach innen, damit kein weißer Rand bleibt; weiche Kante
mask = Image.new('L', im.size, 0)
r = SIZE * 4 * 0.475
c = SIZE * 2
ImageDraw.Draw(mask).ellipse((c - r, c - r, c + r, c + r), fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(2))
im.putalpha(mask)
im = im.resize((SIZE, SIZE), Image.LANCZOS)
os.makedirs(os.path.dirname(dst), exist_ok=True)
im.save(dst, 'WEBP', quality=88, method=6)
print(f'{dst}: {SIZE} × {SIZE}, {os.path.getsize(dst) // 1024} KB')
