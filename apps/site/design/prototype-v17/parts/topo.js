/**
 * Topo Background (kokonutui) - vanilla port.
 * Source: https://kokonutui.com/r/topo-background.json
 *         (/components/kokonutui/topo-background.tsx, @dorianbaffier, v1.1.0)
 * License: MIT (stated in the file's header comment; the JSON has no license field).
 *
 * Original API (React): <TopoBackground interval speed interactive seed labels>.
 * Defaults kept: interval 0.07, speed 1, interactive true, seed 26, labels true.
 * It draws marching-squares contour lines over seeded 3D Perlin noise on a 2D
 * canvas, a cursor "hill", click ripples, and survey-style elevation labels.
 *
 * Port API: window.initTopo(canvas, {reduce, color, interval, speed,
 *   interactive, seed, labels}) -> { destroy() }.
 *
 * Changes: React/TS/cn removed; all constants and the noise, marching squares,
 * label and hill code are kept as in the original. Added: optional `color`
 * (the original always reads getComputedStyle(canvas).color; without `color`
 * the port still does, and still polls it every 500ms while visible).
 * Pointer events and "avoid" label areas use canvas.parentElement as the root
 * (original: the component root). The top/bottom fade mask is applied to the
 * canvas directly. `reduce` replaces matchMedia: one static frame, no listeners.
 * Also pauses on document.hidden (as the original did). Never throws without
 * a 2D context (returns a no-op).
 */
