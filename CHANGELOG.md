# Changelog

## glass-v12 — 2026-11-10

- Add **Pearlescent Glass** with a soft color shift as you move the window and adjustable sheen, iridescence and blur.

## glass-v11 — 2026-11-08

- Add **Rain Glass** with animated raindrops and adjustable intensity, size, speed and blur.
- Use **Engine 0.6.3** for smooth speed changes and idle rendering at zero intensity.

## glass-v10 — 2026-11-07

- Add **Fluted Glass**, **Hammered Glass** and **Chord Glass** with adjustable detail and refraction.
- Add **Cyberspace**, with animated digital contours based on the actual backdrop.
- Optimize **Snow** and **Ember** rendering.
- Use Forge **0.12.2** for the shared **Noise** control.

## glass-v9 — 2026-10-30

### Void: automatic monitor geometry

- Read the current monitor's dimensions and the window's position directly from
  the engine. Keep the tunnel straight when the window is centered, including
  on rotated and fractionally scaled outputs.
- Update perspective automatically when moving between monitors. Remove manual
  Display width/height controls while preserving the other saved Void controls.
- Remove the fragment-derivative requirement by using output-local coordinates.
- Keep redraws on demand, with no continuous animation when the window is still.

### Ember: animated flame glass

- Add rising orange and red flames, adapted from trinketMage's Shadertoy effect
  with source attribution retained.
- Add independent Background opacity beneath the flames, plus Flame strength,
  Flame size, Theme color and Blur controls. Keep shared Opacity unchanged.
- Opt into animation; Forge builds with the per-effect Animation switch can
  freeze the flames and stop continuous redraws.

### Snow: snowfall that settles on each window

- Add layered flakes with varied sizes, speeds, spacing and sideways drift.
- Accumulate snow from the bottom until it covers the glass, using a separate
  clock for each window. Moving, resizing or opening another window does not
  restart an existing snowbank.
- Give settled snow subtle powder relief and a softly shaded edge that stays
  still and sharp independently of backdrop Blur.
- Add Snow accumulation on/off, Fill time, Snowfall and Flake size controls.
  Disabling accumulation leaves falling snow active; re-enabling it restores
  the bank at the window's current age.

Install **engine-v0.6.0 / renderer revision 7** and sign out and back in before
using pack 9. The per-effect Animation switch also needs a Forge build containing
that app control; it is not in stable Forge 0.11.2. Shader ABI remains 1.
Other effects and shared Opacity are preserved. Development packs with duplicate
`ember` or `snow` effect ids must be backed up and removed before the official pack
can be installed. Ember retains its upstream licensing notice; see CREDITS.md.

## glass-v8 — 2026-10-29

- Add **Minecraft Glass**: a thin outer frame and sparse connected-glass pixel
  reflections, with no internal grid. Pixel reflections use the selected Accent
  and stay sharp when the background is blurred. Include independent Blur,
  Pixel size, Texture and Theme color controls.
- Add **Void**: transparent infinity-mirror glass with Accent light frames,
  window-position parallax and a straight tunnel when the window is centered.
  Include Blur for both glass and lines, Glow up to 1000%, Theme color,
  Reflections, Line spacing and Motion controls. Gaps widen only slightly with depth.
- Make Void redraw on demand and evaluate only neighboring reflections instead
  of shading every frame at every pixel. Preserve clipping and opaque foregrounds.
- Add Void Display width/height calibration for different resolutions and output
  scales. Dimensions are configured manually; different-resolution monitors may
  need different values. Require standard fragment derivatives.
- Append Minecraft Glass and Void after Liquid Glass, preserving Mica above Aero
  and keeping all existing effect ids, controls and shared Opacity preferences.

The full pack retains the Forge 0.11+ / renderer revision 4 requirement from Mica;
optional wallpaper-only backdrop selection needs renderer revision 5. Updating
the shaders does not replace the compositor. GLES variants, real private-XDG
compositor rendering, window motion, blur, tint, spacing and idle behavior are
checked before release. GPU timing is shader-only and does not predict total
desktop GPU utilization; other GPU drivers are not separately benchmarked.

## glass-v7 — 2026-10-29

- Add Mica, a visual reconstruction of the Windows 11 matte wallpaper material.
- Place Mica immediately above Aero in the official catalog order.
- Add independent Mica Blur and Wallpaper color controls; keep Opacity shared.
- Adapt to actual system light/dark mode and return inactive windows to a neutral surface.
- Require Forge 0.11+ and renderer revision 4 for Mica. Menu placement requires the Forge update that honors official pack order.
- Preserve the other effects and their saved controls.

Validated with packaging tests, shader compilation variants and 25 checks on real isolated compositor output. Mica is not a pixel-exact port of Microsoft's native implementation.
