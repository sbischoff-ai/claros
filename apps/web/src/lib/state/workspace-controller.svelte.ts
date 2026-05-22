import { WorkspaceContext } from "./workspace-context.svelte";
import { WorkspaceDocuments } from "./workspace-documents.svelte";
import { WorkspaceFocus } from "./workspace-focus.svelte";
import { WorkspaceLifecycle } from "./workspace-lifecycle.svelte";
import { WorkspaceManuscriptActions } from "./workspace-manuscript-actions.svelte";
import { WorkspaceOverlays } from "./workspace-overlays.svelte";
import { WorkspacePalette } from "./workspace-palette.svelte";
import { WorkspaceProjects } from "./workspace-projects.svelte";
import { WorkspaceSidebarController } from "./workspace-sidebar.svelte";
import { WorkspaceTitles } from "./workspace-titles.svelte";
import {
  createBrowserEnvironment,
  type BrowserEnvironment,
} from "$lib/services/browser-environment";
import {
  createMarkdownEditorRuntime,
  type MarkdownEditorRuntime,
} from "$lib/services/markdown-editor-runtime";
import type {
  WorkspaceControllers,
  WorkspaceDragPreviewSurface,
  WorkspaceEditorSurface,
  WorkspaceLifecycleSurface,
  WorkspaceOverlaysSurface,
  WorkspaceProjectLauncherSurface,
  WorkspaceSidebarSurface,
  WorkspaceTitleSurface,
  WorkspaceTopbarSurface,
} from "./workspace-controller-types";

export type {
  WorkspaceControllers,
  WorkspaceDragPreviewSurface,
  WorkspaceEditorSurface,
  WorkspaceLifecycleSurface,
  WorkspaceOverlaysSurface,
  WorkspaceProjectLauncherSurface,
  WorkspaceSidebarSurface,
  WorkspaceTitleSurface,
  WorkspaceTopbarSurface,
} from "./workspace-controller-types";

export function createWorkspaceControllers(
  environment: BrowserEnvironment = createBrowserEnvironment(),
  editorRuntime: MarkdownEditorRuntime = createMarkdownEditorRuntime()
): WorkspaceControllers {
  const ctx = new WorkspaceContext(environment, editorRuntime);
  const documents = new WorkspaceDocuments(ctx);
  const focus = new WorkspaceFocus(ctx, documents);
  const manuscript = new WorkspaceManuscriptActions(ctx, documents);
  const projects = new WorkspaceProjects(ctx, documents);
  const titles = new WorkspaceTitles(ctx, documents, focus, manuscript, projects);
  projects.titles = titles;
  const sidebar = new WorkspaceSidebarController(ctx, documents, focus, manuscript, titles);
  const overlays = new WorkspaceOverlays(ctx, documents, focus);
  const palette = new WorkspacePalette(
    ctx,
    documents,
    focus,
    manuscript,
    projects,
    sidebar,
    titles
  );
  const lifecycle = new WorkspaceLifecycle(
    ctx,
    documents,
    focus,
    overlays,
    palette,
    projects,
    sidebar,
    titles
  );

  const titleSurface = createTitleSurface(ctx, titles);

  return {
    lifecycle: createLifecycleSurface(ctx, lifecycle, focus),
    sidebar: createSidebarSurface(ctx, sidebar, focus, titles),
    dragPreview: createDragPreviewSurface(ctx),
    topbar: createTopbarSurface(ctx, palette, titleSurface),
    title: titleSurface,
    editor: createEditorSurface(ctx, documents),
    projectLauncher: createProjectLauncherSurface(ctx, projects),
    overlays: createOverlaysSurface(ctx, overlays, palette, sidebar, titles),
  };
}

