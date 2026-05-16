export { parseDice, ParseError } from "./dice/parser.js";
export { rollDice } from "./dice/evaluator.js";
export { defaultRNG, fixedRNG } from "./dice/types.js";
export type { DiceExpression, RollResult, RNG } from "./dice/types.js";

export { lookup, matrixLookup, LookupError } from "./tables/lookup.js";
export type { LookupResult, CellResult } from "./tables/types.js";

export { createEvaluator } from "./expression/evaluator.js";
export type { ExpressionEvaluator, ExpressionContext } from "./expression/types.js";

export { parseMacro } from "./macro/parser.js";
export { executeMacro } from "./macro/executor.js";
export { MacroParseError, NotImplementedError } from "./macro/errors.js";
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
export type { ResolvedParams, StepResult, MacroExecutionContext, MacroResult } from "./macro/execution.js";
