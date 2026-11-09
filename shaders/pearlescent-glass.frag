// SPDX-License-Identifier: GPL-3.0-only
// A thin-film sheen over a single backdrop sample.
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
uniform float output_scale;
uniform vec2 output_size;
uniform vec2 surface_position;
uniform float forge_pearl_sheen;
uniform float forge_pearl_iridescence;

void main() {
    if (alpha <= 0.0) discard;
    vec2 g = (input_to_geo * vec3(v_coords, 1.0)).xy;
    if (g.x < 0.0 || g.y < 0.0 || g.x > 1.0 || g.y > 1.0) discard;
    float radius = g.x < 0.5
        ? (g.y < 0.5 ? corner_radius.x : corner_radius.w)
        : (g.y < 0.5 ? corner_radius.y : corner_radius.z);
    vec2 q = abs((g - 0.5) * geo_size) - geo_size * 0.5 + radius;
    float inside = -(length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - radius);
    float aa = 0.5 / max(output_scale, 0.1);
    float mask = smoothstep(-aa, aa, inside);
    if (mask <= 0.0) discard;

    // Window motion changes the simulated viewing angle without an animation clock.
    vec2 view = (surface_position + (geo_size - output_size) * 0.5) / max(output_size, vec2(1.0));
    view = clamp(view, -1.0, 1.0) * step(1.0, min(output_size.x, output_size.y));
    vec2 curved = (g - 0.5) * vec2(1.75, 1.35);
    vec2 slope = curved + view * 0.8;
    float facing = inversesqrt(1.0 + dot(slope, slope));
    float bend = curved.x + 0.55 * curved.y + 0.13 * sin(g.y * 6.2831853);
    float phase = 16.0 * (1.0 - facing) + 2.2 * bend + 3.8 * dot(view, vec2(1.0, -0.45));
    vec3 interference = 0.80 + 0.19 * cos(phase + vec3(0.3, 2.4, 4.5));
    float iridescence = clamp(forge_pearl_iridescence / 100.0, 0.0, 1.0);
    vec3 pearl = mix(vec3(0.89, 0.90, 0.93), interference, iridescence);

    float ribbon = 1.0 - smoothstep(0.02, 0.62, abs(bend + dot(view, vec2(0.65, 0.25)) - 0.18));
    float rim = 1.0 - smoothstep(0.0, 24.0, inside);
    float sheen = clamp(forge_pearl_sheen / 100.0, 0.0, 1.0);
    float reflection = sheen * (0.20 + 0.34 * ribbon + 0.20 * rim);

    vec4 color = texture2D(tex, v_coords);
    #if defined(NO_ALPHA)
    color.a = 1.0;
    #endif
    color.rgb = mix(color.rgb, pearl * color.a, reflection);
    color *= mask * alpha;
    #if defined(DEBUG_FLAGS)
    if (tint == 1.0) color = vec4(0.0, 0.2, 0.0, 0.2) + color * 0.8;
    #endif
    gl_FragColor = color;
}
