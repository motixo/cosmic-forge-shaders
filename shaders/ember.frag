// Flame/noise adapted from trinketMage, https://www.shadertoy.com/view/3tcBzH
// Reference copy: https://github.com/mrdoob/three.js/blob/master/examples/webgpu_shadertoy.html
// Original effect: CC-BY-NC-SA (as credited by Burn My Windows).
// Local Forge adaptation; glass clipping follows COSMIC's clipped_surface.frag.
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
uniform float forge_ember_strength;
uniform float forge_ember_scale;
uniform float forge_ember_color;
uniform float forge_ember_background;

float random_cell(vec2 cell) {
    return fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise_at(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(random_cell(cell), random_cell(cell + vec2(1.0, 0.0)), f.x),
               mix(random_cell(cell + vec2(0.0, 1.0)), random_cell(cell + vec2(1.0)), f.x), f.y);
}

float flame_noise(vec2 p) {
    float value = 0.0;
    float amplitude = 1.0;
    for (int i = 0; i < 3; i++) {
        value += noise_at(p) * amplitude;
        p *= 2.0;
        amplitude *= 0.5;
    }
    // Fine noise matters most in faint flames; otherwise retain its mean brightness.
    if (value < 0.25) {
        value += noise_at(p) * amplitude;
        value += noise_at(p * 2.0) * amplitude * 0.5;
    } else {
        value += 0.09375;
    }
    return value / 1.9375;
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
    color.rgb = mix(color.rgb, theme_tint * color.a,
                    clamp(forge_ember_background / 100.0, 0.0, 1.0));
    if (forge_ember_strength > 0.0) {
        // Surface coordinates keep flames upright on both native and nested outputs.
        vec2 pos = vec2(p.x, geo_size.y - p.y) / max(geo_size.x, 1.0);
        pos *= 100.0 / max(forge_ember_scale, 25.0);
        pos.y -= time * 0.3125;
        float noise_value = max(flame_noise(pos * 10.0), 0.001);
        float gradient = g.y;
        float first = smoothstep(0.0, noise_value, gradient);
        float second = smoothstep(0.0, noise_value, gradient - 0.2);
        float third = smoothstep(0.0, noise_value, gradient - 0.4);
        vec3 bright = vec3(1.0, 0.65, 0.1);
        vec3 dark = vec3(1.0, 0.0, 0.15);
        float theme_mix = clamp(forge_ember_color / 100.0, 0.0, 1.0);
        bright = mix(bright, theme_accent, theme_mix);
        dark = mix(dark, theme_accent * 0.28, theme_mix);
        float outer = first - second;
        float middle = second - third;
        vec3 flame = mix(bright, dark, outer);
        flame = mix(flame, mix(bright, dark, 0.5), middle);
        float flame_alpha = first * mix(0.72, 0.22, outer) * clamp(forge_ember_strength / 100.0, 0.0, 1.0);
        color.rgb = mix(color.rgb, flame * color.a, flame_alpha);
    }
    color *= mask * alpha;
    #if defined(DEBUG_FLAGS)
    if (tint == 1.0) color = vec4(0.0, 0.2, 0.0, 0.2) + color * 0.8;
    #endif
    gl_FragColor = color;
}
