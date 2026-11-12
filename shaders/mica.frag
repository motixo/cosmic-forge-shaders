// forge-backdrop: blurred-only
// SPDX-License-Identifier: GPL-3.0-only
// Mica reconstruction: diffuse wallpaper chroma over a neutral opaque surface.
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
uniform float window_active;
uniform float is_dark;
uniform float forge_blur;
uniform float forge_mica_color;

// Nonseparable luminosity blending preserves hue without wallpaper contrast.
vec3 set_luminosity(vec3 color, float target) {
    color += target - dot(color, vec3(0.30, 0.59, 0.11));
    float low = min(min(color.r, color.g), color.b);
    float high = max(max(color.r, color.g), color.b);
    if (low < 0.0) {
        color = vec3(target) + (color - target) * target / max(target - low, 0.0001);
    }
    if (high > 1.0) {
        color = vec3(target) + (color - target) * (1.0 - target) / max(high - target, 0.0001);
    }
    return clamp(color, 0.0, 1.0);
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

    vec4 sample_color = texture2D(tex, v_coords);
    #if defined(NO_ALPHA)
    sample_color.a = 1.0;
    #endif
    vec3 wallpaper = clamp(sample_color.rgb / max(sample_color.a, 0.0001), 0.0, 1.0);
    float dark = clamp(is_dark, 0.0, 1.0);
    float base = mix(243.0, 32.0, dark) / 255.0;
    float tint_opacity = mix(0.50, 0.80, dark);
    vec3 diffuse = set_luminosity(wallpaper, base);
    float color_strength = clamp(forge_mica_color / 100.0, 0.0, 1.0);
    float activation = clamp(window_active, 0.0, 1.0);
    vec3 material = mix(vec3(base), diffuse, (1.0 - tint_opacity) * color_strength * activation);

    // The material is opaque; alpha still controls surface fades and edge coverage.
    vec4 color = vec4(material, 1.0) * mask * alpha;
    #if defined(DEBUG_FLAGS)
    if (tint == 1.0) color = vec4(0.0, 0.2, 0.0, 0.2) + color * 0.8;
    #endif
    gl_FragColor = color;
}
