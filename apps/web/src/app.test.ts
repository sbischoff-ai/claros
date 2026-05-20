import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { DRAFT_STORAGE_KEY, loadDraft, saveDraft } from "./lib/draft";
import { PROJECT_STORAGE_KEY, firstDocumentPath, loadProjectSession } from "./lib/project-session";
import { THEME_STORAGE_KEY, loadTheme, saveTheme } from "./lib/theme";

const pageSource = readFileSync(
  fileURLToPath(new URL("./routes/+page.svelte", import.meta.url)),
  "utf-8"
);

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("draft persistence", () => {
  it("loads the default draft when no browser draft exists", () => {
    const storage = new MemoryStorage();

    expect(loadDraft(storage)).toContain("# The Abandoned Temple");
  });

  it("saves and loads the draft markdown", () => {
    const storage = new MemoryStorage();

    saveDraft(storage, "# Scene\n\nText.");

    expect(storage.getItem(DRAFT_STORAGE_KEY)).toBe("# Scene\n\nText.");
    expect(loadDraft(storage)).toBe("# Scene\n\nText.");
  });
});

describe("theme persistence", () => {
  it("loads the default theme when no browser theme exists", () => {
    const storage = new MemoryStorage();

    expect(loadTheme(storage)).toBe("default-light");
  });

  it("saves and loads the selected theme", () => {
    const storage = new MemoryStorage();

    saveTheme(storage, "gruvbox-dark");

    expect(storage.getItem(THEME_STORAGE_KEY)).toBe("gruvbox-dark");
    expect(loadTheme(storage)).toBe("gruvbox-dark");
  });

  it("falls back to the default theme when storage contains an unknown theme", () => {
    const storage = new MemoryStorage();
    storage.setItem(THEME_STORAGE_KEY, "unknown-theme");

    expect(loadTheme(storage)).toBe("default-light");
  });
});

describe("project session", () => {
  it("creates a sample project when no project is stored", () => {
    const storage = new MemoryStorage();
    const session = loadProjectSession(storage);

    expect(session.manifest.title).toBe("The Abandoned Temple");
    expect(session.listChapters()).toHaveLength(2);
    expect(session.listScenes()[0]?.title).toBe("Broken Arch");
    expect(session.listNotes().map((note) => note.title)).toContain("Kareth");
    expect(storage.getItem(PROJECT_STORAGE_KEY)).not.toBeNull();
  });

  it("returns the first scene path for the initial document", () => {
    const session = loadProjectSession(new MemoryStorage());

    expect(firstDocumentPath(session)).toBe("manuscript/01-threshold/01-broken-arch.md");
  });

  it("persists document writes", () => {
    const storage = new MemoryStorage();
    const session = loadProjectSession(storage);
    const path = firstDocumentPath(session);

    session.writeDocument({ path }, "# Updated");

    expect(loadProjectSession(storage).readDocument({ path }).body).toBe("# Updated");
  });

  it("does not expose YAML frontmatter as editable document body", () => {
    const session = loadProjectSession(new MemoryStorage());
    const document = session.readDocument({ path: "notes/characters/kareth.md" });

    expect(document.raw).toContain("---\ntitle: Kareth");
    expect(document.body).toBe(
      "# Kareth\n\nA cautious mercenary who trusts old warnings more than new promises."
    );
  });

  it("preserves YAML frontmatter when writing the editable document body", () => {
    const storage = new MemoryStorage();
    const session = loadProjectSession(storage);
    const path = "notes/characters/kareth.md";

    session.writeDocument({ path }, "# Kareth\n\nUpdated body.");

    const written = loadProjectSession(storage).readDocument({ path });
    expect(written.raw).toContain("---\ntitle: Kareth");
    expect(written.raw).toContain("tags:\n  - character");
    expect(written.body).toBe("# Kareth\n\nUpdated body.");
  });

  it("falls back to the sample project when stored data is invalid", () => {
    const storage = new MemoryStorage();
    storage.setItem(PROJECT_STORAGE_KEY, "not json");

    expect(loadProjectSession(storage).manifest.title).toBe("The Abandoned Temple");
  });
});

describe("workspace command surface", () => {
  it("removes the ambiguous return-to-manuscript command", () => {
    expect(pageSource).not.toContain("Return to Manuscript");
  });

  it("exposes a focused editor command and region focus shortcuts", () => {
    expect(pageSource).toContain("Focus Editor");
    expect(pageSource).toContain('event.key === "ArrowLeft"');
    expect(pageSource).toContain('event.key === "ArrowRight"');
  });
});
