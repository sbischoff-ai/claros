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
    expect(editorRuntime.focusedWith).toEqual({ cursor: "end" });
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
