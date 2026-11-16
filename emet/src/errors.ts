import { exitCodes } from "./exit-codes";

/** Stable, machine-readable identifier for a class of `emet` error. */
export type ErrorCode =
  | "land-usage"
  | "land-refused"
  | "tracker-usage"
  | "tracker-refused"
  | "cleanup-usage"
  | "dispatch-failed"
  | "config-invalid"
  | "migration-conflict"
  | "internal";

/** Base class of every module-local `emet` error: a stable code, a fix hint and an exit code. */
export class EmetError extends Error {
  readonly code: ErrorCode;
  readonly fix: string;
  readonly exitCode: number;

  constructor(
    code: ErrorCode,
    message: string,
    fix: string,
    exitCode: number = exitCodes.internal,
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.fix = fix;
    this.exitCode = exitCode;
  }
}

/**
 * Maps a thrown value to a process exit code.
 * @returns The `EmetError` exit code, or the internal-error code for anything else.
 */
export function exitCodeFor(thrown: unknown): number {
  return thrown instanceof EmetError ? thrown.exitCode : exitCodes.internal;
}
