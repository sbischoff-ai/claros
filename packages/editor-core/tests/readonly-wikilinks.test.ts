// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bindReadonlyMarkdownWikilinks,
  type MarkdownWikilinkOptions,
  type MarkdownWikilinkReference,
  type MarkdownWikilinkResolution,
} from "../src";

afterEach(() => {
  vi.useRealTimers();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("bindReadonlyMarkdownWikilinks", () => {
  it("opens a resolved link relative to the rendered scene path", async () => {
    const calls: string[] = [];
    const binding = setup({
      resolve: async (_reference, fromPath) => {
        calls.push(`resolve:${fromPath}`);
        return { status: "resolved", path: "notes/kareth.md", reason: "title" };
      },
      open: async (path) => {
        calls.push(`open:${path}`);
      },
    });

    binding.button.click();
    await vi.waitFor(() => {
      expect(calls).toEqual(["resolve:manuscript/001-start/002-second.md", "open:notes/kareth.md"]);
    });
  });

  it("uses the existing create callback for unresolved links", async () => {
    const create = vi.fn();
    const binding = setup({
      resolve: async () => ({ status: "unresolved", target: "Kareth" }),
      create,
    });

    binding.button.click();
    await vi.waitFor(() => {
      expect(create).toHaveBeenCalledWith(
        reference,
        "manuscript/001-start/002-second.md",
        "Kareth"
      );
    });
  });

  it("shows the existing preview tooltip after the hover delay", async () => {
    vi.useFakeTimers();
    const binding = setup({
      resolve: async () => ({ status: "resolved", path: "notes/kareth.md", reason: "title" }),
      preview: async () => ({
        path: "notes/kareth.md",
        title: "Kareth",
        excerpt: "A cautious mercenary.",
      }),
    });

    binding.button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(499);
    expect(binding.container.querySelector(".cm-claros-wikilink-tooltip")).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => {
      expect(binding.container.querySelector(".cm-claros-wikilink-tooltip")?.textContent).toContain(
        "A cautious mercenary."
      );
    });
  });

  it("shows ambiguous candidates and opens the selected candidate", async () => {
    const open = vi.fn();
    const binding = setup({
      resolve: async () => ({
        status: "ambiguous",
        target: "Shrine",
        reason: "title",
        candidates: [
          { path: "notes/old-shrine.md", title: "Old Shrine" },
          { path: "notes/new-shrine.md", title: "New Shrine" },
        ],
      }),
      open,
    });

    binding.button.click();
    await vi.waitFor(() => {
      expect(binding.container.querySelectorAll(".cm-claros-wikilink-candidate")).toHaveLength(2);
    });
    binding.container
      .querySelectorAll<HTMLButtonElement>(".cm-claros-wikilink-candidate")[1]
      .click();

    expect(open).toHaveBeenCalledWith("notes/new-shrine.md");
  });

  it("removes listeners and installs shared styles only once", async () => {
    const open = vi.fn();
    const first = setup({ open });
    const second = setup({ open });

    expect(document.querySelectorAll("#claros-wikilink-styles")).toHaveLength(1);
    first.cleanup();
    first.button.click();
    await Promise.resolve();

    expect(open).not.toHaveBeenCalled();
    second.cleanup();
  });

  it("keeps readonly link hover styling limited to the dotted underline", () => {
    setup();

    expect(document.querySelector("#claros-wikilink-styles")?.textContent).toContain(
      ".claros-readonly-wikilink:hover {\n  border-color: transparent;\n  background: transparent;\n  color: inherit;"
    );
  });
});

function setup(overrides: Partial<MarkdownWikilinkOptions> = {}) {
  const container = document.createElement("article");
  container.innerHTML =
    '<button type="button" class="claros-readonly-wikilink cm-claros-wikilink" data-claros-wikilink-index="0">Kareth</button>';
  document.body.append(container);
  const cleanup = bindReadonlyMarkdownWikilinks(container, {
    references: [reference],
    fromPath: "manuscript/001-start/002-second.md",
    options: {
      currentPath: () => "manuscript/001-start/001-opening.md",
      resolve: async (): Promise<MarkdownWikilinkResolution> => ({
        status: "resolved",
        path: "notes/kareth.md",
        reason: "title",
      }),
      preview: async (path) => ({ path, title: path, excerpt: "" }),
      open: async () => undefined,
      create: async () => undefined,
      ...overrides,
    },
  });
  return {
    button: container.querySelector<HTMLButtonElement>("button")!,
    cleanup,
    container,
  };
}

const reference: MarkdownWikilinkReference = {
  raw: "[[Kareth]]",
  target: "Kareth",
  from: 0,
  to: 10,
  displayFrom: 2,
  displayTo: 8,
};
