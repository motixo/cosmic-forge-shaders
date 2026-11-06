// SPDX-License-Identifier: GPL-3.0-only
// Build: cc tests/benchmark_effects.c -O2 -lEGL -lGLESv2 -o /tmp/benchmark-effects
// Run: /tmp/benchmark-effects snow|ember before.frag after.frag [width height]
#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <GLES2/gl2.h>
#include <GLES2/gl2ext.h>
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static char *read_source(const char *path) {
    FILE *file = fopen(path, "rb");
    assert(file);
    fseek(file, 0, SEEK_END);
    long length = ftell(file);
    rewind(file);
    char *source = calloc((size_t)length + 1, 1);
    assert(source && fread(source, 1, (size_t)length, file) == (size_t)length);
    fclose(file);
    return source;
}

static GLuint compile(GLenum kind, const char *source) {
    GLuint shader = glCreateShader(kind);
    glShaderSource(shader, 1, &source, NULL);
    glCompileShader(shader);
    GLint ok;
    glGetShaderiv(shader, GL_COMPILE_STATUS, &ok);
    if (!ok) {
        char log[8192];
        glGetShaderInfoLog(shader, sizeof(log), NULL, log);
        fprintf(stderr, "%s\n", log);
        exit(1);
    }
    return shader;
}

static GLuint program(const char *path) {
    const char *vertex = "attribute vec2 position; uniform vec2 uv_direction; varying vec2 v_coords; void main() { v_coords = position * 0.5 * uv_direction + 0.5; gl_Position = vec4(position, 0.0, 1.0); }";
    char *fragment = read_source(path);
    GLuint vs = compile(GL_VERTEX_SHADER, vertex), fs = compile(GL_FRAGMENT_SHADER, fragment);
    free(fragment);
    GLuint result = glCreateProgram();
    glAttachShader(result, vs);
    glAttachShader(result, fs);
    glBindAttribLocation(result, 0, "position");
    glLinkProgram(result);
    GLint ok;
    glGetProgramiv(result, GL_LINK_STATUS, &ok);
    assert(ok);
    glDeleteShader(vs);
    glDeleteShader(fs);
    return result;
}

