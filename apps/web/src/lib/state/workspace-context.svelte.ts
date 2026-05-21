import type { Unsubscriber } from "svelte/store";
import type { ClarosThemeId } from "@claros/editor-core";

import type { ManuscriptDragController, ManuscriptDragState } from "$lib/manuscript-drag";
import type { CompanionConnection, ProjectSession, WorkspaceChapter, WorkspaceScene } from "$lib/project-session";
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
import { createBrowserEnvironment, type BrowserEnvironment } from "$lib/services/browser-environment";
import {
  createMarkdownEditorRuntime,
  type MarkdownEditorRuntime,
} from "$lib/services/markdown-editor-runtime";

export class WorkspaceContext {
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
  manuscriptDragController: ManuscriptDragController | undefined;
  lastWorkspaceFocus = $state<WorkspaceFocusTarget>();
  paletteReturnFocus = $state<WorkspaceFocusTarget>();
  projectTitleReturnFocus = $state<WorkspaceFocusTarget>();
  sidebarTitleReturnFocus = $state<WorkspaceFocusTarget>();
  saveTimer: ReturnType<typeof setTimeout> | undefined;
  suppressEditorChange = false;
  cleanupWindowListeners: Array<() => void> = [];
  dragUnsubscribe: Unsubscriber | undefined;

  constructor(
    readonly environment: BrowserEnvironment = createBrowserEnvironment(),
    readonly editorRuntime: MarkdownEditorRuntime = createMarkdownEditorRuntime()
  ) {}

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
    return this.manuscriptDragController?.previewChapters(this.chapters, this.manuscriptDrag) ?? this.chapters;
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
    return scene === undefined ? undefined : this.chapters.find((chapter) => chapter.id === scene.chapterId);
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
    return this.projectIsOpen && this.activeSceneIndex >= 0 && this.activeSceneIndex < this.scenes.length - 1;
  }

  get canMoveCurrentChapterUp(): boolean {
    return this.projectIsOpen && this.activeChapterIndex > 0;
  }

  get canMoveCurrentChapterDown(): boolean {
    return this.projectIsOpen && this.activeChapterIndex >= 0 && this.activeChapterIndex < this.chapters.length - 1;
  }

  get storageBackendOptions(): StorageBackendOption[] {
    return buildStorageBackendOptions(this.canOpenLocalProject);
  }

  get selectedStorageBackend(): StorageBackendOption {
    return this.storageBackendOptions.find((backend) => backend.id === this.selectedStorageBackendId) ?? this.storageBackendOptions[0];
  }

  get openStorageBackend(): StorageBackendOption {
    return this.storageBackendOptions.find((backend) => backend.id === this.openStorageBackendId) ?? this.storageBackendOptions[0];
  }

  get chapterDropIndicatorItemId(): string {
    return this.manuscriptDragController?.chapterDropIndicatorItemId(this.visibleChapters, this.manuscriptDrag) ?? "";
  }

  get activeSceneIndex(): number {
    const scene = this.activeScene;
    return scene === undefined ? -1 : this.scenes.findIndex((candidate) => candidate.path === scene.path);
  }

  get activeChapterIndex(): number {
    const chapter = this.activeChapter;
    return chapter === undefined ? -1 : this.chapters.findIndex((candidate) => candidate.id === chapter.id);
  }
}
