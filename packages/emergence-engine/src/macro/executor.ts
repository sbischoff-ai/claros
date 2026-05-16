import { parseDice } from "../dice/parser.js";
import { rollDice } from "../dice/evaluator.js";
import { lookup, matrixLookup } from "../tables/lookup.js";
import { createEvaluator } from "../expression/evaluator.js";
import type { AnyTable, RandomTable, MatrixTable } from "@claros/story-format";
import type { RNG } from "../dice/types.js";
import { defaultRNG } from "../dice/types.js";
import { NotImplementedError } from "./errors.js";
import type {
  MacroDefinition,
  RollStep,
  LookupStep,
  MatrixLookupStep,
  InvokeStep,
  StepBody,
} from "./types.js";
import type { ResolvedParams, StepResult, MacroResult } from "./execution.js";

function hasRollStep(body: StepBody): body is RollStep {
  return "roll" in body;
}

function hasLookupStep(body: StepBody): body is LookupStep {
  return "lookup" in body;
}

function hasMatrixLookupStep(body: StepBody): body is MatrixLookupStep {
  return "matrix-lookup" in body;
}

function hasInvokeStep(body: StepBody): body is InvokeStep {
  return "invoke" in body;
}

function requireTable(tables: Map<string, AnyTable>, tableId: string): AnyTable {
  const table = tables.get(tableId);
  if (table === undefined) {
    throw new Error(`table not found: ${tableId}`);
  }
  return table;
}

function normalizeStepAccess(expression: string): string {
  return expression.replace(/\bsteps\.([A-Za-z0-9_-]+)/g, (fullMatch, stepId: string) => {
    if (!stepId.includes("-")) {
      return fullMatch;
    }
    return `steps["${stepId}"]`;
  });
}

export async function executeMacro(
  macro: MacroDefinition,
  params: ResolvedParams,
  tables: Map<string, AnyTable>,
  rng: RNG = defaultRNG
): Promise<MacroResult> {
  const evaluator = createEvaluator();
  const steps: Record<string, StepResult> = {};

  for (const step of macro.steps) {
    const context = { params, steps };

    if (
      step.when !== undefined &&
      !evaluator.evaluateBool(normalizeStepAccess(step.when), context)
    ) {
      continue;
    }

    let stepResult: StepResult;
    const body = step.body;

    if (hasRollStep(body)) {
      const parsed = parseDice(body.roll);
      stepResult = rollDice(parsed, rng);
    } else if (hasLookupStep(body)) {
      const table = requireTable(tables, body.lookup.table) as RandomTable;
      const rollValue = Number(
        body.lookup.roll === undefined
          ? 0
          : evaluator.evaluate(normalizeStepAccess(body.lookup.roll), context)
      );
      stepResult = lookup(table, rollValue);
    } else if (hasMatrixLookupStep(body)) {
      const table = requireTable(tables, body["matrix-lookup"].table) as MatrixTable;
      const rowKey = evaluator.evaluate(normalizeStepAccess(body["matrix-lookup"].row), context);
      const columnKey = evaluator.evaluate(
        normalizeStepAccess(body["matrix-lookup"].column),
        context
      );
      const classifyValue =
        body["matrix-lookup"].classify === undefined
          ? undefined
          : Number(
              evaluator.evaluate(normalizeStepAccess(body["matrix-lookup"].classify), context)
            );

      stepResult = matrixLookup(
        table,
        String(rowKey),
        typeof columnKey === "number" ? columnKey : String(columnKey),
        classifyValue
      );
    } else if (hasInvokeStep(body)) {
      throw new NotImplementedError("invoke steps are not supported until Iter 05");
    } else {
      throw new Error(`unknown step body for step: ${step.id}`);
    }

    steps[step.id] = stepResult;
  }

  const output: Record<string, unknown> = {};
  const finalContext = { params, steps };
  for (const [key, expr] of Object.entries(macro.output)) {
    output[key] = evaluator.evaluate(normalizeStepAccess(expr), finalContext);
  }

  return {
    output,
    steps,
  };
}
