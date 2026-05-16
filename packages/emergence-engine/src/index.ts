export { parseDice, ParseError } from "./dice/parser.js";
export { rollDice } from "./dice/evaluator.js";
export { defaultRNG } from "./dice/types.js";
export type { DiceExpression, RollResult, RNG } from "./dice/types.js";

export { lookup, matrixLookup, LookupError } from "./tables/lookup.js";
export type { LookupResult, CellResult } from "./tables/types.js";

export { createEvaluator } from "./expression/evaluator.js";
export type { ExpressionEvaluator, ExpressionContext } from "./expression/types.js";
