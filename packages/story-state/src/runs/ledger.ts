import * as path from "node:path";
import { dump, load } from "js-yaml";
import { parseStateFile, serializeStateFile } from "@claros/story-format";
import { FileStateAdapter } from "../state/adapter.js";
import type {
  MacroRunDisplay,
  MacroRunEffect,
  MacroRunFilter,
  MacroRunLedgerEntry,
  MacroRunLedgerEntryInput,
  MacroRunRoll,
} from "./types.js";

const LEDGER_RELATIVE_PATH = path.join("state", "runs", "emergence.yaml");

type LedgerFormat = "wrapped-runs" | "top-level-sequence";

interface RawLedgerFile {
  runs?: unknown;
}

interface RawLedgerEntry {
  id?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
  macro?: unknown;
  document?: unknown;
  sceneId?: unknown;
  scene_id?: unknown;
  chapterId?: unknown;
  chapter_id?: unknown;
  params?: unknown;
  rolls?: unknown;
  output?: unknown;
  display?: unknown;
  effects?: unknown;
}

export async function appendMacroRun(
  projectRoot: string,
  entry: MacroRunLedgerEntryInput,
  createdAt = new Date().toISOString()
): Promise<MacroRunLedgerEntry> {
  return appendMacroRunLedgerEntry(new FileStateAdapter({ projectRoot }), entry, createdAt);
}

export async function listMacroRuns(
  projectRoot: string,
  filter?: MacroRunFilter
): Promise<MacroRunLedgerEntry[]> {
  return readMacroRunLedger(new FileStateAdapter({ projectRoot }), filter);
}

export async function getMacroRun(
  projectRoot: string,
  id: string
): Promise<MacroRunLedgerEntry | undefined> {
  return readMacroRunLedger(new FileStateAdapter({ projectRoot })).find((entry) => entry.id === id);
}

export function appendMacroRunLedgerEntry(
  adapter: FileStateAdapter,
  entry: MacroRunLedgerEntryInput,
  createdAt = new Date().toISOString()
): MacroRunLedgerEntry {
  const ledger = readLedgerWithFormat(adapter);
  const existing = ledger.entries;
  const nextEntry: MacroRunLedgerEntry = {
    id: entry.id ?? nextMacroRunId(adapter),
    createdAt,
    macro: entry.macro,
    document: entry.document,
    sceneId: entry.sceneId,
    chapterId: entry.chapterId,
    params: entry.params,
    rolls: entry.rolls,
    output: entry.output,
    display: entry.display,
    effects: entry.effects,
  };

  writeLedger(adapter, [...existing, nextEntry], ledger.format);
  return nextEntry;
}

export function nextMacroRunId(adapter: FileStateAdapter): string {
  return formatRunId(maxRunNumber(readLedger(adapter)) + 1);
}

export function setMacroRunDisplay(
  adapter: FileStateAdapter,
  id: string,
  display: MacroRunDisplay
): MacroRunLedgerEntry | undefined {
  const ledger = readLedgerWithFormat(adapter);
  const index = ledger.entries.findIndex((entry) => entry.id === id);
  if (index < 0) {
    return undefined;
  }

  const updated: MacroRunLedgerEntry = {
    ...ledger.entries[index],
    display,
  };
  const next = [...ledger.entries];
  next[index] = updated;

  writeLedger(adapter, next, ledger.format);
  return updated;
}

export function readMacroRunLedger(
  adapter: FileStateAdapter,
  filter?: MacroRunFilter
): MacroRunLedgerEntry[] {
  const runs = readLedger(adapter);
  const sinceMs = filter?.since === undefined ? undefined : Date.parse(filter.since);

  let filtered = runs.filter((entry) => {
    if (filter?.document !== undefined && entry.document !== filter.document) {
      return false;
    }
    if (filter?.macroId !== undefined && entry.macro !== filter.macroId) {
      return false;
    }
    if (filter?.sceneId !== undefined && entry.sceneId !== filter.sceneId) {
      return false;
    }
    if (filter?.chapterId !== undefined && entry.chapterId !== filter.chapterId) {
      return false;
    }
    if (sinceMs !== undefined && !Number.isNaN(sinceMs)) {
      const createdAtMs = Date.parse(entry.createdAt);
      if (Number.isNaN(createdAtMs) || createdAtMs < sinceMs) {
        return false;
      }
    }
    return true;
  });

  if (filter?.limit !== undefined) {
    filtered = filtered.slice(-filter.limit);
  }

  return filtered;
}

function ledgerPath(adapter: FileStateAdapter): string {
  return path.join(adapter.getProjectRoot(), LEDGER_RELATIVE_PATH);
}

function readLedger(adapter: FileStateAdapter): MacroRunLedgerEntry[] {
  return readLedgerWithFormat(adapter).entries;
}

