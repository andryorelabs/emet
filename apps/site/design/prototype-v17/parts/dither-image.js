/**
 * Dither Image (mischief / tinkererslabs) - vanilla port, with a progress extension.
 * Source: https://ui.tinkererslabs.com/r/dither-image.json (registry/default/dither-image/dither-image.tsx)
 *         + https://ui.tinkererslabs.com/r/render-surface.json (createQuadProgram, QUAD_VERTEX)
 * License: not stated in either item JSON.
 * (magicui pixel-image was rejected: it is a clip-path grid reveal, it does no pixelation.)
 *
 * Original: <DitherImage src alt cell=4 levels=2 base tint contrast=1.15>. A WebGL
 * fragment shader samples the photo at a `cell`-pixel grid (cover-fit), takes luma,
 * applies contrast, adds a 4x4 Bayer threshold, quantises to `levels` tones and mixes
 * tint (ink) -> base (paper). It has NO progress concept and only two colours.
 *
 * Port API: window.initDitherImage(canvas, imgUrl, {reduce, palette, getProgress,
 *   cell, levels, contrast}) -> { destroy(), redraw() }
 *   palette      [dark, mid, light] CSS colours (default ["#111", "#888", "#eee"]).
 *                Original had two (tint=dark, base=light); with levels=2 only
 *                palette[0] and palette[2] are used, exactly like the original.
 *   getProgress  () => 0..1 (default 0). ADDED, not in the original:
 *                  effective cell = max(1, cell * (1 - p))  (coarse -> fine)
 *                  output = mix(ditheredPalette, sampledTexel, smoothstep(0.15, 1, p))
 *                so 0 = coarse dither in the palette, 1 = full colour image.
 *   cell 4 (CSS px), levels 3 (original 2; 3 so the mid palette colour is used), contrast 1.15.
 *
 * Kept verbatim: dither fragment shader core (cover-fit uv, bayer2/bayer4, luma, contrast,
 * threshold scale 1.0667, floor(luma*steps+threshold)/steps), quad vertex shader, texture
 * parameters. Rewritten: React/RenderSurface removed (own sizing, IntersectionObserver,
 * document.hidden pause, dpr cap 2); theme-token colour lookup replaced by `palette`;
 * 2-colour mix generalised to a 3-colour ramp. The <img> fallback underneath is not
 * created: on WebGL or image failure the canvas stays empty and a no-op is returned.
 * `reduce`: one frame at the progress current when the image arrives; call redraw() to
 * repaint after changing progress. Otherwise the loop polls getProgress() each frame and
 * only draws when it changed.
 */
