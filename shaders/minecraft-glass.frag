// forge-backdrop: blurred-only
// SPDX-License-Identifier: GPL-3.0-only
// Minecraft-inspired connected glass with sparse, sharp pixel reflections.
// Geometry clipping follows COSMIC's clipped_surface.frag.
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
uniform float is_dark;
uniform float forge_minecraft_pixel_size;
uniform float forge_minecraft_texture;
uniform float forge_minecraft_color;

float pixel_slash(vec2 cell, float size) {
    vec2 valid = step(vec2(0.0), cell) * (1.0 - step(vec2(size), cell));
    return valid.x * valid.y * (1.0 - step(0.5, abs(cell.x + cell.y - (size - 1.0))));
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
    vec3 transmitted = clamp(color.rgb / max(color.a, 0.0001), 0.0, 1.0);
    transmitted = mix(transmitted, theme_tint, clamp(forge_minecraft_color / 100.0, 0.0, 1.0));

    // Integer display pixels keep the texture sharp at fractional output scales.
    float scale = max(output_scale, 0.1);
    float pixel_size = max(1.0, floor(clamp(forge_minecraft_pixel_size, 2.0, 16.0) * scale + 0.5));
    // Connected glass has no repeating frame inside the window.
    vec2 local_pixel = mod(floor(p * scale), pixel_size * 16.0);
    float detail_size = max(1.0, floor(pixel_size * 0.5 + 0.5));
    vec2 upper = floor((local_pixel - vec2(2.0) * pixel_size) / detail_size);
    vec2 lower = floor((local_pixel - vec2(12.0) * pixel_size) / detail_size);
    float highlight_mask = max(pixel_slash(upper, 3.0), pixel_slash(lower, 2.0));
    float frame_width = max(1.0, floor(pixel_size * 0.75 + 0.5));
    float frame_mask = 1.0 - step(frame_width, inside * scale);
    float pattern_mask = max(frame_mask, highlight_mask);
    float strength = clamp(forge_minecraft_texture / 100.0, 0.0, 1.0);
    float dark = clamp(is_dark, 0.0, 1.0);
    vec3 neutral_ink = mix(mix(theme_tint, vec3(0.12), 0.62),
                          mix(theme_tint, vec3(0.92), 0.60), dark);
    vec3 reflection = theme_accent;
    vec3 pattern_color = mix(neutral_ink * 0.75, reflection, highlight_mask);
    float texture_alpha = pattern_mask * mix(0.42, 1.0, highlight_mask) * strength;
    vec3 material = mix(transmitted, pattern_color, texture_alpha);
    color.rgb = clamp(material, 0.0, 1.0) * color.a;
    color *= mask * alpha;
    #if defined(DEBUG_FLAGS)
    if (tint == 1.0) color = vec4(0.0, 0.2, 0.0, 0.2) + color * 0.8;
    #endif
    gl_FragColor = color;
}
