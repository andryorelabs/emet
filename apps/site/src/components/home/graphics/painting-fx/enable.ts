/** Environment facts that decide whether painting effects run. */
export interface FxEnv {
  readonly reducedMotion: boolean;
  readonly coarsePointer: boolean;
  readonly webgl: boolean;
}

/** True only for motion-tolerant, fine-pointer viewers with WebGL, at any viewport width. */
export function fxEnabled(env: FxEnv): boolean {
  return !env.reducedMotion && !env.coarsePointer && env.webgl;
}
