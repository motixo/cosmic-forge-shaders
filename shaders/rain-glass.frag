// forge-effect-map: rain-runoff-v1
// forge-rain-field: v1
// SPDX-License-Identifier: GPL-3.0-only
// Visual references: Toadstorm's Rainy Glass (https://github.com/toadstorm/RainyGlassShader)
// and BigWings' Heartfelt (https://www.shadertoy.com/view/ltffzl).
// forge-animation-idle: zero forge_animation_intensity_percent
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
uniform vec2 uv_per_pixel;
uniform float output_scale;
uniform float blur_amount;
uniform float time;
uniform float forge_animation_intensity_percent;
uniform float forge_rain_size;
uniform float forge_animation_speed_percent;
uniform vec2 forge_animation_clock;

float drop_time() {
    if (forge_animation_clock.y > 0.0) return forge_animation_clock.x;
    return time * clamp(forge_animation_speed_percent / 100.0, 0.25, 3.0);
}

vec3 rain_hash(vec2 p) {
    // Based on David Hoskins' Hash without Sine (https://www.shadertoy.com/view/4djSRW).
    vec3 h = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    h += dot(h, h.yxz + 33.33);
    return fract((h.xxy + h.yzz) * h.zyx);
}

float rain_visibility(float rank, float limit, float intensity) {
    if (intensity >= 1.0) return 1.0 - step(limit, rank);
    // Center the fade on the threshold so it doesn't bias the density curve.
    float threshold = intensity * limit;
    float fade = 0.12 * threshold * (1.0 - intensity);
    return 1.0 - smoothstep(threshold - fade, threshold + fade, rank);
}

struct Water {
    vec2 bend;
    float clear;
    float shine;
    float shade;
};

const Water dry = Water(vec2(0.0), 0.0, 0.0, 0.0);

Water join_water(Water a, Water b) {
    return Water(a.bend * (1.0 - b.clear) + b.bend, max(a.clear, b.clear),
        max(a.shine * (1.0 - b.clear), b.shine), max(a.shade * (1.0 - b.clear), b.shade));
}

vec2 lens_shape(vec2 q, vec3 traits, float splash, float taper) {
    q.x /= 1.0 + taper * clamp(q.y, -1.0, 1.0);
    float r2 = dot(q, q);
    // Round lobes and shallow dents shift around the rim of each bead.
    vec2 direction = q * inversesqrt(max(r2, 0.0001));
    vec2 tilt = normalize(vec2(2.0 * traits.z - 1.0, 0.58 + traits.y));
    if (splash > 0.0) {
        float angle = splash * (fract(traits.x * 7.13 + traits.z * 3.37) - 0.5) * 6.283185;
        vec2 axis = vec2(cos(angle), sin(angle));
        tilt = tilt.x * axis + tilt.y * vec2(-axis.y, axis.x);
    }
    float x = dot(direction, tilt);
    float y = dot(direction, vec2(-tilt.y, tilt.x));
    float lobe = x * (4.0 * x * x - 3.0);
    float ripple = 4.0 * x * y * (x * x - y * y);
    float lobes = 0.13 + 0.10 * traits.y + splash * mix(0.07, 0.23, traits.z);
    float ripples = 0.17 * traits.x - 0.085 + splash * (0.38 * traits.x - 0.19);
    float contour = clamp(0.98 + lobes * lobe + (0.12 + 0.12 * traits.z) * y + ripples * ripple,
        0.68 - 0.12 * splash, 1.18 + 0.22 * splash);
    return q / contour;
}

Water lens_light(vec2 delta, vec2 q, float r2, float cover, float highlight_side) {
    float dome = sqrt(max(0.0, 1.0 - r2));
    float lip = smoothstep(0.36, 0.94, r2);
    float low = max(0.0, q.y + (highlight_side - 0.5) * q.x * 0.7);
    float glint = clamp(dot(vec3(q, dome), vec3(-0.39, -0.57, 0.72)), 0.0, 1.0);
    glint *= glint;
    glint *= glint;
    glint *= glint;
    glint *= glint;
    return Water(-delta * (1.08 + 1.38 * dome) * cover, cover,
        (lip * low * 0.47 + glint * 0.24) * cover,
        lip * (0.10 + 0.48 * max(0.0, -q.y)) * cover);
}

