import { describe, expect, it } from "vitest";
import {
  createInMemoryProjectIndex,
  type MacroRunLedgerEntry,
  type ProjectIndexDocumentRef,
} from "../src/index.js";
import {
  extractClarosBlocks,
  extractWikilinks,
  parseMarkdownDocument,
  type ChapterRef,
  type NoteRef,
  type ProjectFormatSnapshot,
  type SceneRef,
} from "@claros/story-format";

interface Fixture {
  snapshot: ProjectFormatSnapshot;
  raws: Record<string, string>;
  runs: MacroRunLedgerEntry[];
}

function fixture(): Fixture {
  const chapterOne: ChapterRef = {
    kind: "chapter",
    id: "01-prologue",
    path: "manuscript/01-prologue",
    sequence: 1,
    slug: "prologue",
    title: "Prologue",
    metadata: {},
  };
  const chapterTwo: ChapterRef = {
    kind: "chapter",
    id: "02-journey",
    path: "manuscript/02-journey",
    sequence: 2,
    slug: "journey",
    title: "Journey",
    metadata: {},
  };

  const raws: Record<string, string> = {
    "manuscript/01-prologue/02-arrival.md": [
      "---",
      "title: Arrival",
      "---",
      "",
      "Meet [[Ancient Ruin]].",
      "See [[notes/places/sunken-city.md|city]].",
    ].join("\n"),
    "manuscript/01-prologue/01-opening.md": [
      "---",
      "title: Opening",
      "---",
      "",
      "Start at [[sunken-city]].",
      "> [!claros] Oracle",
      "> Result: yes",
      "> [claros-run: 00001]",
    ].join("\n"),
    "manuscript/02-journey/01-road.md": [
      "---",
      "title: Road",
      "---",
      "",
      "Road to [[Ancient Ruin|the ruin]].",
    ].join("\n"),
    "notes/places/ancient-ruin.md": [
      "---",
      "title: Ancient Ruin",
      "aliases:",
      "  - old temple",
      "tags:",
      "  - lore",
      "  - ruin",
      "type: place",
      "mythic:",
      "  status: active",
      "osr:",
      "  hp:",
      "    current: 12",
      "---",
      "",
      "The ruin references [[old temple]].",
    ].join("\n"),
    "notes/places/sunken-city.md": [
      "---",
      "title: Sunken City",
      "aliases:",
      "  - drowned city",
      "tags:",
      "  - lore",
      "type: place",
      "---",
      "",
      "Connected to [[Ancient Ruin]].",
    ].join("\n"),
    "notes/characters/kareth.md": ["# Kareth", "See [[Ancient Ruin]]."].join("\n"),
  };

  const scenes: SceneRef[] = [
    toScene("manuscript/01-prologue/02-arrival.md", raws["manuscript/01-prologue/02-arrival.md"]),
    toScene("manuscript/01-prologue/01-opening.md", raws["manuscript/01-prologue/01-opening.md"]),
    toScene("manuscript/02-journey/01-road.md", raws["manuscript/02-journey/01-road.md"]),
  ];

  const notes: NoteRef[] = [
    toNote("notes/places/ancient-ruin.md", raws["notes/places/ancient-ruin.md"]),
    toNote("notes/characters/kareth.md", raws["notes/characters/kareth.md"]),
    toNote("notes/places/sunken-city.md", raws["notes/places/sunken-city.md"]),
  ];

  const markdownPaths = Object.keys(raws);
  const wikilinks = markdownPaths.flatMap((path) => extractWikilinks(path, raws[path]));
  const clarosBlocks = markdownPaths.flatMap((path) => extractClarosBlocks(path, raws[path]));

  const runs: MacroRunLedgerEntry[] = [
    {
      id: "00001",
      createdAt: "2026-05-01T10:00:00.000Z",
      macro: "oracle.check",
      document: "manuscript/01-prologue/01-opening.md",
      sceneId: "01-prologue/01-opening",
      chapterId: "01-prologue",
      params: { question: "Will it work?" },
      rolls: [{ notation: "1d100", total: 42 }],
      output: { answer: "yes" },
    },
    {
      id: "00002",
      createdAt: "2026-05-01T11:00:00.000Z",
      macro: "oracle.event",
      document: "manuscript/02-journey/01-road.md",
      sceneId: "02-journey/01-road",
      chapterId: "02-journey",
      params: {},
      rolls: [{ notation: "1d100", total: 14 }],
      output: { event: "betrayal" },
    },
  ];

  return {
    snapshot: {
      root: "/tmp/project",
      manifest: {
        title: "Test",
        subtitle: "A test chronicle",
        modules: ["mythic-gme-2e"],
      },
      chapters: [chapterTwo, chapterOne],
      scenes,
      notes,
      wikilinks,
      clarosBlocks,
    },
    raws,
    runs,
  };
}

