import { exitCodes } from "./exit-codes";

/**
 * Exits with 130 on SIGINT after running `cleanup`.
 * @returns A function that removes the handler.
 */
export function onInterrupt(cleanup?: () => void): () => void {
  const handler = (): void => {
    try {
      cleanup?.();
    } finally {
      process.exit(exitCodes.interrupted);
    }
  };
  process.on("SIGINT", handler);
  return () => {
    process.off("SIGINT", handler);
  };
}
