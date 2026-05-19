import type { MacroResult, ModuleRegistry, RNG, UserPromptFn } from "@claros/emergence-engine";
import type { ClarosBlockRef, MarkdownDocument, ProjectFileWriter } from "@claros/story-format";

export type { SourceRange } from "@claros/story-format";
export type { UserPromptFn } from "@claros/emergence-engine";

export type DocumentInsertionPoint =
  | { kind: "offset"; offset: number }
  | { kind: "end-of-document" }
  | { kind: "after-block"; blockOffset: number }
  | { kind: "replace-range"; start: number; end: number };

export interface MacroRunFilter {
  document?: string;
  macroId?: string;
  sceneId?: string;
  chapterId?: string;
  since?: string;
  limit?: number;
}

export interface MacroRunRoll {
  notation: string;
  total?: number;
  values?: number[];
  kept?: number[];
  label?: string;
}

export interface MacroRunDisplay {
  format: "markdown";
  block: string;
}

export interface MacroRunEffect {
  target: string;
  old?: unknown;
  new?: unknown;
}

export interface MacroRunLedgerEntry {
  id: string;
  createdAt: string;
  macro: string;
  document?: string;
  sceneId?: string;
  chapterId?: string;
  params: Record<string, unknown>;
  rolls: MacroRunRoll[];
  output: Record<string, unknown>;
  display?: MacroRunDisplay;
  effects?: MacroRunEffect[];
}

export interface MacroRunLedgerEntryInput {
  macro: string;
  document?: string;
  sceneId?: string;
  chapterId?: string;
  params: Record<string, unknown>;
  rolls: MacroRunRoll[];
  output: Record<string, unknown>;
  display?: MacroRunDisplay;
  effects?: MacroRunEffect[];
}

export interface ExecuteMacroInDocumentOptions {
  projectRoot: string;
  registry: ModuleRegistry;
  macroId: string;
  documentPath: string;
  params?: Record<string, unknown>;
  insertAt?: DocumentInsertionPoint;
  rng?: RNG;
  userPrompt?: UserPromptFn;
  now?: Date;
  fileWriter?: ProjectFileWriter;
}

export interface ExecuteMacroInDocumentResult {
  run: MacroRunLedgerEntry;
  document?: MarkdownDocument;
  block?: ClarosBlockRef;
  macroResult: MacroResult;
}
