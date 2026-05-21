import type { ClarosThemeId } from "@claros/editor-core";
import type { ManuscriptInsertionPlacement } from "@claros/story-state";
import type { ManuscriptDragController, ManuscriptDragState } from "$lib/manuscript-drag";
import type {
  CompanionConnection,
  ProjectSession,
  WorkspaceChapter,
  WorkspaceNote,
  WorkspaceScene,
} from "$lib/project-session";
import type { StorageBackendOption } from "$lib/storage-backends";
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

export interface WorkspaceController {
  appShell: HTMLElement | undefined;
  editorHost: HTMLDivElement | undefined;
  commandInput: HTMLInputElement | undefined;
  sidebarNav: HTMLElement | undefined;
  project: ProjectSession | undefined;
  projectRevision: number;
  activePath: string;
  activeTitle: string;
  activeDocumentKind: ActiveDocumentKind;
  currentMarkdown: string;
  vimMode: boolean;
  paletteOpen: boolean;
  commandQuery: string;
  selectedCommandIndex: number;
  activeTheme: ClarosThemeId;
  startupReady: boolean;
  sidebarOpen: boolean;
  focusedSidebarItemId: string;
  saveState: SaveState;
  projectOpenState: ProjectOpenState;
  projectError: string;
  canOpenLocalProject: boolean;
  selectedStorageBackendId: StorageBackendId;
  openStorageBackendId: StorageBackendId;
  storageBackendMenuOpen: boolean;
  createProjectIntent: boolean;
  companionConnection: CompanionConnection | undefined;
  collapsedItems: Set<string>;
  titleModal: TitleModalState | undefined;
  deleteModal: DeleteModalState | undefined;
  confirmationModal: ConfirmationModalState | undefined;
  contextMenu: ContextMenuState | undefined;
  editingProjectTitle: boolean;
  projectTitleDraft: string;
  optimisticProjectTitle: string | undefined;
  optimisticChapterTitles: Map<string, string>;
  optimisticSceneTitles: Map<string, string>;
  editingSidebarItemId: string;
  sidebarTitleDraft: string;
  manuscriptDrag: ManuscriptDragState | undefined;
  manuscriptDragController: ManuscriptDragController;
  paletteReturnFocus: WorkspaceFocusTarget | undefined;
  chapters: WorkspaceChapter[];
  scenes: WorkspaceScene[];
  notes: WorkspaceNote[];
  displayProjectTitle: string;
  visibleChapters: WorkspaceChapter[];
  sidebarItems: SidebarItem[];
  activeScene: WorkspaceScene | undefined;
  activeChapter: WorkspaceChapter | undefined;
  projectIsOpen: boolean;
  canDeleteCurrentScene: boolean;
  canDeleteCurrentChapter: boolean;
  canMoveCurrentSceneUp: boolean;
  canMoveCurrentSceneDown: boolean;
  canMoveCurrentChapterUp: boolean;
  canMoveCurrentChapterDown: boolean;
  storageBackendOptions: StorageBackendOption[];
  selectedStorageBackend: StorageBackendOption;
  openStorageBackend: StorageBackendOption;
  chapterDropIndicatorItemId: string;
  paletteCommands: PaletteCommand[];
  filteredCommands: PaletteCommand[];
  sidebarContextMenuItems: ActionMenuItem[];
  mount(): Promise<void>;
  destroy(): void;
  finishStartup(): Promise<void>;
  handleEditorChange(markdown: string): void;
  ensureEditor(): Promise<void>;
  scheduleSave(): void;
  flushSave(): Promise<void>;
  flushSaveWithoutWaiting(): void;
  refreshProjectView(): void;
  setEditorMarkdown(markdown: string): void;
  loadDocument(path: string): Promise<void>;
  openDocument(
    path: string,
    options?: { forceReload?: boolean; skipSave?: boolean }
  ): Promise<void>;
  focusEditorAfterOpen(): Promise<void>;
  toggleVimMode(): void;
  focusEditor(): void;
  focusEditorPreservingSidebar(): void;
  defaultCursorForActiveDocument(): "start" | "end";
  focusEditorWithDefaultCursor(): void;
  rememberEditorFocus(): void;
  rememberSidebarFocus(itemId?: string): void;
  captureWorkspaceFocus(): WorkspaceFocusTarget | undefined;
  restoreWorkspaceFocus(target?: WorkspaceFocusTarget): Promise<void>;
  repairWorkspaceFocus(): Promise<void>;
  hasTransientFocus(): boolean;
  focusSidebar(): void;
  toggleSidebar(): void;
  closeSidebar(): void;
  openLocalProject(): Promise<void>;
  createNewProject(title?: string): Promise<void>;
  openProjectWithBackend(backendId: StorageBackendId): Promise<void>;
  createProjectWithBackend(backendId: StorageBackendId): Promise<void>;
  createProjectWithBackendTitle(backendId: StorageBackendId, title?: string): Promise<void>;
  selectStorageBackend(backend: StorageBackendOption): void;
  connectCompanionFromPrompt(): Promise<void>;
  connectCompanion(connection: CompanionConnection): Promise<void>;
  createNewCompanionProject(title?: string): Promise<void>;
  canDeleteChapter(chapter: WorkspaceChapter): boolean;
  canDeleteScene(): boolean;
  canMoveChapter(chapter: WorkspaceChapter, direction: "up" | "down"): boolean;
  canMoveScene(scene: WorkspaceScene, direction: "up" | "down"): boolean;
  moveCurrentChapter(direction: "up" | "down"): Promise<void>;
  moveCurrentScene(direction: "up" | "down"): Promise<void>;
  moveChapterByDirection(chapter: WorkspaceChapter, direction: "up" | "down"): Promise<void>;
  moveSceneByDirection(scene: WorkspaceScene, direction: "up" | "down"): Promise<void>;
  moveChapter(
    chapterId: string,
    options: { placement: "before" | "after"; targetChapterId: string }
  ): Promise<void>;
  moveScene(
    scenePath: string,
    options: {
      placement: ManuscriptInsertionPlacement;
      targetScenePath?: string;
      targetChapterId?: string;
    }
  ): Promise<void>;
  submitDeleteModal(): Promise<void>;
  closeDeleteModal(): void;
  closeConfirmationModal(): void;
  submitConfirmationModal(): void;
  normalizeSelectedCommandIndex(): void;
  focusCommandInput(): Promise<void>;
  preparePaletteReturnFocus(): void;
  togglePalette(): void;
  closePalette(): void;
  setTheme(themeId: ClarosThemeId): void;
  runCommand(command: PaletteCommand): void;
  runSelectedCommand(): void;
  moveSelectedCommand(delta: number): void;
  handleCommandInputKeydown(event: KeyboardEvent): void;
  handleCommandInput(): void;
  toggleCollapsed(itemId: string): void;
  handleSidebarItemClick(item: SidebarItem): void;
  handleSidebarKeydown(event: KeyboardEvent): void;
  focusSidebarIndex(index: number): void;
  expandFocusedItem(): void;
  openFocusedSidebarContextMenu(): boolean;
  collapseFocusedItem(): void;
  activateFocusedItem(): void;
  focusFirstItemOfKind(kind: "scene" | "note"): void;
  sidebarItemElement(itemId: string): HTMLElement | undefined;
  openSidebarContextMenu(event: MouseEvent, item: SidebarItem): void;
  openSidebarContextMenuAt(x: number, y: number, item: SidebarItem): void;
  closeSidebarContextMenu(): void;
  hasSidebarContextMenu(item: SidebarItem): boolean;
  beginContextMenuTitleEdit(): void;
  buildSidebarContextMenuItems(item: SidebarItem): ActionMenuItem[];
  openCurrentChapterDeleteModal(): void;
  openCurrentSceneDeleteModal(): void;
  openDeleteChapterModal(chapter: WorkspaceChapter): void;
  openDeleteSceneModal(scene: WorkspaceScene): void;
  openTitleModal(state: TitleModalState): void;
  openProjectTitleModal(): void;
  openAppendChapterModal(): void;
  openInsertChapterModal(
    placement: Exclude<ManuscriptInsertionPlacement, "append">,
    chapter?: WorkspaceChapter
  ): void;
  openChapterCreationModal(
    placement: ManuscriptInsertionPlacement,
    targetChapterId?: string
  ): void;
  openAppendSceneModal(): void;
  openInsertSceneModal(
    placement: Exclude<ManuscriptInsertionPlacement, "append">,
    scene?: WorkspaceScene
  ): void;
  openSceneCreationModal(placement: ManuscriptInsertionPlacement, targetScenePath?: string): void;
  openCurrentChapterTitleModal(): void;
  openCurrentSceneTitleModal(): void;
  submitTitleModal(): Promise<void>;
  closeTitleModal(): void;
  prepareProjectTitleEdit(): void;
  beginProjectTitleEdit(): void;
  handleProjectTitleKeydown(event: KeyboardEvent): void;
  commitProjectTitleEdit(): Promise<void>;
  setProjectTitleFromInput(title: string): Promise<void>;
  setChapterTitleFromInput(chapterId: string, title: string): Promise<void>;
  setSceneTitleFromInput(scenePath: string, title: string): Promise<void>;
  beginSidebarTitleEdit(item: SidebarItem): void;
  commitSidebarTitleEdit(item: SidebarItem): Promise<void>;
  cancelInlineTitleEdit(): void;
}
