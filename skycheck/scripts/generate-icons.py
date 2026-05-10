#!/usr/bin/env python3
"""
Generate SkyCheck PWA icons (192x192 and 512x512 PNG) from the SVG.
Run from the skycheck/ directory:
    python scripts/generate-icons.py

Requires: pip install cairosvg
  or if cairosvg fails: pip install Pillow
"""
import os, sys

SVG_PATH = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons', 'favicon.svg')
OUT_DIR  = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
SIZES    = [192, 512]

def generate_with_cairosvg():
    import cairosvg
    for size in SIZES:
        out = os.path.join(OUT_DIR, f'pwa-{size}.png')
        cairosvg.svg2png(url=SVG_PATH, write_to=out, output_width=size, output_height=size)
        print(f'  ✓  pwa-{size}.png')

def generate_with_pillow():
    from PIL import Image, ImageDraw
    # Simple blue square with cloud (placeholder)
    for size in SIZES:
        img = Image.new('RGB', (size, size), color='#1A56C4')
        out = os.path.join(OUT_DIR, f'pwa-{size}.png')
        img.save(out)
        print(f'  ✓  pwa-{size}.png  (placeholder — install cairosvg for proper render)')

try:
    generate_with_cairosvg()
except ImportError:
    print('cairosvg not found — trying Pillow…')
    try:
        generate_with_pillow()
    except ImportError:
        print('Neither cairosvg nor Pillow found.')
        print('Run: pip install cairosvg')
        sys.exit(1)

print('\nIcons generated successfully in public/icons/')
