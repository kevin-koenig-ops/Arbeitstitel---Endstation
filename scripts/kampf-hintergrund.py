# Macht aus Kevins gemaltem Kampf-Hintergrund die Datei fürs Spiel (verkleinert, als WebP).
#
# Aufruf (braucht Python mit Pillow):
#   python3 scripts/kampf-hintergrund.py kunst/kampf/kampf-dorf.png
#   → src/assets/kampf/kampf-dorf.webp
# Name: kampf-<gegend>[-<jahreszeit>], Gegend: dorf, kleinstadt, stadt, wald, berge, kueste, wueste, schnee;
# Jahreszeit (wenn es eigene Bilder gibt): fruehling, sommer, herbst, winter.
# Das Bild sollte breit sein (21:9). Wichtig ist das untere Drittel, darüber ist Himmel.
import os
import sys
from PIL import Image

src = sys.argv[1]
name = os.path.splitext(os.path.basename(src))[0]
dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join('src', 'assets', 'kampf', name + '.webp')
im = Image.open(src).convert('RGB')
w, h = im.size
if w / h < 1.9:
    print(f'Hinweis: {w} × {h} ist recht schmal; gedacht ist 21:9 (etwa 2520 × 1080).')
if w > 2560:
    im = im.resize((2560, round(h * 2560 / w)), Image.LANCZOS)
os.makedirs(os.path.dirname(dst), exist_ok=True)
im.save(dst, 'WEBP', quality=82, method=6)
print(f'{dst}: {im.size[0]} × {im.size[1]}, {os.path.getsize(dst) // 1024} KB')