Water wet_lens(vec2 delta, vec2 radii, vec3 traits, float amount, float aa, float splash, float taper) {
    vec2 q = delta / radii;
    float edge = min(0.72, aa / min(radii.x, radii.y));
    float rim = 1.18 + 0.22 * splash;
    vec2 bound = q / vec2(1.0 + taper, 1.0);
    if (dot(bound, bound) >= rim * rim * (1.0 + edge)) return dry;
    q = lens_shape(q, traits, splash, taper);
    float r2 = dot(q, q);
    if (r2 >= 1.0 + edge) return dry;
    return lens_light(delta, q, r2, (1.0 - smoothstep(1.0 - edge, 1.0 + edge, r2)) * amount, traits.y);
}

Water merging_lens(vec2 a, vec2 b, vec2 ra, vec2 rb, vec3 traits, float phase, float aa,
                   float splash, float taper) {
    vec2 qa = lens_shape(a / ra, traits, splash, taper);
    vec2 qb = lens_shape(b / rb, traits.zxy, splash, taper);
    float da = (length(qa) - 1.0) * min(ra.x, ra.y);
    float db = (length(qb) - 1.0) * min(rb.x, rb.y);
    // Blend the outlines before lighting so the contact has one continuous surface.
    float neck = max(0.02, min(ra.x, rb.x) * 1.25 * sqrt(phase * (1.0 - phase)));
    float wa = clamp(0.5 + 0.5 * (db - da) / neck, 0.0, 1.0);
    float distance_to_water = mix(db, da, wa) - neck * wa * (1.0 - wa);
    if (distance_to_water >= aa) return dry;
    float r = max(0.0, 1.0 + distance_to_water / mix(rb.x, ra.x, wa));
    return lens_light(mix(b, a, wa), mix(qb, qa, wa), r * r,
        1.0 - smoothstep(-aa, aa, distance_to_water), mix(traits.x, traits.y, wa));
}

Water fine_beads(vec2 bead_p, vec2 tile, float size, float intensity, float aa, float phase_time, float variant) {
    // Each column has a different offset and speed, with no reset inside the pane.
    float x = bead_p.x + variant * 0.25;
    float column = floor(x / tile.x);
    vec3 stream = rain_hash(vec2(column, 31.0 + variant));
    float y = bead_p.y - phase_time * mix(1.6, 5.4, stream.x) + stream.y * 79.0;
    vec2 cell = vec2(column, floor(y / tile.y));
    vec3 seed = rain_hash(cell + vec2(83.0, 19.0 + variant));
    // Reject cells that cannot show a bead even at the highest patch density.
    float max_threshold = intensity * 0.98;
    if (seed.x >= max_threshold + 0.12 * max_threshold * (1.0 - intensity)) return dry;
    float r = max(0.44, size * 0.165 * mix(0.30, 1.0, seed.z * seed.z));
    vec2 half_cell = tile * 0.5;
    vec2 jitter = min(vec2(2.85, 3.45), max(vec2(0.0), half_cell - r * 1.56 - aa));
    vec2 center = half_cell + (2.0 * vec2(seed.y, fract(seed.z * 13.71)) - 1.0) * jitter;
    vec2 delta = vec2(x, y) - cell * tile - center;
    if (dot(delta, delta) > (r * 1.56 + aa) * (r * 1.56 + aa)) return dry;
    float patch = 0.54 + 0.36 * sin(cell.x * 0.33 + cell.y * 0.41) * sin(cell.y * 0.23);
    patch = min(0.98, patch * 1.85);
    float visibility = rain_visibility(seed.x, patch, intensity);
    if (visibility <= 0.0) return dry;
    return wet_lens(delta, vec2(r, r * mix(0.70, 1.14, seed.y)), seed, 0.87 * visibility, aa, 0.0, 0.0);
}

