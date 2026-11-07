/**
 * Pure decisions of the scroll motion layer: what runs for a given
 * environment and how far an element has travelled through the viewport.
 */

export interface MotionEnvironment {
  reducedMotion: boolean;
  coarsePointer: boolean;
  hasViewTimeline: boolean;
}

export interface MotionPolicy {
  enabled: boolean;
  smoothScroll: boolean;
  scrollFallback: boolean;
}

export interface BoxMetrics {
  top: number;
  height: number;
}

/** Decides which parts of the layer run: nothing with reduced motion, no smooth scroll on touch. */
export function motionPolicy(environment: MotionEnvironment): MotionPolicy {
  if (environment.reducedMotion) {
    return { enabled: false, smoothScroll: false, scrollFallback: false };
  }
  return {
    enabled: true,
    smoothScroll: !environment.coarsePointer,
    scrollFallback: !environment.hasViewTimeline,
  };
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Progress from the box entering at the bottom of the viewport to leaving at the top. */
export function coverProgress(box: BoxMetrics, viewportHeight: number): number {
  return clamp01((viewportHeight - box.top) / (viewportHeight + box.height));
}

/** Progress from the box top meeting the viewport top to its bottom meeting it. */
export function exitProgress(box: BoxMetrics): number {
  return clamp01(-box.top / box.height);
}
