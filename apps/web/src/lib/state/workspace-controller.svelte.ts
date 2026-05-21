import { tick } from "svelte";
import type { Unsubscriber } from "svelte/store";
import type { ClarosThemeId, MarkdownEditorCursor } from "@claros/editor-core";
import type { ManuscriptInsertionPlacement } from "@claros/story-state";

import { directionalIntentFromKeydown } from "$lib/directional-navigation";
import {
  ManuscriptDragController,
  type ManuscriptDragState,
  type SceneMoveOptions,
} from "$lib/manuscript-drag";
import {
  companionConnectionFromUrl,
  createNewCompanionProjectSession,
  createNewLocalProjectSession,
  firstDocumentPath,
  loadCompanionConnection,
  openCompanionProjectSession,
  openLocalProjectSession,
  saveCompanionConnection,
  type CompanionConnection,
  type ProjectSession,
  type WorkspaceChapter,
  type WorkspaceMoveResult,
  type WorkspaceScene,
} from "$lib/project-session";
import { buildSidebarItems } from "$lib/sidebar-model";
import { buildStorageBackendOptions, type StorageBackendOption } from "$lib/storage-backends";
import { loadTheme, saveTheme } from "$lib/theme";
import {
  normalizedChapterTitle,
  normalizedProjectTitle,
  normalizedSceneTitle,
} from "$lib/title-model";
import { buildWorkspacePaletteCommands } from "$lib/workspace-commands";
import type {
  ActionMenuItem,
  ActiveDocumentKind,
  ConfirmationModalState,
  ContextMenuState,
  DeleteModalState,
  PaletteCommand,
  ProjectOpenState,
  SaveState,
  SidebarItem,
  StorageBackendId,
  TitleModalState,
  WorkspaceFocusTarget,
} from "$lib/workspace-types";
import {
  clampCommandIndex,
  filterCommands,
  listProjectChapters,
  listProjectNotes,
  listProjectScenes,
  projectTitleForDisplay,
} from "$lib/workspace-view-model";
import {
  createBrowserEnvironment,
  type BrowserEnvironment,
} from "$lib/services/browser-environment";
import {
  createMarkdownEditorRuntime,
  type MarkdownEditorRuntime,
} from "$lib/services/markdown-editor-runtime";

export class WorkspaceController {
  appShell = $state<HTMLElement>();
  editorHost = $state<HTMLDivElement>();
  commandInput = $state<HTMLInputElement>();
  sidebarNav = $state<HTMLElement>();
  project = $state<ProjectSession>();
  projectRevision = $state(0);
  activePath = $state("");
  activeTitle = $state("Draft");
  activeDocumentKind = $state<ActiveDocumentKind>("scene");
  currentMarkdown = $state("");
  vimMode = $state(false);
  paletteOpen = $state(false);
  commandQuery = $state("");
  selectedCommandIndex = $state(0);
  activeTheme = $state<ClarosThemeId>("default-light");
  startupReady = $state(false);
  sidebarOpen = $state(false);
  focusedSidebarItemId = $state("");
  saveState = $state<SaveState>("saved");
  projectOpenState = $state<ProjectOpenState>("idle");
  projectError = $state("");
  canOpenLocalProject = $state(false);
  selectedStorageBackendId = $state<StorageBackendId>("file-picker");
  openStorageBackendId = $state<StorageBackendId>("file-picker");
  storageBackendMenuOpen = $state(false);
  createProjectIntent = $state(false);
  companionConnection = $state<CompanionConnection>();
  collapsedItems = $state(new Set<string>(["notes"]));
  titleModal = $state<TitleModalState>();
  deleteModal = $state<DeleteModalState>();
  confirmationModal = $state<ConfirmationModalState>();
  contextMenu = $state<ContextMenuState>();
  editingProjectTitle = $state(false);
  projectTitleDraft = $state("");
  optimisticProjectTitle = $state<string>();
  optimisticChapterTitles = $state(new Map<string, string>());
  optimisticSceneTitles = $state(new Map<string, string>());
  editingSidebarItemId = $state("");
  sidebarTitleDraft = $state("");
  manuscriptDrag = $state<ManuscriptDragState>();

  readonly manuscriptDragController: ManuscriptDragController;

  private lastWorkspaceFocus = $state<WorkspaceFocusTarget>();
  private paletteReturnFocus = $state<WorkspaceFocusTarget>();
  private projectTitleReturnFocus = $state<WorkspaceFocusTarget>();
  private sidebarTitleReturnFocus = $state<WorkspaceFocusTarget>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private suppressEditorChange = false;
  private cleanupWindowListeners: Array<() => void> = [];
  private dragUnsubscribe: Unsubscriber;

  constructor(
    private readonly environment: BrowserEnvironment = createBrowserEnvironment(),
    private readonly editorRuntime: MarkdownEditorRuntime = createMarkdownEditorRuntime()
  ) {
    this.manuscriptDragController = new ManuscriptDragController({
      getChapters: () => this.chapters,
      getScenes: () => this.scenes,
      getCollapsedItems: () => this.collapsedItems,
      setCollapsedItems: (next) => {
        this.collapsedItems = next;
      },
      getSidebarNav: () => this.sidebarNav,
      isTitleEditing: () => this.editingSidebarItemId.length > 0,
      rowForItemId: (itemId) => this.sidebarItemElement(itemId),
      moveChapter: (chapterId, options) => this.moveChapter(chapterId, options),
      moveScene: (scenePath, options) => this.moveScene(scenePath, options),
    });
    this.dragUnsubscribe = this.manuscriptDragController.state.subscribe((drag) => {
      this.manuscriptDrag = drag;
    });
    $effect(() => {
      if (this.paletteOpen) {
        this.selectedCommandIndex = 0;
        void this.focusCommandInput();
      }
    });
    $effect(() => {
      this.normalizeSelectedCommandIndex();
    });
  }

  get chapters(): WorkspaceChapter[] {
    return listProjectChapters(this.projectRevision, this.project);
  }

  get scenes(): WorkspaceScene[] {
    return listProjectScenes(this.projectRevision, this.project);
  }

  get notes() {
    return listProjectNotes(this.projectRevision, this.project);
  }

  get displayProjectTitle(): string {
    return projectTitleForDisplay(this.projectRevision, this.project, this.optimisticProjectTitle);
  }

  get visibleChapters(): WorkspaceChapter[] {
    return this.manuscriptDragController.previewChapters(this.chapters, this.manuscriptDrag);
  }

  get sidebarItems(): SidebarItem[] {
    return buildSidebarItems(
      this.visibleChapters,
      this.notes,
      this.collapsedItems,
      this.optimisticChapterTitles,
      this.optimisticSceneTitles
    );
  }

  get activeScene(): WorkspaceScene | undefined {
    return this.scenes.find((scene) => scene.path === this.activePath);
  }

  get activeChapter(): WorkspaceChapter | undefined {
    const scene = this.activeScene;
    return scene === undefined
      ? undefined
      : this.chapters.find((chapter) => chapter.id === scene.chapterId);
  }

  get projectIsOpen(): boolean {
    return this.projectOpenState === "open";
  }

  get canDeleteCurrentScene(): boolean {
    return this.projectIsOpen && this.activeScene !== undefined && this.scenes.length > 1;
  }

