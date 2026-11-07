/**
 * Scroll motion layer of the home page: Lenis smooth scroll on pointer
 * devices, once-only reveals with a 60ms stagger, and the scroll progress
 * fallback for browsers without `animation-timeline: view()`. Every state
 * is reachable without script; the root attribute `data-motion` only turns
 * the hidden starting states of `motion.css` into transitions.
 */
import Lenis from "lenis";

import {
  coverProgress,
  exitProgress,
  motionPolicy,
  type MotionEnvironment,
  type MotionPolicy,
} from "./policy";

const REVEAL_STAGGER_MS = 60;
const REVEAL_STAGGER_STEPS = 4;
const REVEAL_CLEANUP_MS = 700;
const SMOOTH_LERP = 0.1;

function readEnvironment(): MotionEnvironment {
  return {
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    coarsePointer: matchMedia("(pointer: coarse)").matches,
    hasViewTimeline: CSS.supports("animation-timeline: view()"),
  };
}

function revealNow(target: HTMLElement, delayMs: number): void {
  if (delayMs > 0) target.style.transitionDelay = `${delayMs}ms`;
  target.classList.add("is-in");
  if (delayMs > 0) {
    globalThis.setTimeout(
      () => target.style.removeProperty("transition-delay"),
      REVEAL_CLEANUP_MS + delayMs,
    );
  }
}

function observeReveals(root: ParentNode): () => void {
  const targets = [...root.querySelectorAll<HTMLElement>("[data-reveal]")];
  if (targets.length === 0) return () => undefined;
  const observer = new IntersectionObserver(
    (entries) => {
      let order = 0;
      for (const entry of entries) {
        const target = entry.target;
        if (!(target instanceof HTMLElement)) continue;
        const passed = !entry.isIntersecting && entry.boundingClientRect.bottom < 0;
        if (!entry.isIntersecting && !passed) continue;
        revealNow(
          target,
          passed ? 0 : Math.min(order, REVEAL_STAGGER_STEPS - 1) * REVEAL_STAGGER_MS,
        );
        order += passed ? 0 : 1;
        observer.unobserve(target);
      }
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0 },
  );
  for (const target of targets) observer.observe(target);
  return () => observer.disconnect();
}

function trackScrollProgress(root: ParentNode): () => void {
  const recede = [...root.querySelectorAll<HTMLElement>("[data-recede]")];
  const drift = [...root.querySelectorAll<HTMLElement>("[data-drift]")];
  const visible = new Set<HTMLElement>();
  const watcher = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const target = entry.target;
      if (!(target instanceof HTMLElement)) continue;
      if (entry.isIntersecting) visible.add(target);
      else visible.delete(target);
    }
    schedule();
  });
  let frame = 0;

  const write = (): void => {
    frame = 0;
    for (const target of visible) {
      const box = target.getBoundingClientRect();
      const progress = recede.includes(target)
        ? exitProgress(box)
        : coverProgress(box, innerHeight);
      target.style.setProperty("--p", progress.toFixed(4));
    }
  };
  function schedule(): void {
    if (frame === 0) frame = requestAnimationFrame(write);
  }

  for (const target of [...recede, ...drift]) watcher.observe(target);
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule, { passive: true });
  return () => {
    watcher.disconnect();
    removeEventListener("scroll", schedule);
    removeEventListener("resize", schedule);
    cancelAnimationFrame(frame);
  };
}

function startSmoothScroll(): () => void {
  const lenis = new Lenis({ lerp: SMOOTH_LERP, anchors: true, autoRaf: true });
  return () => lenis.destroy();
}

/**
 * Starts the scroll layer under `root`. Does nothing with reduced motion,
 * and follows the preference if it changes while the page is open.
 */
export function initMotion(root: ParentNode): void {
  const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)");
  let stops: (() => void)[] = [];

  const start = (): void => {
    const policy: MotionPolicy = motionPolicy(readEnvironment());
    if (!policy.enabled) return;
    const html = document.documentElement;
    html.dataset.motion = "ready";
    stops.push(observeReveals(root));
    if (policy.scrollFallback) {
      html.dataset.scrollFallback = "";
      stops.push(trackScrollProgress(root));
    }
    if (policy.smoothScroll) stops.push(startSmoothScroll());
  };

  const stop = (): void => {
    for (const release of stops) release();
    stops = [];
    for (const target of root.querySelectorAll<HTMLElement>("[data-reveal]")) {
      target.classList.add("is-in");
    }
  };

  reducedQuery.addEventListener("change", () => {
    if (reducedQuery.matches) stop();
    else start();
  });
  start();
}