Water drainage(vec2 p, float size, float intensity, float aa) {
    float spacing = mix(192.0, 150.0, smoothstep(0.78, 1.0, intensity));
    float lane = floor(p.x / spacing);
    vec3 channel = rain_hash(vec2(lane, 173.0));
    float visibility = rain_visibility(channel.x, 0.88, intensity);
    if (visibility <= 0.0) return dry;
    float center = (lane + 0.24 + channel.y * 0.52) * spacing;
    if (abs(p.x - center) > 26.0) return dry;
    float phase = channel.z * 6.283185;
    float flow_y = p.y - time * mix(15.0, 26.0, channel.y);
    center += (5.0 + size * 0.30) * sin(p.y * 0.011 + phase)
        + (1.9 + size * 0.072) * sin(flow_y * 0.033 + phase * 2.0)
        + 1.7 * sin(flow_y * 0.085 + phase);
    float dx = p.x - center;
    float pulse = 0.71 + 0.29 * sin(flow_y * 0.046 + phase);
    float width = max(0.48, size * 0.117 * mix(0.77, 1.33, channel.z) * pulse);
    float wet = (1.0 - smoothstep(width * 0.52, width + aa, abs(dx))) * visibility;
    float rim = smoothstep(width * 0.26, width + aa, abs(dx));
    return Water(vec2(-dx * 2.18, 0.0) * wet, wet * 0.89,
        wet * rim * (dx < 0.0 ? 0.11 : 0.035), wet * (0.075 + rim * 0.24));
}

struct RunoffLane {
    float offset_x;
    float width;
    float scale;
    float seed;
    float drop_seed;
    vec3 stream;
    float speed;
    float hold;
    float period;
    float phase;
    float rhythm;
    float rest_sine;
};

RunoffLane prepare_runoff(float x, float width, float scale, float pace, float seed, float size, float phase_time) {
    float lane = floor(x / width);
    vec3 stream = rain_hash(vec2(lane, seed));
    float speed = mix(58.0, 132.0, stream.x) * pace;
    float hold = mix(0.70, 2.60, stream.z);
    float period = hold + 0.40 + (geo_size.y + min(geo_size.y * 0.48, size * 9.0)
        + size * 0.7 + 4.0) / speed;
    float rhythm = stream.z * 6.283185;
    return RunoffLane(x - (lane + 0.5) * width, width, scale, seed, lane + seed * 53.0,
        stream, speed, hold, period, phase_time / period + stream.y, rhythm, sin(rhythm));
}

bool lane_covers(RunoffLane lane, float size, float aa) {
    return abs(lane.offset_x) <= lane.width * 0.12 + size * lane.scale * 2.6 + 2.0 + aa;
}

#ifdef FORGE_EFFECT_MAP_PASS
#define RUNOFF_RESULT vec4
#define RUNOFF_DRY vec4(0.0)
#else
#define RUNOFF_RESULT Water
#define RUNOFF_DRY dry
#endif

