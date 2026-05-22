import type { Unsubscriber } from "svelte/store";
import type { ClarosThemeId } from "@claros/editor-core";

import type { ManuscriptDragController, ManuscriptDragState } from "$lib/manuscript-drag";
import type {
  CompanionConnection,
  ProjectSession,
  WorkspaceChapter,
  WorkspaceScene,
} from "$lib/project-session";
import { buildSidebarItems } from "$lib/sidebar-model";
import { buildStorageBackendOptions, type StorageBackendOption } from "$lib/storage-backends";
import type {
  ActiveDocumentKind,
  ConfirmationModalState,
  ContextMenuState,
  DeleteModalState,
  ProjectOpenState,
  SaveState,
  SidebarItem,
  StorageBackendId,
  TitleModalState,
  WorkspaceFocusTarget,
} from "$lib/workspace-types";
import {
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
import {
  WorkspaceDocumentState,
  WorkspaceFocusState,
  WorkspaceOverlayState,
  WorkspacePaletteState,
  WorkspaceProjectState,
  WorkspaceShellState,
  WorkspaceSidebarState,
  WorkspaceTitleState,
} from "./workspace-state.svelte";

export class WorkspaceContext {
  readonly shell = new WorkspaceShellState();
  readonly projects = new WorkspaceProjectState();
  readonly documents = new WorkspaceDocumentState();
  readonly palette = new WorkspacePaletteState();
  readonly sidebar = new WorkspaceSidebarState();
  readonly overlays = new WorkspaceOverlayState();
  readonly titles = new WorkspaceTitleState();
  readonly focus = new WorkspaceFocusState();

  constructor(
    readonly environment: BrowserEnvironment = createBrowserEnvironment(),
    readonly editorRuntime: MarkdownEditorRuntime = createMarkdownEditorRuntime()
  ) {}

  get appShell(): HTMLElement | undefined {
    return this.shell.appShell;
  }
  set appShell(value: HTMLElement | undefined) {
    this.shell.appShell = value;
  }

  get editorHost(): HTMLDivElement | undefined {
    return this.documents.editorHost;
  }
  set editorHost(value: HTMLDivElement | undefined) {
    this.documents.editorHost = value;
  }

  get commandInput(): HTMLInputElement | undefined {
    return this.palette.commandInput;
  }
  set commandInput(value: HTMLInputElement | undefined) {
    this.palette.commandInput = value;
  }

  get sidebarNav(): HTMLElement | undefined {
    return this.sidebar.sidebarNav;
  }
  set sidebarNav(value: HTMLElement | undefined) {
    this.sidebar.sidebarNav = value;
  }

  get project(): ProjectSession | undefined {
    return this.projects.project;
  }
  set project(value: ProjectSession | undefined) {
    this.projects.project = value;
  }

  get projectRevision(): number {
    return this.projects.projectRevision;
  }
  set projectRevision(value: number) {
    this.projects.projectRevision = value;
  }

  get activePath(): string {
    return this.documents.activePath;
  }
  set activePath(value: string) {
    this.documents.activePath = value;
  }

  get activeTitle(): string {
    return this.documents.activeTitle;
  }
  set activeTitle(value: string) {
    this.documents.activeTitle = value;
  }

  get activeDocumentKind(): ActiveDocumentKind {
    return this.documents.activeDocumentKind;
  }
  set activeDocumentKind(value: ActiveDocumentKind) {
    this.documents.activeDocumentKind = value;
  }

  get currentMarkdown(): string {
    return this.documents.currentMarkdown;
  }
  set currentMarkdown(value: string) {
    this.documents.currentMarkdown = value;
  }

  get vimMode(): boolean {
    return this.documents.vimMode;
  }
  set vimMode(value: boolean) {
    this.documents.vimMode = value;
  }

  get paletteOpen(): boolean {
    return this.palette.paletteOpen;
  }
  set paletteOpen(value: boolean) {
    this.palette.paletteOpen = value;
  }

  get commandQuery(): string {
    return this.palette.commandQuery;
  }
  set commandQuery(value: string) {
    this.palette.commandQuery = value;
  }

  get selectedCommandIndex(): number {
    return this.palette.selectedCommandIndex;
  }
  set selectedCommandIndex(value: number) {
    this.palette.selectedCommandIndex = value;
  }

  get activeTheme(): ClarosThemeId {
    return this.shell.activeTheme;
  }
  set activeTheme(value: ClarosThemeId) {
    this.shell.activeTheme = value;
  }

  get startupReady(): boolean {
    return this.shell.startupReady;
  }
  set startupReady(value: boolean) {
    this.shell.startupReady = value;
  }

  get sidebarOpen(): boolean {
    return this.sidebar.sidebarOpen;
  }
  set sidebarOpen(value: boolean) {
    this.sidebar.sidebarOpen = value;
  }

  get focusedSidebarItemId(): string {
    return this.sidebar.focusedSidebarItemId;
  }
  set focusedSidebarItemId(value: string) {
    this.sidebar.focusedSidebarItemId = value;
  }

  get saveState(): SaveState {
    return this.documents.saveState;
  }
  set saveState(value: SaveState) {
    this.documents.saveState = value;
  }

  get projectOpenState(): ProjectOpenState {
    return this.projects.projectOpenState;
  }
  set projectOpenState(value: ProjectOpenState) {
    this.projects.projectOpenState = value;
  }

  get projectError(): string {
    return this.projects.projectError;
  }
  set projectError(value: string) {
    this.projects.projectError = value;
  }

  get canOpenLocalProject(): boolean {
    return this.projects.canOpenLocalProject;
  }
  set canOpenLocalProject(value: boolean) {
    this.projects.canOpenLocalProject = value;
  }

  get selectedStorageBackendId(): StorageBackendId {
    return this.projects.selectedStorageBackendId;
  }
  set selectedStorageBackendId(value: StorageBackendId) {
    this.projects.selectedStorageBackendId = value;
  }

  get openStorageBackendId(): StorageBackendId {
    return this.projects.openStorageBackendId;
  }
  set openStorageBackendId(value: StorageBackendId) {
    this.projects.openStorageBackendId = value;
  }

  get storageBackendMenuOpen(): boolean {
    return this.projects.storageBackendMenuOpen;
  }
  set storageBackendMenuOpen(value: boolean) {
    this.projects.storageBackendMenuOpen = value;
  }

  get createProjectIntent(): boolean {
    return this.projects.createProjectIntent;
  }
  set createProjectIntent(value: boolean) {
    this.projects.createProjectIntent = value;
  }

  get companionConnection(): CompanionConnection | undefined {
    return this.projects.companionConnection;
  }
  set companionConnection(value: CompanionConnection | undefined) {
    this.projects.companionConnection = value;
  }

  get collapsedItems(): Set<string> {
    return this.sidebar.collapsedItems;
  }
  set collapsedItems(value: Set<string>) {
    this.sidebar.collapsedItems = value;
  }

  get titleModal(): TitleModalState | undefined {
    return this.overlays.titleModal;
  }
  set titleModal(value: TitleModalState | undefined) {
    this.overlays.titleModal = value;
  }

  get deleteModal(): DeleteModalState | undefined {
    return this.overlays.deleteModal;
  }
  set deleteModal(value: DeleteModalState | undefined) {
    this.overlays.deleteModal = value;
  }

  get confirmationModal(): ConfirmationModalState | undefined {
    return this.overlays.confirmationModal;
  }
  set confirmationModal(value: ConfirmationModalState | undefined) {
    this.overlays.confirmationModal = value;
  }

  get contextMenu(): ContextMenuState | undefined {
    return this.overlays.contextMenu;
  }
  set contextMenu(value: ContextMenuState | undefined) {
    this.overlays.contextMenu = value;
  }

  get editingProjectTitle(): boolean {
    return this.titles.editingProjectTitle;
  }
  set editingProjectTitle(value: boolean) {
    this.titles.editingProjectTitle = value;
  }

  get projectTitleDraft(): string {
    return this.titles.projectTitleDraft;
  }
  set projectTitleDraft(value: string) {
    this.titles.projectTitleDraft = value;
  }

  get optimisticProjectTitle(): string | undefined {
    return this.titles.optimisticProjectTitle;
  }
  set optimisticProjectTitle(value: string | undefined) {
    this.titles.optimisticProjectTitle = value;
  }

  get optimisticChapterTitles(): Map<string, string> {
    return this.titles.optimisticChapterTitles;
  }
  set optimisticChapterTitles(value: Map<string, string>) {
    this.titles.optimisticChapterTitles = value;
  }

  get optimisticSceneTitles(): Map<string, string> {
    return this.titles.optimisticSceneTitles;
  }
  set optimisticSceneTitles(value: Map<string, string>) {
    this.titles.optimisticSceneTitles = value;
  }

  get editingSidebarItemId(): string {
    return this.sidebar.editingSidebarItemId;
  }
  set editingSidebarItemId(value: string) {
    this.sidebar.editingSidebarItemId = value;
  }

  get sidebarTitleDraft(): string {
    return this.sidebar.sidebarTitleDraft;
  }
  set sidebarTitleDraft(value: string) {
    this.sidebar.sidebarTitleDraft = value;
  }

  get manuscriptDrag(): ManuscriptDragState | undefined {
    return this.sidebar.manuscriptDrag;
  }
  set manuscriptDrag(value: ManuscriptDragState | undefined) {
    this.sidebar.manuscriptDrag = value;
  }

  get manuscriptDragController(): ManuscriptDragController | undefined {
    return this.sidebar.manuscriptDragController;
  }
  set manuscriptDragController(value: ManuscriptDragController | undefined) {
    this.sidebar.manuscriptDragController = value;
  }

  get lastWorkspaceFocus(): WorkspaceFocusTarget | undefined {
    return this.focus.lastWorkspaceFocus;
  }
  set lastWorkspaceFocus(value: WorkspaceFocusTarget | undefined) {
    this.focus.lastWorkspaceFocus = value;
  }

  get paletteReturnFocus(): WorkspaceFocusTarget | undefined {
    return this.palette.paletteReturnFocus;
  }
  set paletteReturnFocus(value: WorkspaceFocusTarget | undefined) {
    this.palette.paletteReturnFocus = value;
  }

  get projectTitleReturnFocus(): WorkspaceFocusTarget | undefined {
    return this.titles.projectTitleReturnFocus;
  }
  set projectTitleReturnFocus(value: WorkspaceFocusTarget | undefined) {
    this.titles.projectTitleReturnFocus = value;
  }

  get sidebarTitleReturnFocus(): WorkspaceFocusTarget | undefined {
    return this.titles.sidebarTitleReturnFocus;
  }
  set sidebarTitleReturnFocus(value: WorkspaceFocusTarget | undefined) {
    this.titles.sidebarTitleReturnFocus = value;
  }

  get saveTimer(): ReturnType<typeof setTimeout> | undefined {
    return this.documents.saveTimer;
  }
  set saveTimer(value: ReturnType<typeof setTimeout> | undefined) {
    this.documents.saveTimer = value;
  }

  get suppressEditorChange(): boolean {
    return this.documents.suppressEditorChange;
  }
  set suppressEditorChange(value: boolean) {
    this.documents.suppressEditorChange = value;
  }

  get cleanupWindowListeners(): Array<() => void> {
    return this.shell.cleanupWindowListeners;
  }
  set cleanupWindowListeners(value: Array<() => void>) {
    this.shell.cleanupWindowListeners = value;
  }

  get dragUnsubscribe(): Unsubscriber | undefined {
    return this.sidebar.dragUnsubscribe;
  }
  set dragUnsubscribe(value: Unsubscriber | undefined) {
    this.sidebar.dragUnsubscribe = value;
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
    return (
      this.manuscriptDragController?.previewChapters(this.chapters, this.manuscriptDrag) ??
      this.chapters
    );
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
    return (
      this.projectIsOpen &&
      chapter !== undefined &&
      this.chapters.length > 1 &&
      this.scenes.some((scene) => scene.chapterId !== chapter.id)
    );
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

  get chapterDropIndicatorItemId(): string {
    return (
      this.manuscriptDragController?.chapterDropIndicatorItemId(
        this.visibleChapters,
        this.manuscriptDrag
      ) ?? ""
    );
  }

  get activeSceneIndex(): number {
    const scene = this.activeScene;
    return scene === undefined
      ? -1
      : this.scenes.findIndex((candidate) => candidate.path === scene.path);
  }

  get activeChapterIndex(): number {
    const chapter = this.activeChapter;
    return chapter === undefined
      ? -1
      : this.chapters.findIndex((candidate) => candidate.id === chapter.id);
  }
}
