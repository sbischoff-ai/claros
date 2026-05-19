import { parseDice } from "../dice/parser.js";
import { rollDice } from "../dice/evaluator.js";
import { lookup, matrixLookup, lookupWeightedArray } from "../tables/lookup.js";
import { createEvaluator } from "../expression/evaluator.js";
import type { RandomTable, MatrixTable, StateAdapter } from "@claros/story-format";
import type { RNG } from "../dice/types.js";
import { defaultRNG } from "../dice/types.js";
import { MissingParamError } from "./errors.js";
import type {
  MacroDefinition,
  MacroOutputDefinition,
  ParamDefinition,
  RollStep,
  LookupStep,
  MatrixLookupStep,
  InvokeStep,
  StepBody,
} from "./types.js";
import type { ResolvedParams, StepResult, MacroResult } from "./execution.js";
import type { MacroInvocationContext } from "./context.js";
import type { ModuleRegistry } from "../registry/types.js";
import type { WeightedArrayEntry } from "../tables/types.js";

// ── Type guards ──────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Called when a param has source: "user", or when a state source is missing and fallback: user. */
export type UserPromptFn = (param: ParamDefinition, name: string) => Promise<unknown>;

/** Normalise hyphenated step-ID references so jexl can evaluate them. */
function normalizeStepAccess(expression: string): string {
  return expression.replace(/\bsteps\.([A-Za-z0-9_-]+)/g, (_match, stepId: string) => {
    if (!stepId.includes("-")) return `steps.${stepId}`;
    return `steps["${stepId}"]`;
  });
}

/** Parse an effect `set:` target into scope + id + path. Returns null for unknown formats. */
function parseEffectTarget(
  target: string,
  invocationContext?: MacroInvocationContext
): {
  action: (state: StateAdapter, value: unknown) => void;
  read: (state: StateAdapter) => unknown;
} | null {
  // state.story.<path>
  const storyMatch = /^state\.story\.(.+)$/.exec(target);
  if (storyMatch) {
    const path = storyMatch[1];
    return {
      action: (state, value) => state.setStory(path, value),
      read: (state) => state.getStory(path),
    };
  }

  // state.scenes[scene_id].<path>
  const sceneVarMatch = /^state\.scenes\[scene_id\]\.(.+)$/.exec(target);
  if (sceneVarMatch) {
    const sceneId = invocationContext?.sceneId;
    if (sceneId === undefined) return null;
    const path = sceneVarMatch[1];
    return {
      action: (state, value) => state.setScene(sceneId, path, value),
      read: (state) => state.getScene(sceneId, path),
    };
  }

  // state.scenes["<literal-id>"].<path>
  const sceneLiteralMatch = /^state\.scenes\["([^"]+)"\]\.(.+)$/.exec(target);
  if (sceneLiteralMatch) {
    const sceneId = sceneLiteralMatch[1];
    const path = sceneLiteralMatch[2];
    return {
      action: (state, value) => state.setScene(sceneId, path, value),
      read: (state) => state.getScene(sceneId, path),
    };
  }

  // state.chapters[chapter_id].<path>
  const chapterVarMatch = /^state\.chapters\[chapter_id\]\.(.+)$/.exec(target);
  if (chapterVarMatch) {
    const chapterId = invocationContext?.chapterId;
    if (chapterId === undefined) return null;
    const path = chapterVarMatch[1];
    return {
      action: (state, value) => state.setChapter(chapterId, path, value),
      read: (state) => state.getChapter(chapterId, path),
    };
  }

  // state.chapters["<literal-id>"].<path>
  const chapterLiteralMatch = /^state\.chapters\["([^"]+)"\]\.(.+)$/.exec(target);
  if (chapterLiteralMatch) {
    const chapterId = chapterLiteralMatch[1];
    const path = chapterLiteralMatch[2];
    return {
      action: (state, value) => state.setChapter(chapterId, path, value),
      read: (state) => state.getChapter(chapterId, path),
    };
  }

  return null;
}

