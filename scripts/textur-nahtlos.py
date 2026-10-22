# Macht ein (fast) kachelbares Bild nahtlos und verkleinert es für die Karte.
# Zwei Durchgänge: erst links/rechts, dann oben/unten (je mit halb verschobener Kopie).
#
# Aufruf (braucht Python mit Pillow und numpy):
#   python3 scripts/textur-nahtlos.py kunst/texturen/wiese-sommer.jpg src/assets/textures/wiese-sommer.webp
#   [Größe=512] [Übergang=0.14] [Helligkeit=1.0] [Sättigung=1.0] [Kontrast=1.0]
# Daneben entsteht <name>_check.png (3 × 3 gekachelt) zum Prüfen der Ränder; nicht einchecken.
import sys
import numpy as np
from PIL import Image, ImageEnhance

src, dst = sys.argv[1], sys.argv[2]
size = int(sys.argv[3]) if len(sys.argv) > 3 else 512
band = float(sys.argv[4]) if len(sys.argv) > 4 else 0.14
bright = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
sat = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0
contrast = float(sys.argv[7]) if len(sys.argv) > 7 else 1.0

im = Image.open(src).convert('RGB')
w, h = im.size

def repeats_2x2(img):
    """Ist das Bild schon 2 × 2 gekachelt (Gemini macht das oft)? Dann wiederholt es sich nach der halben Breite."""
    g = np.asarray(img.convert('L').resize((512, 512))).astype(np.float32)
    g -= g.mean()
    F = np.fft.fft2(g)
    ac = np.real(np.fft.ifft2(F * np.conj(F))) / max(1e-6, float((g * g).sum()))
    return min(ac[256, 0], ac[0, 256]) > 0.5

if w == h and repeats_2x2(im):
    # Eine Wiederholung aus der Mitte nehmen (ohne Ränder, dort sitzen oft Wasserzeichen).
    # Ihre Kanten passen schon fast, der Übergang muss nur wenig glätten.
    q = w // 2
    im = im.crop((q // 2, q // 2, q // 2 + q, q // 2 + q)).resize((1024, 1024), Image.LANCZOS)
    band = min(band, 0.08)
    print('2 × 2 gekachelt erkannt: nehme ein Viertel aus der Mitte')
else:
    # Gemini-Zeichen o. Ä. am Rand: ein paar Prozent abschneiden, dann quadratisch
    c = int(min(w, h) * 0.02)
    im = im.crop((c, c, w - c, h - c))
    n = min(im.size)
    im = im.crop((0, 0, n, n)).resize((1024, 1024), Image.LANCZOS)
a = np.asarray(im).astype(np.float32)
N = a.shape[0]

def ramp(n):
    d = np.minimum(np.arange(n), n - 1 - np.arange(n)) / n  # 0 am Rand, 0.5 in der Mitte
    t = np.clip(d / band, 0, 1)
    return t * t * (3 - 2 * t)

m = ramp(N)
# links/rechts
ax = np.roll(a, N // 2, axis=1)
a1 = a * m[None, :, None] + ax * (1 - m[None, :, None])
# oben/unten
ay = np.roll(a1, N // 2, axis=0)
a2 = a1 * m[:, None, None] + ay * (1 - m[:, None, None])

out = Image.fromarray(np.clip(a2, 0, 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)
out = ImageEnhance.Color(ImageEnhance.Brightness(out).enhance(bright)).enhance(sat)
out = ImageEnhance.Contrast(out).enhance(contrast)
out.save(dst, quality=84, method=6)
print(dst, out.size, 'Mittelfarbe', tuple(int(v) for v in np.asarray(out).reshape(-1, 3).mean(0)))

# Prüfbild: 3x3 gekachelt
t = Image.new('RGB', (size * 3, size * 3))
for x in range(3):
    for y in range(3):
        t.paste(out, (x * size, y * size))
t.save(dst.rsplit('.', 1)[0] + '_check.png')