(function () {
  "use strict";

  var VERTEX = [
    "attribute vec2 aPosition;",
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = aPosition * 0.5 + 0.5;",
    "  gl_Position = vec4(aPosition, 0.0, 1.0);",
    "}"
  ].join("\n");

  var FRAGMENT = [
    "precision highp float;",
    "varying vec2 vUv;",
    "uniform sampler2D uImage;",
    "uniform vec2 uResolution;",
    "uniform float uCell;",
    "uniform float uLevels;",
    "uniform float uContrast;",
    "uniform float uBoxAspect;",
    "uniform float uImageAspect;",
    "uniform float uProgress;",
    "uniform vec3 uDark;",
    "uniform vec3 uMid;",
    "uniform vec3 uLight;",
    "",
    "float bayer2(vec2 a) {",
    "  a = floor(a);",
    "  return fract(dot(a, vec2(0.5, a.y * 0.75)));",
    "}",
    "",
    "float bayer4(vec2 a) {",
    "  return bayer2(0.5 * a) * 0.25 + bayer2(a);",
    "}",
    "",
    "void main() {",
    "  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);",
    "",
    "  if (uBoxAspect > uImageAspect) {",
    "    uv.y = (uv.y - 0.5) * (uImageAspect / uBoxAspect) + 0.5;",
    "  } else {",
    "    uv.x = (uv.x - 0.5) * (uBoxAspect / uImageAspect) + 0.5;",
    "  }",
    "",
    "  vec2 sampleUv = uv;",
    "  sampleUv = floor(sampleUv * uResolution / uCell) * uCell / uResolution;",
    "",
    "  vec3 texel = texture2D(uImage, sampleUv).rgb;",
    "  float luma = dot(texel, vec3(0.2126, 0.7152, 0.0722));",
    "  luma = clamp((luma - 0.5) * uContrast + 0.5, 0.0, 1.0);",
    "",
    "  float threshold = bayer4(vUv * uResolution / uCell) * 1.0667;",
    "  float steps = max(uLevels - 1.0, 1.0);",
    "  float value = clamp(floor(luma * steps + threshold) / steps, 0.0, 1.0);",
    "",
    "  vec3 dithered = value < 0.5",
    "    ? mix(uDark, uMid, value * 2.0)",
    "    : mix(uMid, uLight, (value - 0.5) * 2.0);",
    "  if (uLevels < 2.5) dithered = mix(uDark, uLight, value);",
    "",
    "  gl_FragColor = vec4(mix(dithered, texel, smoothstep(0.15, 1.0, uProgress)), 1.0);",
    "}"
  ].join("\n");

  function noop() {
    return { destroy: function () {}, redraw: function () {} };
  }

  function readRgb(css, fallback) {
    try {
      var c = document.createElement("canvas");
      c.width = c.height = 1;
      var ctx = c.getContext("2d");
      ctx.fillStyle = "#000";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      var d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0] / 255, d[1] / 255, d[2] / 255];
    } catch (e) {
      return fallback;
    }
  }

  function compile(gl, type, source) {
    var shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
    return shader;
  }

  function initDitherImage(canvas, imgUrl, options) {
    options = options || {};
    if (!canvas || !imgUrl) return noop();
    var gl = null;
    try {
      gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: true });
    } catch (e) {
      gl = null;
    }
    if (!gl) return noop();

    var reduce = !!options.reduce;
    var getProgress = typeof options.getProgress === "function" ? options.getProgress : function () { return 0; };
    var cell = options.cell != null ? options.cell : 4;
    var levels = Math.max(options.levels != null ? options.levels : 3, 2);
    var contrast = options.contrast != null ? options.contrast : 1.15;
    var palette = options.palette && options.palette.length >= 2 ? options.palette : ["#111111", "#888888", "#eeeeee"];
    var dark = readRgb(palette[0], [0.07, 0.07, 0.07]);
    var light = readRgb(palette[palette.length - 1], [0.93, 0.93, 0.93]);
    var mid = palette.length >= 3 ? readRgb(palette[1], [0.5, 0.5, 0.5]) : [(dark[0] + light[0]) / 2, (dark[1] + light[1]) / 2, (dark[2] + light[2]) / 2];

    var vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    var fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    var program = gl.createProgram();
    if (!vertex || !fragment || !program) return noop();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return noop();
    gl.useProgram(program);

    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    var locations = {};
    function loc(name) {
      if (!(name in locations)) locations[name] = gl.getUniformLocation(program, name);
      return locations[name];
    }

    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

    var aspect = 1;
    var loaded = false;
    var destroyed = false;
    var onScreen = false;
    var raf = 0;
    var lastDrawn = -1;
    var dirty = true;

    var image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = function () {
      if (destroyed) return;
      aspect = image.naturalWidth / Math.max(image.naturalHeight, 1);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      loaded = true;
      dirty = true;
      if (reduce) draw(true);
      else schedule();
    };
    image.onerror = function () {};
    image.src = imgUrl;

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        dirty = true;
      }
      return dpr;
    }

    function draw(force) {
      if (destroyed || !loaded) return;
      var progress = Math.min(1, Math.max(0, Number(getProgress()) || 0));
      var dpr = resize();
      if (!force && !dirty && Math.abs(progress - lastDrawn) < 0.002) return;
      lastDrawn = progress;
      dirty = false;
      var w = canvas.width, h = canvas.height;
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(loc("uImage"), 0);
      gl.uniform2f(loc("uResolution"), w, h);
      gl.uniform1f(loc("uCell"), Math.max(1, cell * (1 - progress)) * dpr);
      gl.uniform1f(loc("uLevels"), levels);
      gl.uniform1f(loc("uContrast"), contrast);
      gl.uniform1f(loc("uBoxAspect"), w / Math.max(h, 1));
      gl.uniform1f(loc("uImageAspect"), aspect);
      gl.uniform1f(loc("uProgress"), progress);
      gl.uniform3fv(loc("uDark"), dark);
      gl.uniform3fv(loc("uMid"), mid);
      gl.uniform3fv(loc("uLight"), light);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function frame() {
      raf = 0;
      if (destroyed || reduce || !onScreen || document.hidden) return;
      draw(false);
      raf = requestAnimationFrame(frame);
    }

    function schedule() {
      if (!raf && !destroyed && !reduce && onScreen && !document.hidden) raf = requestAnimationFrame(frame);
    }

    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else {
        dirty = true;
        schedule();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    var io = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(function (entries) {
        onScreen = entries[entries.length - 1].isIntersecting;
        if (onScreen) {
          dirty = true;
          schedule();
        } else {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      });
      io.observe(canvas);
    } else {
      onScreen = true;
    }

    var ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(function () {
        dirty = true;
        if (reduce) draw(true);
        else schedule();
      });
      ro.observe(canvas);
    }

    return {
      redraw: function () {
        dirty = true;
        draw(true);
      },
      destroy: function () {
        destroyed = true;
        cancelAnimationFrame(raf);
        raf = 0;
        document.removeEventListener("visibilitychange", onVisibility);
        if (io) io.disconnect();
        if (ro) ro.disconnect();
        gl.deleteTexture(texture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
      }
    };
  }

  window.initDitherImage = initDitherImage;
})();
