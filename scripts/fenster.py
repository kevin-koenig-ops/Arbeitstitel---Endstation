# Baut den Bogen mit Fenstern, Türen, Toren und Fensterbändern für die Häuser auf der Karte
# und die glatten Wände dazu.
#
# Fenster: aus Kevins Fassadenbildern ausgeschnitten (kunst/texturen/haus-*.jpg), dazu
# vernagelte und kaputte Fassungen. Türen: aus Kevins Türbild (haus-tueren), dazu
# umgefärbte Fassungen, Scheunentür aus der Holzwand, vernagelte Tür.
# Hallen: Rolltore aus dem Wellblech (quer gedreht) und das Fensterband aus haus-halle.
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
# Diese kommen hinter die vernagelten und kaputten (Nummern 16–23)
WINDOWS_MORE = {
    'haus-platte': [(66, 110, 314, 272), (450, 110, 700, 272), (66, 453, 316, 624), (450, 453, 700, 624)],
    'haus-holz': [(116, 108, 268, 266), (501, 108, 650, 266), (116, 488, 268, 657), (501, 488, 650, 657)],
}
CW, CH = 128, 160  # Fenster-Kästchen (3 Reihen à 8)
DW, DH = 128, 256  # Tür-Kästchen (1 Reihe à 8)
GW = 256  # Rolltor-Kästchen (256 × 256, unten links)
SW, SH = 512, 96  # Fensterband-Kästchen (unten rechts, 3 übereinander)
W = H = 1024
DOOR_Y = 3 * CH
LOW_Y = DOOR_Y + DH

atlas = Image.new('RGB', (W, H), (40, 40, 40))
rng = random.Random(7)


def paste(img, x, y, w, h):
    """Mit 3 Pixel Rand (Ränder verlängert), damit es auf Abstand nicht in den Nachbarn blutet."""
    inner = img.resize((w - 6, h - 6), Image.LANCZOS)
    a = np.asarray(inner)
    a = np.pad(a, ((3, 3), (3, 3), (0, 0)), mode='edge')
    atlas.paste(Image.fromarray(a), (x, y))


def crops_of(table):
    out = []
    for name, boxes in table.items():
        im = Image.open(f'{SRC}/{name}.jpg').convert('RGB')
        for b in boxes:
            out.append(im.crop(tuple(int(v * S) for v in b)))
    return out


def planks(img, size=(256, 320), rows=((70, 40), (160, 150), (250, 270))):
    """Vernagelt: schräge Bretter darüber."""
    out = img.resize(size).convert('RGB')
    d = ImageDraw.Draw(out)
    w = size[0]
    for k, (y0, y1) in enumerate(rows):
        col = (118 + k * 9, 84 + k * 6, 52)
        d.polygon([(-10, y0), (w + 10, y1), (w + 10, y1 + 46), (-10, y0 + 46)], fill=col, outline=(60, 40, 24))
        for x in (30, w - 36):
            yy = y0 + (y1 - y0) * x / w
            d.ellipse((x - 4, yy + 18, x + 4, yy + 26), fill=(50, 50, 50))
    return out.filter(ImageFilter.SMOOTH)


def broken(img, size=(256, 320), cracks=6):
    """Kaputt: dunkles Glas mit Sprüngen."""
    a = np.asarray(img.resize(size).convert('RGB')).astype(float)
    g = a.mean(axis=2, keepdims=True)
    glass = g < 150  # dunkle Flächen = Glas
    a = np.where(glass, a * 0.35, a)
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(out)
    w, h = size
    for _ in range(cracks):
        x, y = rng.randint(int(w * 0.2), int(w * 0.8)), rng.randint(int(h * 0.2), int(h * 0.8))
        for _ in range(4):
            d.line((x, y, x + rng.randint(-70, 70), y + rng.randint(-int(h * 0.25), int(h * 0.25))), fill=(200, 205, 210), width=2)
    return out


