/**
 * Terminal (magicui) - vanilla port of the typing sequence.
 * Source: https://magicui.design/r/terminal (registry/magicui/terminal.tsx)
 * License: not stated in the item JSON (no license field).
 * Original deps removed: React, motion/react (useInView, motion.div), cn/tailwind.
 *
 * Original API (React): <Terminal sequence startOnView> containing <AnimatedSpan>
 * (fades in: opacity 0->1, y -5 -> 0, 0.3s) and <TypingAnimation duration=60 ms/char>.
 * In sequence mode (default) items run strictly one after another: the next starts
 * when the previous finishes, and per-item `delay` is ignored. The sequence starts
 * once the terminal is 30% in view (useInView amount 0.3, once). The window chrome
 * (three dots, border) and the <pre><code> wrapper are styling and are NOT ported;
 * style `el` yourself.
 *
 * Port API: window.typeLines(el, lines, {reduce, speed, onDone, startOnView})
 *   -> { destroy(), skip() }
 *   lines  array of: "text"  (typed, like TypingAnimation)
 *                    {text, type:"typing"|"span", className}  ("span" = fade-in AnimatedSpan)
 *   speed  ms per character, default 60 (original `duration`)
 *   startOnView default true (IntersectionObserver, threshold 0.3, once)
 *   Lines are appended to `el` as <div> (span) or <span> (typing) children; `el` gets
 *   display:grid and row-gap .25rem (the original's `grid gap-y-1`) if unset. Text is
 *   inserted with textContent only.
 *
 * Changes: motion's tween replaced by an eased 300ms opacity/translate driven from
 * requestAnimationFrame (easeOut approximated as 1-(1-p)^2); time only advances while
 * `el` is on screen and document is visible (pauses otherwise).
 * `reduce`: all lines rendered fully at once, no timers, onDone called.
 */
(function () {
  "use strict";

  var FADE_MS = 300;

  function typeLines(el, lines, options) {
    options = options || {};
    var noop = { destroy: function () {}, skip: function () {} };
    if (!el || !lines || !lines.length) {
      if (options.onDone) options.onDone();
      return noop;
    }
    var reduce = !!options.reduce;
    var speed = options.speed != null && options.speed > 0 ? options.speed : 60;
    var startOnView = options.startOnView !== false;

    var items = lines.map(function (line) {
      var obj = typeof line === "string" ? { text: line } : line;
      return {
        text: String(obj.text == null ? "" : obj.text),
        type: obj.type === "span" ? "span" : "typing",
        className: obj.className || ""
      };
    });

    if (!el.style.display) el.style.display = "grid";
    if (!el.style.rowGap) el.style.rowGap = "0.25rem";

    function createNode(item) {
      var node = document.createElement(item.type === "span" ? "div" : "span");
      if (item.className) node.className = item.className;
      return node;
    }

    var nodes = [];
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      if (options.onDone) options.onDone();
    }

    if (reduce) {
      for (var r = 0; r < items.length; r++) {
        var rn = createNode(items[r]);
        rn.textContent = items[r].text;
        el.appendChild(rn);
        nodes.push(rn);
      }
      finish();
      return { destroy: function () {}, skip: function () {} };
    }

    var index = 0;
    var elapsed = 0;
    var started = !startOnView;
    var onScreen = !startOnView;
    var destroyed = false;
    var raf = 0;
    var last = 0;
    var current = null;

    function begin() {
      if (index >= items.length) {
        finish();
        return;
      }
      var item = items[index];
      var node = createNode(item);
      if (item.type === "span") {
        node.textContent = item.text;
        node.style.opacity = "0";
        node.style.transform = "translateY(-5px)";
      }
      el.appendChild(node);
      nodes.push(node);
      current = { item: item, node: node };
      elapsed = 0;
    }

    function advance() {
      index++;
      current = null;
      begin();
    }

    function tick(now) {
      raf = 0;
      if (destroyed || done) return;
      if (!onScreen || document.hidden) {
        last = 0;
        return;
      }
      var dt = last ? Math.min(now - last, 100) : 0;
      last = now;
      elapsed += dt;
      if (current) {
        if (current.item.type === "span") {
          var p = Math.min(1, elapsed / FADE_MS);
          var e = 1 - (1 - p) * (1 - p);
          current.node.style.opacity = String(e);
          current.node.style.transform = "translateY(" + (-5 * (1 - e)).toFixed(2) + "px)";
          if (p >= 1) advance();
        } else {
          var chars = Math.min(current.item.text.length, Math.floor(elapsed / speed));
          var shown = current.item.text.substring(0, chars);
          if (current.node.textContent !== shown) current.node.textContent = shown;
          if (chars >= current.item.text.length) advance();
        }
      }
      if (!done) schedule();
    }

    function schedule() {
      if (!raf && !destroyed && !done && started && onScreen && !document.hidden) {
        raf = requestAnimationFrame(tick);
      }
    }

    function onVisibility() {
      last = 0;
      schedule();
    }
    document.addEventListener("visibilitychange", onVisibility);

    var io = null;
    if (startOnView && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(function (entries) {
        onScreen = entries[entries.length - 1].isIntersecting;
        if (onScreen && !started) {
          started = true;
          begin();
        }
        if (!onScreen) {
          cancelAnimationFrame(raf);
          raf = 0;
          last = 0;
        } else {
          schedule();
        }
      }, { threshold: 0.3 });
      io.observe(el);
    } else {
      started = true;
      onScreen = true;
      begin();
      schedule();
    }

    function cleanup() {
      destroyed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      document.removeEventListener("visibilitychange", onVisibility);
      if (io) io.disconnect();
    }

    return {
      destroy: cleanup,
      skip: function () {
        if (destroyed || done) return;
        for (var i = 0; i < nodes.length; i++) {
          if (i < items.length) {
            nodes[i].textContent = items[i].text;
            nodes[i].style.opacity = "1";
            nodes[i].style.transform = "none";
          }
        }
        for (var j = nodes.length; j < items.length; j++) {
          var n = createNode(items[j]);
          n.textContent = items[j].text;
          el.appendChild(n);
          nodes.push(n);
        }
        cleanup();
        finish();
      }
    };
  }

  window.typeLines = typeLines;
})();
