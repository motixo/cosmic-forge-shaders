#!/usr/bin/env python3
"""Check real backdrop processing in a private native compositor preview."""
import json
import os
from pathlib import Path
import time

from PIL import Image, ImageChops, ImageGrab, ImageStat

ROOT = Path(__file__).resolve().parents[1]
RUN = Path(os.environ['CRYSTAL_QA_DIR']).resolve()
STATE = json.loads((RUN / 'state.json').read_text())
assert Path(STATE['env']['XDG_CONFIG_HOME']).resolve() == RUN / 'config'
CONFIG = RUN / 'config/cosmic/com.system76.CosmicComp/v1'
BACKGROUND = RUN / 'config/cosmic/com.system76.CosmicBackground/v1/all'
ARTIFACTS = RUN / 'cyberspace'
ARTIFACTS.mkdir(exist_ok=True)
SAVED = {p: p.read_bytes() if p.exists() else None for p in
         [CONFIG / 'forge_runtime', CONFIG / 'glass_effect', BACKGROUND]}
effect = json.loads((ROOT / 'effects/cyberspace.json').read_text())
results = []


def write(path, value):
    pending = path.with_name('.' + path.name + '.cyber')
    pending.write_text(value + '\n')
    pending.replace(path)


def capture(name):
    image = ImageGrab.grab(xdisplay=STATE['display']).convert('RGB')
    image.save(ARTIFACTS / (name + '.png'))
    return image


def select(name, animated=False, source=None, **controls):
    values = {c['key']: c['default'] for c in effect['controls']}
    values.update({'forge_cyber_' + key: value for key, value in controls.items()})
    shader = source if source is not None else (ROOT / 'shaders/cyberspace.frag').read_text()
    params = ','.join('(key:' + json.dumps(key) + ',name:' + json.dumps(uniform)
                     + ',value:' + str(float(values[key])) + ')'
                     for uniform, key in effect['shader']['uniforms'].items())
    write(CONFIG / 'forge_runtime', '(abi:1,id:"cyberspace",base:"glass",source:'
          + json.dumps(shader) + ',animated:' + str(animated).lower()
          + ',parameters:[' + params + '])')
    write(CONFIG / 'glass_effect', '"cyberspace"')
    time.sleep(.7)
    return capture(name)


def background(path):
    write(BACKGROUND, '(output:"all",source:Path(' + json.dumps(str(path))
          + '),filter_by_theme:false,rotation_frequency:300,filter_method:Lanczos,'
          + 'scaling_mode:Zoom,sampling_method:Alphanumeric)')
    time.sleep(.7)


def diff(a, b, box):
    return sum(ImageStat.Stat(ImageChops.difference(a.crop(box), b.crop(box))).mean) / 3


def check(name, condition, **measurements):
    results.append(dict(test=name, passed=bool(condition), **measurements))
    (ARTIFACTS / 'render-results.json').write_text(json.dumps(results, indent=2) + '\n')
    print(('PASS ' if condition else 'FAIL ') + name + ' ' + json.dumps(measurements), flush=True)
    assert condition, name


try:
    background(RUN / 'wallpaper.png')
    original = select('original', source=(ROOT / 'shaders/glass.frag').read_text(), blur=0)
    channels = [original.getchannel(i).point([255 if v == c else 0 for v in range(256)])
                for i, c in enumerate((11, 14, 20))]
    header_mask = ImageChops.multiply(ImageChops.multiply(channels[0], channels[1]), channels[2])
    data = header_mask.tobytes()
    rows = [data[y * header_mask.width:(y + 1) * header_mask.width] for y in range(header_mask.height)]
    counts = [row.count(255) for row in rows]
    width = max(counts)
    assert width > 100, 'Native test surface is missing'
    row = rows[counts.index(width)]
    left = row.find(max(row.split(b'\x00'), key=len))
    top = next(y for y, count in enumerate(counts) if count >= width * .75)
    body = (left + 350, top + 220, left + 700, top + 420)
    header = (left + 30, top + 15, left + 550, top + 70)
    outside = (left - 8, top - 8, left - 2, top - 2)
    off = select('strength-zero', strength=0)
    check('Zero effect strength preserves the actual backdrop', diff(original, off, body) < .2)
    transformed = select('defaults')
    difference = diff(original, transformed, body)
    check('Cyberspace transforms the backdrop', difference > 10, difference=difference)
    check('Opaque foreground remains untouched', diff(original, transformed, header) < .1)
    check('Effect stays inside rounded clipping', diff(original, transformed, outside) < .1)
    time.sleep(.5)
    check('Animation off stays still', diff(transformed, capture('still'), body) < .1)
    animated = select('animated', animated=True)
    time.sleep(.8)
    difference = diff(animated, capture('animated-later'), body)
    check('Animation on moves the data and scan', difference > .25, difference=difference)
    flat = select('no-depth', depth=0)
    check('Depth changes the projected space', diff(transformed, flat, body) > .5)
    blurred = select('blur-max', blur=100)
    check('Blur changes the processed background', diff(transformed, blurred, body) > .5)
    cyan = select('cyan', color=0)
    check('Theme color changes the neon palette', diff(cyan, transformed, body) > 1)
    bright = select('glow-max', glow=200)
    dim = select('glow-zero', glow=0)
    check('Glow has independent strength', diff(bright, dim, body) > .5)
    small = select('detail-min', size=3)
    large = select('detail-max', size=32)
    check('Detail size changes the digital fragments', diff(small, large, body) > 1)

    # A bright shape in two positions must move the processed contours with it.
    images = []
    for offset in (0, 240):
        field = Image.new('RGB', (1280, 900), (8, 8, 8))
        field.paste((230, 230, 230), (400 + offset, 300, 520 + offset, 720))
        path = ARTIFACTS / ('wallpaper-' + str(offset) + '.png')
        field.save(path)
        background(path)
        images.append(select('contours-' + str(offset), depth=0, strength=100, color=0))
    difference = diff(*images, body)
    check('Digital contours follow actual background content', difference > .5, difference=difference)
    background(RUN / 'wallpaper.png')
    check('Shaders compile without errors', 'Failed to compile' not in (RUN / 'compositor.log').read_text()
          and 'ShaderCompilationError' not in (RUN / 'compositor.log').read_text())
    print('PASS', len(results), 'Cyberspace native render checks', flush=True)
finally:
    for path, contents in SAVED.items():
        if contents is None:
            path.unlink(missing_ok=True)
        else:
            path.write_bytes(contents)
