// forge-backdrop: blurred-only
// SPDX-License-Identifier: GPL-3.0-only
// Repeated cylindrical glass lenses, with diffusion along the grooves.
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
uniform float forge_fluted_spacing;
uniform float forge_fluted_refraction;
uniform float forge_fluted_highlights;
uniform float forge_fluted_color;

vec2 backdrop_uv(vec2 p, vec2 offset) {
    // The generic glass capture ends at the surface; keep every ray inside it.
    vec2 sample_point = clamp(p + offset, vec2(0.5), max(geo_size - 0.5, vec2(0.5)));
    vec2 inset = uv_per_pixel * 0.5;
    return clamp(v_coords + (sample_point - p) * uv_per_pixel, inset, 1.0 - inset);
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

    float spacing = clamp(forge_fluted_spacing, 8.0, 160.0);
    float phase = fract(p.x / spacing);
    float local = phase - 0.5;
    float strength = clamp(forge_fluted_refraction / 100.0, 0.0, 1.0);
    vec3 normal = normalize(vec3(local * 1.8, 0.0, 1.0));
    vec3 ray = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / 1.5);
    vec2 offset = vec2(ray.x / max(-ray.z, 0.5) * spacing * 1.3 * strength, 0.0);
    vec4 color = texture2D(tex, backdrop_uv(p, offset));
    if (blur_amount > 0.0) {
        float spread = blur_amount * mix(8.0, 56.0, strength);
        vec2 vertical = vec2(0.0, spread);
        color = color * 0.5
            + texture2D(tex, backdrop_uv(p, offset + vertical)) * 0.25
            + texture2D(tex, backdrop_uv(p, offset - vertical)) * 0.25;
    }
    #if defined(NO_ALPHA)
    color.a = 1.0;
    #endif
    vec3 material = clamp(color.rgb / max(color.a, 0.0001), 0.0, 1.0);
    material = mix(material, mix(theme_tint, theme_accent, 0.15),
        clamp(forge_fluted_color / 100.0, 0.0, 1.0) * 0.65);

    float highlights = clamp(forge_fluted_highlights / 100.0, 0.0, 1.0);
    float edge = min(phase, 1.0 - phase) * spacing;
    float seam = 1.0 - smoothstep(0.5 * aa, 2.5 * aa, edge);
    float shadow = 1.0 - smoothstep(0.6, 3.5, abs(local - 0.43) * spacing);
    float sheen = pow(max(0.0, 1.0 - abs(local + 0.23) * 3.2), 4.0);
    material *= 1.0 - highlights * (0.08 * shadow + 0.025 * local * local * 4.0);
    material = mix(material, vec3(1.0), highlights * (0.25 * seam + 0.045 * sheen));
    color.rgb = clamp(material, 0.0, 1.0) * color.a;
    color *= mask * alpha;
    #if defined(DEBUG_FLAGS)
    if (tint == 1.0) color = vec4(0.0, 0.2, 0.0, 0.2) + color * 0.8;
    #endif
    gl_FragColor = color;
}
