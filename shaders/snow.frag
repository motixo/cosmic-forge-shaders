// forge-backdrop: blurred-only
// SPDX-License-Identifier: GPL-3.0-only
// Falling snow with an independent accumulating snowbank for each window.
// Geometry clipping follows COSMIC's clipped_surface.frag.
// forge-animation-idle: accumulation forge_snow_accumulation forge_snow_fill_time forge_snow_density
#version 100
//_DEFINES_
#if defined(EXTERNAL)
#extension GL_OES_EGL_image_external : require
#endif
precision highp float;
#if defined(EXTERNAL)
uniform samplerExternalOES tex;
#else
uniform sampler2D tex;
#endif
uniform sampler2D sharp_tex;
uniform float alpha;
varying vec2 v_coords;
#if defined(DEBUG_FLAGS)
uniform float tint;
#endif
uniform vec2 geo_size;
uniform vec4 corner_radius;
uniform mat3 input_to_geo;
uniform float blur_amount;
uniform vec2 uv_per_pixel;
uniform float output_scale;
uniform vec3 theme_tint;
uniform vec3 theme_accent;

uniform float time;
uniform float window_age;
uniform float forge_snow_fill_time;
uniform float forge_snow_accumulation;
uniform float forge_snow_density;
uniform float forge_snow_size;

float random_cell(vec2 cell) {
    return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
}

float snow_layer(vec2 p, float cell_size, float speed, float radius, float seed) {
    float wind = 9.0 * sin(time * 0.17 + seed * 0.13)
               + 4.0 * sin(time * 0.43 + seed);
    vec2 q;
    q.x = (p.x - wind) / cell_size;
    float column = random_cell(vec2(floor(q.x), seed));
    q.y = (p.y - time * speed * mix(0.58, 1.42, column)) / cell_size
        + column * 11.0;
    vec2 cell = floor(q);
    float random = random_cell(cell + seed);
    if (random > clamp(forge_snow_density / 100.0, 0.0, 1.0)) return 0.0;
    float local_x = fract(q.x);
    // The flake center is constrained by its random value and the largest sway.
    float center_x = 0.27 + 0.46 * random;
    float bound = 0.13 + (radius * 1.45 + 0.6) / (0.82 * cell_size) + 0.001;
    if (abs(local_x - center_x) > bound) return 0.0;
    float spread = random_cell(cell.yx + seed + 17.0);
    float flutter = fract(random * 13.17 + spread * 7.91);
    // Keep each flake inside its moving cell so gusts never clip or teleport it.
    vec2 center = vec2(0.27 + 0.46 * random, 0.12 + 0.76 * spread);
    float flake_radius = radius * mix(0.6, 1.45, flutter);
    float outer_radius = flake_radius + 0.6;
    // Almost every pixel misses the flake; skip flutter and shading there.
    if (abs((fract(q).y - center.y) * cell_size) >= outer_radius) return 0.0;
    center.x += (0.055 + 0.075 * flutter)
              * sin(time * (0.4 + 0.55 * random) + spread * 6.283185);
    vec2 flake = (fract(q) - center) * cell_size;
    flake.x *= mix(0.82, 1.18, flutter);
    if (dot(flake, flake) >= outer_radius * outer_radius) return 0.0;
    float coverage = 1.0 - smoothstep(flake_radius - 0.6, flake_radius + 0.6, length(flake));
    float opacity = mix(0.45, 1.0, fract(random * 23.0 + spread * 17.0));
    return coverage * opacity;
}

// Value noise and its analytic slope shade powder without extra texture samples.
vec3 powder_noise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    vec2 blend = f * f * (3.0 - 2.0 * f);
    vec2 slope = 6.0 * f * (1.0 - f);
    float a = random_cell(cell);
    float b = random_cell(cell + vec2(1.0, 0.0));
    float c = random_cell(cell + vec2(0.0, 1.0));
    float d = random_cell(cell + vec2(1.0));
    float height = mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
    vec2 gradient = vec2(mix(b - a, d - c, blend.y),
                         mix(c - a, d - b, blend.x)) * slope;
    return vec3(height, gradient);
}