function createLifecycleSurface(
  ctx: WorkspaceContext,
  lifecycle: WorkspaceLifecycle,
  focus: WorkspaceFocus
): WorkspaceLifecycleSurface {
  return {
    get appShell() {
      return ctx.appShell;
    },
    set appShell(value) {
      ctx.appShell = value;
    },
    get startupReady() {
      return ctx.startupReady;
    },
    get projectIsOpen() {
      return ctx.projectIsOpen;
    },
    get sidebarOpen() {
      return ctx.sidebarOpen;
    },
    mount: () => lifecycle.mount(),
    destroy: () => lifecycle.destroy(),
    toggleSidebar: () => focus.toggleSidebar(),
  };
}

function createSidebarSurface(
  ctx: WorkspaceContext,
  sidebar: WorkspaceSidebarController,
  focus: WorkspaceFocus,
  titles: WorkspaceTitles
): WorkspaceSidebarSurface {
  return {
    get sidebarNav() {
      return ctx.sidebarNav;
    },
    set sidebarNav(value) {
      ctx.sidebarNav = value;
    },
    get focusedItemId() {
      return ctx.focusedSidebarItemId;
    },
    set focusedItemId(value) {
      ctx.focusedSidebarItemId = value;
    },
    get titleDraft() {
      return ctx.sidebarTitleDraft;
    },
    set titleDraft(value) {
      ctx.sidebarTitleDraft = value;
    },
    get activePath() {
      return ctx.activePath;
    },
    get dragging() {
      return ctx.manuscriptDrag !== undefined;
    },
    get draggingItemId() {
      return ctx.manuscriptDrag?.itemId ?? "";
    },
    get ghostChapterId() {
      return ctx.manuscriptDrag?.kind === "chapter" ? ctx.manuscriptDrag.chapterId : "";
    },
    get dropIndicatorItemId() {
      return ctx.chapterDropIndicatorItemId;
    },
    get dropIndicatorPlacement() {
      return ctx.manuscriptDrag?.kind === "chapter" ? ctx.manuscriptDrag.placement : undefined;
    },
    get editingItemId() {
      return ctx.editingSidebarItemId;
    },
    get items() {
      return ctx.sidebarItems;
    },
    get open() {
      return ctx.sidebarOpen;
    },
    close: () => focus.closeSidebar(),
    commitTitle: (item) => titles.commitSidebarTitleEdit(item),
    cancelTitleEdit: () => titles.cancelInlineTitleEdit(),
    handleContextMenu: (event, item) => sidebar.openSidebarContextMenu(event, item),
    handleDragPointerDown: (event, item) =>
      sidebar.manuscriptDragController.handlePointerDown(event, item),
    handleItemClick: (item) => sidebar.handleSidebarItemClick(item),
    handleKeydown: (event) => sidebar.handleSidebarKeydown(event),
    rememberFocus: (itemId) => focus.rememberSidebarFocus(itemId),
  };
}

function createDragPreviewSurface(ctx: WorkspaceContext): WorkspaceDragPreviewSurface {
  return {
    get drag() {
      return ctx.manuscriptDrag;
    },
  };
}

function createTopbarSurface(
  ctx: WorkspaceContext,
  palette: WorkspacePalette,
  title: WorkspaceTitleSurface
): WorkspaceTopbarSurface {
  return {
    title,
    get projectIsOpen() {
      return ctx.projectIsOpen;
    },
    get activeTitle() {
      return ctx.activeTitle;
    },
    get saveState() {
      return ctx.saveState;
    },
    get openStorageBackend() {
      return ctx.openStorageBackend;
    },
    get paletteOpen() {
      return ctx.paletteOpen;
    },
    preparePaletteReturnFocus: () => palette.preparePaletteReturnFocus(),
    togglePalette: () => palette.togglePalette(),
  };
}

function createTitleSurface(ctx: WorkspaceContext, titles: WorkspaceTitles): WorkspaceTitleSurface {
  return {
    get projectTitleDraft() {
      return ctx.projectTitleDraft;
    },
    set projectTitleDraft(value) {
      ctx.projectTitleDraft = value;
    },
    get projectIsOpen() {
      return ctx.projectIsOpen;
    },
    get editingProjectTitle() {
      return ctx.editingProjectTitle;
    },
    get displayProjectTitle() {
      return ctx.displayProjectTitle;
    },
    prepareProjectTitleEdit: () => titles.prepareProjectTitleEdit(),
    beginProjectTitleEdit: () => titles.beginProjectTitleEdit(),
    handleProjectTitleKeydown: (event) => titles.handleProjectTitleKeydown(event),
    commitProjectTitleEdit: () => titles.commitProjectTitleEdit(),
  };
}