function resolveEffectTargetString(
  target: string,
  invocationContext?: MacroInvocationContext
): string | null {
  if (target.includes("[scene_id]")) {
    if (invocationContext?.sceneId === undefined) {
      return null;
    }
    return target.replace("[scene_id]", `[\"${invocationContext.sceneId}\"]`);
  }

  if (target.includes("[chapter_id]")) {
    if (invocationContext?.chapterId === undefined) {
      return null;
    }
    return target.replace("[chapter_id]", `[\"${invocationContext.chapterId}\"]`);
  }

  return target;
}

/** Resolve a single param value. Returns the resolved value or throws MissingParamError. */
async function resolveParam(
  name: string,
  def: ParamDefinition,
  preResolved: ResolvedParams,
  context: Record<string, unknown>,
  userPrompt?: UserPromptFn
): Promise<unknown> {
  // If already pre-resolved by the caller, use it directly.
  if (Object.prototype.hasOwnProperty.call(preResolved, name)) {
    return preResolved[name];
  }

  const evaluator = createEvaluator();
  const source = def.source;

  // Always-prompt source
  if (source === "user") {
    if (userPrompt === undefined) {
      throw new MissingParamError(name);
    }
    return userPrompt(def, name);
  }

  // Literal source
  if (typeof source === "string" && source.startsWith("literal:")) {
    return source.slice("literal:".length);
  }

  // Expression source — evaluate against full context
  let value: unknown;
  try {
    value = evaluator.evaluate(normalizeStepAccess(source), context);
  } catch {
    value = undefined;
  }

  if (value !== undefined && value !== null) {
    return value;
  }

  // Value is missing — apply fallback rules
  if (def.fallback === "user") {
    if (userPrompt === undefined) {
      throw new MissingParamError(name);
    }
    return userPrompt(def, name);
  }

  if (def.default !== undefined) {
    return def.default;
  }

  if (def.required === true) {
    throw new MissingParamError(name);
  }

  return undefined;
}

function evaluateOutputDefinition(
  output: MacroOutputDefinition,
  evaluator: ReturnType<typeof createEvaluator>,
  context: Record<string, unknown>
): Record<string, unknown> {
  const evaluated: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(output)) {
    if (typeof value === "string") {
      evaluated[key] = evaluator.evaluate(normalizeStepAccess(value), context);
      continue;
    }

    evaluated[key] = evaluateOutputDefinition(value, evaluator, context);
  }

  return evaluated;
}

// ── Main executor ─────────────────────────────────────────────────────────────

