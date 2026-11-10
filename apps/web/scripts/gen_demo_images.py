#!/usr/bin/env python3
"""Genera las ilustraciones de demostración (public/demo/<slug>-1..4.svg).

Son siluetas simples sobre blanco, solo para recorrer la tienda en desarrollo; se marcan como «ilustración demo».
Los productos y sus slugs viven en apps/api/internal/seed/demo.go. Uso: python3 scripts/gen_demo_images.py
"""
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "demo"
INK, WHITE, LINE = "#05080F", "#FFFFFF", "#D9DCE3"

# slug -> (forma, color principal, color de acento)
PRODUCTS = {
    "demo-jordan-4-retro-white-oreo": ("sneaker", "#F2F2F2", "#8A8F99"),
    "demo-nike-dunk-low-panda": ("sneaker", "#F5F5F5", "#111111"),
    "demo-nike-air-force-1-triple-white": ("sneaker", "#FAFAFA", "#CFCFCF"),
    "demo-new-balance-550-white-green": ("sneaker", "#F4F4F2", "#1F6B4A"),
    "demo-adidas-samba-og": ("sneaker", "#161616", "#E8E8E8"),
    "demo-adidas-gazelle-bold": ("sneaker", "#F2A7C0", "#FFFFFF"),
    "demo-nike-air-max-90": ("sneaker", "#E9E9E9", "#C8102E"),
    "demo-jordan-1-low": ("sneaker", "#F6EDEF", "#E48FA6"),
    "demo-nike-victori-one-slide": ("slide", "#141414", "#FFFFFF"),
    "demo-essentials-hoodie-negro": ("hoodie", "#15171C", "#3A3E48"),
    "demo-nike-sportswear-tee": ("tee", "#F4F4F4", "#B9BDC6"),
    "demo-essentials-boxy-tee-crema": ("tee", "#EFE6D2", "#CFC3A8"),
    "demo-essentials-cargo-pant": ("pants", "#4B5440", "#323A2B"),
    "demo-jordan-windrunner-jacket": ("jacket", "#14161B", "#C8102E"),
    "demo-jordan-pro-cap": ("cap", "#14161B", "#C8102E"),
    "demo-nike-everyday-socks": ("socks", "#F4F4F4", "#B9BDC6"),
    "demo-nike-heritage-bag": ("bag", "#17191F", "#5F7DAD"),
}


def svg(body: str) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" role="img">'
        f'<rect width="800" height="800" fill="{WHITE}"/>'
        '<ellipse cx="400" cy="660" rx="290" ry="26" fill="#05080F" opacity=".06"/>'
        f"{body}"
        f'<text x="780" y="784" text-anchor="end" font-family="Arial,sans-serif" font-size="14" fill="{LINE}">ILUSTRACIÓN DEMO</text>'
        "</svg>"
    )


def sneaker(v, c, a):
    sole = f'<path d="M110 560 C110 520 140 505 175 505 L640 505 C700 505 725 535 725 565 L725 590 C725 610 710 620 690 620 L145 620 C122 620 110 605 110 585 Z" fill="{WHITE}" stroke="{LINE}" stroke-width="4"/>'
    if v == 0:
        return (
            sole
            + f'<path d="M175 505 L190 380 C195 335 230 320 262 325 L330 340 C380 375 430 385 470 380 C560 380 640 430 700 500 L705 505 Z" fill="{c}" stroke="{LINE}" stroke-width="3"/>'
            + f'<path d="M118 540 C118 515 140 505 175 505 L262 505 L272 445 C225 432 185 445 176 488 Z" fill="{a}" opacity=".9"/>'
            + f'<path d="M300 470 C380 505 470 478 570 440" stroke="{a}" stroke-width="20" fill="none" stroke-linecap="round"/>'
            + "".join(f'<rect x="{262+i*34}" y="{342+i*9}" width="26" height="9" rx="3" fill="{WHITE}" stroke="{LINE}" transform="rotate(18 {262+i*34} {342+i*9})"/>' for i in range(4))
        )
    if v == 1:
        return (
            f'<path d="M120 400 C120 330 200 300 300 300 L600 320 C690 330 705 470 600 482 L300 500 C200 500 120 470 120 400 Z" fill="{c}" stroke="{LINE}" stroke-width="4"/>'
            + f'<path d="M120 400 C120 345 170 318 235 308 L235 492 C170 482 120 455 120 400 Z" fill="{a}" opacity=".85"/>'
            + "".join(f'<rect x="{300+i*42}" y="{345+i*8}" width="34" height="11" rx="3" fill="{WHITE}" stroke="{LINE}"/>' for i in range(4))
            + f'<ellipse cx="560" cy="400" rx="60" ry="50" fill="{WHITE}" opacity=".25"/>'
        )
    if v == 2:
        return (
            f'<rect x="250" y="250" width="300" height="360" rx="110" fill="{c}" stroke="{LINE}" stroke-width="4"/>'
            + f'<rect x="330" y="215" width="140" height="70" rx="30" fill="{a}"/>'
            + f'<rect x="250" y="540" width="300" height="70" rx="30" fill="{WHITE}" stroke="{LINE}" stroke-width="3"/>'
            + f'<rect x="375" y="330" width="50" height="200" rx="12" fill="{a}" opacity=".8"/>'
        )
    return (
        f'<path d="M110 400 C110 330 190 300 300 300 L610 320 C700 330 715 470 610 485 L300 500 C190 500 110 470 110 400 Z" fill="{WHITE}" stroke="{LINE}" stroke-width="4"/>'
        + "".join(f'<path d="M{200+i*60} 330 L{200+i*60} 470" stroke="{a}" stroke-width="10" stroke-linecap="round"/>' for i in range(8))
        + f'<path d="M140 400 C140 360 200 335 300 335 L600 350" stroke="{a}" stroke-width="6" fill="none"/>'
    )


