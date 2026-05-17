import { describe, expect, it } from "vitest";

import { DRAFT_STORAGE_KEY, loadDraft, saveDraft } from "./lib/draft";

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
