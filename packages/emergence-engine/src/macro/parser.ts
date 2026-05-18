import { load } from "js-yaml";
import { MacroParseError } from "./errors.js";
import type {
  MacroDefinition,
  MacroStep,
  StepBody,
  ParamDefinition,
  EffectDefinition,
  MacroOutputDefinition,
} from "./types.js";

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MacroParseError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseStepBody(rawStep: Record<string, unknown>, stepId: string): StepBody {
  const hasRoll = rawStep["roll"] !== undefined;
  const hasLookup = rawStep["lookup"] !== undefined;
  const hasMatrixLookup = rawStep["matrix-lookup"] !== undefined;
  const hasInvoke = rawStep["invoke"] !== undefined;

  const bodyCount = [hasRoll, hasLookup, hasMatrixLookup, hasInvoke].filter(Boolean).length;
  if (bodyCount !== 1) {
    throw new MacroParseError(
      `step "${stepId}" must define exactly one of: roll, lookup, matrix-lookup, invoke`
    );
  }

  if (hasRoll) {
    if (typeof rawStep["roll"] !== "string") {
      throw new MacroParseError(`step "${stepId}" field 'roll' must be a string`);
    }
    return { roll: rawStep["roll"] };
  }

  if (hasLookup) {
    const lookupObj = asRecord(rawStep["lookup"], `step "${stepId}".lookup`);
    if (typeof lookupObj["table"] !== "string") {
      throw new MacroParseError(`step "${stepId}" field 'lookup.table' must be a string`);
    }
    if (lookupObj["roll"] !== undefined && typeof lookupObj["roll"] !== "string") {
      throw new MacroParseError(`step "${stepId}" field 'lookup.roll' must be a string`);
    }

    const result: { table: string; roll?: string } = {
      table: lookupObj["table"],
    };
    if (typeof lookupObj["roll"] === "string") {
      result.roll = lookupObj["roll"];
    }
    return { lookup: result };
  }

  if (hasMatrixLookup) {
    const matrixObj = asRecord(rawStep["matrix-lookup"], `step "${stepId}".matrix-lookup`);
    if (typeof matrixObj["table"] !== "string") {
      throw new MacroParseError(`step "${stepId}" field 'matrix-lookup.table' must be a string`);
    }
    if (typeof matrixObj["row"] !== "string") {
      throw new MacroParseError(`step "${stepId}" field 'matrix-lookup.row' must be a string`);
    }
    if (typeof matrixObj["column"] !== "string") {
      throw new MacroParseError(`step "${stepId}" field 'matrix-lookup.column' must be a string`);
    }
    if (matrixObj["classify"] !== undefined && typeof matrixObj["classify"] !== "string") {
      throw new MacroParseError(`step "${stepId}" field 'matrix-lookup.classify' must be a string`);
    }

    const result: { table: string; row: string; column: string; classify?: string } = {
      table: matrixObj["table"],
      row: matrixObj["row"],
      column: matrixObj["column"],
    };
    if (typeof matrixObj["classify"] === "string") {
      result.classify = matrixObj["classify"];
    }

    return { "matrix-lookup": result };
  }

  if (typeof rawStep["invoke"] !== "string") {
    throw new MacroParseError(`step "${stepId}" field 'invoke' must be a string`);
  }

  const withValue = rawStep["with"];
  let withMap: Record<string, string> | undefined;
  if (withValue !== undefined) {
    const withRecord = asRecord(withValue, `step "${stepId}".with`);
    withMap = {};
    for (const [key, value] of Object.entries(withRecord)) {
      if (typeof value !== "string") {
        throw new MacroParseError(`step "${stepId}" field 'with.${key}' must be a string`);
      }
      withMap[key] = value;
    }
  }

  return withMap !== undefined
    ? { invoke: rawStep["invoke"], with: withMap }
    : { invoke: rawStep["invoke"] };
}

