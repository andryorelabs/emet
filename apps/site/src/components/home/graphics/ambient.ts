/**
 * Keeps the ambient graphics cheap: the valley scenes pause while off
 * screen, and every loop pauses while the tab is hidden. Pure attribute
 * toggles read by `graphics.css`; with no script the loops just run.
 */

/** Wires visibility pausing for every `[data-valley]` scene under `root`. */
export function initAmbient(root: ParentNode): void {
  const html = document.documentElement;
  const syncTab = (): void => {
    if (document.hidden) html.dataset.tabHidden = "";
    else delete html.dataset.tabHidden;
  };
  document.addEventListener("visibilitychange", syncTab);
  syncTab();

  const scenes = root.querySelectorAll<HTMLElement>("[data-valley]");
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const scene = entry.target;
      if (!(scene instanceof HTMLElement)) continue;
      if (entry.isIntersecting) delete scene.dataset.paused;
      else scene.dataset.paused = "";
    }
  });
  for (const scene of scenes) observer.observe(scene);
}