  get canDeleteCurrentChapter(): boolean {
    const chapter = this.activeChapter;
    return this.projectIsOpen && chapter !== undefined && this.canDeleteChapter(chapter);
  }

  get canMoveCurrentSceneUp(): boolean {
    return this.projectIsOpen && this.activeSceneIndex > 0;
  }

  get canMoveCurrentSceneDown(): boolean {
    return (
      this.projectIsOpen &&
      this.activeSceneIndex >= 0 &&
      this.activeSceneIndex < this.scenes.length - 1
    );
  }

  get canMoveCurrentChapterUp(): boolean {
    return this.projectIsOpen && this.activeChapterIndex > 0;
  }

  get canMoveCurrentChapterDown(): boolean {
    return (
      this.projectIsOpen &&
      this.activeChapterIndex >= 0 &&
      this.activeChapterIndex < this.chapters.length - 1
    );
  }

  get storageBackendOptions(): StorageBackendOption[] {
    return buildStorageBackendOptions(this.canOpenLocalProject);
  }

  get selectedStorageBackend(): StorageBackendOption {
    return (
      this.storageBackendOptions.find((backend) => backend.id === this.selectedStorageBackendId) ??
      this.storageBackendOptions[0]
    );
  }

  get openStorageBackend(): StorageBackendOption {
    return (
      this.storageBackendOptions.find((backend) => backend.id === this.openStorageBackendId) ??
      this.storageBackendOptions[0]
    );
  }

  get paletteCommands(): PaletteCommand[] {
    return buildWorkspacePaletteCommands({
      currentTheme: this.activeTheme,
      currentVimMode: this.vimMode,
      currentProjectIsOpen: this.projectIsOpen,
      localProjectSupported: this.canOpenLocalProject,
      sidebarOpen: this.sidebarOpen,
      currentScene: this.activeScene,
      currentChapter: this.activeChapter,
      canMoveSceneUp: this.canMoveCurrentSceneUp,
      canMoveSceneDown: this.canMoveCurrentSceneDown,
      canMoveChapterUp: this.canMoveCurrentChapterUp,
      canMoveChapterDown: this.canMoveCurrentChapterDown,
      canDeleteScene: this.canDeleteCurrentScene,
      canDeleteChapter: this.canDeleteCurrentChapter,
      toggleSidebar: () => this.toggleSidebar(),
      openProjectWithBackend: (backendId) => void this.openProjectWithBackend(backendId),
      createProjectWithBackend: (backendId) => void this.createProjectWithBackend(backendId),
      flushSaveWithoutWaiting: () => this.flushSaveWithoutWaiting(),
      openProjectTitleModal: () => this.openProjectTitleModal(),
      openAppendChapterModal: () => this.openAppendChapterModal(),
      openInsertChapterModal: (placement, chapter) =>
        this.openInsertChapterModal(placement, chapter),
      openCurrentChapterTitleModal: () => this.openCurrentChapterTitleModal(),
      moveCurrentChapter: (direction) => void this.moveCurrentChapter(direction),
      openCurrentChapterDeleteModal: () => this.openCurrentChapterDeleteModal(),
      openAppendSceneModal: () => this.openAppendSceneModal(),
      openInsertSceneModal: (placement, scene) => this.openInsertSceneModal(placement, scene),
      openCurrentSceneTitleModal: () => this.openCurrentSceneTitleModal(),
      moveCurrentScene: (direction) => void this.moveCurrentScene(direction),
      openCurrentSceneDeleteModal: () => this.openCurrentSceneDeleteModal(),
      toggleVimMode: () => this.toggleVimMode(),
      setTheme: (themeId) => this.setTheme(themeId),
    });
  }

  get filteredCommands(): PaletteCommand[] {
    return filterCommands(this.paletteCommands, this.commandQuery);
  }

  get chapterDropIndicatorItemId(): string {
    return this.manuscriptDragController.chapterDropIndicatorItemId(
      this.visibleChapters,
      this.manuscriptDrag
    );
  }

  get sidebarContextMenuItems(): ActionMenuItem[] {
    return this.contextMenu === undefined
      ? []
      : this.buildSidebarContextMenuItems(this.contextMenu.item);
  }

  get paletteReturnFocusTarget(): WorkspaceFocusTarget | undefined {
    return this.paletteReturnFocus;
  }

  async mount(): Promise<void> {
    this.activeTheme = loadTheme(this.environment.storage);
    if (this.appShell !== undefined) {
      this.editorRuntime.applyTheme(this.appShell, this.activeTheme);
    }
    this.canOpenLocalProject = this.environment.canPickLocalDirectory();
    this.selectedStorageBackendId = this.canOpenLocalProject ? "file-picker" : "local-companion";
    this.companionConnection =
      companionConnectionFromUrl(this.environment.currentUrl) ??
      loadCompanionConnection(this.environment.storage);

    this.cleanupWindowListeners = [
      this.environment.addWindowListener("keydown", (event) => this.handleGlobalKeydown(event)),
      this.environment.addWindowListener("focus", () => {
        void this.repairWorkspaceFocus();
      }),
    ];

    if (this.companionConnection !== undefined) {
      saveCompanionConnection(this.environment.storage, this.companionConnection);
      await this.connectCompanion(this.companionConnection);
      await this.finishStartup();
      return;
    }
    this.startupReady = true;
  }

  destroy(): void {
    if (this.saveTimer !== undefined) {
      clearTimeout(this.saveTimer);
      void this.flushSave();
    }
    for (const cleanup of this.cleanupWindowListeners) {
      cleanup();
    }
    this.dragUnsubscribe();
    this.manuscriptDragController.destroy();
    this.editorRuntime.destroy();
  }

  normalizeSelectedCommandIndex(): void {
    this.selectedCommandIndex = clampCommandIndex(
      this.selectedCommandIndex,
      this.filteredCommands.length
    );
  }

  async focusCommandInput(): Promise<void> {
    await tick();
    this.commandInput?.focus();
  }

  async finishStartup(): Promise<void> {
    this.startupReady = true;
    if (this.projectIsOpen) {
      await this.ensureEditor();
      this.setEditorMarkdown(this.currentMarkdown);
      this.focusEditorWithDefaultCursor();
    }
  }