void main() {
    if (alpha <= 0.0) discard;
    vec2 g = (input_to_geo * vec3(v_coords, 1.0)).xy;
    if (g.x < 0.0 || g.y < 0.0 || g.x > 1.0 || g.y > 1.0) discard;
    vec2 p = g * geo_size;
    float radius = g.x < 0.5
        ? (g.y < 0.5 ? corner_radius.x : corner_radius.w)
        : (g.y < 0.5 ? corner_radius.y : corner_radius.z);
    vec2 center = p - geo_size * 0.5;
    vec2 q = abs(center) - geo_size * 0.5 + radius;
    float inside = -(length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - radius);
    float mask = smoothstep(-0.5, 0.5, inside);
    if (mask <= 0.0) discard;

    vec4 color = texture2D(tex, v_coords);
    #if defined(NO_ALPHA)
    color.a = 1.0;
    #endif
    float surface = geo_size.y + 2.0;
    float bank = 0.0;
    if (forge_snow_accumulation >= 0.5) {
        float progress = clamp(window_age / max(forge_snow_fill_time, 1.0), 0.0, 1.0);
        if (progress >= 1.0) {
            surface = -2.0;
            bank = 1.0;
        } else {
            float flat_surface = mix(geo_size.y + 2.0, -2.0, progress);
            float wave = sin(progress * 3.14159265);
            float margin = 15.0 * abs(wave) + 0.01;
            surface = flat_surface;
            if (p.y >= flat_surface + margin + 17.0) {
                bank = 1.0;
            } else if (p.y > flat_surface - margin - 0.8) {
                float mound = 10.0 * sin(p.x / 91.0 + 0.7) + 5.0 * sin(p.x / 37.0 + 2.2);
                surface += mound * wave;
                bank = smoothstep(-0.8, 0.8, p.y - surface);
            }
        }
    }
    if (bank < 1.0 && forge_snow_density > 0.0) {
        float size = clamp(forge_snow_size / 100.0, 0.5, 2.0);
        float flakes = snow_layer(p, 29.0 * size, 24.0, 1.0 * size, 3.0) * 0.45;
        flakes += snow_layer(p, 49.0 * size, 43.0, 1.8 * size, 37.0) * 0.7;
        flakes += snow_layer(p, 79.0 * size, 69.0, 2.9 * size, 91.0);
        flakes = clamp(flakes, 0.0, 1.0);
        color.rgb = mix(color.rgb, vec3(0.93, 0.97, 1.0) * color.a, flakes);
    }
    if (bank > 0.0) {
        // Surface-local coordinates keep the settled texture still as snow grows.
        vec3 clumps = powder_noise(p / 43.0 + vec2(7.1, 21.7));
        vec3 powder = powder_noise(p / 9.0 + vec2(31.2, 8.3));
        vec3 crystals = powder_noise(p / 2.3 + vec2(4.7, 53.1));
        vec2 relief = clumps.yz * 0.12 + powder.yz * 0.30 + crystals.yz * 0.18;
        vec3 normal = normalize(vec3(-relief, 1.0));
        float light = clamp(dot(normal, normalize(vec3(-0.5, -0.6, 0.8))), 0.0, 1.0);
        float hollows = smoothstep(0.15, 0.8, clumps.x * 0.65 + powder.x * 0.35);
        float shade = clamp(0.22 + light * 0.72 + hollows * 0.12, 0.0, 1.0);
        vec3 snow = mix(vec3(0.64, 0.77, 0.89), vec3(0.985, 0.995, 1.0), shade);
        snow = mix(vec3(0.96, 0.98, 1.0), snow, 0.35);
        float depth = max(p.y - surface, 0.0);
        snow *= mix(vec3(0.84, 0.91, 0.97), vec3(1.0), smoothstep(0.0, 17.0, depth));
        float sparkle = crystals.x * crystals.x;
        sparkle *= sparkle;
        sparkle *= sparkle;
        float glint = sparkle * smoothstep(0.7, 1.0, light);
        snow = clamp(snow + glint * 0.014, 0.0, 1.0);
        color.rgb = mix(color.rgb, snow * color.a, bank);
    }
    color *= mask * alpha;
    #if defined(DEBUG_FLAGS)
    if (tint == 1.0) color = vec4(0.0, 0.2, 0.0, 0.2) + color * 0.8;
    #endif
    gl_FragColor = color;
}