RUNOFF_RESULT runoff(vec2 p, RunoffLane lane, float size, float intensity, float aa, float phase_offset
#ifdef FORGE_EFFECT_MAP_PASS
    , float row
#endif
) {
    float lane_width = lane.width;
    float scale = lane.scale;
#ifndef FORGE_EFFECT_MAP_PASS
    float lane_x = lane.offset_x;
#endif
    vec3 stream = lane.stream;
    // Stagger drops on the same lane and vary their shapes independently.
    float phase = lane.phase + phase_offset;
    float cycle = floor(phase) + lane.seed + phase_offset * 46.0;
    vec3 drop = rain_hash(vec2(lane.drop_seed, cycle));
    float visibility = rain_visibility(drop.x, 1.0, intensity);
    if (visibility <= 0.0) return RUNOFF_DRY;

    float elapsed = fract(phase) * lane.period;
    float growth = smoothstep(0.0, 0.20, elapsed);
    float radius = size * scale * mix(0.68, 1.0, drop.y) * growth;
    if (radius < 0.25) return RUNOFF_DRY;
    float contact = max(radius, geo_size.y * 0.66 * drop.z);
    // Heads and trails begin at contact. Include the merged radius in the upper bound.
#ifdef FORGE_EFFECT_MAP_PASS
    float lower_bound = contact - radius * 4.0 - 2.0 * aa;
    float upper_bound = 1e10;
#else
    if (p.y < contact - radius * 4.0 - 2.0 * aa) return RUNOFF_DRY;
#endif
    float slip = max(0.0, elapsed - lane.hold);
    float rhythm = lane.rhythm;
    float surge = 0.082 * (sin(slip * 4.2 + rhythm) - lane.rest_sine);
    float descent = lane.speed * (slip * (1.0 - 0.65 / (1.0 + 3.5 * slip)) + surge);
    float lead_y = contact + descent;
    float launch = radius * 4.15 + 8.0;
    bool paired = lane_width >= 30.0 && descent > launch && fract(drop.x * 13.79 + drop.z * 5.38) < 0.60;
    if (phase_offset > 0.0 || stream.z <= 0.42) {
        // These drops have no trail. Include both heads and room for the merged outline.
        float reach = radius * 2.2 + 2.0 * aa;
        float lower = lead_y - reach;
        float upper = lead_y + reach;
        if (paired) {
            float other_y = contact + (descent - launch) * mix(1.65, 1.96, stream.x);
            float merge_reach = radius * 5.0 + 2.0 * aa;
            lower = min(lead_y, other_y) - merge_reach;
            upper = max(lead_y, other_y) + merge_reach;
        }
#ifdef FORGE_EFFECT_MAP_PASS
        lower_bound = max(lower_bound, lower);
        upper_bound = min(upper_bound, upper);
#else
        if (p.y < lower || p.y > upper) return RUNOFF_DRY;
#endif
    }
    float sliding = smoothstep(0.03, mix(0.30, 0.62, drop.y), slip);
    float splash = lane_width >= 30.0 ? 1.0 - sliding : 0.0;
    float taper = lane_width >= 30.0 ? sliding * mix(0.17, 0.35, drop.z) : 0.0;
    float spread = mix(1.0, mix(1.26, 1.76, fract(5.0 * drop.x + drop.y)), splash);
    float follower_y = lead_y;
    float follower_radius = 0.0;
    float fusion = 0.0;
    float aspect = mix(mix(0.88, 1.51, drop.z) + taper * 0.55, mix(0.72, 1.05, drop.z), splash);
    float follower_aspect = mix(mix(0.92, 1.27, drop.y) + taper * 0.42, 0.92, splash);
    if (paired) {
        float second = radius * mix(0.68, 0.90, stream.z);
        float faster = mix(1.65, 1.96, stream.x);
        float touch = 0.94 * (radius * aspect + second * follower_aspect);
        float meeting = (faster * launch - touch) / (faster - 1.0);
        if (contact + meeting < geo_size.y - radius * 2.0) {
            follower_y = contact + (descent - launch) * faster;
            follower_radius = second * smoothstep(launch, launch + second * 1.7, descent);
            if (descent >= meeting) {
                float a2 = radius * radius;
                float b2 = second * second;
                float share = b2 / (a2 + b2);
                float travel = descent - meeting;
                fusion = smoothstep(0.0, radius * 2.4 + 2.0, travel);
                float center = contact + meeting - touch * share + travel * mix(1.0, faster, share);
                float gap = touch * (1.0 - fusion);
                lead_y = center + gap * share;
                follower_y = center - gap * (1.0 - share);
                // Transfer the smaller bead's area as the two centers settle together.
                radius = sqrt(a2 + b2 * fusion);
                follower_radius = second * sqrt(1.0 - fusion);
                aspect = mix(aspect, 1.02, fusion);
            }
        }
    }

    float contour = 1.18 + 0.22 * splash + 0.12 * fusion;
    float head = radius * aspect * contour + 2.0 * aa;
    float head2 = follower_radius * follower_aspect * contour + 2.0 * aa;
    float trail = min(lead_y - contact, min(geo_size.y * 0.31, radius * mix(4.5, 11.0, stream.z)));
#ifdef FORGE_EFFECT_MAP_PASS
    bool film = phase_offset == 0.0 && stream.z > 0.42 && trail > 0.0;
#else
    float dy = p.y - lead_y;
    float dy2 = p.y - follower_y;
    bool near_lead = abs(dy) < head;
    bool near_follower = follower_radius >= 0.25 && abs(dy2) < head2;
    float behind = -dy - radius * 1.65;
    bool near_film = phase_offset == 0.0 && stream.z > 0.42 && behind > 0.0 && behind < trail;
    if (!near_lead && !near_follower && !near_film) return RUNOFF_DRY;
#endif

    float horizontal_bound = contour * (1.0 + taper);
    float max_radius_x = (lane_width * 0.5 - 1.0 - 2.0 * aa) / horizontal_bound;
    vec2 ra = vec2(min(radius * spread, max_radius_x), radius * aspect);
    vec2 rb = vec2(min(follower_radius * spread, max_radius_x), follower_radius * follower_aspect);
    float width_limit = max(ra.x, rb.x) * horizontal_bound + 2.0 * aa;
    float sway = min(0.88 + radius * 0.25, max(0.2, (lane_width * 0.5 - width_limit) / 1.33));
    float room = max(0.0, lane_width * 0.5 - width_limit - sway * 1.33);
#ifdef FORGE_EFFECT_MAP_PASS
    float lower_y = lead_y - head;
    float upper_y = lead_y + head;
    bool has_follower = follower_radius >= 0.25;
    if (has_follower) {
        lower_y = min(lower_y, follower_y - head2);
        upper_y = max(upper_y, follower_y + head2);
    }
    if (film) lower_y = min(lower_y, lead_y - radius * 1.65 - trail);
    // The padded bounds only reject dry fragments. Heads and trails use the original tests.
    if (row < 1.0) return vec4(max(lower_bound, lower_y) - 0.01, min(upper_bound, upper_y) + 0.01,
        head, has_follower ? head2 : -1.0);
    if (row < 2.0) return vec4(lead_y, follower_y, radius, film ? trail : 0.0);
    if (row < 3.0) return vec4(ra, rb);
    if (row < 4.0) return vec4(growth, splash, taper, fusion);
    if (row < 5.0) return vec4(sway, (2.0 * drop.y - 1.0) * min(lane_width * 0.12, room), width_limit, rhythm);
    return vec4(drop, visibility);
#else
    float drift = sway * (sin(p.y * 0.023 + rhythm) + 0.33 * sin(p.y * 0.068 + drop.z * 9.0));
    float dx = lane_x - (2.0 * drop.y - 1.0) * min(lane_width * 0.12, room) - drift;
    if (abs(dx) > width_limit) return RUNOFF_DRY;
    Water water = dry;
    if (fusion > 0.0 && follower_radius >= 0.25 && (near_lead || near_follower)) {
        water = merging_lens(vec2(dx, dy), vec2(dx, dy2), ra, rb, drop, fusion, aa, splash, taper);
    } else {
        if (near_lead) water = wet_lens(vec2(dx, dy), ra, drop, growth, aa, splash, taper);
        if (near_follower)
            water = join_water(water, wet_lens(vec2(dx, dy2), rb, drop.zxy, 1.0, aa, splash, taper));
    }

    if (near_film) {
        float along = behind / trail;
        float patch = smoothstep(-0.24, 0.48, 0.72 * sin(p.y * 0.086 + rhythm)
            + 0.28 * sin(p.y * 0.237 + drop.y * 10.0));
        float width = radius * mix(0.20, 0.55, patch) * mix(1.0, 0.68, along);
        float streak = patch * (1.0 - smoothstep(width * 0.26, width + aa, abs(dx)))
            * smoothstep(0.0, radius, behind) * (1.0 - smoothstep(0.42, 1.0, along));
        Water film = Water(vec2(-dx * 0.72, 0.0) * streak, streak * 0.64,
            streak * 0.038, streak * 0.064);
        water = join_water(film, water);
    }
    return Water(water.bend * visibility, water.clear * visibility,
        water.shine * visibility, water.shade * visibility);
#endif
}

