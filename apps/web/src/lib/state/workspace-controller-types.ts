import type { ManuscriptDragState } from "$lib/manuscript-drag";
import type { ManuscriptChapterFlow } from "$lib/manuscript-flow";
import type { StorageBackendOption } from "$lib/storage-backends";
import type { MarkdownWikilinkReference } from "@claros/editor-core";
import type {
  ActionMenuItem,
  ConfirmationModalState,
  ContextMenuState,
  DeleteModalState,
  PaletteCommand,
  ProjectOpenState,
  SaveState,
  SidebarItem,
  StorageBackendId,
  TitleModalState,
} from "$lib/workspace-types";

export interface WorkspaceControllers {
  readonly lifecycle: WorkspaceLifecycleSurface;
  readonly sidebar: WorkspaceSidebarSurface;
  readonly dragPreview: WorkspaceDragPreviewSurface;
  readonly topbar: WorkspaceTopbarSurface;
  readonly title: WorkspaceTitleSurface;
  readonly editor: WorkspaceEditorSurface;
  readonly projectLauncher: WorkspaceProjectLauncherSurface;
  readonly overlays: WorkspaceOverlaysSurface;
}

export interface WorkspaceLifecycleSurface {
  appShell: HTMLElement | undefined;
  readonly startupReady: boolean;
  readonly projectIsOpen: boolean;
  readonly sidebarOpen: boolean;
  mount(): Promise<void>;
  destroy(): void;
  toggleSidebar(): void;
}

export interface WorkspaceSidebarSurface {
  sidebarNav: HTMLElement | undefined;
  focusedItemId: string;
  titleDraft: string;
  readonly activePath: string;
  readonly dragging: boolean;
  readonly draggingItemId: string;
  readonly ghostChapterId: string;
  readonly dropIndicatorItemId: string;
  readonly dropIndicatorPlacement: "before" | "after" | undefined;
  readonly editingItemId: string;
  readonly items: SidebarItem[];
  readonly open: boolean;
  close(): void;
  commitTitle(item: SidebarItem): Promise<void>;
  cancelTitleEdit(): void;
  handleContextMenu(event: MouseEvent, item: SidebarItem): void;
  handleDragPointerDown(event: PointerEvent, item: SidebarItem): void;
  handleItemClick(item: SidebarItem): void;
  handleKeydown(event: KeyboardEvent): void;
  rememberFocus(itemId?: string): void;
}

export interface WorkspaceDragPreviewSurface {
  readonly drag: ManuscriptDragState | undefined;
}

export interface WorkspaceTopbarSurface {
  readonly title: WorkspaceTitleSurface;
  readonly projectIsOpen: boolean;
  readonly activeTitle: string;
  readonly saveState: SaveState;
  readonly openStorageBackend: StorageBackendOption;
  readonly paletteOpen: boolean;
  preparePaletteReturnFocus(): void;
  togglePalette(): void;
}

export interface WorkspaceTitleSurface {
  projectTitleDraft: string;
  readonly projectIsOpen: boolean;
  readonly editingProjectTitle: boolean;
  readonly displayProjectTitle: string;
  prepareProjectTitleEdit(): void;
  beginProjectTitleEdit(): void;
  handleProjectTitleKeydown(event: KeyboardEvent): void;
  commitProjectTitleEdit(): Promise<void>;
}

export interface WorkspaceEditorSurface {
  editorHost: HTMLDivElement | undefined;
  readonly canNavigateBack: boolean;
  readonly canNavigateForward: boolean;
  readonly manuscriptChapterFlow: ManuscriptChapterFlow | undefined;
  bindReadonlyWikilinks(
    container: HTMLElement,
    references: readonly MarkdownWikilinkReference[],
    fromPath: string
  ): () => void;
  openManuscriptScene(path: string): Promise<void>;
  ensureEditor(): Promise<void>;
  rememberEditorFocus(): void;
  navigateBack(): Promise<void>;
  navigateForward(): Promise<void>;
}

export interface WorkspaceProjectLauncherSurface {
  createProjectIntent: boolean;
  storageBackendMenuOpen: boolean;
  readonly projectOpenState: ProjectOpenState;
  readonly projectError: string;
  readonly storageBackendOptions: StorageBackendOption[];
  readonly selectedStorageBackend: StorageBackendOption;
  readonly selectedStorageBackendId: StorageBackendId;
  createProjectWithBackend(backendId: StorageBackendId): Promise<void>;
  openProjectWithBackend(backendId: StorageBackendId): Promise<void>;
  selectStorageBackend(backend: StorageBackendOption): void;
}

export interface WorkspaceOverlaysSurface {
  commandInput: HTMLInputElement | undefined;
  commandQuery: string;
  selectedCommandIndex: number;
  readonly paletteOpen: boolean;
  readonly filteredCommands: PaletteCommand[];
  readonly contextMenu: ContextMenuState | undefined;
  readonly sidebarContextMenuItems: ActionMenuItem[];
  readonly titleModal: TitleModalState | undefined;
  readonly deleteModal: DeleteModalState | undefined;
  readonly confirmationModal: ConfirmationModalState | undefined;
  closePalette(): void;
  handleCommandInput(): void;
  handleCommandInputKeydown(event: KeyboardEvent): void;
  runCommand(command: PaletteCommand): void;
  closeSidebarContextMenu(): void;
  submitTitleModal(): Promise<void>;
  closeTitleModal(): void;
  submitDeleteModal(): Promise<void>;
  closeDeleteModal(): void;
  submitConfirmationModal(): void;
  closeConfirmationModal(): void;
}
