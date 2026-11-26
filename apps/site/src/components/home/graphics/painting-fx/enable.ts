/** Environment facts that decide whether painting effects run. */
export interface FxEnv {
  readonly reducedMotion: boolean;
  readonly viewportWidth: number;
  readonly coarsePointer: boolean;
  readonly webgl: boolean;
}

export const FX_MAX_SMALL_VIEWPORT = 900;

/** True only for motion-tolerant, wide, fine-pointer viewers with WebGL. */
export function fxEnabled(env: FxEnv): boolean {
  return (
    !env.reducedMotion &&
    env.viewportWidth > FX_MAX_SMALL_VIEWPORT &&
    !env.coarsePointer &&
    env.webgl
  );
}
