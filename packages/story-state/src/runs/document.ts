import * as path from "node:path";
import {
  executeMacro,
  renderMacroDisplay,
  type RenderedMacroDisplay,
} from "@claros/emergence-engine";
import type {
  MacroDefinition,
  MacroResult,
  ParamDefinition,
  UserPromptFn,
} from "@claros/emergence-engine";
import {
  extractClarosBlocks,
  parseMarkdownDocument,
  type ClarosBlockRef,
  type ProjectFileReader,
  type ProjectFileWriter,
} from "@claros/story-format";
import { appendMacroRunLedgerEntry, nextMacroRunId } from "./ledger.js";
import {
  NodeProjectFileReader,
  NodeProjectFileWriter,
  ensureParentDirectory,
} from "../project/files.js";
import { FileStateAdapter } from "../state/adapter.js";
import type {
  DocumentInsertionPoint,
  ExecuteMacroInDocumentOptions,
  ExecuteMacroInDocumentResult,
  MacroRunRoll,
} from "./types.js";

export type { UserPromptFn } from "@claros/emergence-engine";

export async function executeMacroInDocument(
  options: ExecuteMacroInDocumentOptions
): Promise<ExecuteMacroInDocumentResult> {
  const macro = options.registry.getMacro(options.macroId);
  if (macro === undefined) {
    throw new Error(`macro not found in registry: ${options.macroId}`);
  }

  const normalizedDocumentPath = normalizeDocumentPath(options.projectRoot, options.documentPath);
  const invocationContext = deriveDocumentContext(normalizedDocumentPath);
  const adapter = new FileStateAdapter({ projectRoot: options.projectRoot });
  const createdAt = (options.now ?? new Date()).toISOString();
  const runId = nextMacroRunId(adapter);
  const macroResult = await executeMacro(
    macro,
    options.params ?? {},
    options.registry,
    adapter,
    invocationContext,
    options.rng,
    adaptUserPrompt(options.userPrompt)
  );

  const renderedDisplay = renderMacroDisplay({
    macro,
    result: macroResult,
    run: { id: runId, createdAt },
    documentContext: {
      document: normalizedDocumentPath,
      sceneId: invocationContext.sceneId,
      chapterId: invocationContext.chapterId,
    },
  });
  const finalBlock = renderClarosBlock(renderedDisplay, runId);

  const run = appendMacroRunLedgerEntry(
    adapter,
    {
      id: runId,
      macro: macro.id,
      document: normalizedDocumentPath,
      sceneId: invocationContext.sceneId,
      chapterId: invocationContext.chapterId,
      params: macroResult.params,
      rolls: extractMacroRolls(macro, macroResult),
      output: macroResult.output,
      display: { format: "markdown", block: finalBlock },
      effects: macroResult.effects,
    },
    createdAt
  );
  const inserted =
    options.insertAt === undefined
      ? undefined
      : await writeDisplayBlock(
          options.projectRoot,
          normalizedDocumentPath,
          finalBlock,
          options.insertAt,
          options.fileReader,
          options.fileWriter
        );

  return {
    run,
    ...(inserted === undefined
      ? {}
      : {
          document: parseMarkdownDocument(normalizedDocumentPath, inserted.content),
          block: inserted.block,
        }),
    macroResult,
  };
}

export function renderMacroDisplayBlock(
  macro: MacroDefinition,
  result: MacroResult,
  runId: string
): string {
  const renderedDisplay = renderMacroDisplay({
    macro,
    result,
    run: { id: runId, createdAt: new Date(0).toISOString() },
  });
  return renderClarosBlock(renderedDisplay, runId);
}

export function renderClarosBlock(display: RenderedMacroDisplay, runId: string): string {
  const lines = [`> [!claros] ${display.title}`];
  if (display.body.trim().length > 0) {
    lines.push(...display.body.split(/\r?\n/).map((line) => `> ${line}`.trimEnd()));
  }
  lines.push(">");
  lines.push(`> [claros-run: ${runId}]`);
  return lines.join("\n");
}

async function writeDisplayBlock(
  projectRoot: string,
  documentPath: string,
  block: string,
  insertionPoint: DocumentInsertionPoint,
  fileReader?: ProjectFileReader,
  fileWriter?: ProjectFileWriter
): Promise<{ content: string; block: ClarosBlockRef | undefined }> {
  const absolutePath = path.join(projectRoot, documentPath);
  const reader = fileReader ?? new NodeProjectFileReader();
  const existing = await readExistingDocument(absolutePath, reader);
  const nextContent = insertBlock(existing, block, insertionPoint);
  const writer = fileWriter ?? new NodeProjectFileWriter();
  await ensureParentDirectory(absolutePath, writer);
  await writer.writeFileAtomic(absolutePath, nextContent);

  const insertedBlock = extractClarosBlocks(documentPath, nextContent).find(
    (candidate) => candidate.runId === extractRunId(block)
  );

  return { content: nextContent, block: insertedBlock };
}

