#!/usr/bin/env python3
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('package_effects', ROOT / 'scripts/package_effects.py')
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class PublisherTests(unittest.TestCase):
    def test_crystal_controls_keep_the_native_fallback_catalog(self):
        builtins = json.loads((ROOT / 'effects.json').read_text())
        old = next(e for e in builtins if e['id'] == 'crystal')
        pack = publisher.bundle(4)
        crystal = next(e for e in pack['effects'] if e['id'] == 'crystal')
        self.assertEqual(len(crystal['controls']), len(old['controls']) + 2)
        color = next(c for c in crystal['controls'] if c['key'] == 'forge_crystal_color')
        self.assertEqual((color['min'], color['max'], color['default']), (0, 100, 0))
        dispersion = next(c for c in crystal['controls'] if c['key'] == 'forge_crystal_dispersion')
        self.assertEqual((dispersion['min'], dispersion['max'], dispersion['default']), (0, 10, 1))
        self.assertEqual(crystal['shader']['uniforms'], {
            'forge_crystal_color': 'forge_crystal_color',
            'forge_crystal_dispersion': 'forge_crystal_dispersion',
        })
        self.assertFalse(any(c['key'].startswith('forge_crystal_') for c in old['controls']))

    def test_generic_glass_example_uses_the_neutral_template(self):
        directory = ROOT / 'examples/plain-glass'
        pack = publisher.bundle(1, directory / 'plain-glass.json', 'plain-glass', directory)
        shader = pack['effects'][0]['shader']
        self.assertEqual(shader['base'], 'glass')
        self.assertEqual(shader['uniforms'], {'forge_blur': 'forge_plain_blur'})
        self.assertEqual(shader['source'], (ROOT / 'shaders/glass.frag').read_text())

    def test_official_bundle_contains_all_glass_shader_sources(self):
        pack = publisher.bundle(5)
        self.assertEqual(pack['revision'], 5)
        self.assertEqual([e['id'] for e in pack['effects']], [
            'frosted', 'crystal', 'mica', 'aero', 'liquid-glass', 'minecraft-glass', 'void', 'ember', 'snow',
            'fluted-glass', 'hammered-glass', 'chord-glass', 'cyberspace', 'rain-glass', 'pearlescent-glass',
        ])
        for effect in pack['effects'][1:]:
            self.assertEqual(effect['shader']['source'], (ROOT / 'shaders' / (effect['id'] + '.frag')).read_text())

    def test_mica_uses_wallpaper_and_keeps_its_controls_independent(self):
        effect = next(e for e in publisher.bundle(7)['effects'] if e['id'] == 'mica')
        self.assertEqual(effect['shader']['base'], 'glass')
        self.assertEqual(effect['shader']['backdrop'], 'wallpaper')
        self.assertEqual(effect['shader']['uniforms'], {
            'forge_blur': 'forge_mica_blur',
            'forge_mica_color': 'forge_mica_color',
        })
        controls = {c['key']: c for c in effect['controls']}
        self.assertEqual(controls['forge_mica_blur']['default'], 100)
        self.assertEqual(controls['forge_mica_color']['default'], 100)
        self.assertEqual(controls['alpha_map']['target'], 'theme')
        self.assertNotIn('window_active', effect['shader']['uniforms'])
        self.assertNotIn('is_dark', effect['shader']['uniforms'])

    def test_minecraft_keeps_pixel_and_background_controls_independent(self):
        effect = next(e for e in publisher.bundle(8)['effects'] if e['id'] == 'minecraft-glass')
        controls = {c['key']: c for c in effect['controls']}
        self.assertEqual(effect['shader']['base'], 'glass')
        self.assertFalse(effect['shader'].get('animated', False))
        self.assertEqual(effect['shader']['uniforms']['forge_blur'], 'forge_minecraft_blur')
        self.assertEqual(controls['forge_minecraft_pixel_size']['default'], 8)
        self.assertEqual(controls['forge_minecraft_color']['default'], 10)
        self.assertEqual(controls['alpha_map']['target'], 'theme')

    def test_void_uses_output_geometry_without_idle_animation_or_manual_calibration(self):
        effect = next(e for e in publisher.bundle(9)['effects'] if e['id'] == 'void')
        controls = {c['key']: c for c in effect['controls']}
        self.assertFalse(effect['shader']['animated'])
        self.assertEqual(effect['shader']['base'], 'glass')
        self.assertEqual(effect['shader']['uniforms']['forge_blur'], 'forge_void_blur')
        for axis in ['width', 'height']:
            key = 'forge_void_display_' + axis
            self.assertNotIn(key, effect['shader']['uniforms'])
            self.assertNotIn(key, controls)
            self.assertNotIn(key, effect['shader']['source'])
        for name in ['output_size', 'surface_position']:
            self.assertIn('uniform vec2 ' + name + ';', effect['shader']['source'])
            self.assertNotIn(name, effect['shader']['uniforms'])
        self.assertEqual(controls['forge_void_glow']['max'], 1000)
        self.assertEqual(controls['forge_void_color']['default'], 0)
        self.assertEqual(controls['alpha_map']['target'], 'theme')

    def test_ember_has_independent_background_and_animated_flames(self):
        effect = next(e for e in publisher.bundle(9)['effects'] if e['id'] == 'ember')
        controls = {c['key']: c for c in effect['controls']}
        self.assertTrue(effect['shader']['animated'])
        self.assertEqual(effect['shader']['base'], 'glass')
        self.assertEqual(effect['shader']['uniforms']['forge_blur'], 'forge_ember_blur')
        self.assertEqual(controls['forge_ember_background']['default'], 50)
        self.assertEqual(controls['forge_ember_color']['default'], 0)
        self.assertEqual(controls['alpha_map']['target'], 'theme')
        self.assertIn('uniform float time;', effect['shader']['source'])

    def test_snow_uses_window_age_and_optional_accumulation(self):
        effect = next(e for e in publisher.bundle(9)['effects'] if e['id'] == 'snow')
        controls = {c['key']: c for c in effect['controls']}
        self.assertTrue(effect['shader']['animated'])
        self.assertEqual(effect['shader']['base'], 'glass')
        self.assertEqual(effect['shader']['uniforms']['forge_blur'], 'forge_snow_blur')
        self.assertEqual(controls['forge_snow_accumulation']['type'], 'boolean')
        self.assertTrue(controls['forge_snow_accumulation']['default'])
        self.assertEqual(controls['forge_snow_fill_time']['default'], 180)
        self.assertEqual(controls['alpha_map']['target'], 'theme')
        self.assertIn('uniform float window_age;', effect['shader']['source'])
        self.assertNotIn('window_age', effect['shader']['uniforms'])

    def test_community_metadata_and_shader_are_combined(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sample = json.loads((ROOT / 'examples/prism.json').read_text())['effects'][0]
            source = sample['shader'].pop('source')
            (root / 'definition.json').write_text(json.dumps(sample))
            (root / 'prism.frag').write_text(source)
            pack = publisher.bundle(2, root / 'definition.json', 'my-pack', root)
            self.assertEqual(pack['id'], 'my-pack')
            self.assertEqual(pack['effects'][0]['shader']['source'], source)
            self.assertEqual(pack['effects'][0]['shader']['uniforms'], {'forge_prism': 'forge_prism_amount'})

    def test_missing_custom_shader_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'definition.json').write_text('{"id":"missing","preview":"aero"}')
            with self.assertRaises(ValueError):
                publisher.bundle(1, root / 'definition.json', 'my-pack', root)

    def test_new_effect_files_join_the_official_release_pack(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'effects').mkdir()
            (root / 'shaders').mkdir()
            (root / 'effects.json').write_text('[]')
            effect = json.loads((ROOT / 'examples/prism.json').read_text())['effects'][0]
            source = effect['shader'].pop('source')
            (root / 'effects/prism.json').write_text(json.dumps(effect))
            (root / 'shaders/prism.frag').write_text(source)
            with patch.object(publisher, 'ROOT', root):
                pack = publisher.bundle(2)
            self.assertEqual(pack['id'], 'cosmic-glass')
            self.assertEqual(pack['effects'][0]['id'], 'prism')
            self.assertEqual(pack['effects'][0]['shader']['source'], source)