#if defined(FORGE_EFFECT_MAP_PASS) || (defined(FORGE_EFFECT_MAP_SAMPLE) && !defined(FORGE_RAIN_FIELD_PASS) && !defined(FORGE_RAIN_FIELD_SAMPLE))
float large_bounds_column() {
    float columns = floor(geo_size.x / 18.0) + 1.0;
    float lanes = floor(geo_size.x / 48.0) + 1.0;
    return columns >= 2.0 * lanes ? columns - lanes : -1.0;
}
#endif

#ifdef FORGE_EFFECT_MAP_PASS
#undef main
void main() {
    float column = floor(gl_FragCoord.x);
    float layer = floor(gl_FragCoord.y);
    float slot = floor(layer / 6.0);
    float row = layer - slot * 6.0;
    float intensity = clamp(forge_animation_intensity_percent / 100.0, 0.0, 1.0);
    float size = clamp(forge_rain_size, 4.0, 26.0);
    float aa = 0.65 / max(output_scale, 1.0);
    float phase_time = drop_time();
    if (slot == 0.0 || slot == 3.0) {
        RunoffLane lane = prepare_runoff((column + 0.5) * 30.0, 30.0, 0.29, 0.82, 19.0, size, phase_time);
        gl_FragColor = runoff(vec2(0.0), lane, size, intensity, aa, slot == 0.0 ? 0.0 : 0.5, row);
    } else if (slot == 1.0) {
        // The main 48 px lanes leave enough columns for four additional bounds rows.
        float bounds_column = large_bounds_column();
        if (bounds_column >= 0.0 && column >= bounds_column && row < 4.0) {
            RunoffLane lane = prepare_runoff((column - bounds_column + 0.5) * 48.0,
                48.0, 0.50, 1.0, 7.0, size, phase_time);
            // Match the draw loop so both shaders round the phase offsets the same way.
            for (int index = 1; index < 5; ++index) {
                if (row == float(index - 1)) {
                    float offset = float(index) / 5.0;
                    gl_FragColor = runoff(vec2(0.0), lane, size, intensity, aa, offset, 0.0);
                    break;
                }
            }
        } else {
            RunoffLane lane = prepare_runoff((column + 0.5) * 48.0,
                48.0, 0.50, 1.0, 7.0, size, phase_time);
            gl_FragColor = runoff(vec2(0.0), lane, size, intensity, aa, 0.0, row);
        }
    } else {
        float small_runoff = smoothstep(0.77, 1.0, intensity);
        gl_FragColor = vec4(0.0);
        if (small_runoff > 0.0) {
            float width = mix(22.0, 18.0, small_runoff);
            RunoffLane lane = prepare_runoff((column + 0.5) * width, width, 0.22, 0.96, 47.0, size, phase_time);
            gl_FragColor = runoff(vec2(0.0), lane, size, small_runoff, aa, 0.0, row);
        }
    }
}
#else
#ifdef FORGE_EFFECT_MAP_SAMPLE
uniform highp sampler2D forge_effect_map_tex;
uniform float forge_effect_map_enabled;
#ifdef FORGE_RAIN_FIELD_SAMPLE
uniform highp sampler2D forge_effect_map_shade;
uniform vec2 forge_rain_field_size;
#endif

