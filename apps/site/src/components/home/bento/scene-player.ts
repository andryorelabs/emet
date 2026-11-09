/**
 * Player of the bento scenes: sets `data-playing` on a `[data-scene]` root
 * only while it is on screen and the tab is visible, so the CSS loops pause
 * everywhere else. It does nothing under reduced motion, where every scene
 * stays its static final frame, and follows the preference like `initMotion`.
 */

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const OFFSET_STEP_SECONDS = 0.9;

function assignOffsets(scenes: HTMLElement[]): void {
  scenes.forEach((scene, index) => {
    scene.style.setProperty("--scene-offset", `${(index * OFFSET_STEP_SECONDS).toFixed(1)}s`);
  });
}

function setPlaying(scene: HTMLElement, playing: boolean): void {
  if (playing) scene.dataset.playing = "";
  else delete scene.dataset.playing;
}

function observeScenes(scenes: HTMLElement[]): () => void {
  const byElement = new Map<Element, HTMLElement>(scenes.map((scene) => [scene, scene]));
  const visible = new Set<HTMLElement>();

  const sync = (): void => {
    for (const scene of scenes) setPlaying(scene, visible.has(scene) && !document.hidden);
  };

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const scene = byElement.get(entry.target);
      if (scene === undefined) continue;
      if (entry.isIntersecting) visible.add(scene);
      else visible.delete(scene);
    }
    sync();
  });
  for (const scene of scenes) observer.observe(scene);
  document.addEventListener("visibilitychange", sync);

  return () => {
    observer.disconnect();
    document.removeEventListener("visibilitychange", sync);
    visible.clear();
    for (const scene of scenes) setPlaying(scene, false);
  };
}

/**
 * Starts the scene player under `root` and returns a function that stops it.
 * Scenes run only while visible, and not at all with reduced motion.
 */
export function initBentoScenes(root: ParentNode): () => void {
  const scenes = [...root.querySelectorAll<HTMLElement>("[data-scene]")];
  if (scenes.length === 0) return () => undefined;
  const reducedQuery = matchMedia(REDUCED_MOTION_QUERY);
  let release: (() => void) | undefined;

  const start = (): void => {
    if (reducedQuery.matches || release !== undefined) return;
    assignOffsets(scenes);
    release = observeScenes(scenes);
  };

  const stop = (): void => {
    release?.();
    release = undefined;
  };

  const onPreferenceChange = (): void => {
    if (reducedQuery.matches) stop();
    else start();
  };

  reducedQuery.addEventListener("change", onPreferenceChange);
  start();
  return () => {
    reducedQuery.removeEventListener("change", onPreferenceChange);
    stop();
  };
}
