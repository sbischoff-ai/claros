import type { Unsubscriber } from "svelte/store";
import type { ClarosThemeId } from "@claros/editor-core";
import type { ManuscriptDragController, ManuscriptDragState } from "$lib/manuscript-drag";
import type { CompanionConnection, ProjectSession } from "$lib/project-session";
import type {
  ActiveDocumentKind,
  ConfirmationModalState,
  ContextMenuState,
  DeleteModalState,
  ProjectOpenState,
  SaveState,
  StorageBackendId,
  TitleModalState,
  WorkspaceFocusTarget,
} from "$lib/workspace-types";

export class WorkspaceShellState {
  appShell = $state<HTMLElement>();
  activeTheme = $state<ClarosThemeId>("default-light");
  startupReady = $state(false);
  cleanupWindowListeners: Array<() => void> = [];
}

export class WorkspaceProjectState {
  project = $state<ProjectSession>();
  projectRevision = $state(0);
  projectOpenState = $state<ProjectOpenState>("idle");
  projectError = $state("");
  canOpenLocalProject = $state(false);
  selectedStorageBackendId = $state<StorageBackendId>("file-picker");
  openStorageBackendId = $state<StorageBackendId>("file-picker");
  storageBackendMenuOpen = $state(false);
  createProjectIntent = $state(false);
  companionConnection = $state<CompanionConnection>();
}

export class WorkspaceDocumentState {
  editorHost = $state<HTMLDivElement>();
  activePath = $state("");
  activeTitle = $state("Draft");
  activeDocumentKind = $state<ActiveDocumentKind>("scene");
  currentMarkdown = $state("");
  documentTrail = $state<string[]>([]);
  documentTrailIndex = $state(-1);
  vimMode = $state(false);
  saveState = $state<SaveState>("saved");
  saveTimer: ReturnType<typeof setTimeout> | undefined;
  suppressEditorChange = false;
}

export class WorkspacePaletteState {
  commandInput = $state<HTMLInputElement>();
  paletteOpen = $state(false);
  commandQuery = $state("");
  selectedCommandIndex = $state(0);
  paletteReturnFocus = $state<WorkspaceFocusTarget>();
}

export class WorkspaceSidebarState {
  sidebarNav = $state<HTMLElement>();
  sidebarOpen = $state(false);
  focusedSidebarItemId = $state("");
  collapsedItems = $state(new Set<string>(["notes"]));
  editingSidebarItemId = $state("");
  sidebarTitleDraft = $state("");
  manuscriptDrag = $state<ManuscriptDragState>();
  manuscriptDragController: ManuscriptDragController | undefined;
  dragUnsubscribe: Unsubscriber | undefined;
}

export class WorkspaceOverlayState {
  titleModal = $state<TitleModalState>();
  deleteModal = $state<DeleteModalState>();
  confirmationModal = $state<ConfirmationModalState>();
  contextMenu = $state<ContextMenuState>();
}

export class WorkspaceTitleState {
  editingProjectTitle = $state(false);
  projectTitleDraft = $state("");
  optimisticProjectTitle = $state<string>();
  optimisticChapterTitles = $state(new Map<string, string>());
  optimisticSceneTitles = $state(new Map<string, string>());
  projectTitleReturnFocus = $state<WorkspaceFocusTarget>();
  sidebarTitleReturnFocus = $state<WorkspaceFocusTarget>();
}

export class WorkspaceFocusState {
  lastWorkspaceFocus = $state<WorkspaceFocusTarget>();
}