vec4 slot_data(float column, float row) {
    return texture2D(forge_effect_map_tex, (vec2(column, row) + vec2(0.5)) / vec2(floor(geo_size.x / 18.0) + 1.0, 24.0));
}

Water runoff_cached(vec2 p, float width, float scale, float size, float aa, float slot) {
    float column = floor(p.x / width);
    float lane_x = p.x - (column + 0.5) * width;
    if (abs(lane_x) > width * 0.12 + size * scale * 2.6 + 2.0 + aa) return dry;
    float row = slot * 6.0;
    vec4 bounds = slot_data(column, row);
    if (bounds.z <= 0.0 || p.y < bounds.x || p.y > bounds.y) return dry;
    vec4 motion = slot_data(column, row + 1.0);
    float dy = p.y - motion.x;
    float dy2 = p.y - motion.y;
    float radius = motion.z;
    float trail = motion.w;
    float behind = -dy - radius * 1.65;
    bool near_lead = abs(dy) < bounds.z;
    bool near_follower = bounds.w >= 0.0 && abs(dy2) < bounds.w;
    bool near_film = behind > 0.0 && behind < trail;
    if (!near_lead && !near_follower && !near_film) return dry;

    vec4 drift_data = slot_data(column, row + 4.0);
    vec4 traits = slot_data(column, row + 5.0);
    vec3 drop = traits.xyz;
    float visibility = traits.w;
    float rhythm = drift_data.w;
    float drift = drift_data.x * (sin(p.y * 0.023 + rhythm) + 0.33 * sin(p.y * 0.068 + drop.z * 9.0));
    float dx = lane_x - drift_data.y - drift;
    if (abs(dx) > drift_data.z) return dry;
    vec4 shape = slot_data(column, row + 2.0);
    vec4 lighting = slot_data(column, row + 3.0);
    vec2 ra = shape.xy;
    vec2 rb = shape.zw;
    float growth = lighting.x;
    float splash = lighting.y;
    float taper = lighting.z;
    float fusion = lighting.w;
    Water water = dry;
    if (fusion > 0.0 && bounds.w >= 0.0 && (near_lead || near_follower)) {
        water = merging_lens(vec2(dx, dy), vec2(dx, dy2), ra, rb, drop, fusion, aa, splash, taper);
    } else {
        if (near_lead) water = wet_lens(vec2(dx, dy), ra, drop, growth, aa, splash, taper);
        if (near_follower)
            water = join_water(water, wet_lens(vec2(dx, dy2), rb, drop.zxy, 1.0, aa, splash, taper));
    }

    if (near_film) {
        float along = behind / trail;
        float patch = smoothstep(-0.24, 0.48, 0.72 * sin(p.y * 0.086 + rhythm)
            + 0.28 * sin(p.y * 0.237 + drop.y * 10.0));
        float width = radius * mix(0.20, 0.55, patch) * mix(1.0, 0.68, along);
        float streak = patch * (1.0 - smoothstep(width * 0.26, width + aa, abs(dx)))
            * smoothstep(0.0, radius, behind) * (1.0 - smoothstep(0.42, 1.0, along));
        Water film = Water(vec2(-dx * 0.72, 0.0) * streak, streak * 0.64,
            streak * 0.038, streak * 0.064);
        water = join_water(film, water);
    }
    return Water(water.bend * visibility, water.clear * visibility,
        water.shine * visibility, water.shade * visibility);
}

