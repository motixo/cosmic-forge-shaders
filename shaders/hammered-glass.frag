// forge-backdrop: blurred-only
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
uniform float forge_hammered_size;
uniform float forge_hammered_refraction;
uniform float forge_hammered_texture;
uniform float forge_hammered_color;

vec2 backdrop_uv(vec2 p, vec2 offset) {
    // The generic glass capture ends at the surface; keep every ray inside it.
    vec2 sample_point = clamp(p + offset, vec2(0.5), max(geo_size - 0.5, vec2(0.5)));
    vec2 inset = uv_per_pixel * 0.5;
    return clamp(v_coords + (sample_point - p) * uv_per_pixel, inset, 1.0 - inset);
}

vec2 hash22(vec2 p) {
    vec3 h = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    h += dot(h, h.yzx + 33.33);
    return fract((h.xx + h.yz) * h.zy);
}

vec3 surface_relief(vec2 p) {
    p = p * vec2(0.88, 1.08)
        + vec2(sin(p.y * 0.41 + p.x * 0.17), sin(p.x * 0.33 - p.y * 0.14)) * 0.23;
    vec2 cell = floor(p);
    float first = 10.0;
    float second = 10.0;
    vec2 nearest = vec2(0.0);
    vec2 neighbor = vec2(0.0);
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 id = cell + vec2(float(x), float(y));
            vec2 delta = p - (id + 0.2 + hash22(id) * 0.6);
            float distance_sq = dot(delta, delta);
            if (distance_sq < first) {
                second = first;
                neighbor = nearest;
                first = distance_sq;
                nearest = delta;
            } else if (distance_sq < second) {
                second = distance_sq;
                neighbor = delta;
            }
        }
    }
    float join = 1.0 - smoothstep(0.0, 0.22, second - first);
    vec2 slope = mix(nearest, (nearest + neighbor) * 0.5, join);
    return vec3(exp(-first * 1.8), -slope * 2.8 * exp(-first * 1.8));
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

    float size = clamp(forge_hammered_size, 2.0, 72.0);
    vec3 relief = surface_relief(p / size);
    vec3 normal = normalize(vec3(relief.yz * 1.4, 1.0));
    float strength = clamp(forge_hammered_refraction / 100.0, 0.0, 1.0);
    vec3 ray = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / 1.5);
    vec2 offset = ray.xy / max(-ray.z, 0.5) * size * 2.5 * strength;
    vec4 color = texture2D(tex, backdrop_uv(p, offset));

    #if defined(NO_ALPHA)
    color.a = 1.0;
    #endif
    vec3 material = clamp(color.rgb / max(color.a, 0.0001), 0.0, 1.0);
    material = mix(material, mix(theme_tint, theme_accent, 0.15),
        clamp(forge_hammered_color / 100.0, 0.0, 1.0) * 0.65);

    float texture_strength = clamp(forge_hammered_texture / 100.0, 0.0, 1.0);
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
