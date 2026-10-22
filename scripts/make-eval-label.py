"""Synthetic evaluation label (not real packaging), copied from make-demo-label.py with a GTIN argument.
Usage: python -I scripts/make-eval-label.py OUT.png GTIN13 LOT DDM"""
import sys
from PIL import Image, ImageDraw, ImageFont

out, gtin, lot, ddm = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
gtin_text = f"{gtin[0]} {gtin[1:7]} {gtin[7:]}" if len(gtin) == 13 else gtin

def font(size, bold=False):
    for name in (["arialbd.ttf", "DejaVuSans-Bold.ttf"] if bold else ["arial.ttf", "DejaVuSans.ttf"]):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()

img = Image.new("RGB", (900, 600), (236, 230, 214))
d = ImageDraw.Draw(img)
d.rounded_rectangle((40, 40, 860, 560), radius=28, fill=(255, 252, 244), outline=(120, 110, 90), width=4)
d.rectangle((40, 40, 860, 100), fill=(178, 34, 34))
d.text((60, 52), "SYNTHETIC DEMO LABEL - NOT REAL PACKAGING", font=font(30, True), fill="white")
d.text((80, 130), "Les Vergers Gourmands", font=font(44, True), fill=(60, 50, 30))
d.text((80, 190), "Compote bio - gourde", font=font(34), fill=(60, 50, 30))
# Barcode-like stripes (decorative, not a scannable barcode).
x = 80
for i, w in enumerate([3, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 3, 1, 2, 1]):
    if i % 2 == 0:
        d.rectangle((x, 270, x + w * 4, 380), fill="black")
    x += w * 4 + 3
d.text((80, 390), gtin_text, font=font(30), fill="black")
d.rectangle((470, 270, 830, 470), outline=(60, 50, 30), width=3)
d.text((490, 290), "A consommer de", font=font(26), fill=(60, 50, 30))
d.text((490, 322), "preference avant le :", font=font(26), fill=(60, 50, 30))
d.text((490, 360), ddm, font=font(40, True), fill="black")
d.text((490, 415), f"LOT {lot}", font=font(40, True), fill="black")
d.text((80, 500), "Fictional label generated for the Lotara evaluation.", font=font(22), fill=(110, 100, 80))
img = img.rotate(2.5, expand=False, fillcolor=(236, 230, 214))
img.save(out, optimize=True)
print("wrote", out)
