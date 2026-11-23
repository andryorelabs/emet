import type { TreeSource } from "./assets";

/** What a host adapter needs to install emet's files for one agent host. */
export interface HostContext {
  home: string;
  emetBin: string;
  tree: TreeSource;
  dryRun: boolean;
  force: boolean;
  now(): Date;
  log(line: string): void;
}

/** What a host adapter did: every path it wrote (or would write under `dryRun`) and any notes. */
export interface HostResult {
  host: "claude" | "codex";
  status: "installed" | "unchanged" | "skipped";
  writes: readonly string[];
  notes: readonly string[];
}