  async openLocalProject(): Promise<void> {
    if (!this.canOpenLocalProject) {
      this.projectOpenState = "error";
      this.projectError = "Local folder access is not supported in this browser.";
      return;
    }

    this.flushSaveWithoutWaiting();
    const hadOpenProject = this.projectIsOpen;
    if (!hadOpenProject) {
      this.projectOpenState = "opening";
    }
    this.projectError = "";
    try {
      const handle = await this.environment.pickWritableDirectory();
      this.project = await openLocalProjectSession(handle);
      this.activePath = firstDocumentPath(this.project);
      await this.loadDocument(this.activePath);
      this.projectOpenState = "open";
      this.openStorageBackendId = "file-picker";
      this.sidebarOpen = false;
      await this.ensureEditor();
      this.setEditorMarkdown(this.currentMarkdown);
      this.focusEditorWithDefaultCursor();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        this.projectOpenState = this.project ? "open" : "idle";
        return;
      }
      this.projectOpenState = hadOpenProject ? "open" : "error";
      this.projectError = error instanceof Error ? error.message : "Unable to open project";
    }
  }

  async createNewProject(title = "Untitled Project"): Promise<void> {
    if (!this.canOpenLocalProject) {
      this.projectOpenState = "error";
      this.projectError = "Local folder access is not supported in this browser.";
      return;
    }

    this.flushSaveWithoutWaiting();
    const hadOpenProject = this.projectIsOpen;
    if (!hadOpenProject) {
      this.projectOpenState = "creating";
    }
    this.projectError = "";
    try {
      const handle = await this.environment.pickWritableDirectory();
      this.project = await createNewLocalProjectSession(handle, title);
      this.activePath = firstDocumentPath(this.project);
      await this.loadDocument(this.activePath);
      this.projectOpenState = "open";
      this.openStorageBackendId = "file-picker";
      this.sidebarOpen = false;
      await this.ensureEditor();
      this.setEditorMarkdown(this.currentMarkdown);
      this.focusEditorWithDefaultCursor();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        this.projectOpenState = this.project ? "open" : "idle";
        return;
      }
      this.projectOpenState = hadOpenProject ? "open" : "error";
      this.projectError = error instanceof Error ? error.message : "Unable to create project";
    }
  }

  async openProjectWithBackend(backendId: StorageBackendId): Promise<void> {
    this.storageBackendMenuOpen = false;
    if (backendId === "file-picker") {
      await this.openLocalProject();
      return;
    }
    await this.connectCompanionFromPrompt();
  }

  async createProjectWithBackend(backendId: StorageBackendId): Promise<void> {
    this.storageBackendMenuOpen = false;
    this.openTitleModal({
      target: "new-project",
      heading: "New Project",
      value: "",
      placeholder: "Untitled Project",
      storageBackendId: backendId,
    });
  }

  async createProjectWithBackendTitle(backendId: StorageBackendId, title: string): Promise<void> {
    if (backendId === "file-picker") {
      await this.createNewProject(title);
      return;
    }
    await this.createNewCompanionProject(title);
  }

  selectStorageBackend(backend: StorageBackendOption): void {
    if (!backend.available) {
      return;
    }
    this.selectedStorageBackendId = backend.id;
    this.storageBackendMenuOpen = false;
  }

  async connectCompanionFromPrompt(): Promise<void> {
    const url = this.environment.prompt(
      "Local companion URL",
      this.companionConnection?.url ?? "http://127.0.0.1:3000"
    );
    if (url === null || url.trim().length === 0) {
      return;
    }
    const token = this.environment.prompt(
      "Local companion token",
      this.companionConnection?.token ?? ""
    );
    if (token === null || token.trim().length === 0) {
      return;
    }
    const connection = { url: url.trim(), token: token.trim() };
    saveCompanionConnection(this.environment.storage, connection);
    await this.connectCompanion(connection);
  }

  async connectCompanion(connection: CompanionConnection): Promise<void> {
    this.flushSaveWithoutWaiting();
    const hadOpenProject = this.projectIsOpen;
    if (!hadOpenProject) {
      this.projectOpenState = "connecting";
    }
    this.projectError = "";
    try {
      this.companionConnection = connection;
      this.project = await openCompanionProjectSession(connection);
      this.activePath = firstDocumentPath(this.project);
      await this.loadDocument(this.activePath);
      this.projectOpenState = "open";
      this.openStorageBackendId = "local-companion";
      this.sidebarOpen = false;
      await this.ensureEditor();
      this.setEditorMarkdown(this.currentMarkdown);
      this.focusEditorWithDefaultCursor();
    } catch (error) {
      this.projectOpenState = hadOpenProject ? "open" : "error";
      this.projectError =
        error instanceof Error ? error.message : "Unable to connect local companion";
    }
  }

  async createNewCompanionProject(title = "Untitled Project"): Promise<void> {
    let connection = this.companionConnection;
    if (connection === undefined) {
      const url = this.environment.prompt("Local companion URL", "http://127.0.0.1:3000");
      if (url === null || url.trim().length === 0) {
        return;
      }
      const token = this.environment.prompt("Local companion token", "");
      if (token === null || token.trim().length === 0) {
        return;
      }
      connection = { url: url.trim(), token: token.trim() };
      saveCompanionConnection(this.environment.storage, connection);
    }

    this.flushSaveWithoutWaiting();
    const hadOpenProject = this.projectIsOpen;
    if (!hadOpenProject) {
      this.projectOpenState = "creating";
    }
    this.projectError = "";
    try {
      this.companionConnection = connection;
      this.project = await createNewCompanionProjectSession(connection, title);
      this.activePath = firstDocumentPath(this.project);
      await this.loadDocument(this.activePath);
      this.projectOpenState = "open";
      this.openStorageBackendId = "local-companion";
      this.sidebarOpen = false;
      await this.ensureEditor();
      this.setEditorMarkdown(this.currentMarkdown);
      this.focusEditorWithDefaultCursor();
    } catch (error) {
      this.projectOpenState = hadOpenProject ? "open" : "error";
      this.projectError = error instanceof Error ? error.message : "Unable to create project";
    }
  }

  handleEditorChange(markdown: string): void {
    if (this.suppressEditorChange || !this.projectIsOpen) {
      return;
    }
    this.currentMarkdown = markdown;
    this.saveState = "dirty";
    this.scheduleSave();
  }

  async ensureEditor(): Promise<void> {
    await tick();
    if (this.editorHost === undefined) {
      return;
    }
    this.editorRuntime.ensure({
      parent: this.editorHost,
      doc: this.currentMarkdown,
      vimMode: this.vimMode,
      theme: this.activeTheme,
      onChange: (markdown) => this.handleEditorChange(markdown),
    });
  }

  scheduleSave(): void {
    if (this.saveTimer !== undefined) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      void this.flushSave();
    }, 550);
  }

  async flushSave(): Promise<void> {
    if (!this.project || !this.activePath) {
      return;
    }

    if (this.saveTimer !== undefined) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }

    this.saveState = "saving";
    try {
      await this.project.writeDocument({ path: this.activePath }, this.currentMarkdown);
      this.saveState = "saved";
    } catch {
      this.saveState = "error";
    }
  }

  flushSaveWithoutWaiting(): void {
    void this.flushSave();
  }

  refreshProjectView(): void {
    this.projectRevision += 1;
  }

  setEditorMarkdown(markdown: string): void {
    this.suppressEditorChange = true;
    try {
      this.editorRuntime.setMarkdown(markdown, this.defaultCursorForActiveDocument());
    } finally {
      this.suppressEditorChange = false;
    }
  }

  async loadDocument(path: string): Promise<void> {
    if (!this.project) {
      return;
    }

    const document = await this.project.readDocument({ path });
    this.activePath = document.path;
    this.activeTitle = document.title;
    this.activeDocumentKind = document.kind;
    this.currentMarkdown = document.body;
    this.saveState = "saved";
  }

  async openDocument(
    path: string,
    options: { forceReload?: boolean; skipSave?: boolean } = {}
  ): Promise<void> {
    if (path === this.activePath && options.forceReload !== true) {
      await this.focusEditorAfterOpen();
      return;
    }

    if (options.skipSave !== true) {
      await this.flushSave();
    }
    await this.loadDocument(path);
    this.setEditorMarkdown(this.currentMarkdown);
    await this.focusEditorAfterOpen();
  }

  async focusEditorAfterOpen(): Promise<void> {
    await tick();
    this.focusEditorWithDefaultCursor();
  }

  toggleVimMode(): void {
    if (!this.projectIsOpen) {
      return;
    }
    this.vimMode = !this.vimMode;
    this.editorRuntime.setVimMode(this.vimMode);
    if (this.paletteOpen) {
      this.focusEditor();
    } else {
      this.focusEditorPreservingSidebar();
    }
  }

  focusEditor(): void {
    this.paletteOpen = false;
    this.commandQuery = "";
    this.selectedCommandIndex = 0;
    if (this.projectIsOpen) {
      this.focusEditorWithDefaultCursor();
    }
  }

  focusEditorPreservingSidebar(): void {
    this.paletteOpen = false;
    this.commandQuery = "";
    this.selectedCommandIndex = 0;
    if (this.projectIsOpen) {
      this.editorRuntime.focus();
      this.rememberEditorFocus();
    }
  }

  defaultCursorForActiveDocument(): "start" | "end" {
    return this.activeDocumentKind === "note" ? "start" : "end";
  }

  focusEditorWithDefaultCursor(): void {
    if (!this.projectIsOpen) {
      return;
    }
    this.editorRuntime.focus({ cursor: this.defaultCursorForActiveDocument() });
    this.rememberEditorFocus();
  }

  rememberEditorFocus(): void {
    if (!this.projectIsOpen || !this.editorRuntime.exists) {
      return;
    }
    this.lastWorkspaceFocus = {
      region: "editor",
      path: this.activePath,
      cursor: this.editorRuntime.getCursorPosition(),
    };
  }

  rememberSidebarFocus(itemId = this.focusedSidebarItemId): void {
    if (!this.projectIsOpen || itemId.length === 0) {
      return;
    }
    this.lastWorkspaceFocus = { region: "sidebar", itemId };
  }

  captureWorkspaceFocus(): WorkspaceFocusTarget | undefined {
    const activeElement = this.environment.activeElement;
    if (activeElement !== null && this.editorHost?.contains(activeElement)) {
      this.rememberEditorFocus();
      return this.lastWorkspaceFocus;
    }
    if (activeElement !== null && this.sidebarNav?.contains(activeElement)) {
      this.rememberSidebarFocus();
      return this.lastWorkspaceFocus;
    }
    return this.lastWorkspaceFocus;
  }

  async restoreWorkspaceFocus(target = this.lastWorkspaceFocus): Promise<void> {
    if (!this.projectIsOpen || this.hasTransientFocus()) {
      return;
    }
    await tick();
    if (
      target?.region === "sidebar" &&
      this.sidebarOpen &&
      this.sidebarItems.some((item) => item.id === target.itemId)
    ) {
      this.focusedSidebarItemId = target.itemId;
      this.sidebarNav?.focus();
      this.rememberSidebarFocus(target.itemId);
      return;
    }
    if (target?.region === "editor" && target.path === this.activePath) {
      this.editorRuntime.focus({ cursor: target.cursor as MarkdownEditorCursor });
      this.rememberEditorFocus();
      return;
    }
    this.focusEditorWithDefaultCursor();
  }

  async repairWorkspaceFocus(): Promise<void> {
    if (!this.projectIsOpen || this.hasTransientFocus()) {
      return;
    }
    await tick();
    const activeElement = this.environment.activeElement;
    if (
      activeElement !== null &&
      (this.editorHost?.contains(activeElement) || this.sidebarNav?.contains(activeElement))
    ) {
      return;
    }
    await this.restoreWorkspaceFocus();
  }

  hasTransientFocus(): boolean {
    return (
      this.paletteOpen ||
      this.titleModal !== undefined ||
      this.deleteModal !== undefined ||
      this.confirmationModal !== undefined ||
      this.contextMenu !== undefined ||
      this.editingProjectTitle ||
      this.editingSidebarItemId.length > 0
    );
  }

  focusSidebar(): void {
    if (!this.projectIsOpen) {
      return;
    }
    this.paletteOpen = false;
    this.commandQuery = "";
    this.selectedCommandIndex = 0;
    if (!this.sidebarOpen) {
      this.sidebarOpen = true;
    }
    this.focusedSidebarItemId = this.activePath || this.sidebarItems[0]?.id || "";
    void tick().then(() => {
      this.sidebarNav?.focus();
      this.rememberSidebarFocus();
    });
  }

  preparePaletteReturnFocus(): void {
    this.paletteReturnFocus = this.captureWorkspaceFocus();
  }

  togglePalette(): void {
    if (!this.paletteOpen) {
      this.paletteReturnFocus = this.paletteReturnFocus ?? this.captureWorkspaceFocus();
      this.paletteOpen = true;
      this.commandQuery = "";
      this.selectedCommandIndex = 0;
      return;
    }
    this.closePalette();
  }

  closePalette(): void {
    const returnFocus = this.paletteReturnFocus;
    this.paletteOpen = false;
    this.commandQuery = "";
    this.selectedCommandIndex = 0;
    this.paletteReturnFocus = undefined;
    if (this.projectIsOpen) {
      void this.restoreWorkspaceFocus(returnFocus);
    }
  }

  toggleSidebar(): void {
    if (!this.projectIsOpen) {
      return;
    }
    this.sidebarOpen = !this.sidebarOpen;
    if (this.sidebarOpen) {
      this.focusedSidebarItemId = this.activePath || this.sidebarItems[0]?.id || "";
      void tick().then(() => {
        this.sidebarNav?.focus();
        this.rememberSidebarFocus();
      });
    } else {
      this.focusEditorPreservingSidebar();
    }
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
    if (this.projectIsOpen) {
      this.focusEditorPreservingSidebar();
    }
  }

  setTheme(themeId: ClarosThemeId): void {
    this.activeTheme = themeId;
    saveTheme(this.environment.storage, themeId);
    if (this.appShell !== undefined) {
      this.editorRuntime.applyTheme(this.appShell, themeId);
    }
    this.editorRuntime.setTheme(themeId);
  }

  runCommand(command: PaletteCommand): void {
    if (command.disabled === true) {
      return;
    }
    command.run();
    this.paletteOpen = false;
    this.commandQuery = "";
    this.selectedCommandIndex = 0;
    this.paletteReturnFocus = undefined;

    if (command.focusAfter === "sidebar" && this.projectIsOpen) {
      void tick().then(() => {
        this.sidebarNav?.focus();
        this.rememberSidebarFocus();
      });
      return;
    }

    if (command.focusAfter !== "none" && this.projectIsOpen) {
      void tick().then(() => this.focusEditorPreservingSidebar());
    }
  }

  runSelectedCommand(): void {
    const command = this.filteredCommands[this.selectedCommandIndex];
    if (command) {
      this.runCommand(command);
    }
  }

  moveSelectedCommand(delta: number): void {
    if (this.filteredCommands.length === 0) {
      this.selectedCommandIndex = 0;
      return;
    }

    this.selectedCommandIndex =
      (this.selectedCommandIndex + delta + this.filteredCommands.length) %
      this.filteredCommands.length;
  }

  handleCommandInputKeydown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.moveSelectedCommand(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.moveSelectedCommand(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      this.runSelectedCommand();
    }
  }

  handleCommandInput(): void {
    this.selectedCommandIndex = 0;
  }

  toggleCollapsed(itemId: string): void {
    const next = new Set(this.collapsedItems);
    if (next.has(itemId)) {
      next.delete(itemId);
    } else {
      next.add(itemId);
    }
    this.collapsedItems = next;
  }

  handleSidebarItemClick(item: SidebarItem): void {
    if (item.kind === "add-chapter") {
      this.openAppendChapterModal();
      return;
    }
    if (item.kind === "add-scene") {
      this.openAppendSceneModal();
      return;
    }
    if (item.path !== undefined) {
      void this.openDocument(item.path);
      return;
    }
    if (item.collapsible) {
      this.toggleCollapsed(item.id);
    }
  }

  handleSidebarKeydown(event: KeyboardEvent): void {
    if (
      this.editingSidebarItemId.length > 0 ||
      !(event.target instanceof Node) ||
      !this.sidebarNav?.contains(event.target)
    ) {
      return;
    }

    const currentIndex = this.sidebarItems.findIndex(
      (item) => item.id === this.focusedSidebarItemId
    );
    const intent = directionalIntentFromKeydown(event);

    if ((event.metaKey || event.ctrlKey) && event.key === "ArrowLeft") {
      event.preventDefault();
      this.focusSidebar();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "ArrowRight") {
      event.preventDefault();
      this.focusEditorPreservingSidebar();
      return;
    }

    if (intent === "down") {
      event.preventDefault();
      this.focusSidebarIndex(Math.min(currentIndex + 1, this.sidebarItems.length - 1));
      return;
    }

    if (intent === "up") {
      event.preventDefault();
      this.focusSidebarIndex(Math.max(currentIndex - 1, 0));
      return;
    }

    if (intent === "right") {
      event.preventDefault();
      if (!this.openFocusedSidebarContextMenu()) {
        this.expandFocusedItem();
      }
      return;
    }

    if (intent === "left") {
      event.preventDefault();
      this.collapseFocusedItem();
      return;
    }

    if (intent === "activate") {
      event.preventDefault();
      this.activateFocusedItem();
      return;
    }

    if (event.key.toLowerCase() === "m") {
      event.preventDefault();
      this.focusFirstItemOfKind("scene");
      return;
    }

    if (event.key.toLowerCase() === "n") {
      event.preventDefault();
      this.focusFirstItemOfKind("note");
    }
  }

  focusSidebarIndex(index: number): void {
    this.focusedSidebarItemId = this.sidebarItems[index]?.id ?? this.focusedSidebarItemId;
  }

  expandFocusedItem(): void {
    const item = this.sidebarItems.find((candidate) => candidate.id === this.focusedSidebarItemId);
    if (item?.collapsible && item.collapsed) {
      this.toggleCollapsed(item.id);
    }
  }

  openFocusedSidebarContextMenu(): boolean {
    const item = this.sidebarItems.find((candidate) => candidate.id === this.focusedSidebarItemId);
    if (item === undefined || !this.hasSidebarContextMenu(item)) {
      return false;
    }

    const anchor = this.sidebarItemElement(item.id);
    const rect = anchor?.getBoundingClientRect();
    this.openSidebarContextMenuAt(rect === undefined ? 0 : rect.right + 6, rect?.top ?? 0, item);
    return true;
  }

  collapseFocusedItem(): void {
    const item = this.sidebarItems.find((candidate) => candidate.id === this.focusedSidebarItemId);
    if (item?.collapsible && !item.collapsed) {
      this.toggleCollapsed(item.id);
    }
  }

  activateFocusedItem(): void {
    const item = this.sidebarItems.find((candidate) => candidate.id === this.focusedSidebarItemId);
    if (item?.kind === "add-chapter") {
      this.openAppendChapterModal();
      return;
    }
    if (item?.kind === "add-scene") {
      this.openAppendSceneModal();
      return;
    }
    if (item?.path !== undefined) {
      void this.openDocument(item.path);
      return;
    }
    if (item?.collapsible) {
      this.toggleCollapsed(item.id);
    }
  }

  focusFirstItemOfKind(kind: "scene" | "note"): void {
    const item = this.sidebarItems.find((candidate) => candidate.kind === kind);
    if (item !== undefined) {
      this.focusedSidebarItemId = item.id;
    }
  }

  sidebarItemElement(itemId: string): HTMLElement | undefined {
    return Array.from(
      this.sidebarNav?.querySelectorAll<HTMLElement>("[data-sidebar-item-id]") ?? []
    ).find((element) => element.dataset.sidebarItemId === itemId);
  }

  openTitleModal(state: TitleModalState): void {
    const returnFocus =
      state.returnFocus ?? this.paletteReturnFocus ?? this.captureWorkspaceFocus();
    this.paletteOpen = false;
    this.contextMenu = undefined;
    this.titleModal = { ...state, returnFocus };
  }

  openProjectTitleModal(): void {
    this.openTitleModal({
      target: "project",
      heading: "Project Title",
      value: this.displayProjectTitle,
      placeholder: "Untitled Project",
    });
  }

  openAppendChapterModal(): void {
    this.openChapterCreationModal("append");
  }

  openInsertChapterModal(
    placement: Exclude<ManuscriptInsertionPlacement, "append">,
    chapter: WorkspaceChapter | undefined
  ): void {
    if (chapter === undefined) {
      return;
    }
    this.openChapterCreationModal(placement, chapter.id);
  }

  openChapterCreationModal(
    placement: ManuscriptInsertionPlacement,
    targetChapterId?: string
  ): void {
    this.openTitleModal({
      target: "new-chapter",
      heading: "New Chapter",
      value: "",
      placeholder: `Chapter ${this.chapterCreationSequence(placement, targetChapterId)}`,
      createPlacement: placement,
      targetChapterId,
    });
  }

  openAppendSceneModal(): void {
    this.openSceneCreationModal("append");
  }

  openInsertSceneModal(
    placement: Exclude<ManuscriptInsertionPlacement, "append">,
    scene: WorkspaceScene | undefined
  ): void {
    if (scene === undefined) {
      return;
    }
    this.openSceneCreationModal(placement, scene.path);
  }

  openSceneCreationModal(placement: ManuscriptInsertionPlacement, targetScenePath?: string): void {
    this.openTitleModal({
      target: "new-scene",
      heading: "New Scene",
      value: "",
      placeholder: `Scene ${this.sceneCreationSequence(placement, targetScenePath)}`,
      createPlacement: placement,
      targetScenePath,
    });
  }

  chapterCreationSequence(
    placement: ManuscriptInsertionPlacement,
    targetChapterId?: string
  ): number {
    if (placement === "append" || targetChapterId === undefined) {
      return this.chapters.length + 1;
    }
    const targetIndex = this.chapters.findIndex((chapter) => chapter.id === targetChapterId);
    if (targetIndex === -1) {
      return this.chapters.length + 1;
    }
    return placement === "before" ? targetIndex + 1 : targetIndex + 2;
  }

  sceneCreationSequence(placement: ManuscriptInsertionPlacement, targetScenePath?: string): number {
    if (placement === "append" || targetScenePath === undefined) {
      return this.scenes.length + 1;
    }
    const targetIndex = this.scenes.findIndex((scene) => scene.path === targetScenePath);
    if (targetIndex === -1) {
      return this.scenes.length + 1;
    }
    return placement === "before" ? targetIndex + 1 : targetIndex + 2;
  }

  firstSceneSequenceForChapterCreation(
    placement: ManuscriptInsertionPlacement | undefined,
    targetChapterId?: string
  ): number {
    if (placement === undefined || placement === "append" || targetChapterId === undefined) {
      return this.scenes.length + 1;
    }
    const targetIndex = this.chapters.findIndex((chapter) => chapter.id === targetChapterId);
    if (targetIndex === -1) {
      return this.scenes.length + 1;
    }
    return (
      this.scenes.filter((scene) => {
        const chapterIndex = this.chapters.findIndex((chapter) => chapter.id === scene.chapterId);
        return placement === "before" ? chapterIndex < targetIndex : chapterIndex <= targetIndex;
      }).length + 1
    );
  }

  openCurrentChapterTitleModal(): void {
    if (this.activeChapter === undefined) {
      return;
    }
    this.openTitleModal({
      target: "chapter",
      heading: "Chapter Title",
      value: this.activeChapter.title,
      placeholder: `Chapter ${this.activeChapter.sequence}`,
      chapterId: this.activeChapter.id,
    });
  }

  openCurrentSceneTitleModal(): void {
    if (this.activeScene === undefined) {
      return;
    }
    this.openTitleModal({
      target: "scene",
      heading: "Scene Title",
      value: this.activeScene.title,
      placeholder: `Scene ${this.activeScene.sequence}`,
      scenePath: this.activeScene.path,
    });
  }

  openCurrentChapterDeleteModal(): void {
    const chapter = this.activeChapter;
    if (chapter !== undefined && this.canDeleteChapter(chapter)) {
      this.openDeleteChapterModal(chapter);
    }
  }

  openCurrentSceneDeleteModal(): void {
    const scene = this.activeScene;
    if (scene !== undefined && this.canDeleteScene()) {
      this.openDeleteSceneModal(scene);
    }
  }

  openDeleteChapterModal(chapter: WorkspaceChapter): void {
    this.contextMenu = undefined;
    this.deleteModal = {
      target: "chapter",
      heading: "Delete Chapter",
      label: chapter.title,
      chapterId: chapter.id,
      confirmation: "",
    };
  }

  openDeleteSceneModal(scene: WorkspaceScene): void {
    this.contextMenu = undefined;
    this.deleteModal = {
      target: "scene",
      heading: "Delete Scene",
      label: scene.title,
      scenePath: scene.path,
      confirmation: "",
    };
  }

  async submitTitleModal(): Promise<void> {
    if (this.titleModal === undefined) {
      return;
    }
    const modal = this.titleModal;
    this.titleModal = undefined;
    await this.flushSave();
    if (modal.target === "new-project" && modal.storageBackendId !== undefined) {
      await this.createProjectWithBackendTitle(modal.storageBackendId, modal.value);
      return;
    }
    if (this.project === undefined) {
      return;
    }
    if (modal.target === "project") {
      await this.setProjectTitleFromInput(modal.value);
      await this.restoreWorkspaceFocus(modal.returnFocus);
      return;
    }
    if (modal.target === "new-chapter") {
      this.openTitleModal({
        target: "new-chapter-scene",
        heading: "New Scene",
        value: "",
        placeholder: `Scene ${this.firstSceneSequenceForChapterCreation(
          modal.createPlacement,
          modal.targetChapterId
        )}`,
        chapterTitle: modal.value,
        createPlacement: modal.createPlacement,
        targetChapterId: modal.targetChapterId,
        returnFocus: modal.returnFocus,
      });
      return;
    }
    if (modal.target === "new-chapter-scene") {
      const scene = await this.project.createChapter(modal.chapterTitle ?? "", modal.value, {
        placement: modal.createPlacement,
        targetChapterId: modal.targetChapterId,
      });
      this.refreshProjectView();
      await this.openDocument(scene.path);
      return;
    }
    if (modal.target === "new-scene") {
      const scene = await this.project.createScene(modal.value, {
        placement: modal.createPlacement,
        targetScenePath: modal.targetScenePath,
      });
      this.refreshProjectView();
      await this.openDocument(scene.path);
      return;
    }
    if (modal.target === "chapter" && modal.chapterId !== undefined) {
      await this.setChapterTitleFromInput(modal.chapterId, modal.value);
      await this.restoreWorkspaceFocus(modal.returnFocus);
      return;
    }
    if (modal.target === "scene" && modal.scenePath !== undefined) {
      await this.setSceneTitleFromInput(modal.scenePath, modal.value);
      if (modal.scenePath === this.activePath) {
        await this.loadDocument(this.activePath);
      }
      await this.restoreWorkspaceFocus(modal.returnFocus);
    }
  }

  async submitDeleteModal(): Promise<void> {
    if (
      this.deleteModal === undefined ||
      this.project === undefined ||
      this.deleteModal.confirmation !== "delete"
    ) {
      return;
    }
    const modal = this.deleteModal;
    this.deleteModal = undefined;
    await this.flushSave();
    if (modal.target === "chapter" && modal.chapterId !== undefined) {
      const nextPath = await this.project.deleteChapter(modal.chapterId);
      this.refreshProjectView();
      await this.openDocument(nextPath, { forceReload: true, skipSave: true });
      return;
    }
    if (modal.target === "scene" && modal.scenePath !== undefined) {
      const nextPath = await this.project.deleteScene(modal.scenePath);
      this.refreshProjectView();
      await this.openDocument(nextPath, { forceReload: true, skipSave: true });
    }
  }

  closeTitleModal(): void {
    const returnFocus = this.titleModal?.returnFocus;
    this.titleModal = undefined;
    void this.restoreWorkspaceFocus(returnFocus);
  }

  closeDeleteModal(): void {
    this.deleteModal = undefined;
    void this.restoreWorkspaceFocus();
  }

  closeConfirmationModal(): void {
    this.confirmationModal = undefined;
    void this.restoreWorkspaceFocus();
  }

  submitConfirmationModal(): void {
    const modal = this.confirmationModal;
    this.confirmationModal = undefined;
    modal?.onConfirm();
  }

  prepareProjectTitleEdit(): void {
    this.projectTitleReturnFocus = this.captureWorkspaceFocus();
  }

  beginProjectTitleEdit(): void {
    if (!this.projectIsOpen) {
      return;
    }
    this.projectTitleReturnFocus = this.projectTitleReturnFocus ?? this.captureWorkspaceFocus();
    this.projectTitleDraft = this.project?.manifest.title ?? "";
    this.editingProjectTitle = true;
    void tick().then(() => {
      const input = this.environment.querySelector<HTMLInputElement>(".project-title-input");
      input?.focus();
      input?.select();
    });
  }

  handleProjectTitleKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      void this.commitProjectTitleEdit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.cancelInlineTitleEdit();
    }
  }

  async commitProjectTitleEdit(): Promise<void> {
    if (!this.project || !this.editingProjectTitle) {
      return;
    }
    const returnFocus = this.projectTitleReturnFocus;
    this.projectTitleReturnFocus = undefined;
    this.editingProjectTitle = false;
    await this.setProjectTitleFromInput(this.projectTitleDraft);
    await this.restoreWorkspaceFocus(returnFocus);
  }

  async setProjectTitleFromInput(title: string): Promise<void> {
    if (this.project === undefined) {
      return;
    }
    this.optimisticProjectTitle = normalizedProjectTitle(title);
    try {
      await this.project.setProjectTitle(title);
    } finally {
      this.optimisticProjectTitle = undefined;
      this.refreshProjectView();
    }
  }

  async setChapterTitleFromInput(chapterId: string, title: string): Promise<void> {
    if (this.project === undefined) {
      return;
    }
    const nextTitle = normalizedChapterTitle(chapterId, title, this.chapters);
    const activeSceneSequence =
      this.activeChapter?.id === chapterId ? this.activeScene?.sequence : undefined;
    this.optimisticChapterTitles = new Map(this.optimisticChapterTitles).set(chapterId, nextTitle);
    try {
      const updatedChapter = await this.project.setChapterTitle(chapterId, title);
      const updatedActiveScene =
        activeSceneSequence === undefined
          ? undefined
          : updatedChapter.scenes.find((scene) => scene.sequence === activeSceneSequence);
      if (updatedActiveScene !== undefined) {
        await this.loadDocument(updatedActiveScene.path);
        this.setEditorMarkdown(this.currentMarkdown);
      }
    } finally {
      const next = new Map(this.optimisticChapterTitles);
      next.delete(chapterId);
      this.optimisticChapterTitles = next;
      this.refreshProjectView();
    }
  }

  async setSceneTitleFromInput(scenePath: string, title: string): Promise<void> {
    if (this.project === undefined) {
      return;
    }
    const nextTitle = normalizedSceneTitle(scenePath, title, this.scenes);
    this.optimisticSceneTitles = new Map(this.optimisticSceneTitles).set(scenePath, nextTitle);
    if (scenePath === this.activePath) {
      this.activeTitle = nextTitle;
    }
    try {
      const updatedScene = await this.project.setSceneTitle(scenePath, title);
      if (scenePath === this.activePath) {
        await this.loadDocument(updatedScene.path);
        this.setEditorMarkdown(this.currentMarkdown);
      }
    } finally {
      const next = new Map(this.optimisticSceneTitles);
      next.delete(scenePath);
      this.optimisticSceneTitles = next;
      this.refreshProjectView();
    }
  }

  beginSidebarTitleEdit(item: SidebarItem): void {
    this.sidebarTitleReturnFocus = this.captureWorkspaceFocus();
    this.editingSidebarItemId = item.id;
    this.sidebarTitleDraft = item.label;
    this.contextMenu = undefined;
    void tick().then(() => {
      const input = this.environment.querySelector<HTMLInputElement>(".sidebar-title-input");
      input?.focus();
      input?.select();
    });
  }

  async commitSidebarTitleEdit(item: SidebarItem): Promise<void> {
    if (!this.project || this.editingSidebarItemId !== item.id) {
      return;
    }
    const returnFocus = this.sidebarTitleReturnFocus;
    this.sidebarTitleReturnFocus = undefined;
    this.editingSidebarItemId = "";
    if (item.kind === "chapter" && item.chapterId !== undefined) {
      await this.setChapterTitleFromInput(item.chapterId, this.sidebarTitleDraft);
    }
    if (item.kind === "scene" && item.path !== undefined) {
      await this.setSceneTitleFromInput(item.path, this.sidebarTitleDraft);
      if (item.path === this.activePath) {
        await this.loadDocument(this.activePath);
      }
    }
    await this.restoreWorkspaceFocus(returnFocus);
  }

  cancelInlineTitleEdit(): void {
    const returnFocus = this.sidebarTitleReturnFocus ?? this.projectTitleReturnFocus;
    this.editingProjectTitle = false;
    this.editingSidebarItemId = "";
    this.projectTitleReturnFocus = undefined;
    this.sidebarTitleReturnFocus = undefined;
    void this.restoreWorkspaceFocus(returnFocus);
  }

  openSidebarContextMenu(event: MouseEvent, item: SidebarItem): void {
    if (!this.hasSidebarContextMenu(item)) {
      return;
    }
    event.preventDefault();
    this.openSidebarContextMenuAt(event.clientX, event.clientY, item);
  }

  openSidebarContextMenuAt(x: number, y: number, item: SidebarItem): void {
    this.focusedSidebarItemId = item.id;
    this.rememberSidebarFocus(item.id);
    this.contextMenu = { x, y, item };
  }

  closeSidebarContextMenu(): void {
    const returnFocus =
      this.contextMenu === undefined
        ? undefined
        : { region: "sidebar" as const, itemId: this.contextMenu.item.id };
    this.contextMenu = undefined;
    if (returnFocus !== undefined) {
      void this.restoreWorkspaceFocus(returnFocus);
    }
  }

  hasSidebarContextMenu(item: SidebarItem): boolean {
    return item.kind === "chapter" || item.kind === "scene";
  }

  beginContextMenuTitleEdit(): void {
    if (this.contextMenu !== undefined) {
      this.beginSidebarTitleEdit(this.contextMenu.item);
    }
  }

  canDeleteChapter(chapter: WorkspaceChapter): boolean {
    return this.chapters.length > 1 && this.scenes.some((scene) => scene.chapterId !== chapter.id);
  }

  canDeleteScene(): boolean {
    return this.scenes.length > 1;
  }

  canMoveChapter(chapter: WorkspaceChapter, direction: "up" | "down"): boolean {
    const index = this.chapters.findIndex((candidate) => candidate.id === chapter.id);
    return direction === "up" ? index > 0 : index >= 0 && index < this.chapters.length - 1;
  }

  canMoveScene(scene: WorkspaceScene, direction: "up" | "down"): boolean {
    const index = this.scenes.findIndex((candidate) => candidate.path === scene.path);
    return direction === "up" ? index > 0 : index >= 0 && index < this.scenes.length - 1;
  }

  async moveCurrentChapter(direction: "up" | "down"): Promise<void> {
    if (this.activeChapter !== undefined) {
      await this.moveChapterByDirection(this.activeChapter, direction);
    }
  }

  async moveCurrentScene(direction: "up" | "down"): Promise<void> {
    if (this.activeScene !== undefined) {
      await this.moveSceneByDirection(this.activeScene, direction);
    }
  }

  async moveChapterByDirection(chapter: WorkspaceChapter, direction: "up" | "down"): Promise<void> {
    const index = this.chapters.findIndex((candidate) => candidate.id === chapter.id);
    const target = this.chapters[direction === "up" ? index - 1 : index + 1];
    if (this.project === undefined || target === undefined) {
      return;
    }
    await this.moveChapter(chapter.id, {
      placement: direction === "up" ? "before" : "after",
      targetChapterId: target.id,
    });
  }

  async moveSceneByDirection(scene: WorkspaceScene, direction: "up" | "down"): Promise<void> {
    const index = this.scenes.findIndex((candidate) => candidate.path === scene.path);
    const target = this.scenes[direction === "up" ? index - 1 : index + 1];
    if (this.project === undefined || target === undefined) {
      return;
    }
    await this.moveScene(scene.path, {
      placement: direction === "up" ? "before" : "after",
      targetScenePath: target.path,
    });
  }

  async moveChapter(
    chapterId: string,
    options: { placement: "before" | "after"; targetChapterId: string }
  ): Promise<void> {
    if (this.project === undefined) {
      return;
    }
    this.contextMenu = undefined;
    await this.flushSave();
    const move = await this.project.moveChapter(chapterId, options);
    await this.refreshAfterMove(move);
  }

  async moveScene(
    scenePath: string,
    options: SceneMoveOptions,
    moveOptions: { skipEmptyChapterConfirmation?: boolean } = {}
  ): Promise<void> {
    if (this.project === undefined) {
      return;
    }
    this.contextMenu = undefined;
    if (
      !moveOptions.skipEmptyChapterConfirmation &&
      this.shouldConfirmEmptyChapterDeletion(scenePath, options)
    ) {
      this.openEmptyChapterMoveConfirmation(scenePath, options);
      return;
    }
    await this.flushSave();
    const move = await this.project.moveScene(scenePath, options);
    await this.refreshAfterMove(move);
  }

  shouldConfirmEmptyChapterDeletion(scenePath: string, options: SceneMoveOptions): boolean {
    const scene = this.scenes.find((candidate) => candidate.path === scenePath);
    const targetChapterId = this.targetChapterIdForSceneMove(options);
    return (
      scene !== undefined &&
      targetChapterId !== undefined &&
      targetChapterId !== scene.chapterId &&
      this.scenes.filter((candidate) => candidate.chapterId === scene.chapterId).length === 1
    );
  }

  targetChapterIdForSceneMove(options: SceneMoveOptions): string | undefined {
    if (options.placement === "append") {
      return options.targetChapterId;
    }
    return this.scenes.find((scene) => scene.path === options.targetScenePath)?.chapterId;
  }

  openEmptyChapterMoveConfirmation(scenePath: string, options: SceneMoveOptions): void {
    const scene = this.scenes.find((candidate) => candidate.path === scenePath);
    const chapter =
      scene === undefined
        ? undefined
        : this.chapters.find((candidate) => candidate.id === scene.chapterId);
    const sceneLabel = scene?.title ?? "this scene";
    const chapterLabel = chapter?.title ?? "its current chapter";
    this.confirmationModal = {
      heading: "Delete Empty Chapter?",
      message: `Moving "${sceneLabel}" out of "${chapterLabel}" will delete the empty chapter.`,
      confirmLabel: "Move and Delete Chapter",
      cancelLabel: "Cancel",
      onConfirm: () => {
        void this.moveScene(scenePath, options, { skipEmptyChapterConfirmation: true });
      },
    };
  }

  async refreshAfterMove(move: WorkspaceMoveResult): Promise<void> {
    const nextActivePath = move.pathMap[this.activePath] ?? this.activePath;
    this.refreshProjectView();
    if (
      nextActivePath !== this.activePath ||
      this.scenes.some((scene) => scene.path === nextActivePath)
    ) {
      await this.openDocument(nextActivePath, { forceReload: true, skipSave: true });
    }
  }

  buildSidebarContextMenuItems(item: SidebarItem): ActionMenuItem[] {
    const menuItems: ActionMenuItem[] = [
      { label: "Change title", run: () => this.beginContextMenuTitleEdit() },
    ];

    if (item.kind === "chapter") {
      const chapter = this.chapterForItem(item);
      menuItems.push({
        label: "Add new chapter",
        disabled: chapter === undefined,
        submenu: [
          { label: "Before", run: () => this.openInsertChapterModal("before", chapter) },
          { label: "After", run: () => this.openInsertChapterModal("after", chapter) },
        ],
      });
      menuItems.push({
        label: "Move",
        disabled: chapter === undefined,
        submenu: [
          {
            label: "Up",
            disabled: chapter === undefined || !this.canMoveChapter(chapter, "up"),
            run: () => {
              if (chapter !== undefined) void this.moveChapterByDirection(chapter, "up");
            },
          },
          {
            label: "Down",
            disabled: chapter === undefined || !this.canMoveChapter(chapter, "down"),
            run: () => {
              if (chapter !== undefined) void this.moveChapterByDirection(chapter, "down");
            },
          },
        ],
      });
      menuItems.push({
        label: "Delete chapter",
        disabled: chapter === undefined || !this.canDeleteChapter(chapter),
        run: () => {
          if (chapter !== undefined) this.openDeleteChapterModal(chapter);
        },
      });
      return menuItems;
    }

    const scene = this.sceneForItem(item);
    menuItems.push({
      label: "Add new scene",
      disabled: scene === undefined,
      submenu: [
        { label: "Before", run: () => this.openInsertSceneModal("before", scene) },
        { label: "After", run: () => this.openInsertSceneModal("after", scene) },
      ],
    });
    menuItems.push({
      label: "Move",
      disabled: scene === undefined,
      submenu: [
        {
          label: "Up",
          disabled: scene === undefined || !this.canMoveScene(scene, "up"),
          run: () => {
            if (scene !== undefined) void this.moveSceneByDirection(scene, "up");
          },
        },
        {
          label: "Down",
          disabled: scene === undefined || !this.canMoveScene(scene, "down"),
          run: () => {
            if (scene !== undefined) void this.moveSceneByDirection(scene, "down");
          },
        },
      ],
    });
    menuItems.push({
      label: "Delete scene",
      disabled: scene === undefined || !this.canDeleteScene(),
      run: () => {
        if (scene !== undefined) this.openDeleteSceneModal(scene);
      },
    });
    return menuItems;
  }

  private get activeSceneIndex(): number {
    const scene = this.activeScene;
    return scene === undefined
      ? -1
      : this.scenes.findIndex((candidate) => candidate.path === scene.path);
  }

  private get activeChapterIndex(): number {
    const chapter = this.activeChapter;
    return chapter === undefined
      ? -1
      : this.chapters.findIndex((candidate) => candidate.id === chapter.id);
  }

  private handleGlobalKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      this.togglePalette();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
      event.preventDefault();
      if (this.projectIsOpen) this.toggleSidebar();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "ArrowLeft") {
      event.preventDefault();
      if (this.projectIsOpen) this.focusSidebar();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "ArrowRight") {
      event.preventDefault();
      if (this.projectIsOpen) this.focusEditorPreservingSidebar();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "v") {
      event.preventDefault();
      if (this.projectIsOpen) this.toggleVimMode();
      return;
    }
    if (event.key === "Escape") {
      this.handleEscape(event);
    }
  }

  private handleEscape(event: KeyboardEvent): void {
    if (this.manuscriptDrag !== undefined) {
      event.preventDefault();
      this.manuscriptDragController.cancel();
      return;
    }
    if (this.storageBackendMenuOpen) {
      this.storageBackendMenuOpen = false;
      return;
    }
    if (this.contextMenu !== undefined) {
      this.closeSidebarContextMenu();
      return;
    }
    if (this.editingProjectTitle || this.editingSidebarItemId.length > 0) {
      this.cancelInlineTitleEdit();
      return;
    }
    if (this.titleModal !== undefined) {
      this.closeTitleModal();
      return;
    }
    if (this.deleteModal !== undefined) {
      this.closeDeleteModal();
      return;
    }
    if (this.confirmationModal !== undefined) {
      this.closeConfirmationModal();
      return;
    }
    if (this.paletteOpen) {
      this.closePalette();
      return;
    }
    if (this.projectIsOpen && this.sidebarOpen) {
      this.closeSidebar();
    }
  }

  private chapterForItem(item: SidebarItem): WorkspaceChapter | undefined {
    return item.chapterId === undefined
      ? undefined
      : this.chapters.find((chapter) => chapter.id === item.chapterId);
  }

  private sceneForItem(item: SidebarItem): WorkspaceScene | undefined {
    return item.path === undefined
      ? undefined
      : this.scenes.find((scene) => scene.path === item.path);
  }
}

export function createWorkspaceController(): WorkspaceController {
  return new WorkspaceController();
}
