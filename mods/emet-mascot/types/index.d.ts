export type MascotMachine = {
  state: "sleep" | "work" | "waiting" | "done" | "error";
  working: boolean;
  waiting: boolean;
  transient: "done" | "error" | null;
  transientSince: number;
};

export type MascotPhase = {
  phase:
    | "planning"
    | "dispatch"
    | "working"
    | "review"
    | "checking"
    | "landing"
    | "done"
    | "failed";
  wave: number | null;
  spec: string | null;
  runId: string | null;
  updatedAt: string;
  outcome?: string;
};

declare module "claude-code" {
  interface PluginState {
    "emet-mascot": { machine: MascotMachine; phase: MascotPhase | null; reported: string[] };
  }
}