# --- Fenster -------------------------------------------------------------------------------
crops = crops_of(WINDOWS)
windows = crops + [planks(crops[3]), planks(crops[4]), broken(crops[0]), broken(crops[8])] + crops_of(WINDOWS_MORE)
for i, img in enumerate(windows):
    paste(img, (i % 8) * CW, (i // 8) * CH, CW, CH)


# --- Türen ---------------------------------------------------------------------------------
T = Image.open(f'{SRC}/haus-tueren.jpg').convert('RGB')
green = T.crop(tuple(int(v * S) for v in (30, 28, 352, 768)))
red = T.crop(tuple(int(v * S) for v in (412, 28, 742, 768)))


def recolor(img, hue, leaf, new_h, s_mul, v_mul, s_max=80):
    """Türblatt umfärben (HSV): nur Pixel im Farbton der Tür, Efeu (kräftiger) bleibt grün."""
    hsv = np.asarray(img.convert('HSV')).astype(float)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    yy, xx = np.mgrid[0 : h.shape[0], 0 : h.shape[1]]
    x0, y0, x1, y1 = [int(c * S) for c in leaf]
    lo, hi = hue
    tone = (h >= lo) & (h <= hi) if lo <= hi else (h >= lo) | (h <= hi)
    m = (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1) & tone & (s < s_max)
    h = np.where(m, new_h, h)
    s = np.where(m, np.clip(s * s_mul, 0, 255), s)
    v = np.where(m, np.clip(v * v_mul, 0, 255), v)
    return Image.fromarray(np.stack([h, s, v], -1).astype(np.uint8), 'HSV').convert('RGB')


LEAF_G = (36, 30, 302, 740)  # Türblatt im Ausschnitt (768er Maßstab)
LEAF_R = (25, 30, 312, 740)
holz = Image.open(f'{SRC}/haus-holz.jpg').convert('RGB')


def barn_door():
    """Scheunentür: Bretter aus der Holzwand, dunkler Rahmen und Querstreben."""
    img = holz.crop(tuple(int(v * S) for v in (282, 0, 497, 494))).resize((256, 584))
    d = ImageDraw.Draw(img, 'RGBA')
    w, h = img.size
    d.rectangle((0, 0, w, h), outline=(40, 28, 18, 255), width=12)
    for y in (90, h - 120):
        d.rectangle((10, y, w - 10, y + 26), fill=(78, 58, 38, 235))
    d.line((24, h - 110, w - 24, 120), fill=(78, 58, 38, 235), width=24)
    d.rectangle((w - 52, h // 2 - 8, w - 30, h // 2 + 40), fill=(60, 56, 50, 255))
    return img.filter(ImageFilter.GaussianBlur(0.8))


doors = [
    green,
    red,
    recolor(green, (40, 84), LEAF_G, 150, 0.9, 0.95),  # blaugrau
    recolor(green, (40, 84), LEAF_G, 20, 1.3, 0.8),  # braun
    recolor(green, (40, 84), LEAF_G, 30, 0.15, 1.35),  # weiß
    barn_door(),
    planks(green, (256, 584), ((120, 90), (300, 330), (470, 440))),  # vernagelt
    recolor(red, (240, 20), LEAF_R, 22, 0.9, 0.75, 256),  # dunkelbraun
]
for i, img in enumerate(doors):
    paste(img, i * DW, DOOR_Y, DW, DH)


# --- Hallen: Rolltore und Fensterband --------------------------------------------------------
halle = Image.open(f'{SRC}/haus-halle.jpg').convert('RGB')


def roller(tint, rust):
    """Rolltor: Wellblech quer gedreht, dunkler Rahmen, unten schmutzig."""
    img = halle.crop(tuple(int(v * S) for v in (130, 118, 370, 358))).rotate(90, expand=True).resize((GW, GW))
    a = np.asarray(img).astype(float) * np.array(tint)[None, None, :]
    yy = np.linspace(0, 1, GW)[:, None, None]
    a *= 1 - 0.25 * np.clip((yy - 0.7) / 0.3, 0, 1)
    a = a * (1 - rust) + np.array([120, 70, 40])[None, None, :] * rust * (a.mean(axis=2, keepdims=True) / 140)
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, GW - 1, GW - 1), outline=(48, 46, 44), width=10)
    d.rectangle((10, 10, GW - 11, 30), fill=(70, 70, 68))
    return img


paste(roller((0.95, 0.98, 1.02), 0.0), 0, LOW_Y, GW, GW)
paste(roller((1.0, 0.95, 0.9), 0.35), GW, LOW_Y, GW, GW)

strip = halle.crop(tuple(int(v * S) for v in (34, 382, 736, 512)))
paste(strip, 512, LOW_Y, SW, SH)
paste(broken(strip, (1024, 192), 14), 512, LOW_Y + SH, SW, SH)
paste(planks(strip, (1024, 192), ((20, 60), (110, 70))), 512, LOW_Y + 2 * SH, SW, SH)

atlas.save(f'{OUT}/haus-fenster.webp', quality=88)
print('Fensterbogen:', atlas.size)


# --- Glatte Wände ---------------------------------------------------------------------------
# Die Spalten mit Fenstern herausschneiden, den Rest weich aneinandersetzen, zweimal
# nebeneinander (Putz gespiegelt, damit es sich weniger wiederholt), dann kachelbar machen.
# Halle: statt Spalten die Zeile mit dem Fensterband heraus.
KEEP = {
    'haus-putz': ([(0.0, 0.13), (0.365, 0.635), (0.87, 1.0)], 0.035, 0.925),
    'haus-klinker': ([(0.0, 0.11), (0.39, 0.6), (0.885, 1.0)], 0.0, 1.0),
    'haus-fachwerk': ([(0.0, 0.14), (0.335, 0.665), (0.86, 1.0)], 0.0, 1.0),
    'haus-holz': ([(0.0, 0.148), (0.355, 0.65), (0.85, 1.0)], 0.0, 1.0),
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


def seamless(row, name):
    """Kachelbar machen: Ränder mit einer um die halbe Breite verschobenen Kopie überblenden."""
    a = np.asarray(row.resize((1024, 1024), Image.LANCZOS)).astype(float)
    N = 1024
    d = np.minimum(np.arange(N), N - 1 - np.arange(N)) / N
    t = np.clip(d / 0.05, 0, 1)
    m = t * t * (3 - 2 * t)
    a = a * m[None, :, None] + np.roll(a, N // 2, axis=1) * (1 - m[None, :, None])
    a = a * m[:, None, None] + np.roll(a, N // 2, axis=0) * (1 - m[:, None, None])
    out = name.replace('haus-', 'haus-wand-')
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((512, 512), Image.LANCZOS).save(f'{OUT}/{out}.webp', quality=86)
    print('Wand:', out)


for name, (cols, y0, y1) in KEEP.items():
    im = Image.open(f'{SRC}/{name}.jpg').convert('RGB')
    w, h = im.size
    pieces = [im.crop((int(w * a), int(h * y0), int(w * b), int(h * y1))) for a, b in cols]
    one = hjoin(pieces)
    two = one.transpose(Image.FLIP_LEFT_RIGHT) if name == 'haus-putz' else one
    row = hjoin([one, two])
    if name == 'haus-putz':
        # Putz: neu gemalt in Kevins Putzfarbe, als weiches Wolkenmuster (von sich aus kachelbar),
        # damit keine Spuren der Fensterrahmen bleiben
        base = np.asarray(row.resize((1024, 1024))).reshape(-1, 3).mean(axis=0)
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
    seamless(row, name)

# Plattenbau: die Fugen sollen bleiben. Deshalb die Fenster mit der Wand darunter übermalen
# (in die Länge gezogen, so werden die Rostspuren länger), dann von Fuge zu Fuge zuschneiden.
pl = np.asarray(Image.open(f'{SRC}/haus-platte.jpg').convert('RGB')).astype(float)
for (x0, y0, x1, y1), (b0, b1) in [((52, 96, 328, 292), (292, 372)), ((436, 96, 714, 292), (292, 372)), ((52, 439, 330, 642), (642, 712)), ((436, 439, 714, 642), (642, 712))]:
    x0, y0, x1, y1, b0, b1 = (int(v * S) for v in (x0, y0, x1, y1, b0, b1))
    p = np.asarray(Image.fromarray(pl[b0:b1, x0:x1].astype(np.uint8)).resize((x1 - x0, y1 - y0), Image.LANCZOS)).astype(float)
    f = 34
    my = np.clip(np.minimum(np.arange(y1 - y0), y1 - y0 - 1 - np.arange(y1 - y0)) / f, 0, 1)
    mx = np.clip(np.minimum(np.arange(x1 - x0), x1 - x0 - 1 - np.arange(x1 - x0)) / f, 0, 1)
    m = (my[:, None] * mx[None, :])[..., None]
    pl[y0:y1, x0:x1] = pl[y0:y1, x0:x1] * (1 - m) + p * m
seamless(Image.fromarray(np.clip(pl, 0, 255).astype(np.uint8)).crop((0, int(38 * S), 2048, int(718 * S))), 'haus-platte')

# Halle: Wellblech über und unter dem Fensterband, übereinander gesetzt
w, h = halle.size
top = np.asarray(halle.crop((0, 0, w, int(h * 0.49)))).astype(float)
bot = np.asarray(halle.crop((0, int(h * 0.672), w, h))).astype(float)
ov = 24
t = np.linspace(0, 1, ov)[:, None, None]
col = np.concatenate([top[:-ov], top[-ov:] * (1 - t) + bot[:ov] * t, bot[ov:]], axis=0)
seamless(Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)), 'haus-halle')
