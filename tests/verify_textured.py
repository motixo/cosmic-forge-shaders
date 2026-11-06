#!/usr/bin/env python3
"""Verify textured glass against a native surface in a private engine preview."""
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
ARTIFACTS = RUN / 'textured-glass'
ARTIFACTS.mkdir(exist_ok=True)
SAVED = {p: p.read_bytes() if p.exists() else None
         for p in [CONFIG / 'forge_runtime', CONFIG / 'glass_effect', BACKGROUND]}
results = []


def write(path, value):
    pending = path.with_name('.' + path.name + '.textured')
    pending.write_text(value + '\n')
    pending.replace(path)


def select(effect, prefix, name, source=None, **controls):
    values = {c['key']: c['default'] for c in effect['controls']}
    values.update({f'forge_{prefix}_' + key: value for key, value in controls.items()})
    shader = source if source is not None else (ROOT / 'shaders' / (effect['id'] + '.frag')).read_text()
    params = ','.join('(key:' + json.dumps(key) + ',name:' + json.dumps(uniform)
                     + ',value:' + str(float(values[key])) + ')'
                     for uniform, key in effect['shader']['uniforms'].items())
    write(CONFIG / 'forge_runtime', '(abi:1,id:' + json.dumps(effect['id'])
          + ',base:"glass",source:' + json.dumps(shader) + ',parameters:[' + params + '])')
    write(CONFIG / 'glass_effect', json.dumps(effect['id']))
    time.sleep(.75)
    image = ImageGrab.grab(xdisplay=STATE['display']).convert('RGB')
    image.save(ARTIFACTS / (effect['id'] + '-' + name + '.png'))
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
    time.sleep(.7)


materials = [('hammered-glass', 'hammered'), ('chord-glass', 'chord')]
flat = {}
try:
    for identifier, prefix in materials:
        effect = json.loads((ROOT / 'effects' / (identifier + '.json')).read_text())
        select_effect = lambda name, **kwargs: select(effect, prefix, name, **kwargs)
        background(RUN / 'wallpaper.png')
        reference = select_effect('neutral', source=(ROOT / 'shaders/glass.frag').read_text(), blur=0)
        channels = [reference.getchannel(i).point([255 if v == c else 0 for v in range(256)])
                    for i, c in enumerate((11, 14, 20))]
        header = ImageChops.multiply(ImageChops.multiply(channels[0], channels[1]), channels[2])
        data = header.tobytes()
        rows = [data[y * header.width:(y + 1) * header.width] for y in range(header.height)]
        counts = [row.count(255) for row in rows]
        width = max(counts)
        assert width > 100, 'Native test surface is missing'
        row = rows[counts.index(width)]
        left = row.find(max(row.split(b'\x00'), key=len))
        top = next(y for y, count in enumerate(counts) if count >= width * .75)
        body = (left + 350, top + 220, left + 700, top + 420)
        plain = select_effect('zero-optics', blur=0, refraction=0, texture=0)
        check(identifier + ': zero optics preserves the backdrop', diff(reference, plain, body) < .2)
        refracted = select_effect('refraction', blur=0, texture=0)
        delta = diff(plain, refracted, body)
        check(identifier + ': refraction bends the actual backdrop', delta > .1, difference=delta)
        blurred = select_effect('blurred', texture=0)
        check(identifier + ': blur softens the backdrop', diff(refracted, blurred, body) > .25)
        default = select_effect('default')
        check(identifier + ': texture has independent strength', diff(blurred, default, body) > .5)
        tinted = select_effect('tinted', color=100)
        check(identifier + ': theme color tints the material', diff(default, tinted, body) > 1)
        check(identifier + ': effect stays inside rounded clipping',
              diff(reference, default, (left - 5, top - 5, left, top)) < .2)

        field = ARTIFACTS / 'flat-wallpaper.png'
        Image.new('RGB', (1280, 900), (42, 53, 72)).save(field)
        background(field)
        clear = select_effect('flat-clear', blur=0, refraction=0, texture=100)
        frosted = select_effect('flat-frosted', blur=100, refraction=0, texture=100)
        check(identifier + ': blur leaves surface detail sharp on a uniform backdrop',
              diff(clear, frosted, body) < .5, difference=diff(clear, frosted, body))
        maximum = next(c['max'] for c in effect['controls'] if c['key'] == f'forge_{prefix}_size')
        small = select_effect('size-min', size=2, blur=0, refraction=0, texture=100)
        large = select_effect('size-max', size=maximum, blur=0, refraction=0, texture=100)
        check(identifier + ': size endpoints visibly change the pattern', diff(small, large, body) > .5)
        flat[identifier] = clear.crop(body)
    for a, b in zip(materials, materials[1:]):
        difference = sum(ImageStat.Stat(ImageChops.difference(flat[a[0]], flat[b[0]])).mean) / 3
        check(a[0] + ' and ' + b[0] + ' have distinct textures', difference > 1, difference=difference)
    chord = flat['chord-glass']
    horizontal = diff(chord, ImageChops.offset(chord, 1, 0), (2, 2, chord.width - 2, chord.height - 2))
    vertical = diff(chord, ImageChops.offset(chord, 0, 1), (2, 2, chord.width - 2, chord.height - 2))
    check('Chord detail follows vertical threads', horizontal > vertical * 2,
          horizontal_difference=horizontal, vertical_difference=vertical)
    check('Native compositor remains active',
          Path(STATE['env']['XDG_RUNTIME_DIR'], 'cosmic-forge-engine-v1').is_file())
finally:
    for path, contents in SAVED.items():
        if contents is None:
            path.unlink(missing_ok=True)
        else:
            path.write_bytes(contents)
