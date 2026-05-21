import { createEvaluator } from "../expression/evaluator.js";
import { MacroDisplayTemplateError } from "./errors.js";
import type { MacroDefinition } from "./types.js";
import type { MacroResult } from "./execution.js";

export interface RenderMacroDisplayOptions {
  macro: MacroDefinition;
  result: MacroResult;
  run: {
    id: string;
    createdAt: string;
  };
  documentContext?: {
    document?: string;
    sceneId?: string;
    chapterId?: string;
  };
}

export interface RenderedMacroDisplay {
  format: "markdown";
  title: string;
  body: string;
}

interface TemplateExpression {
  expression: string;
  filters: string[];
}

const SUPPORTED_FILTERS = new Set(["title", "json"]);

export function validateMacroDisplayTemplate(macroId: string, template: string): void {
  if (/\[!claros\]/i.test(template)) {
    throw new MacroDisplayTemplateError(macroId, "template must not contain [!claros]");
  }
  if (/\[claros-run:/i.test(template)) {
    throw new MacroDisplayTemplateError(macroId, "template must not contain [claros-run:");
  }

  validateTemplateTags(macroId, template);
}

export function renderMacroDisplay(options: RenderMacroDisplayOptions): RenderedMacroDisplay {
  const { macro, result, run, documentContext } = options;
  if (macro.display === undefined) {
    return {
      format: "markdown",
      title: displayTitle(macro),
      body: renderFallbackBody(macro, result),
    };
  }

  validateMacroDisplayTemplate(macro.id, macro.display.template);
  return {
    format: "markdown",
    title: macro.display.title?.trim() || displayTitle(macro),
    body: renderTemplate(macro.id, macro.display.template, {
      macro: {
        id: macro.id,
        name: macro.name,
        description: macro.description,
      },
      params: result.params,
      steps: result.steps,
      output: result.output,
      context: {
        document: documentContext?.document,
        sceneId: documentContext?.sceneId,
        chapterId: documentContext?.chapterId,
      },
      run,
    }),
  };
}

function validateTemplateTags(macroId: string, template: string): void {
  const evaluator = createEvaluator();
  const stack: string[] = [];

  for (const match of template.matchAll(/\{\{\s*([\s\S]*?)\s*\}\}/g)) {
    const tag = match[1].trim();
    if (tag.length === 0) {
      throw new MacroDisplayTemplateError(macroId, "empty interpolation expression");
    }

    if (tag.startsWith("#")) {
      if (!tag.startsWith("#if ")) {
        throw new MacroDisplayTemplateError(macroId, `unsupported directive: ${tag}`);
      }
      if (stack.length > 0) {
        throw new MacroDisplayTemplateError(macroId, "nested directives are not supported");
      }
      const expression = tag.slice("#if ".length).trim();
      validateExpression(macroId, expression, evaluator);
      stack.push("if");
      continue;
    }

    if (tag.startsWith("/")) {
      if (tag !== "/if") {
        throw new MacroDisplayTemplateError(macroId, `unsupported closing directive: ${tag}`);
      }
      if (stack.pop() !== "if") {
        throw new MacroDisplayTemplateError(macroId, "unmatched {{/if}} directive");
      }
      continue;
    }

    if (tag === "else") {
      throw new MacroDisplayTemplateError(macroId, "else directives are not supported");
    }

    if (tag.startsWith(">") || tag.startsWith("!")) {
      throw new MacroDisplayTemplateError(macroId, `unsupported directive: ${tag}`);
    }

    const parsed = parseTemplateExpression(macroId, tag);
    validateExpression(macroId, parsed.expression, evaluator);
  }

  if (stack.length > 0) {
    throw new MacroDisplayTemplateError(macroId, "unclosed {{#if}} directive");
  }
}

function validateExpression(
  macroId: string,
  expression: string,
  evaluator: ReturnType<typeof createEvaluator>
): void {
  if (expression.length === 0) {
    throw new MacroDisplayTemplateError(macroId, "empty expression");
  }
  try {
    evaluator.evaluate(normalizeStepAccess(expression), {
      macro: {},
      params: {},
      steps: {},
      output: {},
      context: {},
      run: {},
    });
  } catch (error) {
    throw new MacroDisplayTemplateError(
      macroId,
      `invalid expression "${expression}": ${(error as Error).message}`
    );
  }
}

function renderTemplate(
  macroId: string,
  template: string,
  context: Record<string, unknown>
): string {
  const withConditionals = template.replace(
    /\{\{\s*#if\s+([\s\S]*?)\s*\}\}([\s\S]*?)\{\{\s*\/if\s*\}\}/g,
    (_match, expression: string, body: string) =>
      evaluateBool(macroId, expression, context) ? body : ""
  );

  return withConditionals
    .replace(/\{\{\s*([\s\S]*?)\s*\}\}/g, (_match, expression: string) => {
      const parsed = parseTemplateExpression(macroId, expression.trim());
      return formatTemplateValue(
        evaluateExpression(macroId, parsed.expression, context),
        parsed.filters
      );
    })
    .trimEnd();
}

function evaluateBool(
  macroId: string,
  expression: string,
  context: Record<string, unknown>
): boolean {
  try {
    return createEvaluator().evaluateBool(normalizeStepAccess(expression.trim()), context);
  } catch (error) {
    throw new MacroDisplayTemplateError(
      macroId,
      `failed to evaluate condition "${expression}": ${(error as Error).message}`
    );
  }
}

function evaluateExpression(
  macroId: string,
  expression: string,
  context: Record<string, unknown>
): unknown {
  try {
    return createEvaluator().evaluate(normalizeStepAccess(expression), context);
  } catch (error) {
    throw new MacroDisplayTemplateError(
      macroId,
      `failed to evaluate expression "${expression}": ${(error as Error).message}`
    );
  }
}

function parseTemplateExpression(macroId: string, value: string): TemplateExpression {
  const parts = value
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const [expression, ...filters] = parts;

  if (expression === undefined) {
    throw new MacroDisplayTemplateError(macroId, "empty expression");
  }

  for (const filter of filters) {
    if (!SUPPORTED_FILTERS.has(filter)) {
      throw new MacroDisplayTemplateError(macroId, `unsupported filter: ${filter}`);
    }
  }

  return { expression, filters };
}

function renderFallbackBody(macro: MacroDefinition, result: MacroResult): string {
  const lines: string[] = [];
  const params = summarizeRecord(result.params);
  if (params !== undefined) {
    lines.push(`**Input:** ${params}`);
  }

  const rolls = summarizeRolls(macro, result);
  if (rolls !== undefined) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push(`🎲 ${rolls}`);
  }

  const output = summarizeRecord(result.output);
  if (output !== undefined) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push(output);
  }

  return lines.join("\n");
}

function summarizeRolls(macro: MacroDefinition, result: MacroResult): string | undefined {
  const rolls = macro.steps.flatMap((step) => {
    if (!("roll" in step.body)) {
      return [];
    }
    const roll = result.steps[step.id];
    if (!isRecord(roll)) {
      return [];
    }
    const total = roll.total;
    return [`\`${step.body.roll} -> ${typeof total === "number" ? total : "?"}\``];
  });

  return rolls.length === 0 ? undefined : rolls.join(" · ");
}

function summarizeRecord(record: Record<string, unknown>): string | undefined {
  const entries = Object.entries(record);
  if (entries.length === 0) {
    return undefined;
  }
  return entries
    .map(([key, value]) => `**${humanize(key)}:** ${formatTemplateValue(value, [])}`)
    .join(" · ");
}

function formatTemplateValue(value: unknown, filters: string[]): string {
  let current = value;
  for (const filter of filters) {
    if (filter === "title") {
      current = titleCase(String(current ?? ""));
      continue;
    }
    if (filter === "json") {
      current = JSON.stringify(current);
    }
  }

  if (current === undefined || current === null) {
    return "";
  }
  if (typeof current === "string") {
    return current;
  }
  if (typeof current === "number" || typeof current === "boolean") {
    return String(current);
  }
  return JSON.stringify(current);
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function displayTitle(macro: MacroDefinition): string {
  return macro.name.trim() || macro.id;
}

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (match) => match.toUpperCase());
}

function normalizeStepAccess(expression: string): string {
  return expression.replace(/\bsteps\.([A-Za-z0-9_-]+)/g, (_match, stepId: string) => {
    if (!stepId.includes("-")) {
      return `steps.${stepId}`;
    }
    return `steps["${stepId}"]`;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