def slide(v, c, a):
    if v in (0, 3):
        return (
            f'<path d="M110 560 C110 530 150 520 190 520 L600 520 C690 520 715 550 715 575 C715 600 690 615 660 615 L150 615 C125 615 110 595 110 560 Z" fill="{a}" stroke="{LINE}" stroke-width="3"/>'
            + f'<path d="M230 520 C260 400 520 400 580 520 Z" fill="{c}"/>'
        )
    return (
        f'<ellipse cx="400" cy="420" rx="280" ry="150" fill="{c}"/>'
        f'<path d="M180 400 C260 300 540 300 620 400" stroke="{a}" stroke-width="16" fill="none"/>'
    )


def top(v, c, a, hood=False, zip_=False, long=True):
    if long:
        sleeves = f'<path d="M290 200 L130 560 L215 595 L330 330 Z" fill="{c}" stroke="{LINE}" stroke-width="3"/><path d="M510 200 L670 560 L585 595 L470 330 Z" fill="{c}" stroke="{LINE}" stroke-width="3"/>'
    else:
        sleeves = f'<path d="M290 200 L170 330 L240 385 L330 310 Z" fill="{c}" stroke="{LINE}" stroke-width="3"/><path d="M510 200 L630 330 L560 385 L470 310 Z" fill="{c}" stroke="{LINE}" stroke-width="3"/>'
    body = f'<path d="M290 200 L330 190 Q400 235 470 190 L510 200 L520 640 L280 640 Z" fill="{c}" stroke="{LINE}" stroke-width="3"/>'
    neck = (
        f'<path d="M300 190 Q400 90 500 190 Q400 250 300 190 Z" fill="{a}" stroke="{LINE}" stroke-width="3"/>' if hood
        else f'<path d="M335 190 Q400 250 465 190" stroke="{a}" stroke-width="16" fill="none" stroke-linecap="round"/>'
    )
    extras = ""
    if hood and v == 0:
        extras += f'<path d="M290 480 L510 480 L490 560 L310 560 Z" fill="{a}" opacity=".6"/><path d="M370 235 L368 320 M430 235 L432 320" stroke="{WHITE}" stroke-width="6" stroke-linecap="round"/>'
    if zip_ and v == 0:
        extras += f'<path d="M400 240 L400 640" stroke="{a}" stroke-width="8"/>'
        extras += f'<rect x="290" y="450" width="70" height="60" rx="8" fill="{a}" opacity=".5"/>'
    if v == 1:  # espalda
        return sleeves + body + (f'<path d="M300 190 Q400 130 500 190 L490 300 Q400 260 310 300 Z" fill="{a}" opacity=".7"/>' if hood else f'<path d="M335 190 Q400 215 465 190" stroke="{a}" stroke-width="16" fill="none" stroke-linecap="round"/>')
    if v == 2:  # detalle
        return f'<g transform="translate(-400 -330) scale(2)">{sleeves}{body}{neck}{extras}</g>'
    if v == 3:  # doblada
        return f'<rect x="190" y="230" width="420" height="380" rx="26" fill="{c}" stroke="{LINE}" stroke-width="3"/><path d="M190 300 L610 300" stroke="{a}" stroke-width="6"/><rect x="330" y="230" width="140" height="40" rx="18" fill="{a}"/>'
    return sleeves + body + neck + extras


