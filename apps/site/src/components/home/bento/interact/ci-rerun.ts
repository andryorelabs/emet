/**
 * CI "Run again": the button restarts the check loop from its first frame,
 * so the failing test, the fix chip and the retries diff play again.
 */

/**
 * Restarts every animation under `scene` from zero.
 */
export function restartScene(scene: HTMLElement): void {
  scene.style.setProperty("--scene-offset", "0s");
  scene.dataset.restart = "";
  scene.getBoundingClientRect();
  delete scene.dataset.restart;
}

/**
 * Wires the Run again button of the CI scene.
 */
export function initCiRerun(scene: HTMLElement): void {
  const button = scene.querySelector<HTMLButtonElement>(".ci-rerun");
  if (button === null) return;
  button.inert = false;
  button.addEventListener("click", () => {
    restartScene(scene);
  });
}
