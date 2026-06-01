// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarkdownWikilinkReference } from "@claros/editor-core";

import { createWorkspaceControllers } from "./workspace-controller.svelte";
import { FakeBrowserEnvironment, FakeMarkdownEditorRuntime } from "$lib/test-utils";

afterEach(() => {
  vi.restoreAllMocks();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("readonly manuscript wikilinks", () => {
  it("opens resolved notes through the existing workspace document flow", async () => {
    const editorRuntime = new FakeMarkdownEditorRuntime();
    const controllers = createWorkspaceControllers(new FakeBrowserEnvironment(), editorRuntime);
    controllers.editor.editorHost = document.createElement("div");
    await controllers.lifecycle.mount();
    await controllers.projectLauncher.openProjectWithBackend("file-picker");

    const container = document.createElement("article");
    container.innerHTML = '<button type="button" data-claros-wikilink-index="0">Kareth</button>';
    const cleanup = controllers.editor.bindReadonlyWikilinks(
      container,
      [reference],
      "manuscript/001-start/002-second.md"
    );

    container.querySelector<HTMLButtonElement>("button")!.click();
    await vi.waitFor(() => {
      expect(controllers.sidebar.activePath).toBe("notes/characters/kareth.md");
    });

    expect(editorRuntime.documentId).toBe("notes/characters/kareth.md");
    cleanup();
    controllers.lifecycle.destroy();
  });
});

const reference: MarkdownWikilinkReference = {
  raw: "[[Kareth]]",
  target: "Kareth",
  from: 0,
  to: 10,
  displayFrom: 2,
  displayTo: 8,
};