struct Scenario {
    const char *name;
    float values[5];
};
static const struct Scenario snow_scenarios[] = {
    {"empty", {0, 1, 75, 100, 7}},
    {"half", {90, 1, 75, 100, 7}},
    {"full", {180, 1, 75, 100, 7}},
    {"disabled", {90, 0, 75, 100, 7}},
    {"no-snow", {0, 0, 0, 100, 7}},
    {"bank-only", {90, 1, 0, 100, 7}},
    {"sparse-small", {12, 1, 10, 50, 0}},
    {"dense-small", {0, 1, 100, 50, 59}},
    {"dense-large", {0, 1, 100, 200, 149}},
    {"partial-large", {179, 1, 82, 200, 201}},
    {"live-settings", {10, 1, 82, 76, 28}},
};
static const struct Scenario ember_scenarios[] = {
    {"defaults", {85, 100, 50, 0, 7}},
    {"live-settings", {96, 31, 35, 0, 28}},
    {"small", {100, 25, 50, 0, 149}},
    {"large", {100, 200, 50, 0, 7}},
    {"theme-color", {100, 100, 50, 100, 59}},
    {"no-flames", {0, 31, 35, 0, 7}},
    {"faint", {10, 100, 50, 0, 0}},
    {"transparent-backing", {100, 100, 0, 50, 201}},
    {"opaque-backing", {85, 100, 100, 100, 7}},
};
static const char *snow_uniforms[] = {"window_age", "forge_snow_accumulation", "forge_snow_density", "forge_snow_size", "time"};
static const char *ember_uniforms[] = {"forge_ember_strength", "forge_ember_scale", "forge_ember_background", "forge_ember_color", "time"};
static int ember;
static void parameters(GLuint shader, int width, int height, const struct Scenario *s) {
    glUseProgram(shader);
    glUniform2f(glGetUniformLocation(shader, "uv_direction"), 1, 1);
    glUniform1i(glGetUniformLocation(shader, "tex"), 0);
    glUniform1i(glGetUniformLocation(shader, "sharp_tex"), 0);
    glUniform1f(glGetUniformLocation(shader, "alpha"), 1);
    glUniform1f(glGetUniformLocation(shader, "output_scale"), 1);
    glUniform2f(glGetUniformLocation(shader, "geo_size"), width, height);
    glUniform4f(glGetUniformLocation(shader, "corner_radius"), 12, 12, 12, 12);
    const GLfloat identity[] = {1,0,0,0,1,0,0,0,1};
    glUniformMatrix3fv(glGetUniformLocation(shader, "input_to_geo"), 1, GL_FALSE, identity);
    glUniform1f(glGetUniformLocation(shader, "forge_snow_fill_time"), 180);
    glUniform3f(glGetUniformLocation(shader, "theme_tint"), .16f, .19f, .23f);
    glUniform3f(glGetUniformLocation(shader, "theme_accent"), .3f, .6f, .9f);
    const char **uniforms = ember ? ember_uniforms : snow_uniforms;
    for (int i = 0; i < 5; i++) glUniform1f(glGetUniformLocation(shader, uniforms[i]), s->values[i]);
}
int main(int argc, char **argv) {
    assert(argc == 4 || argc == 6);
    assert(strcmp(argv[1], "snow") == 0 || strcmp(argv[1], "ember") == 0);
    ember = strcmp(argv[1], "ember") == 0;
    int width = argc == 6 ? atoi(argv[4]) : 1920;
    int height = argc == 6 ? atoi(argv[5]) : 1080;
    assert(width >= 64 && height >= 64 && width <= 4096 && height <= 4096);
    const struct Scenario *scenarios = ember ? ember_scenarios : snow_scenarios;
    size_t scenario_count = ember ? sizeof(ember_scenarios) / sizeof(*ember_scenarios)
                                  : sizeof(snow_scenarios) / sizeof(*snow_scenarios);
    PFNEGLQUERYDEVICESEXTPROC devices_fn = (void *)eglGetProcAddress("eglQueryDevicesEXT");
    PFNEGLGETPLATFORMDISPLAYEXTPROC display_fn = (void *)eglGetProcAddress("eglGetPlatformDisplayEXT");
    EGLDeviceEXT devices[8];
    EGLint device_count = 0;
    assert(devices_fn && display_fn && devices_fn(8, devices, &device_count));
    EGLDisplay display = EGL_NO_DISPLAY;
    EGLContext context = EGL_NO_CONTEXT;
    EGLSurface surface = EGL_NO_SURFACE;
    for (int i = 0; i < device_count; i++) {
        EGLDisplay candidate = display_fn(EGL_PLATFORM_DEVICE_EXT, devices[i], NULL);
        EGLint major, minor, count;
        if (!eglInitialize(candidate, &major, &minor)) continue;
        eglBindAPI(EGL_OPENGL_ES_API);
        const EGLint config_attrs[] = {EGL_SURFACE_TYPE,EGL_PBUFFER_BIT,EGL_RENDERABLE_TYPE,EGL_OPENGL_ES2_BIT,EGL_RED_SIZE,8,EGL_GREEN_SIZE,8,EGL_BLUE_SIZE,8,EGL_ALPHA_SIZE,8,EGL_NONE};
        EGLConfig config;
        if (!eglChooseConfig(candidate, config_attrs, &config, 1, &count) || !count) continue;
        const EGLint surface_attrs[] = {EGL_WIDTH,width,EGL_HEIGHT,height,EGL_NONE};
        const EGLint context_attrs[] = {EGL_CONTEXT_CLIENT_VERSION,2,EGL_NONE};
        context = eglCreateContext(candidate, config, EGL_NO_CONTEXT, context_attrs);
        surface = eglCreatePbufferSurface(candidate, config, surface_attrs);
        if (!eglMakeCurrent(candidate, surface, surface, context)) continue;
        display = candidate;
        break;
    }
    assert(display != EGL_NO_DISPLAY);
    printf("Renderer: %s\n", glGetString(GL_RENDERER));
    PFNGLGENQUERIESEXTPROC gen_queries = (void *)eglGetProcAddress("glGenQueriesEXT");
    PFNGLBEGINQUERYEXTPROC begin_query = (void *)eglGetProcAddress("glBeginQueryEXT");
    PFNGLENDQUERYEXTPROC end_query = (void *)eglGetProcAddress("glEndQueryEXT");
    PFNGLGETQUERYOBJECTUI64VEXTPROC query_result = (void *)eglGetProcAddress("glGetQueryObjectui64vEXT");
    assert(gen_queries && begin_query && end_query && query_result);
    GLuint shaders[] = {program(argv[2]), program(argv[3])};
    const GLfloat vertices[] = {-1,-1, 1,-1, -1,1, 1,1};
    glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 0, vertices);
    glEnableVertexAttribArray(0);
    GLuint texture;
    glGenTextures(1, &texture);
    glBindTexture(GL_TEXTURE_2D, texture);
    const unsigned char pixel[] = {40,60,80,255};
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 1, 1, 0, GL_RGBA, GL_UNSIGNED_BYTE, pixel);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    GLuint query;
    gen_queries(1, &query);
    glViewport(0, 0, width, height);
    size_t bytes = width * height * 4;
    unsigned char *reference = malloc(bytes), *candidate = malloc(bytes);
    assert(reference && candidate);
    for (size_t scenario = 0; scenario < scenario_count; scenario++) {
        const struct Scenario *s = &scenarios[scenario];
        for (int version = 0; version < 2; version++) {
            parameters(shaders[version], width, height, s);
            glClearColor(0, 0, 0, 0); glClear(GL_COLOR_BUFFER_BIT);
            glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
            glReadPixels(0, 0, width, height, GL_RGBA, GL_UNSIGNED_BYTE,
                         version ? candidate : reference);
        }
        double difference = 0;
        unsigned maximum = 0;
        size_t changed = 0;
        for (size_t i = 0; i < bytes; i++) {
            unsigned delta = abs((int)reference[i] - candidate[i]);
            difference += delta;
            if (delta) changed++;
            if (delta > maximum) maximum = delta;
        }
        difference /= bytes;
        printf("Image %s mean=%.8f max=%u changed=%zu\n", s->name, difference, maximum, changed);
        for (size_t i = 3; i < bytes; i += 4) assert(reference[i] == candidate[i]);
        if (ember) {
            // Fine noise changes, while clipping, opacity and zero strength stay exact.
            assert(difference < .75 && maximum <= 32);
            if (s->values[0] == 0) assert(maximum == 0);
        } else if (strcmp(s->name, "no-snow") == 0) {
            for (int y = 16; y < height - 16; y++) for (int x = 16; x < width - 16; x++) {
                size_t pixel = (y * width + x) * 4;
                assert(candidate[pixel] == 40 && candidate[pixel + 1] == 60
                       && candidate[pixel + 2] == 80 && candidate[pixel + 3] == 255);
            }
        } else if (s->values[2] == 0) {
            // The old step() admitted rare hash-zero flakes even at density zero.
            assert(difference < .001);
        } else {
            assert(difference < .01 && maximum <= 2);
        }
        for (int version = 0; version < 2; version++) {
            parameters(shaders[version], width, height, s);
            for (int draw = 0; draw < 50; draw++) glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
        }
        glFinish();
        for (int pass = 0; pass < 6; pass++) {
            int version = pass % 2;
            parameters(shaders[version], width, height, s);
            begin_query(GL_TIME_ELAPSED_EXT, query);
            for (int draw = 0; draw < 60; draw++) glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
            end_query(GL_TIME_ELAPSED_EXT);
            glFinish();
            GLuint64EXT elapsed;
            query_result(query, GL_QUERY_RESULT_EXT, &elapsed);
            printf("GPU %s %s %.6f ms\n", s->name, version ? "optimized" : "before", (double)elapsed / 60000000.0);
            fflush(stdout);
        }
    }
    free(reference); free(candidate);
    GLint disjoint = 0;
    glGetIntegerv(GL_GPU_DISJOINT_EXT, &disjoint);
    assert(!disjoint && glGetError() == GL_NO_ERROR);
    eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
    eglDestroySurface(display, surface);
    eglDestroyContext(display, context);
    eglTerminate(display);
    return 0;
}
