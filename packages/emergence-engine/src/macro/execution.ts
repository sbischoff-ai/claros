import type { ProjectStateSnapshot } from "@claros/story-format";

export interface ResolvedParams {
  [key: string]: unknown;
}

// StepResult is intentionally opaque — concrete step results (RollResult,
// LookupResult, CellResult, invoke output) are structurally incompatible with a
// named index signature under strict mode. Callers access step results via the
// jexl expression evaluator which handles dynamic property access at runtime.
export type StepResult = unknown;

export interface MacroExecutionContext {
  params: ResolvedParams;
  steps: Record<string, StepResult>;
  state: ProjectStateSnapshot;
  scene_id: string | undefined;
  chapter_id: string | undefined;
}

export interface MacroResult {
  output: Record<string, unknown>;
  steps: Record<string, StepResult>;
}
