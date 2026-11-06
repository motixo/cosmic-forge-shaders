// SPDX-License-Identifier: GPL-3.0-only
// Procedural textured glass; surface detail stays sharp above the blurred backdrop.
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
uniform float alpha;
varying vec2 v_coords;
#if defined(DEBUG_FLAGS)
uniform float tint;
#endif
uniform vec2 geo_size;
uniform vec4 corner_radius;
uniform mat3 input_to_geo;
uniform vec2 uv_per_pixel;
uniform float output_scale;
uniform float blur_amount;
uniform vec3 theme_tint;
uniform vec3 theme_accent;
uniform float forge_chord_size;
uniform float forge_chord_refraction;
uniform float forge_chord_texture;
uniform float forge_chord_color;

vec2 backdrop_uv(vec2 p, vec2 offset) {
    // The generic glass capture ends at the surface; keep every ray inside it.
    vec2 sample_point = clamp(p + offset, vec2(0.5), max(geo_size - 0.5, vec2(0.5)));
    vec2 inset = uv_per_pixel * 0.5;
    return clamp(v_coords + (sample_point - p) * uv_per_pixel, inset, 1.0 - inset);
}

float hash12(vec2 p) {
    vec3 h = fract(vec3(p.xyx) * 0.1031);
    h += dot(h, h.yzx + 33.33);
    return fract((h.x + h.y) * h.z);
}

// Value noise and its analytic gradient avoid extra height samples per normal.
vec3 field(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 du = 6.0 * f * (1.0 - f);
    float a = hash12(cell);
    float b = hash12(cell + vec2(1.0, 0.0));
    float c = hash12(cell + vec2(0.0, 1.0));
    float d = hash12(cell + 1.0);
    return vec3(mix(mix(a, b, u.x), mix(c, d, u.x), u.y),
                mix(b - a, d - c, u.y) * du.x,
                mix(c - a, d - b, u.x) * du.y);
}

vec3 surface_relief(vec2 p) {
    vec3 warp = field(p * vec2(0.15, 0.026));
    vec3 grain = field(p * vec2(1.4, 0.22) + vec2(31.7, 13.1));
    float phase = 6.2831853 * (p.x + 1.4 * warp.x + 0.12 * grain.x);
    float ridge = cos(phase);
    vec2 slope = vec2(ridge * (1.0 + 0.2 * warp.y) + grain.y * 0.30,
        ridge * warp.z * 0.12 + grain.z * 0.035);
    return vec3(0.5 + 0.5 * sin(phase), slope);
}

void main() {
    if (alpha <= 0.0) discard;
    vec2 g = (input_to_geo * vec3(v_coords, 1.0)).xy;
    if (g.x < 0.0 || g.y < 0.0 || g.x > 1.0 || g.y > 1.0) discard;
    vec2 p = g * geo_size;
    float radius = g.x < 0.5
        ? (g.y < 0.5 ? corner_radius.x : corner_radius.w)
        : (g.y < 0.5 ? corner_radius.y : corner_radius.z);
    vec2 q = abs(p - geo_size * 0.5) - geo_size * 0.5 + radius;
    float inside = -(length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - radius);
    float aa = 0.5 / max(output_scale, 0.1);
    float mask = smoothstep(-aa, aa, inside);
    if (mask <= 0.0) discard;

    float size = clamp(forge_chord_size, 2.0, 48.0);
    vec3 relief = surface_relief(p / size);
    vec3 normal = normalize(vec3(relief.yz * 1.4, 1.0));
    float strength = clamp(forge_chord_refraction / 100.0, 0.0, 1.0);
    vec3 ray = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / 1.5);
    vec2 offset = ray.xy / max(-ray.z, 0.5) * size * 2.5 * strength;
    vec4 color = texture2D(tex, backdrop_uv(p, offset));
    if (blur_amount > 0.0) {
        vec2 vertical = vec2(0.0, blur_amount * 24.0);
        color = color * 0.5
            + texture2D(tex, backdrop_uv(p, offset + vertical)) * 0.25
            + texture2D(tex, backdrop_uv(p, offset - vertical)) * 0.25;
    }
    #if defined(NO_ALPHA)
    color.a = 1.0;
    #endif
    vec3 material = clamp(color.rgb / max(color.a, 0.0001), 0.0, 1.0);
    material = mix(material, mix(theme_tint, theme_accent, 0.15),
        clamp(forge_chord_color / 100.0, 0.0, 1.0) * 0.65);

    float texture_strength = clamp(forge_chord_texture / 100.0, 0.0, 1.0);
    vec3 light = normalize(vec3(-0.45, -0.65, 0.85));
    vec3 half_light = normalize(light + vec3(0.0, 0.0, 1.0));
    float shade = max(-dot(normal.xy, light.xy), 0.0);
    float glint = pow(max(dot(normal, half_light), 0.0), 18.0);
    material *= 1.0 - texture_strength * (0.10 + 0.32 * shade);
    material = mix(material, vec3(1.0),
        texture_strength * (0.24 * glint + 0.045 * relief.x));
    color.rgb = clamp(material, 0.0, 1.0) * color.a;
    color *= mask * alpha;
    #if defined(DEBUG_FLAGS)
    if (tint == 1.0) color = vec4(0.0, 0.2, 0.0, 0.2) + color * 0.8;
    #endif
    gl_FragColor = color;
}
