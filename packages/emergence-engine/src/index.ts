export { parseDice, ParseError } from "./dice/parser.js";
export { rollDice } from "./dice/evaluator.js";
export { defaultRNG, fixedRNG } from "./dice/types.js";
export type { DiceExpression, RollResult, RNG } from "./dice/types.js";

export { lookup, matrixLookup, lookupWeightedArray, LookupError } from "./tables/lookup.js";
export type {
  LookupResult,
  CellResult,
  WeightedArrayEntry,
  WeightedArrayResult,
} from "./tables/types.js";

export { createEvaluator } from "./expression/evaluator.js";
export type { ExpressionEvaluator, ExpressionContext } from "./expression/types.js";

export { parseMacro } from "./macro/parser.js";
export { executeMacro } from "./macro/executor.js";
export type { UserPromptFn } from "./macro/executor.js";
export { MacroParseError, NotImplementedError, MissingParamError } from "./macro/errors.js";
export type { MacroInvocationContext } from "./macro/context.js";
export type {
  MacroDefinition,
  MacroStep,
  StepBody,
  RollStep,
  LookupStep,
  MatrixLookupStep,
  InvokeStep,
  ParamDefinition,
  ParamType,
  ParamSource,
  EffectDefinition,
} from "./macro/types.js";
export type {
  ResolvedParams,
  StepResult,
  AppliedMacroEffect,
  MacroExecutionContext,
  MacroResult,
} from "./macro/execution.js";

export { createInMemoryStateAdapter } from "./state/adapter.js";
export { createRegistry } from "./registry/types.js";
export type { ModuleRegistry } from "./registry/types.js";
export { loadModuleFromDirectory } from "./registry/loader.js";
export { createHookDispatcher } from "./hooks/types.js";
export type { HookDispatcher, HookName } from "./hooks/types.js";
