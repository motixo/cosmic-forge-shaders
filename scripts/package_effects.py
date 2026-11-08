#!/usr/bin/env python3
"""Create the GitHub release asset from the glass sources in this repository."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OFFICIAL_ORDER = ['frosted', 'crystal', 'mica', 'aero', 'liquid-glass', 'minecraft-glass', 'void', 'ember', 'snow',
                  'fluted-glass', 'hammered-glass', 'chord-glass', 'cyberspace', 'rain-glass']


def bundle(revision, catalog=None, pack_id='cosmic-glass', shaders=None):
    definitions = json.loads((catalog or ROOT / 'effects.json').read_text())
    effects = definitions.get('effects', [definitions]) if isinstance(definitions, dict) else definitions
    if catalog is None:
        for path in sorted((ROOT / 'effects').glob('*.json')):
            effect = json.loads(path.read_text())
            for index, existing in enumerate(effects):
                if existing['id'] == effect['id']:
                    effects[index] = effect
                    break
            else:
                effects.append(effect)
        effects.sort(key=lambda effect: OFFICIAL_ORDER.index(effect['id'])
                     if effect['id'] in OFFICIAL_ORDER else len(OFFICIAL_ORDER))
    for effect in effects:
        shader = (shaders or ROOT / 'shaders') / (effect['id'] + '.frag')
        if shader.exists():
            effect.setdefault('shader', {'base': effect.get('preview', effect['id'])})['source'] = shader.read_text()
        if effect['id'] != 'frosted' and not effect.get('shader', {}).get('source'):
            raise ValueError('Missing shader for ' + effect['id'])
    return {'format': 1, 'id': pack_id, 'revision': revision, 'effects': effects}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision', type=int, required=True)
    parser.add_argument('--catalog', type=Path, help='A community effect definition or pack')
    parser.add_argument('--pack-id', default='cosmic-glass')
    parser.add_argument('--shader-dir', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'build/effects/cosmic-forge-glass.json')
    args = parser.parse_args()
    if args.revision < 1:
        parser.error('--revision must be positive and increase for every published pack')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(bundle(args.revision, args.catalog, args.pack_id, args.shader_dir), indent=2) + '\n')
    print(args.output)


if __name__ == '__main__':
    main()