async function readExistingDocument(
  absolutePath: string,
  fileReader: ProjectFileReader
): Promise<string> {
  const stat = await fileReader.stat(absolutePath);
  if (!stat.exists || stat.isDirectory) {
    return "";
  }

  return fileReader.readFile(absolutePath);
}

function insertBlock(
  content: string,
  block: string,
  insertionPoint: DocumentInsertionPoint
): string {
  if (insertionPoint.kind === "replace-range") {
    const start = clampOffset(insertionPoint.start, content.length);
    const end = clampOffset(insertionPoint.end, content.length);
    return joinWithSpacing(content.slice(0, start), block, content.slice(end));
  }

  const offset = resolveInsertionOffset(content, insertionPoint);
  return joinWithSpacing(content.slice(0, offset), block, content.slice(offset));
}

function resolveInsertionOffset(
  content: string,
  insertionPoint: Exclude<DocumentInsertionPoint, { kind: "replace-range" }>
): number {
  switch (insertionPoint.kind) {
    case "offset":
      return clampOffset(insertionPoint.offset, content.length);
    case "end-of-document":
      return content.length;
    case "after-block":
      return findBlockEndOffset(content, insertionPoint.blockOffset);
  }
}

function findBlockEndOffset(content: string, blockOffset: number): number {
  const start = clampOffset(blockOffset, content.length);
  const trailing = content.slice(start);
  const lines = trailing.split(/(?<=\n)/);
  let offset = start;
  let inBlock = false;

  for (const line of lines) {
    const bare = line.endsWith("\n") ? line.slice(0, -1) : line;
    if (/^\s*>/.test(bare)) {
      inBlock = true;
      offset += line.length;
      continue;
    }
    if (inBlock) {
      break;
    }
    if (bare.trim().length === 0) {
      offset += line.length;
      continue;
    }
    break;
  }

  return offset;
}

function joinWithSpacing(prefix: string, block: string, suffix: string): string {
  const before = prefix.length === 0 || prefix.endsWith("\n") ? "" : "\n\n";
  const after = suffix.length === 0 || suffix.startsWith("\n") ? "" : "\n\n";
  return `${prefix}${before}${block}${after}${suffix}`;
}

function normalizeDocumentPath(projectRoot: string, documentPath: string): string {
  const absolutePath = path.isAbsolute(documentPath)
    ? documentPath
    : path.join(projectRoot, documentPath);
  return path.relative(projectRoot, absolutePath).replace(/\\/g, "/");
}

function deriveDocumentContext(documentPath: string): { sceneId?: string; chapterId?: string } {
  const sceneMatch = /^manuscript\/([^/]+)\/([^/]+)\.md$/i.exec(documentPath);
  if (sceneMatch === null) {
    return {};
  }

  return {
    chapterId: sceneMatch[1],
    sceneId: `${sceneMatch[1]}/${sceneMatch[2]}`,
  };
}

function adaptUserPrompt(userPrompt?: UserPromptFn) {
  if (userPrompt === undefined) {
    return undefined;
  }
  return async (param: ParamDefinition, name: string) => {
    return userPrompt(param, name);
  };
}

function extractMacroRolls(macro: MacroDefinition, result: MacroResult): MacroRunRoll[] {
  return macro.steps.flatMap((step) => {
    if (!("roll" in step.body)) {
      return [];
    }
    const rollResult = result.steps[step.id];
    if (!isRollResult(rollResult)) {
      return [];
    }
    return [
      {
        notation: step.body.roll,
        total: rollResult.total,
        values: [...rollResult.rolls],
        kept: [...rollResult.kept],
        label: step.id,
      },
    ];
  });
}

function isRollResult(value: unknown): value is { total: number; rolls: number[]; kept: number[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { total?: unknown }).total === "number" &&
    Array.isArray((value as { rolls?: unknown }).rolls) &&
    Array.isArray((value as { kept?: unknown }).kept)
  );
}

function clampOffset(offset: number, length: number): number {
  return Math.max(0, Math.min(offset, length));
}

function extractRunId(block: string): string | undefined {
  return /\[claros-run:\s*([A-Za-z0-9_-]+)\]/i.exec(block)?.[1];
}
