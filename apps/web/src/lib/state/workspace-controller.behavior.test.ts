import { afterEach, describe, expect, it, vi } from "vitest";

import { createWorkspaceControllers } from "./workspace-controller.svelte";
import {
  FakeBrowserEnvironment,
  FakeMarkdownEditorRuntime,
  createProjectHandle,
  readHandleFile,
} from "$lib/test-utils";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("workspace controllers", () => {
  it("mounts, opens a local project, and initializes the editor from the first document", async () => {
    const environment = new FakeBrowserEnvironment();
    const editorRuntime = new FakeMarkdownEditorRuntime();
    const controllers = createWorkspaceControllers(environment, editorRuntime);
    controllers.lifecycle.appShell = {} as HTMLElement;
    controllers.editor.editorHost = {} as HTMLDivElement;

    await controllers.lifecycle.mount();
    await controllers.projectLauncher.openProjectWithBackend("file-picker");

    expect(controllers.lifecycle.startupReady).toBe(true);
    expect(controllers.lifecycle.projectIsOpen).toBe(true);
    expect(controllers.topbar.activeTitle).toBe("Opening");
    expect(controllers.topbar.saveState).toBe("saved");
    expect(controllers.sidebar.activePath).toBe("manuscript/001-start/001-opening.md");
    expect(controllers.sidebar.items.map((item) => item.label)).toContain("Opening");
    expect(editorRuntime.ensured).toBe(true);
    expect(editorRuntime.markdown).toBe("\nStart.");
    expect(editorRuntime.documentId).toBe("manuscript/001-start/001-opening.md");
    expect(editorRuntime.focusedWith).toEqual({ cursor: "end" });
  });

  it("uses the active document path as the editor history scope when opening documents", async () => {
    const editorRuntime = new FakeMarkdownEditorRuntime();
    const controllers = createWorkspaceControllers(new FakeBrowserEnvironment(), editorRuntime);
    controllers.editor.editorHost = {} as HTMLDivElement;

    await controllers.lifecycle.mount();
    await controllers.projectLauncher.openProjectWithBackend("file-picker");
    const secondScene = controllers.sidebar.items.find((item) => item.label === "Second");

    expect(secondScene).toBeDefined();
    controllers.sidebar.handleItemClick(secondScene!);
    await vi.waitFor(() => {
      expect(controllers.sidebar.activePath).toBe("manuscript/001-start/002-second.md");
    });

    expect(editorRuntime.documentId).toBe("manuscript/001-start/002-second.md");
    expect(editorRuntime.setMarkdownCalls.at(-1)).toEqual({
      markdown: "\nSecond.",
      cursor: "end",
      documentId: "manuscript/001-start/002-second.md",
    });
  });

  it("navigates backward and forward through opened scene and note files", async () => {
    const editorRuntime = new FakeMarkdownEditorRuntime();
    const controllers = createWorkspaceControllers(new FakeBrowserEnvironment(), editorRuntime);
    controllers.editor.editorHost = {} as HTMLDivElement;

    await controllers.lifecycle.mount();
    await controllers.projectLauncher.openProjectWithBackend("file-picker");
    const firstScene = controllers.sidebar.activePath;
    const secondScene = controllers.sidebar.items.find((item) => item.label === "Second");

    expect(controllers.editor.canNavigateBack).toBe(false);
    expect(controllers.editor.canNavigateForward).toBe(false);
    controllers.sidebar.handleItemClick(secondScene!);
    await vi.waitFor(() => {
      expect(controllers.sidebar.activePath).toBe("manuscript/001-start/002-second.md");
    });
    await editorRuntime.wikilinks?.open("notes/characters/kareth.md");

    expect(controllers.sidebar.activePath).toBe("notes/characters/kareth.md");
    expect(controllers.editor.canNavigateBack).toBe(true);
    expect(controllers.editor.canNavigateForward).toBe(false);

    await controllers.editor.navigateBack();
    expect(controllers.sidebar.activePath).toBe("manuscript/001-start/002-second.md");
    expect(controllers.editor.canNavigateBack).toBe(true);
    expect(controllers.editor.canNavigateForward).toBe(true);

    await controllers.editor.navigateForward();
    expect(controllers.sidebar.activePath).toBe("notes/characters/kareth.md");

    await controllers.editor.navigateBack();
    controllers.sidebar.handleItemClick(
      controllers.sidebar.items.find((item) => item.path === firstScene)!
    );
    await vi.waitFor(() => {
      expect(controllers.sidebar.activePath).toBe(firstScene);
    });
    expect(controllers.editor.canNavigateForward).toBe(false);
  });

  it("uses global shortcuts for editor file history", async () => {
    const environment = new FakeBrowserEnvironment();
    const editorRuntime = new FakeMarkdownEditorRuntime();
    const controllers = createWorkspaceControllers(environment, editorRuntime);
    controllers.editor.editorHost = {} as HTMLDivElement;

    await controllers.lifecycle.mount();
    await controllers.projectLauncher.openProjectWithBackend("file-picker");
    controllers.sidebar.handleItemClick(
      controllers.sidebar.items.find((item) => item.label === "Second")!
    );
    await vi.waitFor(() => {
      expect(controllers.sidebar.activePath).toBe("manuscript/001-start/002-second.md");
    });

    const backEvent = keydownEvent({
      key: "ArrowLeft",
      ctrlKey: true,
      altKey: true,
      cancelable: true,
    });
    environment.dispatchWindowEvent(backEvent);
    await vi.waitFor(() => {
      expect(controllers.sidebar.activePath).toBe("manuscript/001-start/001-opening.md");
    });
    expect(backEvent.defaultPrevented).toBe(true);

    const forwardEvent = keydownEvent({
      key: "i",
      metaKey: true,
      cancelable: true,
    });
    environment.dispatchWindowEvent(forwardEvent);
    await vi.waitFor(() => {
      expect(controllers.sidebar.activePath).toBe("manuscript/001-start/002-second.md");
    });
    expect(forwardEvent.defaultPrevented).toBe(true);

    const commandBackEvent = keydownEvent({
      key: "o",
      ctrlKey: true,
      cancelable: true,
    });
    environment.dispatchWindowEvent(commandBackEvent);
    await vi.waitFor(() => {
      expect(controllers.sidebar.activePath).toBe("manuscript/001-start/001-opening.md");
    });
    expect(commandBackEvent.defaultPrevented).toBe(true);

    const arrowForwardEvent = keydownEvent({
      key: "ArrowRight",
      ctrlKey: true,
      altKey: true,
      cancelable: true,
    });
    environment.dispatchWindowEvent(arrowForwardEvent);
    await vi.waitFor(() => {
      expect(controllers.sidebar.activePath).toBe("manuscript/001-start/002-second.md");
    });
    expect(arrowForwardEvent.defaultPrevented).toBe(true);
  });

  it("flushes pending editor changes before file history navigation", async () => {
    const handle = createProjectHandle();
    const environment = new FakeBrowserEnvironment();
    environment.pickedDirectory = handle;
    const editorRuntime = new FakeMarkdownEditorRuntime();
    const controllers = createWorkspaceControllers(environment, editorRuntime);
    controllers.editor.editorHost = {} as HTMLDivElement;

    await controllers.lifecycle.mount();
    await controllers.projectLauncher.openProjectWithBackend("file-picker");
    controllers.sidebar.handleItemClick(
      controllers.sidebar.items.find((item) => item.label === "Second")!
    );
    await vi.waitFor(() => {
      expect(controllers.sidebar.activePath).toBe("manuscript/001-start/002-second.md");
    });
    editorRuntime.emitChange("# Second\n\nEdited before going back.");

    await controllers.editor.navigateBack();

    expect(controllers.sidebar.activePath).toBe("manuscript/001-start/001-opening.md");
    expect(await readHandleFile(handle, "/manuscript/001-start/002-second.md")).toContain(
      "Edited before going back."
    );
  });

  it("saves editor changes through the active project document", async () => {
    vi.useFakeTimers();
    const environment = new FakeBrowserEnvironment();
    const editorRuntime = new FakeMarkdownEditorRuntime();
    const handle = createProjectHandle();
    environment.pickedDirectory = handle;
    const controllers = createWorkspaceControllers(environment, editorRuntime);
    controllers.editor.editorHost = {} as HTMLDivElement;

    await controllers.lifecycle.mount();
    await controllers.projectLauncher.openProjectWithBackend("file-picker");
    editorRuntime.emitChange("# Opening\n\nUpdated body.");

    expect(controllers.topbar.saveState).toBe("dirty");
    await vi.advanceTimersByTimeAsync(550);

    expect(controllers.topbar.saveState).toBe("saved");
    expect(await readHandleFile(handle, "/manuscript/001-start/001-opening.md")).toContain(
      "Updated body."
    );
  });

  it("runs palette commands against the current workspace state", async () => {
    const environment = new FakeBrowserEnvironment();
    const editorRuntime = new FakeMarkdownEditorRuntime();
    const controllers = createWorkspaceControllers(environment, editorRuntime);
    controllers.editor.editorHost = {} as HTMLDivElement;

    await controllers.lifecycle.mount();
    await controllers.projectLauncher.openProjectWithBackend("file-picker");
    controllers.topbar.togglePalette();
    controllers.overlays.commandQuery = "vim";
    controllers.overlays.handleCommandInput();
    controllers.overlays.runCommand(controllers.overlays.filteredCommands[0]);

    expect(controllers.overlays.paletteOpen).toBe(false);
    expect(editorRuntime.vimMode).toBe(true);
    expect(editorRuntime.focusedWith).toEqual({ cursor: "end" });
  });

  it("creates notes from the command palette and opens them", async () => {
    const environment = new FakeBrowserEnvironment();
    const editorRuntime = new FakeMarkdownEditorRuntime();
    const handle = createProjectHandle();
    environment.pickedDirectory = handle;
    const controllers = createWorkspaceControllers(environment, editorRuntime);
    controllers.editor.editorHost = {} as HTMLDivElement;

    await controllers.lifecycle.mount();
    await controllers.projectLauncher.openProjectWithBackend("file-picker");
    controllers.topbar.togglePalette();
    const command = controllers.overlays.filteredCommands.find(
      (candidate) => candidate.label === "Add: New Note"
    );
    expect(command?.disabled).toBe(false);
    controllers.overlays.runCommand(command!);
    expect(controllers.overlays.titleModal?.target).toBe("new-note");
    controllers.overlays.titleModal!.value = "Hidden Shrine";
    await controllers.overlays.submitTitleModal();

    expect(controllers.sidebar.activePath).toBe("notes/hidden-shrine.md");
    expect(editorRuntime.markdown).toContain("# Hidden Shrine");
    expect(await readHandleFile(handle, "/notes/hidden-shrine.md")).toContain(
      'title: "Hidden Shrine"'
    );
  });

  it("creates unresolved wikilink notes through the shared folder modal path", async () => {
    const environment = new FakeBrowserEnvironment();
    const editorRuntime = new FakeMarkdownEditorRuntime();
    const handle = createProjectHandle();
    environment.pickedDirectory = handle;
    const controllers = createWorkspaceControllers(environment, editorRuntime);
    controllers.editor.editorHost = {} as HTMLDivElement;

    await controllers.lifecycle.mount();
    await controllers.projectLauncher.openProjectWithBackend("file-picker");
    await editorRuntime.wikilinks?.create(
      {
        raw: "[[Hidden Shrine]]",
        target: "Hidden Shrine",
        from: 0,
        to: 17,
        displayFrom: 2,
        displayTo: 15,
      },
      "manuscript/001-start/001-opening.md",
      "Hidden Shrine"
    );

    expect(controllers.overlays.titleModal?.target).toBe("new-wikilink-note");
    expect(controllers.overlays.titleModal?.value).toBe("Hidden Shrine");
    await controllers.overlays.submitTitleModal();

    expect(controllers.sidebar.activePath).toBe("notes/hidden-shrine.md");
    expect(await readHandleFile(handle, "/notes/hidden-shrine.md")).toContain(
      'title: "Hidden Shrine"'
    );
  });

  it("keeps title editing and sidebar state scoped to their feature surfaces", async () => {
    const controllers = createWorkspaceControllers(
      new FakeBrowserEnvironment(),
      new FakeMarkdownEditorRuntime()
    );
    controllers.editor.editorHost = {} as HTMLDivElement;

    await controllers.lifecycle.mount();
    await controllers.projectLauncher.openProjectWithBackend("file-picker");
    controllers.lifecycle.toggleSidebar();
    controllers.sidebar.handleItemClick(controllers.sidebar.items[0]);
    controllers.topbar.title.beginProjectTitleEdit();
    controllers.topbar.title.projectTitleDraft = "Renamed Workspace";
    await controllers.topbar.title.commitProjectTitleEdit();

    expect(controllers.sidebar.open).toBe(true);
    expect(controllers.topbar.title.displayProjectTitle).toBe("Renamed Workspace");
    expect(controllers.topbar.title.editingProjectTitle).toBe(false);
  });
});

function keydownEvent(
  options: Pick<KeyboardEvent, "key"> &
    Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "cancelable">>
): KeyboardEvent {
  let defaultPrevented = false;
  return {
    type: "keydown",
    key: options.key,
    altKey: options.altKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    shiftKey: options.shiftKey ?? false,
    cancelable: options.cancelable ?? false,
    get defaultPrevented() {
      return defaultPrevented;
    },
    preventDefault: () => {
      defaultPrevented = true;
    },
  } as KeyboardEvent;
}
