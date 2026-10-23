# Macht ein Straßenbild nahtlos (nur links/rechts) und verkleinert es für die Karte.
# Die Straße läuft im Bild waagerecht; oben und unten sind ihre Ränder und bleiben, wie sie sind.
#
# Aufruf (braucht Python mit Pillow und numpy):
#   python3 scripts/strasse-nahtlos.py kunst/texturen/feldweg-sommer.jpg src/assets/textures/feldweg-sommer.webp
#   [Breite=1024] [Übergang=0.12]
# Daneben entsteht <name>_check.png (3 × nebeneinander) zum Prüfen der Nähte; nicht einchecken.
import sys
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
width = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
band = float(sys.argv[4]) if len(sys.argv) > 4 else 0.12

im = Image.open(src).convert('RGB')
w, h = im.size
# Ein schmaler Rand ringsum weg (Gemini-Zeichen und unsaubere Kanten)
c = int(min(w, h) * 0.015)
im = im.crop((c, c, w - c, h - c))
a = np.asarray(im).astype(np.float32)
W = a.shape[1]

# Links/rechts: mit der halb verschobenen Kopie überblenden, an den Rändern ganz die Kopie
d = np.minimum(np.arange(W), W - 1 - np.arange(W)) / W  # 0 am Rand, 0.5 in der Mitte
t = np.clip(d / band, 0, 1)
m = t * t * (3 - 2 * t)
shifted = np.roll(a, W // 2, axis=1)
out = a * m[None, :, None] + shifted * (1 - m[None, :, None])

img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
height = round(width * img.size[1] / img.size[0])
img = img.resize((width, height), Image.LANCZOS)
img.save(dst, quality=82)

check = Image.new('RGB', (width * 3, height))
for i in range(3):
    check.paste(img, (i * width, 0))
check.save(dst.rsplit('.', 1)[0] + '_check.png')
print(dst, img.size)
