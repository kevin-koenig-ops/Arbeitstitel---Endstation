# Baut den Bogen mit Fenstern und Türen für die Häuser auf der Karte und die glatten Wände.
#
# Fenster: aus Kevins Fassadenbildern ausgeschnitten (kunst/texturen/haus-*.jpg), dazu
# vernagelte und kaputte Fassungen. Türen: hier gemalt (bis es ein Türbild gibt).
# Wände: die fensterlosen Streifen zwischen den Fenstern, nebeneinander gelegt und kachelbar.
#
# Aufruf (braucht Python mit Pillow und numpy):  python3 scripts/fenster.py
# Die Lage der Kästchen steht auch in src/map/windows.ts (beides zusammen ändern).
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = 'kunst/texturen'
OUT = 'src/assets/textures'
S = 2048 / 768  # die Kästchen unten sind in der 768er-Vorschau gemessen

# Fenster je Fassade (links, oben, rechts, unten), samt Fensterbank
WINDOWS = {
    'haus-putz': [(98, 76, 288, 304), (481, 78, 672, 304), (98, 433, 288, 664), (481, 435, 672, 664)],
    'haus-klinker': [(90, 36, 293, 334), (474, 36, 678, 334), (90, 418, 293, 720), (474, 418, 678, 720)],
    'haus-fachwerk': [(130, 100, 266, 278), (510, 100, 646, 278), (130, 484, 266, 664), (510, 484, 646, 664)],
}
CW, CH = 128, 160  # Fenster-Kästchen
DW, DH = 128, 256  # Tür-Kästchen
W, H = 1024, 2 * CH + DH

atlas = Image.new('RGB', (W, H), (40, 40, 40))
rng = random.Random(7)


def paste(img, col, row_y, w, h):
    """Mit 3 Pixel Rand (Ränder verlängert), damit es auf Abstand nicht in den Nachbarn blutet."""
    inner = img.resize((w - 6, h - 6), Image.LANCZOS)
    a = np.asarray(inner)
    a = np.pad(a, ((3, 3), (3, 3), (0, 0)), mode='edge')
    atlas.paste(Image.fromarray(a), (col * w, row_y))


crops = []
for name, boxes in WINDOWS.items():
    im = Image.open(f'{SRC}/{name}.jpg').convert('RGB')
    for b in boxes:
        crops.append(im.crop(tuple(int(v * S) for v in b)))


def planks(img):
    """Vernagelt: drei schräge Bretter über dem Fenster."""
    out = img.resize((256, 320)).convert('RGB')
    d = ImageDraw.Draw(out)
    for k, (y0, y1) in enumerate([(70, 40), (160, 150), (250, 270)]):
        col = (118 + k * 9, 84 + k * 6, 52)
        d.polygon([(-10, y0), (266, y1), (266, y1 + 46), (-10, y0 + 46)], fill=col, outline=(60, 40, 24))
        for x in (30, 220):
            d.ellipse((x - 4, y0 + (y1 - y0) * x / 256 + 18, x + 4, y0 + (y1 - y0) * x / 256 + 26), fill=(50, 50, 50))
    return out.filter(ImageFilter.SMOOTH)


def broken(img):
    """Kaputt: dunkles Glas mit Sprüngen."""
    a = np.asarray(img.resize((256, 320)).convert('RGB')).astype(float)
    g = a.mean(axis=2, keepdims=True)
    glass = (g < 150)  # dunkle Flächen = Glas
    a = np.where(glass, a * 0.35, a)
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(out)
    for _ in range(6):
        x, y = rng.randint(60, 200), rng.randint(60, 260)
        for _ in range(4):
            d.line((x, y, x + rng.randint(-70, 70), y + rng.randint(-70, 70)), fill=(200, 205, 210), width=2)
    return out