function toScene(path: string, raw: string): SceneRef {
  const parts = path.split("/");
  const chapterId = parts[1];
  const stem = parts[2].replace(/\.md$/i, "");
  const [sequenceRaw, ...slugParts] = stem.split("-");
  const parsed = parseMarkdownDocument(path, raw);
  const frontmatter = (parsed.frontmatter ?? {}) as { title?: string };

  return {
    kind: "scene",
    id: `${chapterId}/${stem}`,
    path,
    chapterId,
    sequence: Number.parseInt(sequenceRaw, 10),
    slug: slugParts.join("-"),
    title: typeof frontmatter.title === "string" ? frontmatter.title : undefined,
    frontmatter,
  };
}

function toNote(path: string, raw: string): NoteRef {
  const parsed = parseMarkdownDocument(path, raw);
  const frontmatter = (parsed.frontmatter ?? {}) as {
    title?: string;
    aliases?: string[];
    tags?: string[];
  };

  return {
    kind: "note",
    path,
    slug: path.split("/").at(-1)?.replace(/\.md$/i, "") ?? path,
    title: typeof frontmatter.title === "string" ? frontmatter.title : undefined,
    aliases: Array.isArray(frontmatter.aliases) ? frontmatter.aliases : [],
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
    frontmatter,
  };
}

function ref(path: string): ProjectIndexDocumentRef {
  return { path };
}

