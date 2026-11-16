/** The process exit codes shared by every `emet` command. */
export const exitCodes = {
  success: 0,
  findings: 1,
  usage: 2,
  internal: 3,
  interrupted: 130,
} as const;

/** Documented per-command exit outcomes that the prompts branch on. */
export const commandOutcomes = {
  ask: { sliceTimeout: 3, expired: 4 },
  "review-package": { badRange: 3 },
} as const;