def pants(v, c, a):
    if v == 3:
        return f'<rect x="200" y="250" width="400" height="320" rx="24" fill="{c}" stroke="{LINE}" stroke-width="3"/><rect x="200" y="250" width="400" height="48" rx="20" fill="{a}"/>'
    p = f'<path d="M270 140 L530 140 L565 650 L430 650 L400 330 L370 650 L235 650 Z" fill="{c}" stroke="{LINE}" stroke-width="3"/><rect x="270" y="130" width="260" height="44" rx="10" fill="{a}"/>'
    if v == 0:
        p += f'<rect x="262" y="390" width="62" height="90" rx="8" fill="{a}" opacity=".8"/><rect x="476" y="390" width="62" height="90" rx="8" fill="{a}" opacity=".8"/>'
    if v == 2:
        return f'<g transform="translate(-400 -140) scale(2)">{p}</g>'
    return p


def cap(v, c, a):
    if v == 1:
        return f'<path d="M210 520 C210 260 590 260 590 520 Z" fill="{c}" stroke="{LINE}" stroke-width="3"/><path d="M200 520 L600 520 L600 560 L200 560 Z" fill="{a}"/><circle cx="400" cy="330" r="16" fill="{a}"/>'
    if v == 2:
        return f'<path d="M210 520 C210 260 590 260 590 520 Z" fill="{c}" stroke="{LINE}" stroke-width="3"/><rect x="330" y="470" width="140" height="40" rx="8" fill="{a}"/>'
    if v == 3:
        return f'<circle cx="400" cy="400" r="230" fill="{c}" stroke="{LINE}" stroke-width="3"/><circle cx="400" cy="400" r="22" fill="{a}"/>' + "".join(f'<path d="M400 400 L{400+230*__import__("math").cos(i*1.0472):.0f} {400+230*__import__("math").sin(i*1.0472):.0f}" stroke="{a}" stroke-width="4"/>' for i in range(6))
    return f'<path d="M180 520 C180 300 360 260 520 300 C610 320 640 420 640 520 Z" fill="{c}" stroke="{LINE}" stroke-width="3"/><path d="M130 520 C330 480 520 490 660 520 L660 560 C520 535 330 535 130 560 Z" fill="{a}"/>'


def socks(v, c, a):
    one = lambda x: f'<path d="M{x} 180 L{x+130} 180 L{x+130} 450 C{x+130} 500 {x+190} 520 {x+190} 580 C{x+190} 620 {x+150} 640 {x+80} 640 L{x-10} 640 C{x-50} 640 {x-50} 600 {x} 560 C{x} 520 {x} 480 {x} 450 Z" fill="{c}" stroke="{LINE}" stroke-width="3"/><rect x="{x}" y="180" width="130" height="50" fill="{a}"/>'
    if v == 2:
        return f'<g transform="translate(-300 -100) scale(1.6)">{one(240)}</g>'
    return one(140) + one(330) + one(520) if v != 3 else one(330)


def bag(v, c, a):
    s = f'<path d="M270 300 C270 140 530 140 530 300" stroke="{a}" stroke-width="22" fill="none" stroke-linecap="round"/><rect x="190" y="290" width="420" height="330" rx="28" fill="{c}" stroke="{LINE}" stroke-width="3"/><rect x="240" y="440" width="320" height="120" rx="16" fill="{a}" opacity=".35"/><rect x="380" y="400" width="40" height="30" rx="6" fill="{a}"/>'
    if v == 2:
        return f'<g transform="translate(-400 -280) scale(2)">{s}</g>'
    return s


SHAPES = {
    "sneaker": sneaker, "slide": slide, "pants": pants, "cap": cap, "socks": socks, "bag": bag,
    "hoodie": lambda v, c, a: top(v, c, a, hood=True),
    "jacket": lambda v, c, a: top(v, c, a, hood=True, zip_=True),
    "tee": lambda v, c, a: top(v, c, a, long=False),
}

for slug, (shape, c, a) in PRODUCTS.items():
    for v in range(4):
        (OUT / f"{slug}-{v+1}.svg").write_text(svg(SHAPES[shape](v, c, a)), encoding="utf-8")
print(f"{len(PRODUCTS) * 4} ilustraciones en {OUT}")