(function () {
  "use strict";

  var CELL = 12;
  var TERRAIN_SCALE = 360;
  var INDEX_EVERY = 5;
  var HILL_HEIGHT = 0.5;
  var HILL_SPREAD = 120;
  var HILL_FOLLOW = 9;
  var HILL_RISE = 5;
  var RIPPLE_MS = 1800;
  var RIPPLE_SPEED = 0.24;
  var RIPPLE_WIDTH = 42;
  var RIPPLE_HEIGHT = 0.2;
  var RIPPLE_WAVELENGTH = 96;
  var IDLE_FRAME_MS = 33;
  var LABEL_SPACING = 210;
  var LABEL_BASE = 500;
  var LABEL_STEP = 20;
  var LABEL_MARGIN = 0.16;
  var MAX_LABEL_ANGLE = Math.PI / 3;
  var LABEL_FONT = "500 10px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";

  function noop() {
    return { destroy: function () {} };
  }

  /** Seeded 3D gradient noise (Ken Perlin's improved noise), about -1 to 1. */
  function createNoise(seed) {
    var p = [];
    var i;
    for (i = 0; i < 256; i++) p.push(i);
    var state = (seed >>> 0) || 1;
    function random() {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    }
    for (i = 255; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    var perm = new Uint8Array(512);
    for (i = 0; i < 512; i++) perm[i] = p[i & 255];
    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function grad(hash, x, y, z) {
      var h = hash & 15;
      var u = h < 8 ? x : y;
      var v = z;
      if (h < 4) v = y;
      else if (h === 12 || h === 14) v = x;
      return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
    return function (x, y, z) {
      var X = Math.floor(x) & 255;
      var Y = Math.floor(y) & 255;
      var Z = Math.floor(z) & 255;
      var fx = x - Math.floor(x);
      var fy = y - Math.floor(y);
      var fz = z - Math.floor(z);
      var u = fade(fx);
      var v = fade(fy);
      var w = fade(fz);
      var A = perm[X] + Y;
      var AA = perm[A] + Z;
      var AB = perm[A + 1] + Z;
      var B = perm[X + 1] + Y;
      var BA = perm[B] + Z;
      var BB = perm[B + 1] + Z;
      return lerp(
        lerp(
          lerp(grad(perm[AA], fx, fy, fz), grad(perm[BA], fx - 1, fy, fz), u),
          lerp(grad(perm[AB], fx, fy - 1, fz), grad(perm[BB], fx - 1, fy - 1, fz), u),
          v
        ),
        lerp(
          lerp(grad(perm[AA + 1], fx, fy, fz - 1), grad(perm[BA + 1], fx - 1, fy, fz - 1), u),
          lerp(grad(perm[AB + 1], fx, fy - 1, fz - 1), grad(perm[BB + 1], fx - 1, fy - 1, fz - 1), u),
          v
        ),
        w
      );
    };
  }

  /** The segment a contour draws through one grid cell (bits: TL 8, TR 4, BR 2, BL 1). */
  function cellSegments(path, index, box, cross) {
    var x0 = box.x0, y0 = box.y0, x1 = box.x1, y1 = box.y1;
    var top = cross.top, right = cross.right, bottom = cross.bottom, left = cross.left;
    function line(ax, ay, bx, by) {
      path.moveTo(ax, ay);
      path.lineTo(bx, by);
    }
    switch (index) {
      case 1: case 14: line(x0, left, bottom, y1); break;
      case 2: case 13: line(bottom, y1, x1, right); break;
      case 3: case 12: line(x0, left, x1, right); break;
      case 4: case 11: line(top, y0, x1, right); break;
      case 6: case 9: line(top, y0, bottom, y1); break;
      case 7: case 8: line(x0, left, top, y0); break;
      case 5:
        line(x0, left, top, y0);
        line(bottom, y1, x1, right);
        break;
      case 10:
        line(top, y0, x1, right);
        line(x0, left, bottom, y1);
        break;
      default: break;
    }
  }

  function offerLabel(slots, label) {
    var x = label.x, y = label.y;
    if (y < slots.height * LABEL_MARGIN || y > slots.height * (1 - LABEL_MARGIN) ||
        x < 24 || x > slots.width - 24) return;
    for (var k = 0; k < slots.avoid.length; k++) {
      var r = slots.avoid[k];
      if (x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) return;
    }
    var row = Math.floor(y / LABEL_SPACING);
    var shifted = x + slots.drift + (row % 2) * (LABEL_SPACING / 2);
    var col = Math.floor(shifted / LABEL_SPACING);
    var cx = (col + 0.5) * LABEL_SPACING;
    var cy = (row + 0.5) * LABEL_SPACING;
    var score = Math.pow(shifted - cx, 2) + Math.pow(y - cy, 2);
    if (score > Math.pow(LABEL_SPACING * 0.32, 2)) return;
    var key = row * 100000 + col;
    var current = slots.best.get(key);
    if (!current || score < current.score) {
      slots.best.set(key, { x: x, y: y, angle: label.angle, level: label.level, score: score });
    }
  }

  function offerCellLabel(slots, corners, x0, y0, level, t) {
    var a = corners[0], b = corners[1], c = corners[2], d = corners[3];
    var gx = b - a + c - d;
    var gy = d - a + c - b;
    var px = gx / (2 * CELL);
    var py = gy / (2 * CELL);
    var g2 = px * px + py * py;
    var lift = g2 > 0 ? (t - (a + b + c + d) / 4) / g2 : 0;
    var half = CELL / 2;
    var ox = Math.max(-half, Math.min(half, lift * px));
    var oy = Math.max(-half, Math.min(half, lift * py));
    var angle = Math.atan2(gx, -gy);
    if (angle > Math.PI / 2) angle -= Math.PI;
    else if (angle < -Math.PI / 2) angle += Math.PI;
    if (Math.abs(angle) > MAX_LABEL_ANGLE) return;
    offerLabel(slots, { x: x0 + half + ox, y: y0 + half + oy, angle: angle, level: level });
  }

  function traceCell(field, cols, i, j, interval, paths) {
    var a = field[j * cols + i];
    var b = field[j * cols + i + 1];
    var c = field[(j + 1) * cols + i + 1];
    var d = field[(j + 1) * cols + i];
    var x0 = i * CELL;
    var y0 = j * CELL;
    var first = Math.ceil(Math.min(a, b, c, d) / interval);
    var last = Math.floor(Math.max(a, b, c, d) / interval);
    if (first > last) return;
    var box = { x0: x0, y0: y0, x1: x0 + CELL, y1: y0 + CELL };
    for (var level = first; level <= last; level++) {
      var t = level * interval;
      var index = (a > t ? 8 : 0) | (b > t ? 4 : 0) | (c > t ? 2 : 0) | (d > t ? 1 : 0);
      if (index === 0 || index === 15) continue;
      var isIndex = level % INDEX_EVERY === 0;
      cellSegments(isIndex ? paths.major : paths.minor, index, box, {
        top: x0 + CELL * ((t - a) / (b - a)),
        right: y0 + CELL * ((t - b) / (c - b)),
        bottom: x0 + CELL * ((t - d) / (c - d)),
        left: y0 + CELL * ((t - a) / (d - a))
      });
      if (isIndex && paths.slots && index !== 5 && index !== 10) {
        offerCellLabel(paths.slots, [a, b, c, d], x0, y0, level, t);
      }
    }
  }

  function traceContours(field, cols, rows, interval, minor, major, slots) {
    var paths = { minor: minor, major: major, slots: slots };
    for (var j = 0; j < rows - 1; j++) {
      for (var i = 0; i < cols - 1; i++) traceCell(field, cols, i, j, interval, paths);
    }
  }

  function stepHill(hill, dt) {
    var follow = 1 - Math.exp(-HILL_FOLLOW * dt);
    hill.x += (hill.targetX - hill.x) * follow;
    hill.y += (hill.targetY - hill.y) * follow;
    var goal = hill.on ? 1 : 0;
    hill.amount += (goal - hill.amount) * (1 - Math.exp(-HILL_RISE * dt));
    return Math.abs(hill.targetX - hill.x) > 0.5 ||
      Math.abs(hill.targetY - hill.y) > 0.5 ||
      Math.abs(goal - hill.amount) > 0.002;
  }

  function initTopo(canvas, options) {
    options = options || {};
    if (!canvas) return noop();
    var ctx = null;
    try {
      ctx = canvas.getContext("2d");
    } catch (e) {
      ctx = null;
    }
    if (!ctx || typeof Path2D === "undefined") return noop();

    var root = canvas.parentElement || canvas;
    var reduceMotion = !!options.reduce;
    var interval = options.interval != null ? options.interval : 0.07;
    var speed = options.speed != null ? options.speed : 1;
    var interactive = options.interactive != null ? options.interactive : true;
    var seed = options.seed != null ? options.seed : 26;
    var labels = options.labels != null ? options.labels : true;
    var fixedColor = options.color || "";
    var noise = createNoise(seed);

    canvas.style.maskImage = "linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent)";
    canvas.style.webkitMaskImage = canvas.style.maskImage;

    var width = 0, height = 0, cols = 0, rows = 0;
    var field = new Float32Array(0);
    var color = "";
    var hill = { x: 0, y: 0, targetX: 0, targetY: 0, amount: 0, on: false };
    var ripples = [];
    var time = 0, last = 0, lastPaint = 0, raf = 0;
    var visible = true;
    var destroyed = false;
    var slots = { drift: 0, width: 0, height: 0, best: new Map(), avoid: [] };

    function readColor() {
      return fixedColor || getComputedStyle(canvas).color;
    }

    function measureContent() {
      var origin = canvas.getBoundingClientRect();
      slots.avoid = [];
      for (var k = 0; k < root.children.length; k++) {
        var child = root.children[k];
        if (child === canvas || child.contains(canvas)) continue;
        var r = child.getBoundingClientRect();
        slots.avoid.push({
          x0: r.left - origin.left - 16,
          y0: r.top - origin.top - 12,
          x1: r.right - origin.left + 16,
          y1: r.bottom - origin.top + 12
        });
      }
    }

    function resize() {
      var rect = canvas.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(width / CELL) + 1;
      rows = Math.ceil(height / CELL) + 1;
      field = new Float32Array(cols * rows);
      color = readColor();
      measureContent();
    }

    function sample(now) {
      var z = time * 0.05;
      var drift = time * 6;
      var hillOn = hill.amount > 0.001;
      var spread = 2 * HILL_SPREAD * HILL_SPREAD;
      var ringWidth = 2 * RIPPLE_WIDTH * RIPPLE_WIDTH;
      for (var j = 0; j < rows; j++) {
        var y = j * CELL;
        for (var i = 0; i < cols; i++) {
          var x = i * CELL;
          var nx = (x + drift) / TERRAIN_SCALE;
          var ny = y / TERRAIN_SCALE;
          var v = noise(nx, ny, z) * 0.78 + noise(nx * 2.3 + 17.1, ny * 2.3 + 4.7, z * 1.4) * 0.22;
          if (hillOn) {
            var dx = x - hill.x;
            var dy = y - hill.y;
            v += HILL_HEIGHT * hill.amount * Math.exp(-(dx * dx + dy * dy) / spread);
          }
          for (var n = 0; n < ripples.length; n++) {
            var ripple = ripples[n];
            var age = now - ripple.start;
            var reach = age * RIPPLE_SPEED;
            var d = Math.hypot(x - ripple.x, y - ripple.y) - reach;
            var fadeOut = 1 - age / RIPPLE_MS;
            v += RIPPLE_HEIGHT * fadeOut * fadeOut * Math.exp(-(d * d) / ringWidth) *
              Math.cos((d / RIPPLE_WAVELENGTH) * Math.PI * 2);
          }
          field[j * cols + i] = v;
        }
      }
    }

    function drawLabels() {
      ctx.font = LABEL_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      slots.best.forEach(function (label) {
        var text = "" + (LABEL_BASE + label.level * LABEL_STEP);
        var w = ctx.measureText(text).width + 8;
        ctx.save();
        ctx.translate(Math.round(label.x), Math.round(label.y));
        ctx.rotate(label.angle);
        ctx.globalCompositeOperation = "destination-out";
        ctx.globalAlpha = 1;
        ctx.fillRect(-w / 2, -6, w, 12);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 0.5;
        ctx.fillText(text, 0, 0.5);
        ctx.restore();
      });
    }

    function paint(now) {
      sample(now);
      var minor = new Path2D();
      var major = new Path2D();
      slots.best.clear();
      slots.drift = time * 6;
      slots.width = width;
      slots.height = height;
      traceContours(field, cols, rows, interval, minor, major, labels ? slots : null);
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = 0.75;
      ctx.stroke(minor);
      ctx.globalAlpha = 0.34;
      ctx.lineWidth = 1.1;
      ctx.stroke(major);
      if (labels) drawLabels();
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      raf = 0;
      if (!visible || destroyed) return;
      var dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      var hillMoving = stepHill(hill, dt);
      while (ripples.length > 0 && now - ripples[0].start > RIPPLE_MS) ripples.shift();
      var settling = hillMoving || ripples.length > 0;
      time += dt * speed;
      if (settling || now - lastPaint >= IDLE_FRAME_MS) {
        paint(now);
        lastPaint = now;
      }
      if (speed > 0 || settling) raf = requestAnimationFrame(frame);
    }

    function start() {
      if (!raf && visible && !reduceMotion && !destroyed) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    }

    var colorTimer = 0;
    function checkColor() {
      var next = readColor();
      if (next !== color) {
        color = next;
        if (reduceMotion || !raf) paint(performance.now());
      }
    }
    function watchColor() {
      if (reduceMotion || fixedColor) return;
      if (visible && !colorTimer) {
        checkColor();
        colorTimer = window.setInterval(checkColor, 500);
      } else if (!visible && colorTimer) {
        window.clearInterval(colorTimer);
        colorTimer = 0;
      }
    }

    resize();
    paint(performance.now());
    start();

    var ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(function () {
        resize();
        paint(performance.now());
      });
      ro.observe(canvas);
    }

    var onScreen = true;
    function updateVisible() {
      visible = onScreen && !document.hidden;
      watchColor();
      if (visible) start();
    }
    var io = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(function (entries) {
        onScreen = entries[entries.length - 1].isIntersecting;
        updateVisible();
      });
      io.observe(root);
    }
    document.addEventListener("visibilitychange", updateVisible);
    watchColor();

    function local(event) {
      var rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    function onMove(event) {
      if (event.pointerType !== "mouse") return;
      var point = local(event);
      if (!hill.on) {
        hill.x = point.x;
        hill.y = point.y;
      }
      hill.targetX = point.x;
      hill.targetY = point.y;
      hill.on = true;
      start();
    }
    function onLeave() {
      hill.on = false;
      start();
    }
    function onDown(event) {
      if (event.target && event.target.closest && event.target.closest("a, button, input, textarea")) return;
      var point = local(event);
      ripples.push({ x: point.x, y: point.y, start: performance.now() });
      if (ripples.length > 4) ripples.shift();
      start();
    }
    var listening = interactive && !reduceMotion;
    if (listening) {
      root.addEventListener("pointermove", onMove);
      root.addEventListener("pointerleave", onLeave);
      root.addEventListener("pointerdown", onDown);
    }

    return {
      destroy: function () {
        destroyed = true;
        cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect();
        if (io) io.disconnect();
        document.removeEventListener("visibilitychange", updateVisible);
        window.clearInterval(colorTimer);
        if (listening) {
          root.removeEventListener("pointermove", onMove);
          root.removeEventListener("pointerleave", onLeave);
          root.removeEventListener("pointerdown", onDown);
        }
      }
    };
  }

  window.initTopo = initTopo;
})();
