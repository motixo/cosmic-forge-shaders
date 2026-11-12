// forge-backdrop: blurred-only
// SPDX-License-Identifier: GPL-3.0-only
// Backdrop-driven digital contours and analytic wireframe walls; no ray marching.
// forge-animation-idle: zero forge_cyber_strength
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
uniform vec3 theme_accent;
uniform vec2 output_size;
uniform vec2 surface_position;
uniform float time;
uniform float forge_cyber_strength;
uniform float forge_cyber_size;
uniform float forge_cyber_depth;
uniform float forge_cyber_glow;
uniform float forge_cyber_color;

float hash21(vec2 p) {
    vec3 h = fract(vec3(p.xyx) * 0.1031);
    h += dot(h, h.yzx + 33.33);
    return fract((h.x + h.y) * h.z);
}

vec3 backdrop_at(vec2 uv, vec2 inset) {
    vec4 color = texture2D(tex, clamp(uv, inset, 1.0 - inset));
    return clamp(color.rgb / max(color.a, 0.0001), 0.0, 1.0);
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
    float aa = 0.65 / max(output_scale, 0.1);
    float mask = smoothstep(-aa, aa, inside);
    if (mask <= 0.0) discard;

    vec4 color = texture2D(tex, v_coords);
    #if defined(NO_ALPHA)
    color.a = 1.0;
    #endif
    float strength = clamp(forge_cyber_strength / 100.0, 0.0, 1.0);
    if (strength > 0.0) {
        float size = clamp(forge_cyber_size, 3.0, 32.0);
        float depth = clamp(forge_cyber_depth / 100.0, 0.0, 1.0);
        float glow = clamp(forge_cyber_glow / 100.0, 0.0, 2.0);
        vec3 neon = mix(vec3(0.0, 0.85, 0.92), theme_accent,
            clamp(forge_cyber_color / 100.0, 0.0, 1.0));
        vec2 screen = max(output_size, vec2(1.0));
        vec2 position = (surface_position + geo_size * 0.5 - screen * 0.5) / (screen * 0.5);
        vec2 vanishing = (vec2(0.5) - clamp(position, -1.0, 1.0) * 0.12) * geo_size;
        float band = floor(p.y / 12.0);
        float glitch = step(0.985, hash21(vec2(band, floor(time * 5.0))))
            * sin(time * 7.0 + band) * size * 0.7;
        vec2 uv_origin = v_coords - p * uv_per_pixel;
        vec2 inset = uv_per_pixel * 0.5;
        vec2 sample_limit = max(geo_size - 0.5, vec2(0.5));
        float light = 0.0;
        float halo = 0.0;
        float surface_luma = 0.0;
        for (int i = 0; i < 3; i++) {
            if (i > 0 && depth <= 0.0) break;
            float layer = float(i);
            float projection = 1.0 + layer * 0.22 * depth;
            vec2 projected = vanishing + (p - vanishing) * projection + vec2(glitch, 0.0);
            float cell_size = size * (1.0 + layer * 1.5);
            vec2 cell = floor(projected / cell_size);
            vec2 local = fract(projected / cell_size);
            vec2 point = (cell + 0.5) * cell_size;
            // Each layer derives its contours from the actual backdrop.
            vec2 center_uv = uv_origin + clamp(point, vec2(0.5), sample_limit) * uv_per_pixel;
            vec2 neighbor_uv = uv_origin + clamp(point - cell_size, vec2(0.5), sample_limit) * uv_per_pixel;
            vec3 center = backdrop_at(center_uv, inset);
            vec3 left = backdrop_at(vec2(neighbor_uv.x, center_uv.y), inset);
            vec3 above = backdrop_at(vec2(center_uv.x, neighbor_uv.y), inset);
            vec2 contrast = vec2(dot(abs(center - left), vec3(0.3333)),
                dot(abs(center - above), vec3(0.3333)));
            contrast = smoothstep(vec2(0.012), vec2(0.12), contrast);
            float luminance = dot(center, vec3(0.299, 0.587, 0.114));
            if (i == 0) surface_luma = luminance;
            vec2 distance_to_line = min(local, 1.0 - local) * cell_size / projection;
            vec2 line = 1.0 - smoothstep(vec2(0.25), vec2(0.25 + aa), distance_to_line);
            vec2 broad = 1.0 - smoothstep(vec2(0.5), vec2(1.5 + glow * 2.5), distance_to_line);
            float weight = i == 0 ? 1.0 : depth * 0.38 / layer;
            float data = step(0.57, hash21(cell + vec2(0.0, floor(local.y * 8.0))))
                * (1.0 - smoothstep(0.0, 0.22, abs(local.x - 0.5)))
                * (1.0 - smoothstep(0.1, 0.3, abs(fract(local.y * 8.0) - 0.5)));
            light += weight * (max(line.x * contrast.x, line.y * contrast.y)
                + data * (luminance * 0.18 + max(contrast.x, contrast.y) * 0.3));
            halo += weight * max(broad.x * contrast.x, broad.y * contrast.y);
        }

        // Intersect a rectangular room analytically to get perspective walls in one step.
        vec2 ray = (p - vanishing) / max(geo_size.y, 1.0);
        vec2 travel = vec2(0.85, 0.6) / max(abs(ray), vec2(0.001));
        float wall_depth = min(travel.x, travel.y);
        float along = travel.x < travel.y ? ray.y * wall_depth : ray.x * wall_depth;
        vec2 wall = vec2(along * 10.0, wall_depth * 6.0) * (12.0 / size);
        vec2 wall_cell = floor(wall);
        vec2 wall_distance = min(fract(wall), 1.0 - fract(wall));
        float line_width = clamp(0.012 * wall_depth, 0.008, 0.12);
        vec2 wall_lines = 1.0 - smoothstep(vec2(0.0), vec2(line_width), wall_distance);
        float fragments = step(0.3, hash21(wall_cell));
        float fade = 1.0 / (1.0 + wall_depth * wall_depth * 0.15);
        float room = max(wall_lines.x, wall_lines.y) * fragments * fade * depth;
        float scan = 1.0 - smoothstep(0.0, 0.045, abs(fract(g.y * 0.7 - time * 0.08) - 0.5));
        float pulses = 0.82 + 0.18 * sin(p.y * 0.055 - time * 2.0);
        float illumination = (light * pulses * 1.6 + room * 0.9) * (0.7 + scan * 0.7)
            + halo * glow * 0.25;
        vec3 original = color.rgb / max(color.a, 0.0001);
        vec3 digital = original * 0.045 + neon * (surface_luma * 0.045 + illumination);
        color.rgb = mix(original, clamp(digital, 0.0, 1.0), strength) * color.a;
    }
    color *= mask * alpha;
    #if defined(DEBUG_FLAGS)
    if (tint == 1.0) color = vec4(0.0, 0.2, 0.0, 0.2) + color * 0.8;
    #endif
    gl_FragColor = color;
}
