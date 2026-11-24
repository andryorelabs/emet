import { spawn } from "node:child_process";
import { homedir } from "node:os";

import { EMET_VERSION, embeddedTree, isCompiledBinary } from "./assets";
import { snapshotEnv } from "./env";
import { runSelf, type SelfDeps } from "./self-install";

/** Runs `<emetBin> setup` attached to this terminal and resolves to its exit code. */
export function runSetupCommand(emetBin: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(emetBin, ["setup"], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}

/** The `SelfDeps` of this process: the real home, executable, embedded tree and terminal. */
export function processSelfDeps(): SelfDeps {
  return {
    home: homedir(),
    executablePath: process.execPath,
    compiled: isCompiledBinary(),
    version: EMET_VERSION,
    tree: embeddedTree,
    interactive: process.stdin.isTTY && process.stdout.isTTY,
    pathEnv: snapshotEnv().PATH ?? "",
    runSetup: runSetupCommand,
    now: () => new Date(),
    log: (line) => {
      console.log(line);
    },
    error: (line) => {
      console.error(line);
    },
  };
}

/** Entry point for `emet self <install|update> ...`. */
export function run(argv: string[]): Promise<number> {
  return runSelf(argv, processSelfDeps());
}
