// forge-backdrop: blurred-only
// SPDX-License-Identifier: GPL-3.0-only
// Infinity mirror; output-local geometry follows motion without idle animation.
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
uniform float forge_void_depth;
uniform float forge_void_glow;
uniform float forge_void_parallax;
uniform float forge_void_spacing;
uniform float forge_void_color;
uniform vec2 output_size;
uniform vec2 surface_position;

const float depth_curve = 1.06;

float stroke(float distance_to_line, float width, float aa, float blur) {
    float crisp = 1.0 - smoothstep(max(0.0, width * 0.5 - aa * 0.5), width * 0.5 + aa * 0.5, distance_to_line);
    if (blur <= 0.0) return crisp;
    float sigma = max(aa * 0.5, blur * 6.0);
    float soft = exp(-0.5 * distance_to_line * distance_to_line / (sigma * sigma)) * min(1.0, width / (sigma * 2.506628));
    return mix(crisp, soft, smoothstep(0.0, 0.08, blur));
}

void main() {
    vec2 g = (input_to_geo * vec3(v_coords, 1.0)).xy;
    if (alpha <= 0.0) discard;
    if (g.x < 0.0 || g.y < 0.0 || g.x > 1.0 || g.y > 1.0) discard;
    vec2 p = g * geo_size;
    float radius = g.x < 0.5
        ? (g.y < 0.5 ? corner_radius.x : corner_radius.w)
        : (g.y < 0.5 ? corner_radius.y : corner_radius.z);
    vec2 center = p - geo_size * 0.5;
    vec2 q = abs(center) - geo_size * 0.5 + radius;
    float inside = -(length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - radius);
    float aa = 1.0 / max(output_scale, 1.0);
    float mask = smoothstep(-0.5 * aa, 0.5 * aa, inside);
    if (mask <= 0.0) discard;

    vec4 color = texture2D(tex, v_coords);
    #if defined(NO_ALPHA)
    color.a = 1.0;
    #endif
    vec3 backdrop = color.rgb / max(color.a, 0.0001);
    // Output-local geometry keeps the tunnel centered on its current monitor.
    vec2 screen_center = 0.5 * max(output_size, vec2(1.0));
    vec2 offset = surface_position + geo_size * 0.5 - screen_center;
    vec2 position = offset / (abs(offset) + max(geo_size * 0.5, vec2(1.0)));
    float motion = clamp(forge_void_parallax / 100.0, 0.0, 1.0);
    vec2 view = motion * position * 0.65;
    vec2 vanishing = clamp(vec2(0.5) - view * 0.45, vec2(0.13), vec2(0.87));
    vec2 tilt = clamp(view * vec2(1.2, -1.2), vec2(-0.55), vec2(0.55));
    vec2 inset = min(vec2(3.0) / max(geo_size, vec2(1.0)), vec2(0.1));
    float glow = clamp(forge_void_glow / 100.0, 0.0, 10.0);
    float glow_spread = sqrt(max(1.0, glow));
    float line_blur = clamp(blur_amount, 0.0, 1.0);
    float halo_radius = length(vec2(4.7 * glow_spread, line_blur * 6.0));
    float frame_distance = abs(inside - 3.0);
    float light = stroke(frame_distance, 1.8, aa, line_blur);
    float halo = exp(-frame_distance / halo_radius) * 4.7 * glow_spread / halo_radius;
    vec2 ray = g - vanishing;
    vec2 perspective_tilt = tilt * geo_size / max(max(geo_size.x, geo_size.y), 1.0);
    float plane = 1.0 + dot(vanishing - 0.5, perspective_tilt);
    float slope = dot(ray, perspective_tilt);
    vec2 extent = mix(inset, vec2(1.0) - inset, step(vec2(0.0), ray)) - vanishing;
    float radial = max(ray.x / extent.x, ray.y / extent.y);
    // Invert the tunnel projection once, then shade only the two neighboring reflections.
    float depth_at_pixel = max(0.0, (1.0 - radial) / max(radial * plane + slope, 0.000001));
    float spacing = clamp(forge_void_spacing / 100.0, 0.25, 2.0);
    float last_reflection = max(2.0, forge_void_depth - 1.0);
    float travel_limit = 1.0 - pow(1.18, -spacing * last_reflection);
    float travel_at_pixel = depth_at_pixel / (1.0 + depth_at_pixel);
    // A convex curve in projected travel makes the visible gaps grow with depth.
    float reflection = clamp(floor(last_reflection * pow(clamp(travel_at_pixel / travel_limit, 0.0, 1.0), 1.0 / depth_curve)), 1.0, last_reflection - 1.0);
    float fade = pow(0.92, reflection);
    for (int i = 0; i < 2; i++) {
        float progress = (reflection + float(i)) / last_reflection;
        float travel = travel_limit * pow(progress, depth_curve);
        float expansion = 1.0 / max(1.0 - travel, 0.000001);
        float depth = expansion - 1.0;
        float projection = (1.0 + depth * plane) / max(1.0 - depth * slope, 0.000001);
        vec2 front = (vanishing + ray * projection - 0.5) * geo_size;
        vec2 distance_to_edge = abs(front) - (0.5 - inset) * geo_size;
        float distance_to_frame = abs(length(max(distance_to_edge, vec2(0.0))) + min(max(distance_to_edge.x, distance_to_edge.y), 0.0)) / projection;
        float width = max(0.65 * aa, 1.8 * inversesqrt(expansion));
        float core = stroke(distance_to_frame, width, aa, line_blur);
        light = max(light, core * fade);
        float base_radius = (1.2 + 3.5 / expansion) * glow_spread;
        halo_radius = length(vec2(base_radius, line_blur * 6.0));
        halo += exp(-distance_to_frame / halo_radius) * fade * base_radius / halo_radius;
        fade *= 0.92;
    }
    float illumination = clamp(light + halo * 0.22 * glow, 0.0, 1.0);
    vec3 glass = mix(backdrop, theme_tint, clamp(forge_void_color / 100.0, 0.0, 1.0));
    vec3 material = mix(glass, theme_accent, illumination);
    color.rgb = material * color.a;
    color *= mask * alpha;
    #if defined(DEBUG_FLAGS)
    if (tint == 1.0) color = vec4(0.0, 0.2, 0.0, 0.2) + color * 0.8;
    #endif
    gl_FragColor = color;
}