describe("InMemoryProjectIndex", () => {
  it("builds from snapshot with chapter/scene ordering and recursive notes", () => {
    const { snapshot } = fixture();
    const index = createInMemoryProjectIndex();

    index.build(snapshot);

    expect(index.getManifestSummary()).toEqual(snapshot.manifest);
    expect(index.listChapters().map((chapter) => chapter.id)).toEqual([
      "01-prologue",
      "02-journey",
    ]);
    expect(index.listScenes().map((scene) => scene.path)).toEqual([
      "manuscript/01-prologue/01-opening.md",
      "manuscript/01-prologue/02-arrival.md",
      "manuscript/02-journey/01-road.md",
    ]);
    expect(index.listNotes().map((note) => note.path)).toEqual([
      "notes/characters/kareth.md",
      "notes/places/ancient-ruin.md",
      "notes/places/sunken-city.md",
    ]);
  });

  it("resolves wikilinks via explicit path, title, alias, and slug fallback", () => {
    const { snapshot } = fixture();
    const index = createInMemoryProjectIndex();
    index.build(snapshot);

    expect(
      index.resolveWikilink(
        "notes/places/sunken-city.md",
        ref("manuscript/01-prologue/01-opening.md")
      )
    ).toMatchObject({
      status: "resolved",
      reason: "explicit-path",
      path: "notes/places/sunken-city.md",
    });
    expect(index.resolveWikilink("Ancient Ruin")).toMatchObject({
      status: "resolved",
      reason: "title",
      path: "notes/places/ancient-ruin.md",
    });
    expect(index.resolveWikilink("old temple")).toMatchObject({
      status: "resolved",
      reason: "alias",
      path: "notes/places/ancient-ruin.md",
    });
    expect(index.resolveWikilink("sunken-city")).toMatchObject({
      status: "resolved",
      reason: "slug",
      path: "notes/places/sunken-city.md",
    });
  });

  it("returns ambiguity when duplicate title or alias matches exist", () => {
    const { snapshot } = fixture();
    const index = createInMemoryProjectIndex();
    index.build(snapshot);

    index.updateDocument(
      "notes/duplicates/other-ruin.md",
      ["---", "title: Ancient Ruin", "aliases:", "  - old temple", "---", "", "duplicate"].join(
        "\n"
      )
    );

    expect(index.resolveWikilink("Ancient Ruin")).toMatchObject({
      status: "ambiguous",
      reason: "title",
    });
    expect(index.resolveWikilink("old temple")).toMatchObject({
      status: "ambiguous",
      reason: "alias",
    });
  });

  it("indexes outgoing links and backlinks", () => {
    const { snapshot } = fixture();
    const index = createInMemoryProjectIndex();
    index.build(snapshot);

    const outgoing = index.getOutgoingLinks(ref("manuscript/01-prologue/01-opening.md"));
    expect(outgoing.map((link) => link.target)).toEqual(["sunken-city"]);

    const backlinks = index.getBacklinks(ref("notes/places/ancient-ruin.md"));
    expect(backlinks.map((link) => `${link.fromPath}:${link.target}`)).toEqual([
      "manuscript/01-prologue/02-arrival.md:Ancient Ruin",
      "manuscript/02-journey/01-road.md:Ancient Ruin",
      "notes/characters/kareth.md:Ancient Ruin",
      "notes/places/ancient-ruin.md:old temple",
      "notes/places/sunken-city.md:Ancient Ruin",
    ]);
  });

  it("indexes claros blocks with run IDs and macro run ledger entries", () => {
    const { snapshot, runs } = fixture();
    const index = createInMemoryProjectIndex();
    index.build(snapshot, runs);

    expect(index.listClarosBlocks()).toHaveLength(1);
    expect(index.listClarosBlocks()[0]).toMatchObject({
      fromPath: "manuscript/01-prologue/01-opening.md",
      runId: "00001",
      title: "Oracle",
    });

    expect(index.listMacroRuns({ macroId: "oracle.check" }).map((run) => run.id)).toEqual([
      "00001",
    ]);
    expect(index.listMacroRuns({ chapterId: "02-journey" }).map((run) => run.id)).toEqual([
      "00002",
    ]);
  });

  it("supports incremental updateDocument/removeDocument and run updates", () => {
    const { snapshot, runs } = fixture();
    const index = createInMemoryProjectIndex();
    index.build(snapshot);

    index.updateDocument(
      "notes/places/sunken-city.md",
      [
        "---",
        "title: Submerged City",
        "aliases:",
        "  - sunken-city",
        "tags:",
        "  - mystery",
        "type: place",
        "mythic:",
        "  status: dormant",
        "---",
        "",
        "Now links [[Ancient Ruin]].",
      ].join("\n")
    );

    expect(index.resolveWikilink("Submerged City")).toMatchObject({
      status: "resolved",
      reason: "title",
      path: "notes/places/sunken-city.md",
    });
    expect(index.findByTag("mystery").map((note) => note.path)).toEqual([
      "notes/places/sunken-city.md",
    ]);

    index.removeDocument("notes/characters/kareth.md");
    expect(index.listNotes().map((note) => note.path)).not.toContain("notes/characters/kareth.md");

    index.updateRuns(runs);
    expect(index.listMacroRuns({ limit: 1 }).map((run) => run.id)).toEqual(["00002"]);
    expect(index.search("oracle.check").map((result) => result.path)).toContain(
      "manuscript/01-prologue/01-opening.md"
    );
  });

  it("matches semantic results between build(snapshot) and rebuild from canonical files", () => {
    const { snapshot, raws, runs } = fixture();

    const direct = createInMemoryProjectIndex();
    direct.build(snapshot, runs);

    const rebuilt = createInMemoryProjectIndex();
    rebuilt.build({
      root: snapshot.root,
      manifest: snapshot.manifest,
      chapters: snapshot.chapters,
      scenes: [],
      notes: [],
      wikilinks: [],
      clarosBlocks: [],
    });
    Object.entries(raws).forEach(([path, raw]) => rebuilt.updateDocument(path, raw));
    rebuilt.updateRuns(runs);

    expect(rebuilt.listScenes()).toEqual(direct.listScenes());
    expect(rebuilt.listNotes()).toEqual(direct.listNotes());
    expect(rebuilt.listClarosBlocks()).toEqual(direct.listClarosBlocks());
    expect(rebuilt.getBacklinks(ref("notes/places/ancient-ruin.md"))).toEqual(
      direct.getBacklinks(ref("notes/places/ancient-ruin.md"))
    );
    expect(rebuilt.resolveWikilink("old temple")).toEqual(direct.resolveWikilink("old temple"));
  });

  it("returns a defensive manifest summary copy", () => {
    const { snapshot } = fixture();
    const index = createInMemoryProjectIndex();
    index.build(snapshot);

    const manifest = index.getManifestSummary();
    manifest.title = "Mutated";

    expect(index.getManifestSummary()).toEqual(snapshot.manifest);
  });

  it("search returns documents without affecting identity or link correctness", () => {
    const { snapshot, runs } = fixture();
    const index = createInMemoryProjectIndex();
    index.build(snapshot, runs);

    const beforeResolve = index.resolveWikilink("Ancient Ruin");
    const beforeBacklinks = index.getBacklinks(ref("notes/places/ancient-ruin.md"));

    const metadataResults = index.search("mythic lore");
    expect(metadataResults.map((result) => result.path)).toContain("notes/places/ancient-ruin.md");

    const emergenceResults = index.search("oracle 00001");
    expect(emergenceResults.map((result) => result.path)).toContain(
      "manuscript/01-prologue/01-opening.md"
    );

    const afterResolve = index.resolveWikilink("Ancient Ruin");
    const afterBacklinks = index.getBacklinks(ref("notes/places/ancient-ruin.md"));

    expect(afterResolve).toEqual(beforeResolve);
    expect(afterBacklinks).toEqual(beforeBacklinks);
  });
});