#endif

void main() {
    if (alpha <= 0.0) discard;
    vec2 g = (input_to_geo * vec3(v_coords, 1.0)).xy;
    if (g.x < 0.0 || g.y < 0.0 || g.x > 1.0 || g.y > 1.0) discard;
    vec2 p = g * geo_size;
    float corner = g.x < 0.5
        ? (g.y < 0.5 ? corner_radius.x : corner_radius.w)
        : (g.y < 0.5 ? corner_radius.y : corner_radius.z);
    vec2 q = abs(p - geo_size * 0.5) - geo_size * 0.5 + corner;
    float inside = -(length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - corner);
    float aa = 0.65 / max(output_scale, 1.0);
    float mask = smoothstep(-aa, aa, inside);
    if (mask <= 0.0) discard;

#ifdef FORGE_RAIN_FIELD_SAMPLE
    vec2 field_uv = gl_FragCoord.xy / forge_rain_field_size;
    vec4 water_data = texture2D(forge_effect_map_tex, field_uv);
    Water water = Water(water_data.xy, water_data.z, water_data.w,
        texture2D(forge_effect_map_shade, field_uv).r);
#else
    Water water = dry;
    float intensity = clamp(forge_animation_intensity_percent / 100.0, 0.0, 1.0);
    if (intensity > 0.0) {
        float size = clamp(forge_rain_size, 4.0, 26.0);
        float phase_time = drop_time();
        // Keep even the largest fine bead inside its cell at any intensity.
        float min_span = 2.0 * (size * 0.165 * 1.56 + aa) + 0.3;
        vec2 tile = max(vec2(12.0, 13.0), vec2(min_span));
        water = drainage(p, size, intensity, aa);
        vec2 bead_p = vec2(p.x + 2.1 * sin(p.y * 0.045) + 1.2 * sin(p.y * 0.095 + p.x * 0.025), p.y);
        water = join_water(water, fine_beads(bead_p, tile, size, intensity, aa, phase_time, 0.0));
        water = join_water(water, fine_beads(bead_p, tile, size, intensity, aa, phase_time, 29.0));
        water = join_water(water, fine_beads(bead_p, tile, size, intensity, aa, phase_time, 61.0));
        water = join_water(water, fine_beads(bead_p, tile, size, intensity, aa, phase_time, 97.0));
        RunoffLane large_lane = prepare_runoff(p.x, 48.0, 0.50, 1.0, 7.0, size, phase_time);
        bool large_visible = lane_covers(large_lane, size, aa);
#ifdef FORGE_EFFECT_MAP_SAMPLE
        if (forge_effect_map_enabled > 0.5) {
            water = join_water(water, runoff_cached(p, 30.0, 0.29, size, aa, 0.0));
            water = join_water(water, runoff_cached(p, 48.0, 0.50, size, aa, 1.0));
            float small_runoff = smoothstep(0.77, 1.0, intensity);
            if (small_runoff > 0.0) {
                float width = mix(22.0, 18.0, small_runoff);
                water = join_water(water, runoff_cached(p, width, 0.22, size, aa, 2.0));
            }
            water = join_water(water, runoff_cached(p, 30.0, 0.29, size, aa, 3.0));
        } else
#endif
        {
            RunoffLane medium_lane = prepare_runoff(p.x, 30.0, 0.29, 0.82, 19.0, size, phase_time);
            bool medium_visible = lane_covers(medium_lane, size, aa);
            if (medium_visible) water = join_water(water, runoff(p, medium_lane, size, intensity, aa, 0.0));
            if (large_visible) water = join_water(water, runoff(p, large_lane, size, intensity, aa, 0.0));
            float small_runoff = smoothstep(0.77, 1.0, intensity);
            if (small_runoff > 0.0) {
                float width = mix(22.0, 18.0, small_runoff);
                RunoffLane small_lane = prepare_runoff(p.x, width, 0.22, 0.96, 47.0, size, phase_time);
                if (lane_covers(small_lane, size, aa))
                    water = join_water(water, runoff(p, small_lane, size, small_runoff, aa, 0.0));
            }
            if (medium_visible) water = join_water(water, runoff(p, medium_lane, size, intensity, aa, 0.5));
        }
        const int large_drop_slots = 5;
        if (large_visible) {
#if defined(FORGE_EFFECT_MAP_SAMPLE) && !defined(FORGE_RAIN_FIELD_PASS)
            float bounds_column = large_bounds_column();
            bool use_bounds = forge_effect_map_enabled > 0.5 && bounds_column >= 0.0;
            float bound_lane = floor(p.x / 48.0) + bounds_column;
#endif
            for (int slot = 1; slot < large_drop_slots; ++slot) {
                float offset = float(slot) / float(large_drop_slots);
#if defined(FORGE_EFFECT_MAP_SAMPLE) && !defined(FORGE_RAIN_FIELD_PASS)
                if (use_bounds) {
                    vec4 bounds = slot_data(bound_lane, 5.0 + float(slot));
                    if (bounds.z <= 0.0 || p.y < bounds.x - 1.0 || p.y > bounds.y + 1.0)
                        continue;
                }
#endif
                water = join_water(water, runoff(p, large_lane, size, intensity, aa, offset));
            }
        }
    }
#endif
#ifdef FORGE_RAIN_FIELD_PASS
    gl_FragData[0] = vec4(water.bend, water.clear, water.shine);
    gl_FragData[1] = vec4(water.shade, 0.0, 0.0, 0.0);
#else
    vec2 uv = v_coords;
    if (water.clear > 0.0) {
        vec2 point = clamp(p + water.bend, vec2(0.5), max(geo_size - 0.5, vec2(0.5)));
        vec2 inset = uv_per_pixel * 0.5;
        uv = clamp(v_coords + (point - p) * uv_per_pixel, inset, 1.0 - inset);
    }
    vec4 color = texture2D(tex, uv);
    if (water.clear > 0.0 && blur_amount > 0.0)
        color = mix(color, texture2D(sharp_tex, uv), water.clear * 0.82);
    #if defined(NO_ALPHA)
    color.a = 1.0;
    #endif
    color.rgb = mix(color.rgb * (1.0 - min(water.shade, 0.72)),
        vec3(0.95, 0.98, 1.0) * color.a, min(water.shine, 0.72));
    color *= mask * alpha;
    #if defined(DEBUG_FLAGS)
    if (tint == 1.0) color = vec4(0.0, 0.2, 0.0, 0.2) + color * 0.8;
    #endif
    gl_FragColor = color;
#endif
}
#endif
// forge-effect-map-end
