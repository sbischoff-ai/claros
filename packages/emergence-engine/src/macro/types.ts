export type ParamType = "string" | "int" | "float" | "bool" | "enum" | "dice-expr" | "ref";

export type ParamSource =
  | "user"
  | `state.${"story" | "chapter" | "scene"}.${string}`
  | `state.character.${"active" | string}.${string}`
  | `literal:${string}`;

export interface ParamDefinition {
  type: ParamType;
  required?: boolean;
  source: ParamSource;
  fallback?: "user";
  prompt?: string;
  default?: unknown;
  range?: [number, number];
  values?: string[];
}

export interface RollStep {
  roll: string;
}

export interface LookupStep {
  lookup: { table: string; roll?: string };
}

export interface MatrixLookupStep {
  "matrix-lookup": { table: string; row: string; column: string; classify?: string };
}

export interface InvokeStep {
  invoke: string;
  with?: Record<string, string>;
}

export type StepBody = RollStep | LookupStep | MatrixLookupStep | InvokeStep;

export interface MacroStep {
  id: string;
  when?: string;
  body: StepBody;
}

export interface EffectDefinition {
  set: string;
  value: string;
  when?: string;
}

export interface MacroDefinition {
  id: string;
  name: string;
  description?: string;
  hooks?: string[];
  params: Record<string, ParamDefinition>;
  steps: MacroStep[];
  effects: EffectDefinition[];
  output: Record<string, string>;
}