function createEditorSurface(
  ctx: WorkspaceContext,
  documents: WorkspaceDocuments
): WorkspaceEditorSurface {
  return {
    get editorHost() {
      return ctx.editorHost;
    },
    set editorHost(value) {
      ctx.editorHost = value;
    },
    ensureEditor: () => documents.ensureEditor(),
    rememberEditorFocus: () => documents.rememberEditorFocus(),
  };
}

function createProjectLauncherSurface(
  ctx: WorkspaceContext,
  projects: WorkspaceProjects
): WorkspaceProjectLauncherSurface {
  return {
    get createProjectIntent() {
      return ctx.createProjectIntent;
    },
    set createProjectIntent(value) {
      ctx.createProjectIntent = value;
    },
    get storageBackendMenuOpen() {
      return ctx.storageBackendMenuOpen;
    },
    set storageBackendMenuOpen(value) {
      ctx.storageBackendMenuOpen = value;
    },
    get projectOpenState() {
      return ctx.projectOpenState;
    },
    get projectError() {
      return ctx.projectError;
    },
    get storageBackendOptions() {
      return ctx.storageBackendOptions;
    },
    get selectedStorageBackend() {
      return ctx.selectedStorageBackend;
    },
    get selectedStorageBackendId() {
      return ctx.selectedStorageBackendId;
    },
    createProjectWithBackend: (backendId) => projects.createProjectWithBackend(backendId),
    openProjectWithBackend: (backendId) => projects.openProjectWithBackend(backendId),
    selectStorageBackend: (backend) => projects.selectStorageBackend(backend),
  };
}

function createOverlaysSurface(
  ctx: WorkspaceContext,
  overlays: WorkspaceOverlays,
  palette: WorkspacePalette,
  sidebar: WorkspaceSidebarController,
  titles: WorkspaceTitles
): WorkspaceOverlaysSurface {
  return {
    get commandInput() {
      return ctx.commandInput;
    },
    set commandInput(value) {
      ctx.commandInput = value;
    },
    get commandQuery() {
      return ctx.commandQuery;
    },
    set commandQuery(value) {
      ctx.commandQuery = value;
    },
    get selectedCommandIndex() {
      return ctx.selectedCommandIndex;
    },
    set selectedCommandIndex(value) {
      ctx.selectedCommandIndex = value;
    },
    get paletteOpen() {
      return ctx.paletteOpen;
    },
    get filteredCommands() {
      return palette.filteredCommands;
    },
    get contextMenu() {
      return ctx.contextMenu;
    },
    get sidebarContextMenuItems() {
      return sidebar.sidebarContextMenuItems;
    },
    get titleModal() {
      return ctx.titleModal;
    },
    get deleteModal() {
      return ctx.deleteModal;
    },
    get confirmationModal() {
      return ctx.confirmationModal;
    },
    closePalette: () => palette.closePalette(),
    handleCommandInput: () => palette.handleCommandInput(),
    handleCommandInputKeydown: (event) => palette.handleCommandInputKeydown(event),
    runCommand: (command) => palette.runCommand(command),
    closeSidebarContextMenu: () => sidebar.closeSidebarContextMenu(),
    submitTitleModal: () => titles.submitTitleModal(),
    closeTitleModal: () => titles.closeTitleModal(),
    submitDeleteModal: () => overlays.submitDeleteModal(),
    closeDeleteModal: () => overlays.closeDeleteModal(),
    submitConfirmationModal: () => overlays.submitConfirmationModal(),
    closeConfirmationModal: () => overlays.closeConfirmationModal(),
  };
}
