#!/usr/bin/env python3
"""Exercise Fluted Glass in the engine's isolated, headless preview."""
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
MODE = RUN / 'config/cosmic/com.system76.CosmicTheme.Mode/v1/is_dark'
ARTIFACTS = RUN / 'fluted-glass'
ARTIFACTS.mkdir(exist_ok=True)
SOURCE = (ROOT / 'shaders/fluted-glass.frag').read_text()
EFFECT = json.loads((ROOT / 'effects/fluted-glass.json').read_text())
DEFAULTS = {c['key']: c['default'] for c in EFFECT['controls']}
SAVED = {p: p.read_bytes() if p.exists() else None
         for p in [CONFIG / 'forge_runtime', CONFIG / 'glass_effect', BACKGROUND, MODE]}
results = []


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_name('.' + path.name + '.fluted')
    pending.write_text(value + '\n')
    pending.replace(path)


def select(name, source=SOURCE, **controls):
    values = dict(DEFAULTS, **{'forge_fluted_' + key: value for key, value in controls.items()})
    parameters = ','.join('(key:' + json.dumps(key) + ',name:' + json.dumps(uniform)
                          + ',value:' + str(float(values[key])) + ')'
                          for uniform, key in EFFECT['shader']['uniforms'].items())
    write(CONFIG / 'forge_runtime', '(abi:1,id:"fluted-glass",base:"glass",source:'
          + json.dumps(source) + ',parameters:[' + parameters + '])')
    write(CONFIG / 'glass_effect', '"fluted-glass"')
    time.sleep(.9)
    image = ImageGrab.grab(xdisplay=STATE['display']).convert('RGB')
    image.save(ARTIFACTS / (name + '.png'))
    return image


def check(name, condition, **measurements):
    results.append(dict(test=name, passed=bool(condition), **measurements))
    (ARTIFACTS / 'render-results.json').write_text(json.dumps(results, indent=2) + '\n')
    print(('PASS ' if condition else 'FAIL ') + name + ' ' + json.dumps(measurements), flush=True)
    assert condition, name


def diff(a, b, box):
    return sum(ImageStat.Stat(ImageChops.difference(a.crop(box), b.crop(box))).mean) / 3


def background(path):
    write(BACKGROUND, '(output:"all",source:Path(' + json.dumps(str(path))
          + '),filter_by_theme:false,rotation_frequency:300,filter_method:Lanczos,'
          + 'scaling_mode:Zoom,sampling_method:Alphanumeric)')
    time.sleep(.8)


try:
    reference = select('neutral', source=(ROOT / 'shaders/glass.frag').read_text(), blur=0)
    channels = [reference.getchannel(i).point([255 if v == c else 0 for v in range(256)])
                for i, c in enumerate((11, 14, 20))]
    header = ImageChops.multiply(ImageChops.multiply(channels[0], channels[1]), channels[2])
    rows = [header.tobytes()[y * header.width:(y + 1) * header.width] for y in range(header.height)]
    counts = [row.count(255) for row in rows]
    width = max(counts)
    assert width > 100, 'Native test surface header is missing'
    row = rows[counts.index(width)]
    left = row.find(max(row.split(b'\x00'), key=len))
    top = next(y for y, count in enumerate(counts) if count >= width * .75)
    body = (left + 350, top + 220, left + 700, top + 420)
    plain = select('zero-optics', blur=0, refraction=0, highlights=0)
    check('Zero refraction, blur and highlights preserve the backdrop', diff(reference, plain, body) < .2)
    refracted = select('refraction', blur=0, highlights=0)
    check('Refraction bends the actual backdrop', diff(plain, refracted, body) > .5)
    blurred = select('blurred', highlights=0)
    check('Blur softens the refracted backdrop', diff(refracted, blurred, body) > .5)
    tinted = select('tinted', color=100)
    check('Theme color changes the material', diff(blurred, tinted, body) > 1)
    default = select('default')
    check('Grooves remain inside the native surface',
          diff(reference, default, (left - 5, top - 5, left, top)) < .2)

    field = ARTIFACTS / 'flat-wallpaper.png'
    Image.new('RGB', (1280, 900), (42, 53, 72)).save(field)
    background(field)
    dense = select('spacing-20', spacing=20, blur=0, refraction=0, highlights=100)
    wide = select('spacing-80', spacing=80, blur=0, refraction=0, highlights=100)

    def ridges(image):
        values = [image.getpixel((x, top + 410))[0] for x in range(left + 220, left + 700)]
        cutoff = min(values) + (max(values) - min(values)) * .6
        return sum(a < cutoff <= b for a, b in zip(values, values[1:]))

    dense_count, wide_count = ridges(dense), ridges(wide)
    check('Groove spacing changes the visible ridge count',
          dense_count >= 20 and 4 <= wide_count <= 7 and dense_count >= wide_count * 3,
          spacing_20_ridges=dense_count, spacing_80_ridges=wide_count)
    for spacing in (8, 160):
        image = select('spacing-' + str(spacing), spacing=spacing)
        check('Spacing endpoint ' + str(spacing) + ' renders without a shader failure',
              diff(reference, image, body) > 1)
    for dark in (False, True):
        write(MODE, str(dark).lower())
        select('dark' if dark else 'light')
    check('Native compositor remains active',
          Path(STATE['env']['XDG_RUNTIME_DIR'], 'cosmic-forge-engine-v1').is_file())
finally:
    for path, data in SAVED.items():
        if data is None:
            path.unlink(missing_ok=True)
        else:
            path.write_bytes(data)
