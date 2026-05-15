export type ExpressionContext = Record<string, unknown>;

export interface ExpressionEvaluator {
  /** Evaluate an expression string against a context. Returns undefined for missing paths. */
  evaluate(expression: string, context: ExpressionContext): unknown;

  /** Evaluate and coerce to boolean. Never throws. */
  evaluateBool(expression: string, context: ExpressionContext): boolean;
}