export async function executeMacro(
  macro: MacroDefinition,
  params: ResolvedParams,
  registry: ModuleRegistry,
  state: StateAdapter,
  invocationContext?: MacroInvocationContext,
  rng: RNG = defaultRNG,
  userPrompt?: UserPromptFn
): Promise<MacroResult> {
  const evaluator = createEvaluator();
  const sceneId = invocationContext?.sceneId;
  const chapterId = invocationContext?.chapterId;

  // Take state snapshot once before execution — used for expression evaluation throughout.
  const snapshot = state.getAll(sceneId, chapterId);

  // Base expression context — shared by param resolution, step conditions, and output.
  // Steps are added incrementally as they complete.
  const steps: Record<string, StepResult> = {};
  const effects: MacroResult["effects"] = [];
  const makeContext = () => ({
    params,
    steps,
    state: snapshot,
    scene_id: sceneId,
    chapter_id: chapterId,
  });

  // ── Param resolution ────────────────────────────────────────────────────────
  // Build a shallow context for param resolution (steps is empty at this point).
  const paramCtx = makeContext();
  const resolvedParams: ResolvedParams = {};
  for (const [name, def] of Object.entries(macro.params)) {
    resolvedParams[name] = await resolveParam(name, def, params, paramCtx, userPrompt);
  }
  // Replace params reference so subsequent expressions see resolved values.
  // We rebind the variable used by makeContext.
  params = resolvedParams;

  // ── Step execution ──────────────────────────────────────────────────────────
  for (const step of macro.steps) {
    const ctx = makeContext();

    if (step.when !== undefined && !evaluator.evaluateBool(normalizeStepAccess(step.when), ctx)) {
      continue;
    }

    const body = step.body;

    if (hasRollStep(body)) {
      const parsed = parseDice(body.roll);
      steps[step.id] = rollDice(parsed, rng);
    } else if (hasLookupStep(body)) {
      const tableSource = body.lookup.table;
      const registeredTable = registry.getTable(tableSource) as RandomTable | undefined;
      if (registeredTable !== undefined) {
        // Static registered table path: look up by range-based dice roll.
        const rollValue =
          body.lookup.roll === undefined
            ? undefined
            : Number(evaluator.evaluate(normalizeStepAccess(body.lookup.roll), ctx));
        steps[step.id] = lookup(registeredTable, rollValue, rng);
      } else {
        // Expression path: evaluate tableSource against context; expect a weighted array.
        const weightedArray = evaluator.evaluate(normalizeStepAccess(tableSource), ctx);
        if (!Array.isArray(weightedArray)) {
          throw new Error(
            `lookup source "${tableSource}" is not a registered table and did not evaluate to an array`
          );
        }
        steps[step.id] = lookupWeightedArray(weightedArray as WeightedArrayEntry[], rng);
      }
    } else if (hasMatrixLookupStep(body)) {
      const table = registry.getTable(body["matrix-lookup"].table) as MatrixTable | undefined;
      if (table === undefined) throw new Error(`table not found: ${body["matrix-lookup"].table}`);
      const rowKey = evaluator.evaluate(normalizeStepAccess(body["matrix-lookup"].row), ctx);
      const colKey = evaluator.evaluate(normalizeStepAccess(body["matrix-lookup"].column), ctx);
      const classifyValue =
        body["matrix-lookup"].classify === undefined
          ? undefined
          : Number(evaluator.evaluate(normalizeStepAccess(body["matrix-lookup"].classify), ctx));
      steps[step.id] = matrixLookup(
        table,
        String(rowKey),
        typeof colKey === "number" ? colKey : String(colKey),
        classifyValue
      );
    } else if (hasInvokeStep(body)) {
      const subMacro = registry.getMacro(body.invoke);
      if (subMacro === undefined) {
        throw new Error(`invoke: macro not found in registry: ${body.invoke}`);
      }
      // Evaluate with: expressions against the calling macro's current context.
      const withParams: ResolvedParams = {};
      if (body.with !== undefined) {
        for (const [key, expr] of Object.entries(body.with)) {
          withParams[key] = evaluator.evaluate(normalizeStepAccess(expr), ctx);
        }
      }
      // Sub-macro receives the same invocationContext (scene/chapter propagated unchanged).
      const subResult = await executeMacro(
        subMacro,
        withParams,
        registry,
        state,
        invocationContext,
        rng,
        userPrompt
      );
      // Store the sub-macro's output as this step's result.
      steps[step.id] = subResult.output;
    } else {
      throw new Error(`unknown step body for step: ${step.id}`);
    }
  }

  // ── Effects execution ───────────────────────────────────────────────────────
  // Effects run after all steps; each write is applied to the adapter immediately.
  for (const effect of macro.effects) {
    const ctx = makeContext();
    if (
      effect.when !== undefined &&
      !evaluator.evaluateBool(normalizeStepAccess(effect.when), ctx)
    ) {
      continue;
    }
    const parsed = parseEffectTarget(effect.set, invocationContext);
    if (parsed === null) {
      throw new Error(`effect: unrecognised or unresolvable target: ${effect.set}`);
    }
    const resolvedTarget = resolveEffectTargetString(effect.set, invocationContext);
    if (resolvedTarget === null) {
      throw new Error(`effect: unrecognised or unresolvable target: ${effect.set}`);
    }
    const oldValue = parsed.read(state);
    const newValue = evaluator.evaluate(normalizeStepAccess(effect.value), ctx);
    parsed.action(state, newValue);
    effects.push({ target: resolvedTarget, old: oldValue, new: newValue });
  }

  // ── Output evaluation ───────────────────────────────────────────────────────
  const finalCtx = makeContext();
  const output = evaluateOutputDefinition(macro.output, evaluator, finalCtx);

  return { params: resolvedParams, output, steps, effects };
}