function parseParams(raw: unknown): Record<string, ParamDefinition> {
  if (raw === undefined) {
    return {};
  }

  const paramsObj = asRecord(raw, "params");
  const params: Record<string, ParamDefinition> = {};

  for (const [name, def] of Object.entries(paramsObj)) {
    params[name] = asRecord(def, `params.${name}`) as unknown as ParamDefinition;
  }

  return params;
}

function parseSteps(raw: unknown): MacroStep[] {
  if (raw === undefined) {
    return [];
  }

  if (!Array.isArray(raw)) {
    throw new MacroParseError("steps must be an array");
  }

  return raw.map((step, index): MacroStep => {
    const stepObj = asRecord(step, `steps[${index}]`);

    if (typeof stepObj["id"] !== "string" || stepObj["id"].length === 0) {
      throw new MacroParseError(`steps[${index}] missing required field 'id'`);
    }

    if (stepObj["when"] !== undefined && typeof stepObj["when"] !== "string") {
      throw new MacroParseError(`steps[${index}] field 'when' must be a string`);
    }

    const body = parseStepBody(stepObj, stepObj["id"]);

    return {
      id: stepObj["id"],
      when: typeof stepObj["when"] === "string" ? stepObj["when"] : undefined,
      body,
    };
  });
}

function parseEffects(raw: unknown): EffectDefinition[] {
  if (raw === undefined) {
    return [];
  }

  if (!Array.isArray(raw)) {
    throw new MacroParseError("effects must be an array");
  }

  return raw.map((effect, index): EffectDefinition => {
    const effectObj = asRecord(effect, `effects[${index}]`);

    if (typeof effectObj["set"] !== "string") {
      throw new MacroParseError(`effects[${index}] field 'set' must be a string`);
    }
    if (typeof effectObj["value"] !== "string") {
      throw new MacroParseError(`effects[${index}] field 'value' must be a string`);
    }
    if (effectObj["when"] !== undefined && typeof effectObj["when"] !== "string") {
      throw new MacroParseError(`effects[${index}] field 'when' must be a string`);
    }

    return {
      set: effectObj["set"],
      value: effectObj["value"],
      when: typeof effectObj["when"] === "string" ? effectObj["when"] : undefined,
    };
  });
}

function parseOutput(raw: unknown): MacroOutputDefinition {
  if (raw === undefined) {
    return {};
  }

  const outputObj = asRecord(raw, "output");
  const output: MacroOutputDefinition = {};

  for (const [key, value] of Object.entries(outputObj)) {
    if (typeof value === "string") {
      output[key] = value;
      continue;
    }

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      output[key] = parseOutput(value);
      continue;
    }

    throw new MacroParseError(`output.${key} must be a string expression or nested object`);
  }

  return output;
}

export function parseMacro(yaml: string): MacroDefinition {
  let raw: unknown;
  try {
    raw = load(yaml);
  } catch (error) {
    throw new MacroParseError(`YAML parse error: ${(error as Error).message}`);
  }

  const root = asRecord(raw, "macro");

  if (typeof root["id"] !== "string" || root["id"].length === 0) {
    throw new MacroParseError("missing required field 'id'");
  }

  if (typeof root["name"] !== "string" || root["name"].length === 0) {
    throw new MacroParseError("missing required field 'name'");
  }

  let hooks: string[] | undefined;
  if (root["hooks"] !== undefined) {
    if (!Array.isArray(root["hooks"]) || root["hooks"].some((v) => typeof v !== "string")) {
      throw new MacroParseError("hooks must be an array of strings");
    }
    hooks = root["hooks"] as string[];
  }

  return {
    id: root["id"],
    name: root["name"],
    description: typeof root["description"] === "string" ? root["description"] : undefined,
    hooks,
    params: parseParams(root["params"]),
    steps: parseSteps(root["steps"]),
    effects: parseEffects(root["effects"]),
    output: parseOutput(root["output"]),
  };
}
