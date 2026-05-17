import { describe, expect, it } from "vitest";

import { DRAFT_STORAGE_KEY, loadDraft, saveDraft } from "./lib/draft";
import { THEME_STORAGE_KEY, loadTheme, saveTheme } from "./lib/theme";

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