function readLedgerWithFormat(adapter: FileStateAdapter): {
  entries: MacroRunLedgerEntry[];
  format: LedgerFormat;
} {
  const raw = adapter.readTextFile(ledgerPath(adapter));
  if (raw === undefined) {
    return { entries: [], format: "wrapped-runs" };
  }

  const loaded = load(raw);
  if (Array.isArray(loaded)) {
    return {
      entries: loaded.flatMap((entry) => {
        const normalized = normalizeEntry(entry);
        return normalized === undefined ? [] : [normalized];
      }),
      format: "top-level-sequence",
    };
  }

  const parsed = parseStateFile(raw).data as RawLedgerFile;
  if (!Array.isArray(parsed.runs)) {
    return { entries: [], format: "wrapped-runs" };
  }

  return {
    entries: parsed.runs.flatMap((entry) => {
      const normalized = normalizeEntry(entry);
      return normalized === undefined ? [] : [normalized];
    }),
    format: "wrapped-runs",
  };
}

function writeLedger(
  adapter: FileStateAdapter,
  entries: MacroRunLedgerEntry[],
  format: LedgerFormat
): void {
  const serializedEntries = entries.map((entry) => ({
    id: entry.id,
    created_at: entry.createdAt,
    macro: entry.macro,
    ...(entry.document === undefined ? {} : { document: entry.document }),
    ...(entry.sceneId === undefined ? {} : { scene_id: entry.sceneId }),
    ...(entry.chapterId === undefined ? {} : { chapter_id: entry.chapterId }),
    params: entry.params,
    rolls: entry.rolls,
    output: entry.output,
    ...(entry.display === undefined ? {} : { display: entry.display }),
    ...(entry.effects === undefined ? {} : { effects: entry.effects }),
  }));

  adapter.writeFileAtomic(
    ledgerPath(adapter),
    format === "top-level-sequence"
      ? dump(serializedEntries, { lineWidth: -1 })
      : serializeStateFile({
          data: {
            runs: serializedEntries,
          },
        })
  );
}

function normalizeEntry(raw: unknown): MacroRunLedgerEntry | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  const entry = raw as RawLedgerEntry;
  const createdAt = entry.createdAt ?? entry.created_at;
  if (
    typeof entry.id !== "string" ||
    typeof createdAt !== "string" ||
    typeof entry.macro !== "string"
  ) {
    return undefined;
  }

  return {
    id: entry.id,
    createdAt,
    macro: entry.macro,
    document: typeof entry.document === "string" ? entry.document : undefined,
    sceneId:
      typeof (entry.sceneId ?? entry.scene_id) === "string"
        ? String(entry.sceneId ?? entry.scene_id)
        : undefined,
    chapterId:
      typeof (entry.chapterId ?? entry.chapter_id) === "string"
        ? String(entry.chapterId ?? entry.chapter_id)
        : undefined,
    params: isRecord(entry.params) ? entry.params : {},
    rolls: normalizeRolls(entry.rolls),
    output: isRecord(entry.output) ? entry.output : {},
    display: normalizeDisplay(entry.display),
    effects: normalizeEffects(entry.effects),
  };
}

function normalizeRolls(value: unknown): MacroRunRoll[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((roll) => {
    if (!isRecord(roll) || typeof roll.notation !== "string") {
      return [];
    }
    return [
      {
        notation: roll.notation,
        total: typeof roll.total === "number" ? roll.total : undefined,
        values: Array.isArray(roll.values)
          ? roll.values.filter((item): item is number => typeof item === "number")
          : undefined,
        kept: Array.isArray(roll.kept)
          ? roll.kept.filter((item): item is number => typeof item === "number")
          : undefined,
        label: typeof roll.label === "string" ? roll.label : undefined,
      },
    ];
  });
}

function normalizeDisplay(value: unknown): MacroRunDisplay | undefined {
  if (!isRecord(value) || value.format !== "markdown" || typeof value.block !== "string") {
    return undefined;
  }
  return { format: "markdown", block: value.block };
}

function normalizeEffects(value: unknown): MacroRunEffect[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const effects = value.flatMap((effect) => {
    if (!isRecord(effect) || typeof effect.target !== "string") {
      return [];
    }
    return [
      {
        target: effect.target,
        ...(Object.prototype.hasOwnProperty.call(effect, "old") ? { old: effect.old } : {}),
        ...(Object.prototype.hasOwnProperty.call(effect, "new") ? { new: effect.new } : {}),
      },
    ];
  });

  return effects.length > 0 ? effects : undefined;
}

function maxRunNumber(entries: MacroRunLedgerEntry[]): number {
  return entries.reduce((max, entry) => Math.max(max, parseRunId(entry.id)), 0);
}

function parseRunId(id: string): number {
  return /^\d{5}$/.test(id) ? Number.parseInt(id, 10) : 0;
}

function formatRunId(value: number): string {
  return String(value).padStart(5, "0");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
