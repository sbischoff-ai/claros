import { describe, expect, it } from "vitest";
import { render } from "svelte/server";

import WorkspaceEditorFrame from "./WorkspaceEditorFrame.svelte";
import type { ManuscriptChapterFlow, ManuscriptFlowSceneBlock } from "$lib/manuscript-flow";
import type { WorkspaceEditorSurface } from "$lib/state/workspace-controller.svelte";

describe("WorkspaceEditorFrame", () => {
  it("renders a middle scene between previous and following readonly scene blocks", () => {
    const html = renderFrame(flow(["opening"], "middle", ["ending"]));

    expectInOrder(
      html,
      "manuscript-chapter-heading",
      'data-scene-path="opening"',
      "manuscript-delimiter",
      'data-scene-path="middle"',
      "manuscript-delimiter",
      'data-scene-path="ending"'
    );
    expect(html.match(/class="editor-host"/g)).toHaveLength(1);
    expect(html.match(/class="manuscript-context-scene"/g)).toHaveLength(2);
    expect(html.match(/class="manuscript-context-scene-content"/g)).toHaveLength(2);
    expect(html.match(/role="button" tabindex="0"/g)).toHaveLength(2);
  });

  it("renders delimiters after previous scenes for the last scene", () => {
    const html = renderFrame(flow(["opening", "middle"], "ending", []));

    expectInOrder(
      html,
      'data-scene-path="opening"',
      "manuscript-delimiter",
      'data-scene-path="middle"',
      "manuscript-delimiter",
      'data-scene-path="ending"'
    );
  });

  it("renders delimiters before following scenes for the first scene", () => {
    const html = renderFrame(flow([], "opening", ["middle", "ending"]));

    expectInOrder(
      html,
      'data-scene-path="opening"',
      "manuscript-delimiter",
      'data-scene-path="middle"',
      "manuscript-delimiter",
      'data-scene-path="ending"'
    );
  });

  it("renders a single-scene chapter with only the editor host", () => {
    const html = renderFrame(flow([], "solo", []));

    expect(html).toContain("manuscript-chapter-heading");
    expect(html).toContain('data-scene-path="solo"');
    expect(html).not.toContain("manuscript-context-scene");
    expect(html).not.toContain("manuscript-delimiter");
  });

  it("keeps note mode as an editor-only layout", () => {
    const html = renderFrame(undefined);

    expect(html).toContain('class="editor-host"');
    expect(html).not.toContain("manuscript-mode");
    expect(html).not.toContain("manuscript-chapter-heading");
    expect(html).not.toContain("manuscript-context-scene");
    expect(html).not.toContain("manuscript-delimiter");
  });
});

function renderFrame(manuscriptChapterFlow: ManuscriptChapterFlow | undefined): string {
  return render(WorkspaceEditorFrame, {
    props: {
      controller: {
        manuscriptChapterFlow,
        canNavigateBack: false,
        canNavigateForward: false,
        ensureEditor: async () => undefined,
        rememberEditorFocus: () => undefined,
        navigateBack: async () => undefined,
        navigateForward: async () => undefined,
      } as WorkspaceEditorSurface,
    },
  }).body;
}

function flow(
  previousScenes: string[],
  currentScene: string,
  followingScenes: string[]
): ManuscriptChapterFlow {
  return {
    chapter: {
      kind: "chapter",
      id: "chapter",
      sequence: 1,
      title: "Chapter",
      scenes: [],
    },
    previousScenes: previousScenes.map(block),
    currentScene: block(currentScene),
    followingScenes: followingScenes.map(block),
  };
}

function block(path: string): ManuscriptFlowSceneBlock {
  return {
    scene: {
      kind: "scene",
      id: path,
      chapterId: "chapter",
      sequence: 1,
      title: path,
      path,
    },
    markdown: `# ${path}`,
  };
}

function expectInOrder(html: string, ...needles: string[]): void {
  let previousIndex = -1;
  for (const needle of needles) {
    const index = html.indexOf(needle, previousIndex + 1);
    expect(index, `Expected ${needle} after index ${previousIndex}`).toBeGreaterThan(previousIndex);
    previousIndex = index;
  }
}
