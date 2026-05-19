import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRegistry, fixedRNG, parseMacro } from "@claros/emergence-engine";
import { parseStateFile, stripClarosMarkers } from "@claros/story-format";
import { FileStateAdapter } from "../src/state/adapter.js";
import {
  appendMacroRun,
  appendMacroRunLedgerEntry,
  executeMacroInDocument,
  getMacroRun,
  listMacroRuns,
  readMacroRunLedger,
  renderMacroDisplayBlock,
} from "../src/index.js";

const dirs: string[] = [];

function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claros-test-"));
  fs.mkdirSync(path.join(dir, "manuscript", "01-prologue"), { recursive: true });
  fs.mkdirSync(path.join(dir, "state", "scenes", "01-prologue"), { recursive: true });
  fs.mkdirSync(path.join(dir, "state", "chapters"), { recursive: true });
  fs.writeFileSync(path.join(dir, "manuscript", "01-prologue", "01-opening.md"), "# Opening\n");
  dirs.push(dir);
  return dir;
}

function createTestRegistry() {
  const registry = createRegistry();
  registry.registerMacro(
    parseMacro(`
id: test.document-context
name: "Document Context"
params:
  question:
    type: string
    source: user
steps:
  - id: fate-roll
    roll: 1d100
effects:
  - set: state.scenes[scene_id].mythic.chaos_factor
    value: "6"
  - set: state.chapters[chapter_id].status.current
    value: '"active"'
output:
  answer: '"yes"'
  question: "params.question"
`)
  );
  return registry;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("executeMacroInDocument", () => {
  it("executes a macro with document-derived scene/chapter context", async () => {
    const root = makeProject();
    const adapter = new FileStateAdapter({ projectRoot: root });
    adapter.setScene("01-prologue/01-opening", "mythic.chaos_factor", 5);

    const result = await executeMacroInDocument({
      projectRoot: root,
      registry: createTestRegistry(),
      macroId: "test.document-context",
      documentPath: "manuscript/01-prologue/01-opening.md",
      params: { question: "Does the priest recognize the blade?" },
      rng: fixedRNG(42),
    });

    const reloaded = new FileStateAdapter({ projectRoot: root });
    expect(reloaded.getScene("01-prologue/01-opening", "mythic.chaos_factor")).toBe(6);
    expect(reloaded.getChapter("01-prologue", "status.current")).toBe("active");
    expect(result.run.sceneId).toBe("01-prologue/01-opening");
    expect(result.run.chapterId).toBe("01-prologue");
  });

  it("appends a ledger entry to state/runs/emergence.yaml", async () => {
    const root = makeProject();

    const result = await executeMacroInDocument({
      projectRoot: root,
      registry: createTestRegistry(),
      macroId: "test.document-context",
      documentPath: "manuscript/01-prologue/01-opening.md",
      params: { question: "Will this work?" },
    });

    const ledgerPath = path.join(root, "state", "runs", "emergence.yaml");
    expect(fs.existsSync(ledgerPath)).toBe(true);

    const parsed = parseStateFile(fs.readFileSync(ledgerPath, "utf-8")).data as {
      runs?: Array<Record<string, unknown>>;
    };
    expect(parsed.runs).toHaveLength(1);
    expect(parsed.runs?.[0]).toMatchObject({
      id: result.run.id,
      macro: "test.document-context",
      document: "manuscript/01-prologue/01-opening.md",
    });
    expect(parsed.runs?.[0]?.display).toMatchObject({
      format: "markdown",
      block: expect.stringContaining(`[claros-run: ${result.run.id}]`),
    });
  });

  it("run IDs are zero-padded monotonic sequence numbers", async () => {
    const root = makeProject();

    const created = await Promise.all([
      appendMacroRun(root, {
        macro: "test.macro",
        document: "notes/session.md",
        params: {},
        rolls: [],
        output: {},
      }),
      appendMacroRun(root, {
        macro: "test.macro",
        document: "notes/session.md",
        params: {},
        rolls: [],
        output: {},
      }),
      appendMacroRun(root, {
        macro: "test.macro",
        document: "notes/session.md",
        params: {},
        rolls: [],
        output: {},
      }),
    ]);

    expect(created.map((entry) => entry.id)).toEqual(["00001", "00002", "00003"]);
  });

  it("generated display block includes [claros-run: <id>]", () => {
    const macro = parseMacro(`
id: test.macro
name: "Test Macro"
params: {}
steps: []
effects: []
output:
  answer: '"yes"'
`);

    const block = renderMacroDisplayBlock(
      macro,
      { params: {}, output: { answer: "yes" }, steps: {}, effects: [] },
      "00042"
    );

    expect(block).toContain("[claros-run: 00042]");
  });

  it("does not mutate the document unless insertAt is provided", async () => {
    const root = makeProject();
    const documentPath = path.join(root, "manuscript", "01-prologue", "01-opening.md");
    const before = fs.readFileSync(documentPath, "utf-8");

    const result = await executeMacroInDocument({
      projectRoot: root,
      registry: createTestRegistry(),
      macroId: "test.document-context",
      documentPath: "manuscript/01-prologue/01-opening.md",
      params: { question: "No insertion by default?" },
    });

    expect(fs.readFileSync(documentPath, "utf-8")).toBe(before);
    expect(result.document).toBeUndefined();
    expect(result.block).toBeUndefined();
  });

  it("inserted block remains plain Markdown blockquote when insertAt is explicit", async () => {
    const root = makeProject();

    const result = await executeMacroInDocument({
      projectRoot: root,
      registry: createTestRegistry(),
      macroId: "test.document-context",
      documentPath: "manuscript/01-prologue/01-opening.md",
      params: { question: "Does it insert?" },
      insertAt: { kind: "end-of-document" },
    });
    expect(result.document).toBeDefined();
    expect(result.block).toBeDefined();

    const content = fs.readFileSync(
      path.join(root, "manuscript", "01-prologue", "01-opening.md"),
      "utf-8"
    );
    const inserted = content
      .split("\n")
      .filter(
        (line) => line.includes("[!claros]") || line.includes("[claros-run:") || line.includes("🎲")
      );

    expect(inserted.length).toBeGreaterThan(0);
    expect(inserted.every((line) => line.startsWith(">"))).toBe(true);
  });

  it("user edits to a block do not invalidate ledger read APIs", async () => {
    const root = makeProject();

    const result = await executeMacroInDocument({
      projectRoot: root,
      registry: createTestRegistry(),
      macroId: "test.document-context",
      documentPath: "manuscript/01-prologue/01-opening.md",
      params: { question: "Can I edit this?" },
      insertAt: { kind: "end-of-document" },
    });

    const documentPath = path.join(root, "manuscript", "01-prologue", "01-opening.md");
    const edited = fs.readFileSync(documentPath, "utf-8").replace("**Question:**", "**Prompt:**");
    fs.writeFileSync(documentPath, edited);

    const stored = await getMacroRun(root, result.run.id);
    expect(stored?.id).toBe(result.run.id);
    expect(stored?.document).toBe("manuscript/01-prologue/01-opening.md");
  });

  it("ledger append uses atomic write adapter path", () => {
    const root = makeProject();
    const adapter = new FileStateAdapter({ projectRoot: root });
    const atomicSpy = vi.spyOn(adapter, "writeFileAtomic");

    appendMacroRunLedgerEntry(adapter, {
      macro: "test.macro",
      document: "notes/session.md",
      params: {},
      rolls: [],
      output: {},
    });

    expect(atomicSpy).toHaveBeenCalledTimes(1);
    expect(atomicSpy.mock.calls[0][0]).toContain(path.join("state", "runs", "emergence.yaml"));
  });

  it("effects.target stores resolved strings with scene_id substituted", async () => {
    const root = makeProject();

    const result = await executeMacroInDocument({
      projectRoot: root,
      registry: createTestRegistry(),
      macroId: "test.document-context",
      documentPath: "manuscript/01-prologue/01-opening.md",
      params: { question: "Where does this land?" },
    });

    expect(result.run.effects?.[0]).toMatchObject({
      target: 'state.scenes["01-prologue/01-opening"].mythic.chaos_factor',
      new: 6,
    });
  });

  it("list/get APIs still work after user-edited blocks and support filtering", async () => {
    const root = makeProject();

    const result = await executeMacroInDocument({
      projectRoot: root,
      registry: createTestRegistry(),
      macroId: "test.document-context",
      documentPath: "manuscript/01-prologue/01-opening.md",
      params: { question: "Filter me?" },
    });

    const allRuns = await listMacroRuns(root, {
      document: "manuscript/01-prologue/01-opening.md",
      macroId: "test.document-context",
      sceneId: "01-prologue/01-opening",
      chapterId: "01-prologue",
      since: "2026-01-01T00:00:00.000Z",
      limit: 10,
    });

    expect(allRuns).toHaveLength(1);
    expect(allRuns[0].id).toBe(result.run.id);
  });

  it("preserves monotonic IDs when emergence.yaml already has entries", () => {
    const root = makeProject();
    const adapter = new FileStateAdapter({ projectRoot: root });

    fs.mkdirSync(path.join(root, "state", "runs"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "state", "runs", "emergence.yaml"),
      [
        "runs:",
        '  - id: "00009"',
        '    created_at: "2026-01-01T00:00:00.000Z"',
        '    macro: "test.old"',
        '    document: "notes/old.md"',
        "    params: {}",
        "    rolls: []",
        "    output: {}",
      ].join("\n")
    );

    const entry = appendMacroRunLedgerEntry(adapter, {
      macro: "test.new",
      document: "notes/new.md",
      params: {},
      rolls: [],
      output: {},
    });

    expect(entry.id).toBe("00010");
  });

  it("preserves top-level YAML sequence ledgers when appending (ADR-027 compatibility)", () => {
    const root = makeProject();
    const adapter = new FileStateAdapter({ projectRoot: root });
    const ledgerPath = path.join(root, "state", "runs", "emergence.yaml");

    fs.mkdirSync(path.join(root, "state", "runs"), { recursive: true });
    fs.writeFileSync(
      ledgerPath,
      [
        '- id: "00009"',
        '  created_at: "2026-01-01T00:00:00.000Z"',
        '  macro: "test.old"',
        '  document: "notes/old.md"',
        "  params: {}",
        "  rolls: []",
        "  output: {}",
      ].join("\n")
    );

    const entry = appendMacroRunLedgerEntry(adapter, {
      macro: "test.new",
      document: "notes/new.md",
      params: {},
      rolls: [],
      output: {},
    });

    expect(entry.id).toBe("00010");
    const written = fs.readFileSync(ledgerPath, "utf-8");
    expect(written.trimStart().startsWith("- id:")).toBe(true);
    expect(written).not.toContain("runs:");
    expect(written).toContain("00010");
    expect(written).toContain("macro: test.new");
    expect(written).toContain("document: notes/new.md");
  });

  it("exporter helper can strip [!claros] and [claros-run: ...] markers", async () => {
    const root = makeProject();

    const result = await executeMacroInDocument({
      projectRoot: root,
      registry: createTestRegistry(),
      macroId: "test.document-context",
      documentPath: "manuscript/01-prologue/01-opening.md",
      params: { question: "Can this export cleanly?" },
      rng: fixedRNG(42),
    });

    expect(stripClarosMarkers(result.run.display?.block ?? "")).not.toContain("[!claros]");
    expect(stripClarosMarkers(result.run.display?.block ?? "")).not.toContain("[claros-run:");
  });

  it("readMacroRunLedger remains compatible with the adapter surface", async () => {
    const root = makeProject();

    const result = await executeMacroInDocument({
      projectRoot: root,
      registry: createTestRegistry(),
      macroId: "test.document-context",
      documentPath: "manuscript/01-prologue/01-opening.md",
      params: { question: "Adapter compatible?" },
    });

    const runs = readMacroRunLedger(new FileStateAdapter({ projectRoot: root }), {
      document: "manuscript/01-prologue/01-opening.md",
    });

    expect(runs[0].id).toBe(result.run.id);
  });
});
