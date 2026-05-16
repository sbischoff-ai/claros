export interface ResolvedParams {
  [key: string]: unknown;
}

export interface StepResult {
  [key: string]: unknown;
}

export interface MacroExecutionContext {
  params: ResolvedParams;
  steps: Record<string, StepResult>;
}

export interface MacroResult {
  output: Record<string, unknown>;
  steps: Record<string, StepResult>;
}
