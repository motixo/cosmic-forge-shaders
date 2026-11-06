# COSMIC Forge Shaders

Glass effects for **COSMIC Forge**: Crystal, Mica, Aero, Liquid Glass, Minecraft Glass,
Void, Ember, Snow, Fluted Glass, Hammered Glass, Chord Glass, Cyberspace and the definition for COSMIC's native Frosted Glass. This is the former `cosmic-crystal` repository, renamed with
its history and releases intact.

[Install COSMIC Forge](https://github.com/motixo/cosmic-forge#install) with the
one-line installer or native DEB, RPM and Arch packages, then select or import effects in the app.

This repository contains effect data and GLSL, plus a Python pack builder. It does
not patch, build or install the compositor or COSMIC Settings. Renderer setup and
restoration belong to the Forge app. Existing standalone Crystal installers are
retained in [v0.8.0](https://github.com/motixo/cosmic-forge-shaders/tree/v0.8.0).

## Contents

- `effects.json`: built-in effect descriptions and controls.
- `shaders/crystal.frag`: Crystal refraction, frost and Everyday mode.
- `shaders/mica.frag`: matte wallpaper tint with light/dark themes and inactive-window fallback.
- `shaders/aero.frag`: Aero glass, reflections and theme tint.
- `shaders/liquid-glass.frag`: curved refraction and soft edge highlights on the generic glass base.
- `shaders/minecraft-glass.frag`: connected pixel glass with sharp Accent reflections.
- `shaders/void.frag`: an infinity mirror with window parallax and soft light lines.
- `shaders/ember.frag`: animated flames with independent background opacity.
- `shaders/snow.frag`: drifting snow and optional accumulation on each window.
- `shaders/fluted-glass.frag`: vertical glass grooves with adjustable spacing and refraction.
- `shaders/hammered-glass.frag`: rounded hammered relief.
- `shaders/chord-glass.frag`: fine vertical glass threads.
- `shaders/cyberspace.frag`: animated digital contours from the actual backdrop.
- `shaders/glass.frag`: neutral generic glass template with independent blur.
- `effects/*.json`: additional glass definitions and overrides for the release pack.
- `examples/`: an importable Prism pack and a separate JSON + `.frag` example.
- `scripts/package_effects.py`: combines metadata and GLSL into a release asset.

Frosted Glass uses COSMIC's native pipeline, so it has no `.frag` file here.

## Build a pack

Requires Python 3.11+; no third-party Python dependencies.

```sh
python -m unittest discover -s tests -v
python scripts/package_effects.py --revision 1
```

The generated official pack is installed through Forge's verified GitHub update
feed; its reserved pack id cannot be imported as a local community pack.

To add a glass effect, add its definition to `effects/<id>.json` and GLSL to
`shaders/<id>.frag`. The definition follows an entry in `effects.json`, including
`id`, `name`, `tagline`, `description`, `preview`, `controls` and an optional
`shader.uniforms` map from custom float uniform names to control keys. Choose
`glass`, `aero` or `crystal` as the base pipeline. Custom control keys and uniform names
start with `forge_`; source is limited to 64 KiB. See the Prism example for a
complete definition. A complete pack can also be imported through Forge settings,
or select its JSON metadata and `.frag` together.
In the official pack, a definition with an existing id replaces that entry while
preserving the pack's catalog order in compatible Forge versions. This keeps
downloadable controls separate from Forge's built-in fallback catalog.

Crystal, Aero, Liquid Glass, Minecraft Glass and Void have independent **Theme color** controls. They
adjust the tint strength without changing opacity. Crystal starts at 0% to retain
its existing appearance, and its tint follows COSMIC's light or dark surface color.

Crystal also has independent **Dispersion**, from 0 to 10 px at 100% refraction.
It scales with refraction and the local facet strength; 0 removes wavelength
separation, and the default of 1 preserves the previous appearance. Sampling stays
within the compositor's existing background capture, including at maximum strength.

Community authors can build a separate pack:

```sh
python scripts/package_effects.py --catalog examples/prism-files/prism.json \
  --shader-dir examples/prism-files --pack-id prism-demo --revision 1 \
  --output build/prism.json
cosmic-forge --import-pack build/prism.json
```

## Publish an update

Increase the positive pack revision for each change, then tag the tested source:

```sh
git tag glass-v2
git push origin glass-v2
```

The release workflow builds `cosmic-forge-glass.json` using that revision and
publishes it on the tagged stable GitHub release. Forge checks this repository on
startup and every six hours while open, and verifies the asset's SHA-256 digest
before installation. Users can also choose **Check for updates** in Forge settings.
The official pack id remains `cosmic-glass`; community packs are kept separately.
Compatible shader updates do not rebuild the compositor or change desktop launchers.

Forge's source checkout includes this repository as the `shaders` Git submodule.
Its pinned commit supplies built-in definitions at compile time; installed apps
download release packs independently of Git.

GPL-3.0-only except Ember's adapted flame code, which retains its upstream
CC-BY-NC-SA notice and attribution; see [CREDITS.md](CREDITS.md).
Independent project; COSMIC is developed by System76 and its contributors.

## Mica

Mica is an interpretation of [Microsoft's Mica material](https://learn.microsoft.com/en-us/windows/apps/design/style/mica).
It uses only the wallpaper behind the window, with broad diffusion and subtle color
on an opaque neutral surface. It follows the actual system light/dark mode; an
inactive window returns to a neutral surface. The light theme intentionally shows
only a faint wallpaper tint. This is a visual reconstruction, not Microsoft's
native compositor implementation or a pixel-exact port.

**Blur** and **Wallpaper color** are independent Mica controls, both defaulting to
100%. Wallpaper color at 0% gives a solid neutral surface. **Opacity** remains the
shared COSMIC theme control. Mica requires **Forge 0.11+ and renderer revision 4**.
The official catalog places it immediately above Aero; displaying the pack's order
also requires a Forge version that honors the official catalog order.

```sh
cosmic-forge --import-pack effects/mica.json shaders/mica.frag
CRYSTAL_QA_DIR=/path/to/preview python tests/verify_mica.py
```

The render check uses the engine's test surface at `../engine/build/bin/test-surface`;
set `FORGE_ENGINE_DIR` when the engine checkout is elsewhere. Release notes are in
[CHANGELOG.md](CHANGELOG.md).

## Minecraft Glass and Void

**Minecraft Glass** has one outer frame and small, sparse diagonal pixel marks,
without an internal grid. The pixel marks use the selected Accent; the outer frame
adapts to the light/dark surface palette. **Blur** softens only the backdrop, while
**Pixel size**, **Texture** and **Theme color** remain independent.

**Void** places Accent-colored frames over transparent glass. The tunnel follows
window movement, looks straight ahead when centered, and gently increases the
visible gaps toward the far end. **Line spacing** sets overall separation;
**Reflections** sets the frame count. **Glow** reaches 1000%, **Blur** softens both
the backdrop and the lines, and **Theme color** tints the glass without recoloring
the lights. It redraws with the desktop instead of requesting continuous idle
animation. Its fragment shader evaluates only neighboring frames, independent of
the selected reflection count.

Void now reads the current monitor's logical dimensions and the window's
output-local position from the engine. Rotation, fractional scaling and moving
between monitors are handled automatically; manual **Display width/height**
controls are no longer needed. A centered window looks straight down the tunnel.
This also removes the previous dependency on standard fragment derivatives.

Both effects preserve the shared **Opacity** setting. Pack 9 requires
**engine-v0.6.0 / renderer revision 7** for Void's automatic geometry; install it
through **Settings → Patches** and sign out and back in before using this pack.
Shader updates download separately from the engine.

Run their render checks against the engine's **headless** preview in private XDG:

```sh
CRYSTAL_QA_DIR=/path/to/preview python tests/verify_minecraft.py
VOID_QA_DIR=/path/to/preview python tests/verify_void.py
VOID_QA_DIR=/path/to/preview python tests/verify_void_idle.py
```

## Ember and Snow

**Ember** brings rising orange and red flames to transparent glass, adapted from
[trinketMage's Shadertoy effect](https://www.shadertoy.com/view/3tcBzH).
**Background opacity** blends a theme-colored backing beneath the flames without
changing shared Opacity. **Flame strength**, **Flame size**, **Theme color** and
background **Blur** have independent controls.

**Snow** has several layers of flakes with varied speed, size and sideways drift.
A softly textured snowbank grows from the bottom until it fills the background.
Each window starts its own accumulation when the effect first renders on it.
**Fill time** controls the buildup from 10 to 3600 seconds; **Snowfall**, **Flake
size** and **Blur** remain independent. Turn **Snow accumulation** off to keep
falling flakes without a settled bank; turning it back on restores the bank at
the window's current age. Opaque foreground content stays visible.

Both effects opt into engine animation. Forge builds with per-effect animation
controls can turn **Animation** off for a still surface and stop continuous
redraws. This app control is not included in stable Forge 0.11.2. Snow needs
renderer 6+ for its independent window clock; the complete pack needs renderer 7
for Void. Existing effect ids, control keys and shared Opacity are preserved.

If you imported the development `ember-local` or `snow-local` packs, back them up
and remove those local packs before installing the official update: duplicate
effect ids cannot coexist. Keep your saved effect preferences.

## Generic glass

Forge 0.5+ and engine renderer revision 2 add `shader.base: "glass"`. The neutral
template supplies sharp/blurred background textures, geometry, output scale and
theme colors. It has no fixed tint, reflections or facets. Map `forge_blur` to a
unique per-effect integer control key in 0–100; it controls the blur pipeline and
defaults to 45 if absent. Opacity stays shared. Other custom float uniforms work
as usual. An invalid source falls back to neutral glass.

```sh
cosmic-forge --import-pack examples/plain-glass/plain-glass.json \
  examples/plain-glass/plain-glass.frag
python scripts/package_effects.py --catalog examples/plain-glass/plain-glass.json \
  --shader-dir examples/plain-glass --pack-id plain-glass --revision 1 \
  --output build/plain-glass.json
```

The example stays outside the official catalog so the existing release feed
remains compatible with older Forge apps. Glass packs require Forge 0.5+.
Detailed shader inputs and creation steps are documented in
[adding effects](https://github.com/motixo/cosmic-forge/blob/main/docs/adding-effects.md).

Liquid Glass uses this base for broad, curved refraction inspired by
[this ShojiWM configuration](https://github.com/bea4dev/liquid-glass-config-shojiwm).
The lens displacement scales with the surface size, with adjustable chromatic
dispersion near the rim. Lensing adjusts the geometric distortion, from 0% (no
distortion) to 100% (full lensing), without changing its tint or opacity.
Clear center sets the size of the undistorted middle: lower values let lensing
reach further inward; higher values restrict it to the edges. At 100% the entire
surface is free of lens distortion. Blur remains independent.
The lens follows the actual window outline through the corners, without a separate
rounded boundary inside the glass.
Blur, thickness, dispersion and highlights have independent controls;
opacity remains shared. This is a shader-only interpretation, without pointer
tracking or morphing animations. Try the source pair in Forge 0.5+ with renderer 2:

```sh
cosmic-forge --import-pack effects/liquid-glass.json shaders/liquid-glass.frag
```

With the engine's headless preview running, verify corner continuity, lensing
endpoints, blur and foreground preservation on real compositor output:

```sh
CRYSTAL_QA_DIR=/path/to/preview python tests/verify_liquid_corners.py
```