windows = crops + [planks(crops[3]), planks(crops[4]), broken(crops[0]), broken(crops[8])]
for i, img in enumerate(windows):
    paste(img, i % 8, (i // 8) * CH, CW, CH)


def door(base, style):
    """Gemalte Haustür: Rahmen, Füllungen, Klinke, unten etwas dunkler."""
    img = Image.new('RGB', (DW * 2, DH * 2), (90, 80, 70))
    d = ImageDraw.Draw(img)
    w, h = img.size
    frame = (225, 220, 205) if style != 'barn' else (95, 70, 45)
    d.rectangle((0, 0, w, h), fill=frame)
    d.rectangle((18, 18, w - 18, h), fill=base)
    dark = tuple(max(0, int(c * 0.78)) for c in base)
    light = tuple(min(255, int(c * 1.12)) for c in base)
    if style == 'panels':
        for y0, y1 in ((50, 200), (230, 380), (410, 500)):
            d.rectangle((50, y0, w - 50, y1), fill=dark)
            d.rectangle((58, y0 + 8, w - 58, y1 - 8), fill=light)
    elif style == 'glass':
        d.rectangle((60, 50, w - 60, 250), fill=(52, 66, 76))
        d.line((w // 2, 50, w // 2, 250), fill=base, width=10)
        d.line((60, 150, w - 60, 150), fill=base, width=10)
        d.rectangle((50, 300, w - 50, 470), fill=dark)
    elif style == 'strip':
        d.rectangle((w - 90, 40, w - 50, 480), fill=(52, 66, 76))
    elif style == 'fan':
        d.pieslice((18, -60, w - 18, 160), 0, 180, fill=(52, 66, 76))
        d.line((18, 50, w - 18, 50), fill=frame, width=12)
        for y0, y1 in ((120, 300), (330, 480)):
            d.rectangle((50, y0, w - 50, y1), fill=dark)
    elif style in ('barn', 'boarded'):
        for x in range(18, w - 18, 44):
            d.rectangle((x, 18, x + 40, h), fill=tuple(max(0, c + rng.randint(-14, 14)) for c in base), outline=dark)
        if style == 'boarded':
            for y in (120, 330):
                d.polygon([(0, y), (w, y - 40), (w, y + 6), (0, y + 46)], fill=(130, 96, 58), outline=(60, 40, 24))
        else:
            d.line((30, 40, w - 30, h - 40), fill=dark, width=18)
    # Klinke
    if style not in ('boarded',):
        d.rectangle((w - 72, 270, w - 40, 284), fill=(190, 180, 150))
    # Schmutz unten, leichtes Rauschen wie gemalt
    a = np.asarray(img).astype(float)
    yy = np.linspace(0, 1, h)[:, None, None]
    a *= 1 - 0.22 * np.clip((yy - 0.75) / 0.25, 0, 1)
    a += np.random.default_rng(len(style) * 7 + base[0]).normal(0, 7, a.shape)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.1))


DOORS = [((112, 74, 44), 'panels'), ((54, 92, 66), 'glass'), ((140, 52, 42), 'panels'), ((72, 84, 96), 'strip'), ((228, 222, 210), 'fan'), ((118, 86, 54), 'barn'), ((96, 70, 46), 'boarded'), ((150, 120, 70), 'glass')]
for i, (col, style) in enumerate(DOORS):
    paste(door(col, style), i, 2 * CH, DW, DH)

atlas.save(f'{OUT}/haus-fenster.webp', quality=88)
print('Fensterbogen:', atlas.size)


# --- Glatte Wände ---------------------------------------------------------------------------
# Die Spalten mit Fenstern herausschneiden, den Rest weich aneinandersetzen, zweimal
# nebeneinander (Putz gespiegelt, damit es sich weniger wiederholt), dann kachelbar machen.
KEEP = {
    'haus-putz': ([(0.0, 0.13), (0.365, 0.635), (0.87, 1.0)], 0.035, 0.925),
    'haus-klinker': ([(0.0, 0.11), (0.39, 0.6), (0.885, 1.0)], 0.0, 1.0),
    'haus-fachwerk': ([(0.0, 0.14), (0.335, 0.665), (0.86, 1.0)], 0.0, 1.0),
}


def hjoin(parts, overlap=24):
    """Bilder nebeneinander, an den Stößen weich überblendet."""
    out = np.asarray(parts[0]).astype(float)
    for p in parts[1:]:
        b = np.asarray(p).astype(float)
        t = np.linspace(0, 1, overlap)[None, :, None]
        mix = out[:, -overlap:] * (1 - t) + b[:, :overlap] * t
        out = np.concatenate([out[:, :-overlap], mix, b[:, overlap:]], axis=1)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


for name, (cols, y0, y1) in KEEP.items():
    im = Image.open(f'{SRC}/{name}.jpg').convert('RGB')
    w, h = im.size
    pieces = [im.crop((int(w * a), int(h * y0), int(w * b), int(h * y1))) for a, b in cols]
    one = hjoin(pieces)
    two = one.transpose(Image.FLIP_LEFT_RIGHT) if name == 'haus-putz' else one
    row = hjoin([one, two]).resize((1024, 1024), Image.LANCZOS)
    if name == 'haus-putz':
        # Putz: neu gemalt in Kevins Putzfarbe, als weiches Wolkenmuster (von sich aus kachelbar),
        # damit keine Spuren der Fensterrahmen bleiben
        base = np.asarray(row).reshape(-1, 3).mean(axis=0)
        noise = np.zeros((1024, 1024))
        g = np.random.default_rng(5)
        for scale, amp in ((90, 5.0), (24, 3.0), (5, 2.0)):
            f = np.fft.fft2(g.normal(0, 1, (1024, 1024)))
            fy = np.fft.fftfreq(1024)[:, None]
            fx = np.fft.fftfreq(1024)[None, :]
            f *= np.exp(-((fx**2 + fy**2) * (scale**2) * 20))
            n = np.real(np.fft.ifft2(f))
            noise += n / (n.std() + 1e-9) * amp
        tint = np.array([1.0, 0.92, 0.8])  # warm in den Flecken
        a = base[None, None, :] + noise[:, :, None] * tint[None, None, :]
        Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((512, 512), Image.LANCZOS).save(f'{OUT}/haus-wand-putz.webp', quality=88)
        print('Wand: haus-wand-putz (gemalt)')
        continue
    a = np.asarray(row).astype(float)
    N = 1024
    d = np.minimum(np.arange(N), N - 1 - np.arange(N)) / N
    t = np.clip(d / 0.05, 0, 1)
    m = t * t * (3 - 2 * t)
    a = a * m[None, :, None] + np.roll(a, N // 2, axis=1) * (1 - m[None, :, None])
    a = a * m[:, None, None] + np.roll(a, N // 2, axis=0) * (1 - m[:, None, None])
    out = name.replace('haus-', 'haus-wand-')
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((512, 512), Image.LANCZOS).save(f'{OUT}/{out}.webp', quality=86)
    print('Wand:', out)
