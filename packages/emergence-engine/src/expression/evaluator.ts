import { Jexl } from "jexl";
import type { ExpressionContext, ExpressionEvaluator } from "./types.js";

function buildJexl(): InstanceType<typeof Jexl> {
  const jexl = new Jexl();

  // Add English boolean keyword aliases.
  // jexl uses &&/||/! by default; these aliases allow authors to write
  // natural-language YAML expressions like "value <= ey and value > sy".
  //
  // Precedence 10 matches jexl's built-in && and || precedence.
  jexl.addBinaryOp("and", 10, (left: unknown, right: unknown) => !!(left && right));
  jexl.addBinaryOp("or", 10, (left: unknown, right: unknown) => !!(left || right));
  jexl.addUnaryOp("not", (v: unknown) => !v);

  // Array helper — jexl 2.x maps `.property` over array elements rather than
  // accessing native JS array properties, so `.length` returns each element's
  // length, not the array size. Use the `count` transform instead:
  //   state.story.mythic.npcs | count  →  2
  jexl.addTransform("count", (val: unknown) => (Array.isArray(val) ? val.length : 0));

  return jexl;
}

class JexlEvaluator implements ExpressionEvaluator {
  private readonly jexl: InstanceType<typeof Jexl>;

  constructor() {
    this.jexl = buildJexl();
  }

  evaluate(expression: string, context: ExpressionContext): unknown {
    // evalSync returns the result directly; undefined for missing paths (jexl built-in behaviour).
    return this.jexl.evalSync(expression, context);
  }

  evaluateBool(expression: string, context: ExpressionContext): boolean {
    try {
      const result = this.evaluate(expression, context);
      return Boolean(result);
    } catch {
      return false;
    }
  }
}

/** Returns a shared evaluator instance. Safe to call multiple times — returns the same instance. */
let _instance: JexlEvaluator | undefined;
export function createEvaluator(): ExpressionEvaluator {
  if (_instance === undefined) {
    _instance = new JexlEvaluator();
  }
  return _instance;
}
