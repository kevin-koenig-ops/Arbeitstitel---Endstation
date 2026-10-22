# Macht ein Fassaden- oder Dachbild für die Häuser auf der Karte kachelbar.
#
# Fassaden sind zwei Stockwerke hoch und zwei Fenster breit. Um eine halbe Bildbreite
# (bzw. -höhe) verschoben liegen die Fenster also wieder an derselben Stelle; deshalb
# lässt sich der Rand mit einer verschobenen Kopie glätten, ohne dass Geisterfenster entstehen.
#
# Aufruf (braucht Python mit Pillow und numpy):
#   python3 scripts/fassade.py kunst/texturen/haus-putz.jpg src/assets/textures/haus-putz.webp [oben=0] [unten=1] [Größe=512] [Übergang=0.06]
# oben/unten: welcher Teil der Höhe bleibt (0–1), z. B. um ein Gesims oben oder einen Sockel unten abzuschneiden.
# Daneben entsteht <name>_check.png (3 × 3 gekachelt) zum Prüfen der Ränder; nicht einchecken.
import sys
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
top = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
bottom = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
size = int(sys.argv[5]) if len(sys.argv) > 5 else 512
band = float(sys.argv[6]) if len(sys.argv) > 6 else 0.06

im = Image.open(src).convert('RGB')
w, h = im.size
im = im.crop((0, int(h * top), w, int(h * bottom))).resize((1024, 1024), Image.LANCZOS)
a = np.asarray(im).astype(np.float32)
N = a.shape[0]


def ramp(n):
    d = np.minimum(np.arange(n), n - 1 - np.arange(n)) / n  # 0 am Rand, 0.5 in der Mitte
    t = np.clip(d / band, 0, 1)
    return t * t * (3 - 2 * t)


m = ramp(N)
a1 = a * m[None, :, None] + np.roll(a, N // 2, axis=1) * (1 - m[None, :, None])
a2 = a1 * m[:, None, None] + np.roll(a1, N // 2, axis=0) * (1 - m[:, None, None])

out = Image.fromarray(np.clip(a2, 0, 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)
out.save(dst, quality=86)
check = Image.new('RGB', (size * 3, size * 3))
for i in range(3):
    for j in range(3):
        check.paste(out, (i * size, j * size))
check.save(dst.rsplit('.', 1)[0] + '_check.png')
print('fertig:', dst)
