<script lang="ts">
  import "./page.css";

  import { onDestroy, onMount, tick } from "svelte";
  import Command from "phosphor-svelte/lib/Command";
  import Files from "phosphor-svelte/lib/Files";
  import {
    CLAROS_THEMES,
    applyNamedTheme,
    createMarkdownEditor,
    type ClarosMarkdownEditor,
    type ClarosThemeId,
  } from "@claros/editor-core";
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
    type WorkspaceScene,
  } from "$lib/project-session";
  import type { BrowserDirectoryPicker } from "$lib/browser-file-system";
  import ActionMenu from "$lib/ActionMenu.svelte";
  import CommandPalette from "$lib/CommandPalette.svelte";
  import DeleteModal from "$lib/DeleteModal.svelte";
  import { directionalIntentFromKeydown } from "$lib/directional-navigation";
  import ProjectLauncher from "$lib/ProjectLauncher.svelte";
  import { buildSidebarItems } from "$lib/sidebar-model";
  import { buildStorageBackendOptions, type StorageBackendOption } from "$lib/storage-backends";
  import { loadTheme, saveTheme } from "$lib/theme";
  import TitleModal from "$lib/TitleModal.svelte";
  import {
    normalizedChapterTitle,
    normalizedProjectTitle,
    normalizedSceneTitle,
  } from "$lib/title-model";
  import WorkspaceSidebar from "$lib/WorkspaceSidebar.svelte";
  import {
    clampCommandIndex,
    filterCommands,
    listProjectChapters,
    listProjectNotes,
    listProjectScenes,
    projectTitleForDisplay,
    saveStateLabel,
  } from "$lib/workspace-view-model";
  import type {
    ActionMenuItem,
    ActiveDocumentKind,
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

  let appShell: HTMLElement;
  let editorHost: HTMLDivElement;
  let editor: ClarosMarkdownEditor | undefined;
  let commandInput: HTMLInputElement;
  let sidebarNav: HTMLElement;
  let project: ProjectSession | undefined;
  let projectRevision = 0;
  let activePath = "";
  let activeTitle = "Draft";
  let activeDocumentKind: ActiveDocumentKind = "scene";
  let currentMarkdown = "";
  let vimMode = false;
  let paletteOpen = false;
  let commandQuery = "";
  let selectedCommandIndex = 0;
  let activeTheme: ClarosThemeId = "default-light";
  let startupReady = false;
  let sidebarOpen = false;
  let focusedSidebarItemId = "";
  let saveState: SaveState = "saved";
  let projectOpenState: ProjectOpenState = "idle";
  let projectError = "";
  let canOpenLocalProject = false;
  let selectedStorageBackendId: StorageBackendId = "file-picker";
  let openStorageBackendId: StorageBackendId = "file-picker";
  let storageBackendMenuOpen = false;
  let createProjectIntent = false;
  let companionConnection: CompanionConnection | undefined;
  let collapsedItems = new Set<string>(["notes"]);
  let titleModal: TitleModalState | undefined;
  let deleteModal: DeleteModalState | undefined;
  let contextMenu: ContextMenuState | undefined;
  let editingProjectTitle = false;
  let projectTitleDraft = "";
  let optimisticProjectTitle: string | undefined;
  let displayProjectTitle = "Claros";
  let optimisticChapterTitles = new Map<string, string>();
  let optimisticSceneTitles = new Map<string, string>();
  let editingSidebarItemId = "";
  let sidebarTitleDraft = "";
  let lastWorkspaceFocus: WorkspaceFocusTarget | undefined;
  let paletteReturnFocus: WorkspaceFocusTarget | undefined;
  let projectTitleReturnFocus: WorkspaceFocusTarget | undefined;
  let sidebarTitleReturnFocus: WorkspaceFocusTarget | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  $: chapters = listProjectChapters(projectRevision, project);
  $: scenes = listProjectScenes(projectRevision, project);
  $: notes = listProjectNotes(projectRevision, project);
  $: displayProjectTitle = projectTitleForDisplay(projectRevision, project, optimisticProjectTitle);
  $: sidebarItems = buildSidebarItems(
    chapters,
    notes,
    collapsedItems,
    optimisticChapterTitles,
    optimisticSceneTitles
  );
  $: activeScene = scenes.find((scene) => scene.path === activePath);
  $: activeChapter = activeScene
    ? chapters.find((chapter) => chapter.id === activeScene.chapterId)
    : undefined;
  $: canDeleteCurrentScene = projectIsOpen && activeScene !== undefined && scenes.length > 1;
  $: canDeleteCurrentChapter =
    projectIsOpen &&
    activeChapter !== undefined &&
    chapters.length > 1 &&
    scenes.some((scene) => scene.chapterId !== activeChapter.id);
  $: storageBackendOptions = buildStorageBackendOptions(canOpenLocalProject);
  $: selectedStorageBackend =
    storageBackendOptions.find((backend) => backend.id === selectedStorageBackendId) ??
    storageBackendOptions[0];
  $: openStorageBackend =
    storageBackendOptions.find((backend) => backend.id === openStorageBackendId) ??
    storageBackendOptions[0];
  $: projectIsOpen = projectOpenState === "open";
  $: paletteCommands = buildPaletteCommands(activeTheme, vimMode, projectIsOpen, canOpenLocalProject);
  $: filteredCommands = filterCommands(paletteCommands, commandQuery);
  $: selectedCommandIndex = clampCommandIndex(selectedCommandIndex, filteredCommands.length);
  $: sidebarContextMenuItems =
    contextMenu === undefined ? [] : buildSidebarContextMenuItems(contextMenu.item);

  $: if (paletteOpen) {
    selectedCommandIndex = 0;
    void tick().then(() => commandInput?.focus());
  }

  onMount(() => {
    activeTheme = loadTheme(window.localStorage);
    applyNamedTheme(appShell, activeTheme);
    canOpenLocalProject =
      typeof (window as Window & BrowserDirectoryPicker).showDirectoryPicker === "function";
    selectedStorageBackendId = canOpenLocalProject ? "file-picker" : "local-companion";
    companionConnection =
      companionConnectionFromUrl(new URL(window.location.href)) ??
      loadCompanionConnection(window.localStorage);
    if (companionConnection !== undefined) {
      saveCompanionConnection(window.localStorage, companionConnection);
      void connectCompanion(companionConnection).finally(() => {
        void finishStartup();
      });
    } else {
      startupReady = true;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        togglePalette();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        if (projectIsOpen) {
          toggleSidebar();
        }
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === "ArrowLeft") {
        event.preventDefault();
        if (projectIsOpen) {
          focusSidebar();
        }
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === "ArrowRight") {
        event.preventDefault();
        if (projectIsOpen) {
          focusEditorPreservingSidebar();
        }
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "v"
      ) {
        event.preventDefault();
        if (projectIsOpen) {
          toggleVimMode();
        }
        return;
      }

      if (event.key === "Escape") {
        if (storageBackendMenuOpen) {
          storageBackendMenuOpen = false;
          return;
        }
        if (contextMenu !== undefined) {
          closeSidebarContextMenu();
          return;
        }
        if (editingProjectTitle || editingSidebarItemId.length > 0) {
          cancelInlineTitleEdit();
          return;
        }
        if (titleModal !== undefined) {
          closeTitleModal();
          return;
        }
        if (deleteModal !== undefined) {
          closeDeleteModal();
          return;
        }
        if (paletteOpen) {
          closePalette();
          return;
        }
        if (projectIsOpen && sidebarOpen) {
          closeSidebar();
        }
      }
    };

    const handleWindowFocus = () => {
      void repairWorkspaceFocus();
    };

    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("focus", handleWindowFocus);
    };
  });

  async function finishStartup(): Promise<void> {
    startupReady = true;
    if (projectIsOpen) {
      await ensureEditor();
      editor?.setMarkdown(currentMarkdown, { cursor: defaultCursorForActiveDocument() });
      focusEditorWithDefaultCursor();
    }
  }

  onDestroy(() => {
    if (saveTimer !== undefined) {
      clearTimeout(saveTimer);
      void flushSave();
    }
    editor?.destroy();
  });

  async function openLocalProject(): Promise<void> {
    if (!canOpenLocalProject) {
      projectOpenState = "error";
      projectError = "Local folder access is not supported in this browser.";
      return;
    }

    const picker = window as Window & BrowserDirectoryPicker;
    if (picker.showDirectoryPicker === undefined) {
      projectOpenState = "error";
      projectError = "Local folder access is not supported in this browser.";
      return;
    }

    flushSaveWithoutWaiting();
    const hadOpenProject = projectIsOpen;
    if (!hadOpenProject) {
      projectOpenState = "opening";
    }
    projectError = "";
    try {
      const handle = await picker.showDirectoryPicker({ mode: "readwrite" });
      project = await openLocalProjectSession(handle);
      activePath = firstDocumentPath(project);
      await loadDocument(activePath);
      projectOpenState = "open";
      openStorageBackendId = "file-picker";
      sidebarOpen = false;
      await ensureEditor();
      editor?.setMarkdown(currentMarkdown, { cursor: defaultCursorForActiveDocument() });
      focusEditorWithDefaultCursor();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        projectOpenState = project ? "open" : "idle";
        return;
      }
      projectOpenState = hadOpenProject ? "open" : "error";
      projectError = error instanceof Error ? error.message : "Unable to open project";
    }
  }

  async function createNewProject(title = "Untitled Project"): Promise<void> {
    if (!canOpenLocalProject) {
      projectOpenState = "error";
      projectError = "Local folder access is not supported in this browser.";
      return;
    }

    const picker = window as Window & BrowserDirectoryPicker;
    if (picker.showDirectoryPicker === undefined) {
      projectOpenState = "error";
      projectError = "Local folder access is not supported in this browser.";
      return;
    }

    flushSaveWithoutWaiting();
    const hadOpenProject = projectIsOpen;
    if (!hadOpenProject) {
      projectOpenState = "creating";
    }
    projectError = "";
    try {
      const handle = await picker.showDirectoryPicker({ mode: "readwrite" });
      project = await createNewLocalProjectSession(handle, title);
      activePath = firstDocumentPath(project);
      await loadDocument(activePath);
      projectOpenState = "open";
      openStorageBackendId = "file-picker";
      sidebarOpen = false;
      await ensureEditor();
      editor?.setMarkdown(currentMarkdown, { cursor: defaultCursorForActiveDocument() });
      focusEditorWithDefaultCursor();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        projectOpenState = project ? "open" : "idle";
        return;
      }
      projectOpenState = hadOpenProject ? "open" : "error";
      projectError = error instanceof Error ? error.message : "Unable to create project";
    }
  }

  async function openProjectWithBackend(backendId: StorageBackendId): Promise<void> {
    storageBackendMenuOpen = false;
    if (backendId === "file-picker") {
      await openLocalProject();
      return;
    }
    await connectCompanionFromPrompt();
  }

  async function createProjectWithBackend(backendId: StorageBackendId): Promise<void> {
    storageBackendMenuOpen = false;
    openTitleModal({
      target: "new-project",
      heading: "New Project",
      value: "",
      placeholder: "Untitled Project",
      storageBackendId: backendId,
    });
  }

  async function createProjectWithBackendTitle(
    backendId: StorageBackendId,
    title: string
  ): Promise<void> {
    if (backendId === "file-picker") {
      await createNewProject(title);
      return;
    }
    await createNewCompanionProject(title);
  }

  function selectStorageBackend(backend: StorageBackendOption): void {
    if (!backend.available) {
      return;
    }
    selectedStorageBackendId = backend.id;
    storageBackendMenuOpen = false;
  }

  async function connectCompanionFromPrompt(): Promise<void> {
    const url = window.prompt(
      "Local companion URL",
      companionConnection?.url ?? "http://127.0.0.1:3000"
    );
    if (url === null || url.trim().length === 0) {
      return;
    }
    const token = window.prompt("Local companion token", companionConnection?.token ?? "");
    if (token === null || token.trim().length === 0) {
      return;
    }
    const connection = { url: url.trim(), token: token.trim() };
    saveCompanionConnection(window.localStorage, connection);
    await connectCompanion(connection);
  }

  async function connectCompanion(connection: CompanionConnection): Promise<void> {
    flushSaveWithoutWaiting();
    const hadOpenProject = projectIsOpen;
    if (!hadOpenProject) {
      projectOpenState = "connecting";
    }
    projectError = "";
    try {
      companionConnection = connection;
      project = await openCompanionProjectSession(connection);
      activePath = firstDocumentPath(project);
      await loadDocument(activePath);
      projectOpenState = "open";
      openStorageBackendId = "local-companion";
      sidebarOpen = false;
      await ensureEditor();
      editor?.setMarkdown(currentMarkdown, { cursor: defaultCursorForActiveDocument() });
      focusEditorWithDefaultCursor();
    } catch (error) {
      projectOpenState = hadOpenProject ? "open" : "error";
      projectError = error instanceof Error ? error.message : "Unable to connect local companion";
    }
  }

  async function createNewCompanionProject(title = "Untitled Project"): Promise<void> {
    let connection = companionConnection;
    if (connection === undefined) {
      const url = window.prompt("Local companion URL", "http://127.0.0.1:3000");
      if (url === null || url.trim().length === 0) {
        return;
      }
      const token = window.prompt("Local companion token", "");
      if (token === null || token.trim().length === 0) {
        return;
      }
      connection = { url: url.trim(), token: token.trim() };
      saveCompanionConnection(window.localStorage, connection);
    }

    flushSaveWithoutWaiting();
    const hadOpenProject = projectIsOpen;
    if (!hadOpenProject) {
      projectOpenState = "creating";
    }
    projectError = "";
    try {
      companionConnection = connection;
      project = await createNewCompanionProjectSession(connection, title);
      activePath = firstDocumentPath(project);
      await loadDocument(activePath);
      projectOpenState = "open";
      openStorageBackendId = "local-companion";
      sidebarOpen = false;
      await ensureEditor();
      editor?.setMarkdown(currentMarkdown, { cursor: defaultCursorForActiveDocument() });
      focusEditorWithDefaultCursor();
    } catch (error) {
      projectOpenState = hadOpenProject ? "open" : "error";
      projectError = error instanceof Error ? error.message : "Unable to create project";
    }
  }

  function handleEditorChange(markdown: string): void {
    if (!projectIsOpen) {
      return;
    }
    currentMarkdown = markdown;
    saveState = "dirty";
    scheduleSave();
  }

  async function ensureEditor(): Promise<void> {
    if (editor !== undefined) {
      editor.setTheme(activeTheme);
      editor.setVimMode(vimMode);
      return;
    }
    await tick();
    if (editorHost === undefined) {
      return;
    }
    editor = createMarkdownEditor({
      parent: editorHost,
      doc: currentMarkdown,
      vimMode,
      theme: activeTheme,
      onChange: handleEditorChange,
    });
  }

  function scheduleSave(): void {
    if (saveTimer !== undefined) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      void flushSave();
    }, 550);
  }

  async function flushSave(): Promise<void> {
    if (!project || !activePath) {
      return;
    }

    if (saveTimer !== undefined) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    }

    saveState = "saving";
    try {
      await project.writeDocument({ path: activePath }, currentMarkdown);
      saveState = "saved";
    } catch {
      saveState = "error";
    }
  }

  function flushSaveWithoutWaiting(): void {
    void flushSave();
  }

  function refreshProjectView(): void {
    projectRevision += 1;
  }

  async function loadDocument(path: string): Promise<void> {
    if (!project) {
      return;
    }

    const document = await project.readDocument({ path });
    activePath = document.path;
    activeTitle = document.title;
    activeDocumentKind = document.kind;
    currentMarkdown = document.body;
    saveState = "saved";
  }

  async function openDocument(path: string): Promise<void> {
    if (path === activePath) {
      await focusEditorAfterOpen();
      return;
    }

    await flushSave();
    await loadDocument(path);
    editor?.setMarkdown(currentMarkdown, { cursor: defaultCursorForActiveDocument() });
    await focusEditorAfterOpen();
  }

  async function focusEditorAfterOpen(): Promise<void> {
    await tick();
    focusEditorWithDefaultCursor();
  }

  function toggleVimMode(): void {
    if (!projectIsOpen) {
      return;
    }
    vimMode = !vimMode;
    editor?.setVimMode(vimMode);
    if (paletteOpen) {
      focusEditor();
    } else {
      focusEditorPreservingSidebar();
    }
  }

  function focusEditor(): void {
    paletteOpen = false;
    commandQuery = "";
    selectedCommandIndex = 0;
    if (projectIsOpen) {
      focusEditorWithDefaultCursor();
    }
  }

  function focusEditorPreservingSidebar(): void {
    paletteOpen = false;
    commandQuery = "";
    selectedCommandIndex = 0;
    if (projectIsOpen) {
      editor?.focus();
      rememberEditorFocus();
    }
  }

  function defaultCursorForActiveDocument(): "start" | "end" {
    return activeDocumentKind === "note" ? "start" : "end";
  }

  function focusEditorWithDefaultCursor(): void {
    if (!projectIsOpen) {
      return;
    }
    editor?.focus({ cursor: defaultCursorForActiveDocument() });
    rememberEditorFocus();
  }

  function rememberEditorFocus(): void {
    if (!projectIsOpen || editor === undefined) {
      return;
    }
    lastWorkspaceFocus = {
      region: "editor",
      path: activePath,
      cursor: editor.getCursorPosition(),
    };
  }

  function rememberSidebarFocus(itemId = focusedSidebarItemId): void {
    if (!projectIsOpen || itemId.length === 0) {
      return;
    }
    lastWorkspaceFocus = { region: "sidebar", itemId };
  }

  function captureWorkspaceFocus(): WorkspaceFocusTarget | undefined {
    const activeElement = document.activeElement;
    if (activeElement !== null && editorHost?.contains(activeElement)) {
      rememberEditorFocus();
      return lastWorkspaceFocus;
    }
    if (activeElement !== null && sidebarNav?.contains(activeElement)) {
      rememberSidebarFocus();
      return lastWorkspaceFocus;
    }
    return lastWorkspaceFocus;
  }

  async function restoreWorkspaceFocus(target = lastWorkspaceFocus): Promise<void> {
    if (!projectIsOpen || hasTransientFocus()) {
      return;
    }
    await tick();
    if (target?.region === "sidebar" && sidebarOpen && sidebarItems.some((item) => item.id === target.itemId)) {
      focusedSidebarItemId = target.itemId;
      sidebarNav?.focus();
      rememberSidebarFocus(target.itemId);
      return;
    }
    if (target?.region === "editor" && target.path === activePath) {
      editor?.focus({ cursor: target.cursor });
      rememberEditorFocus();
      return;
    }
    focusEditorWithDefaultCursor();
  }

  async function repairWorkspaceFocus(): Promise<void> {
    if (!projectIsOpen || hasTransientFocus()) {
      return;
    }
    await tick();
    const activeElement = document.activeElement;
    if (
      activeElement !== null &&
      (editorHost?.contains(activeElement) || sidebarNav?.contains(activeElement))
    ) {
      return;
    }
    await restoreWorkspaceFocus();
  }

  function hasTransientFocus(): boolean {
    return (
      paletteOpen ||
      titleModal !== undefined ||
      deleteModal !== undefined ||
      contextMenu !== undefined ||
      editingProjectTitle ||
      editingSidebarItemId.length > 0
    );
  }

  function focusSidebar(): void {
    if (!projectIsOpen) {
      return;
    }
    paletteOpen = false;
    commandQuery = "";
    selectedCommandIndex = 0;
    if (!sidebarOpen) {
      sidebarOpen = true;
    }
    focusedSidebarItemId = activePath || sidebarItems[0]?.id || "";
    void tick().then(() => {
      sidebarNav?.focus();
      rememberSidebarFocus();
    });
  }

  function togglePalette(): void {
    if (!paletteOpen) {
      paletteReturnFocus = paletteReturnFocus ?? captureWorkspaceFocus();
      paletteOpen = true;
      commandQuery = "";
      selectedCommandIndex = 0;
      return;
    }
    closePalette();
  }

  function closePalette(): void {
    const returnFocus = paletteReturnFocus;
    paletteOpen = false;
    commandQuery = "";
    selectedCommandIndex = 0;
    paletteReturnFocus = undefined;
    if (projectIsOpen) {
      void restoreWorkspaceFocus(returnFocus);
    }
  }

  function toggleSidebar(): void {
    if (!projectIsOpen) {
      return;
    }
    sidebarOpen = !sidebarOpen;
    if (sidebarOpen) {
      focusedSidebarItemId = activePath || sidebarItems[0]?.id || "";
      void tick().then(() => {
        sidebarNav?.focus();
        rememberSidebarFocus();
      });
    } else {
      focusEditorPreservingSidebar();
    }
  }

  function closeSidebar(): void {
    sidebarOpen = false;
    if (projectIsOpen) {
      focusEditorPreservingSidebar();
    }
  }

  function setTheme(themeId: ClarosThemeId): void {
    activeTheme = themeId;
    saveTheme(window.localStorage, themeId);
    applyNamedTheme(appShell, themeId);
    editor?.setTheme(themeId);
  }

  function runCommand(command: PaletteCommand): void {
    if (command.disabled === true) {
      return;
    }
    command.run();
    paletteOpen = false;
    commandQuery = "";
    selectedCommandIndex = 0;
    paletteReturnFocus = undefined;

    if (command.focusAfter === "sidebar" && projectIsOpen) {
      void tick().then(() => {
        sidebarNav?.focus();
        rememberSidebarFocus();
      });
      return;
    }

    if (command.focusAfter !== "none" && projectIsOpen) {
      void tick().then(() => focusEditorPreservingSidebar());
    }
  }

  function runSelectedCommand(): void {
    const command = filteredCommands[selectedCommandIndex];
    if (command) {
      runCommand(command);
    }
  }

  function moveSelectedCommand(delta: number): void {
    if (filteredCommands.length === 0) {
      selectedCommandIndex = 0;
      return;
    }

    selectedCommandIndex =
      (selectedCommandIndex + delta + filteredCommands.length) % filteredCommands.length;
  }

  function handleCommandInputKeydown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelectedCommand(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelectedCommand(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      runSelectedCommand();
    }
  }

  function handleCommandInput(): void {
    selectedCommandIndex = 0;
  }

  function buildPaletteCommands(
    currentTheme: ClarosThemeId,
    currentVimMode: boolean,
    currentProjectIsOpen: boolean,
    localProjectSupported: boolean
  ): PaletteCommand[] {
    const projectCommandDisabled = !currentProjectIsOpen;
    return [
      {
        label: "Toggle Sidebar",
        active: sidebarOpen,
        disabled: projectCommandDisabled,
        focusAfter: "none",
        run: toggleSidebar,
      },
      {
        label: "Open Project: Local Folder",
        disabled: !localProjectSupported,
        focusAfter: "editor",
        run: () => void openProjectWithBackend("file-picker"),
      },
      {
        label: "New Project: Local Folder",
        disabled: !localProjectSupported,
        focusAfter: "editor",
        run: () => void createProjectWithBackend("file-picker"),
      },
      {
        label: "Open Project: Local Companion",
        focusAfter: "editor",
        run: () => void openProjectWithBackend("local-companion"),
      },
      {
        label: "New Project: Local Companion",
        focusAfter: "editor",
        run: () => void createProjectWithBackend("local-companion"),
      },
      {
        label: "Save Document",
        disabled: projectCommandDisabled,
        focusAfter: "editor",
        run: flushSaveWithoutWaiting,
      },
      {
        label: "Change Title: Project",
        disabled: projectCommandDisabled,
        focusAfter: "none",
        run: openProjectTitleModal,
      },
      {
        label: "Append: New Chapter",
        disabled: projectCommandDisabled,
        focusAfter: "none",
        run: openAppendChapterModal,
      },
      {
        label: "Change Title: Current Chapter",
        disabled: projectCommandDisabled || activeChapter === undefined,
        focusAfter: "none",
        run: openCurrentChapterTitleModal,
      },
      {
        label: "Delete: Current Chapter",
        disabled: !canDeleteCurrentChapter,
        focusAfter: "none",
        run: openCurrentChapterDeleteModal,
      },
      {
        label: "Append: New Scene",
        disabled: projectCommandDisabled,
        focusAfter: "none",
        run: openAppendSceneModal,
      },
      {
        label: "Change Title: Current Scene",
        disabled: projectCommandDisabled || activeScene === undefined,
        focusAfter: "none",
        run: openCurrentSceneTitleModal,
      },
      {
        label: "Delete: Current Scene",
        disabled: !canDeleteCurrentScene,
        focusAfter: "none",
        run: openCurrentSceneDeleteModal,
      },
      {
        label: currentVimMode ? "Disable Vim" : "Enable Vim",
        active: currentVimMode,
        disabled: projectCommandDisabled,
        focusAfter: "editor",
        run: toggleVimMode,
      },
      ...CLAROS_THEMES.map((theme) => ({
        label: `Theme: ${theme.label}`,
        active: theme.id === currentTheme,
        focusAfter: "editor" as const,
        run: () => setTheme(theme.id),
      })),
      {
        label: "Focus Editor",
        disabled: projectCommandDisabled,
        focusAfter: "editor",
        run: () => undefined,
      },
    ];
  }

  function toggleCollapsed(itemId: string): void {
    const next = new Set(collapsedItems);
    if (next.has(itemId)) {
      next.delete(itemId);
    } else {
      next.add(itemId);
    }
    collapsedItems = next;
  }

  function handleSidebarItemClick(item: SidebarItem): void {
    if (item.kind === "add-chapter") {
      openAppendChapterModal();
      return;
    }
    if (item.kind === "add-scene") {
      openAppendSceneModal();
      return;
    }
    if (item.path !== undefined) {
      void openDocument(item.path);
      return;
    }
    if (item.collapsible) {
      toggleCollapsed(item.id);
    }
  }

  function handleSidebarKeydown(event: KeyboardEvent): void {
    if (
      editingSidebarItemId.length > 0 ||
      !(event.target instanceof Node) ||
      !sidebarNav?.contains(event.target)
    ) {
      return;
    }

    const currentIndex = sidebarItems.findIndex((item) => item.id === focusedSidebarItemId);
    const intent = directionalIntentFromKeydown(event);

    if ((event.metaKey || event.ctrlKey) && event.key === "ArrowLeft") {
      event.preventDefault();
      focusSidebar();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "ArrowRight") {
      event.preventDefault();
      focusEditorPreservingSidebar();
      return;
    }

    if (intent === "down") {
      event.preventDefault();
      focusSidebarIndex(Math.min(currentIndex + 1, sidebarItems.length - 1));
      return;
    }

    if (intent === "up") {
      event.preventDefault();
      focusSidebarIndex(Math.max(currentIndex - 1, 0));
      return;
    }

    if (intent === "right") {
      event.preventDefault();
      if (!openFocusedSidebarContextMenu()) {
        expandFocusedItem();
      }
      return;
    }

    if (intent === "left") {
      event.preventDefault();
      collapseFocusedItem();
      return;
    }

    if (intent === "activate") {
      event.preventDefault();
      activateFocusedItem();
      return;
    }

    if (event.key.toLowerCase() === "m") {
      event.preventDefault();
      focusFirstItemOfKind("scene");
      return;
    }

    if (event.key.toLowerCase() === "n") {
      event.preventDefault();
      focusFirstItemOfKind("note");
    }
  }

  function focusSidebarIndex(index: number): void {
    focusedSidebarItemId = sidebarItems[index]?.id ?? focusedSidebarItemId;
  }

  function expandFocusedItem(): void {
    const item = sidebarItems.find((candidate) => candidate.id === focusedSidebarItemId);
    if (item?.collapsible && item.collapsed) {
      toggleCollapsed(item.id);
    }
  }

  function openFocusedSidebarContextMenu(): boolean {
    const item = sidebarItems.find((candidate) => candidate.id === focusedSidebarItemId);
    if (item === undefined || !hasSidebarContextMenu(item)) {
      return false;
    }

    const anchor = sidebarItemElement(item.id);
    const rect = anchor?.getBoundingClientRect();
    openSidebarContextMenuAt(rect === undefined ? 0 : rect.right + 6, rect?.top ?? 0, item);
    return true;
  }

  function collapseFocusedItem(): void {
    const item = sidebarItems.find((candidate) => candidate.id === focusedSidebarItemId);
    if (item?.collapsible && !item.collapsed) {
      toggleCollapsed(item.id);
    }
  }

  function activateFocusedItem(): void {
    const item = sidebarItems.find((candidate) => candidate.id === focusedSidebarItemId);
    if (item?.kind === "add-chapter") {
      openAppendChapterModal();
      return;
    }
    if (item?.kind === "add-scene") {
      openAppendSceneModal();
      return;
    }
    if (item?.path !== undefined) {
      void openDocument(item.path);
      return;
    }
    if (item?.collapsible) {
      toggleCollapsed(item.id);
    }
  }

  function focusFirstItemOfKind(kind: "scene" | "note"): void {
    const item = sidebarItems.find((candidate) => candidate.kind === kind);
    if (item !== undefined) {
      focusedSidebarItemId = item.id;
    }
  }

  function sidebarItemElement(itemId: string): HTMLElement | undefined {
    return Array.from(sidebarNav?.querySelectorAll<HTMLElement>("[data-sidebar-item-id]") ?? []).find(
      (element) => element.dataset.sidebarItemId === itemId
    );
  }

  function openTitleModal(state: TitleModalState): void {
    const returnFocus = state.returnFocus ?? paletteReturnFocus ?? captureWorkspaceFocus();
    paletteOpen = false;
    contextMenu = undefined;
    titleModal = { ...state, returnFocus };
  }

  function openProjectTitleModal(): void {
    openTitleModal({
      target: "project",
      heading: "Project Title",
      value: displayProjectTitle,
      placeholder: "Untitled Project",
    });
  }

  function openAppendChapterModal(): void {
    openTitleModal({
      target: "new-chapter",
      heading: "New Chapter",
      value: "",
      placeholder: `Chapter ${chapters.length + 1}`,
    });
  }

  function openAppendSceneModal(): void {
    openTitleModal({
      target: "new-scene",
      heading: "New Scene",
      value: "",
      placeholder: `Scene ${scenes.length + 1}`,
    });
  }

  function openCurrentChapterTitleModal(): void {
    if (activeChapter === undefined) {
      return;
    }
    openTitleModal({
      target: "chapter",
      heading: "Chapter Title",
      value: activeChapter.title,
      placeholder: `Chapter ${activeChapter.sequence}`,
      chapterId: activeChapter.id,
    });
  }

  function openCurrentSceneTitleModal(): void {
    if (activeScene === undefined) {
      return;
    }
    openTitleModal({
      target: "scene",
      heading: "Scene Title",
      value: activeScene.title,
      placeholder: `Scene ${activeScene.sequence}`,
      scenePath: activeScene.path,
    });
  }

  function openCurrentChapterDeleteModal(): void {
    if (activeChapter !== undefined && canDeleteChapter(activeChapter)) {
      openDeleteChapterModal(activeChapter);
    }
  }

  function openCurrentSceneDeleteModal(): void {
    if (activeScene !== undefined && canDeleteScene()) {
      openDeleteSceneModal(activeScene);
    }
  }

  function openDeleteChapterModal(chapter: WorkspaceChapter): void {
    contextMenu = undefined;
    deleteModal = {
      target: "chapter",
      heading: "Delete Chapter",
      label: chapter.title,
      chapterId: chapter.id,
      confirmation: "",
    };
  }

  function openDeleteSceneModal(scene: WorkspaceScene): void {
    contextMenu = undefined;
    deleteModal = {
      target: "scene",
      heading: "Delete Scene",
      label: scene.title,
      scenePath: scene.path,
      confirmation: "",
    };
  }

  async function submitTitleModal(): Promise<void> {
    if (titleModal === undefined) {
      return;
    }
    const modal = titleModal;
    titleModal = undefined;
    await flushSave();
    if (modal.target === "new-project" && modal.storageBackendId !== undefined) {
      await createProjectWithBackendTitle(modal.storageBackendId, modal.value);
      return;
    }
    if (project === undefined) {
      return;
    }
    if (modal.target === "project") {
      await setProjectTitleFromInput(modal.value);
      await restoreWorkspaceFocus(modal.returnFocus);
      return;
    }
    if (modal.target === "new-chapter") {
      openTitleModal({
        target: "new-chapter-scene",
        heading: "New Scene",
        value: "",
        placeholder: `Scene ${scenes.length + 1}`,
        chapterTitle: modal.value,
        returnFocus: modal.returnFocus,
      });
      return;
    }
    if (modal.target === "new-chapter-scene") {
      const scene = await project.appendChapter(modal.chapterTitle ?? "", modal.value);
      refreshProjectView();
      await openDocument(scene.path);
      return;
    }
    if (modal.target === "new-scene") {
      const scene = await project.appendScene(modal.value);
      refreshProjectView();
      await openDocument(scene.path);
      return;
    }
    if (modal.target === "chapter" && modal.chapterId !== undefined) {
      await setChapterTitleFromInput(modal.chapterId, modal.value);
      await restoreWorkspaceFocus(modal.returnFocus);
      return;
    }
    if (modal.target === "scene" && modal.scenePath !== undefined) {
      await setSceneTitleFromInput(modal.scenePath, modal.value);
      if (modal.scenePath === activePath) {
        await loadDocument(activePath);
      }
      await restoreWorkspaceFocus(modal.returnFocus);
    }
  }

  async function submitDeleteModal(): Promise<void> {
    if (deleteModal === undefined || project === undefined || deleteModal.confirmation !== "delete") {
      return;
    }
    const modal = deleteModal;
    deleteModal = undefined;
    await flushSave();
    if (modal.target === "chapter" && modal.chapterId !== undefined) {
      const nextPath = await project.deleteChapter(modal.chapterId);
      refreshProjectView();
      await openDocument(nextPath);
      return;
    }
    if (modal.target === "scene" && modal.scenePath !== undefined) {
      const nextPath = await project.deleteScene(modal.scenePath);
      refreshProjectView();
      await openDocument(nextPath);
    }
  }

  function closeTitleModal(): void {
    const returnFocus = titleModal?.returnFocus;
    titleModal = undefined;
    void restoreWorkspaceFocus(returnFocus);
  }

  function closeDeleteModal(): void {
    deleteModal = undefined;
    void restoreWorkspaceFocus();
  }

  function beginProjectTitleEdit(): void {
    if (!projectIsOpen) {
      return;
    }
    projectTitleReturnFocus = projectTitleReturnFocus ?? captureWorkspaceFocus();
    projectTitleDraft = project?.manifest.title ?? "";
    editingProjectTitle = true;
    void tick().then(() => {
      const input = document.querySelector<HTMLInputElement>(".project-title-input");
      input?.focus();
      input?.select();
    });
  }

  async function commitProjectTitleEdit(): Promise<void> {
    if (!project || !editingProjectTitle) {
      return;
    }
    const returnFocus = projectTitleReturnFocus;
    projectTitleReturnFocus = undefined;
    editingProjectTitle = false;
    await setProjectTitleFromInput(projectTitleDraft);
    await restoreWorkspaceFocus(returnFocus);
  }

  async function setProjectTitleFromInput(title: string): Promise<void> {
    if (project === undefined) {
      return;
    }
    optimisticProjectTitle = normalizedProjectTitle(title);
    try {
      await project.setProjectTitle(title);
    } finally {
      optimisticProjectTitle = undefined;
      refreshProjectView();
    }
  }

  async function setChapterTitleFromInput(chapterId: string, title: string): Promise<void> {
    if (project === undefined) {
      return;
    }
    const nextTitle = normalizedChapterTitle(chapterId, title, chapters);
    optimisticChapterTitles = new Map(optimisticChapterTitles).set(chapterId, nextTitle);
    try {
      await project.setChapterTitle(chapterId, title);
    } finally {
      const next = new Map(optimisticChapterTitles);
      next.delete(chapterId);
      optimisticChapterTitles = next;
      refreshProjectView();
    }
  }

  async function setSceneTitleFromInput(scenePath: string, title: string): Promise<void> {
    if (project === undefined) {
      return;
    }
    const nextTitle = normalizedSceneTitle(scenePath, title, scenes);
    optimisticSceneTitles = new Map(optimisticSceneTitles).set(scenePath, nextTitle);
    if (scenePath === activePath) {
      activeTitle = nextTitle;
    }
    try {
      await project.setSceneTitle(scenePath, title);
    } finally {
      const next = new Map(optimisticSceneTitles);
      next.delete(scenePath);
      optimisticSceneTitles = next;
      refreshProjectView();
    }
  }

  function beginSidebarTitleEdit(item: SidebarItem): void {
    sidebarTitleReturnFocus = captureWorkspaceFocus();
    editingSidebarItemId = item.id;
    sidebarTitleDraft = item.label;
    contextMenu = undefined;
    void tick().then(() => {
      const input = document.querySelector<HTMLInputElement>(".sidebar-title-input");
      input?.focus();
      input?.select();
    });
  }

  async function commitSidebarTitleEdit(item: SidebarItem): Promise<void> {
    if (!project || editingSidebarItemId !== item.id) {
      return;
    }
    const returnFocus = sidebarTitleReturnFocus;
    sidebarTitleReturnFocus = undefined;
    editingSidebarItemId = "";
    if (item.kind === "chapter" && item.chapterId !== undefined) {
      await setChapterTitleFromInput(item.chapterId, sidebarTitleDraft);
    }
    if (item.kind === "scene" && item.path !== undefined) {
      await setSceneTitleFromInput(item.path, sidebarTitleDraft);
      if (item.path === activePath) {
        await loadDocument(activePath);
      }
    }
    await restoreWorkspaceFocus(returnFocus);
  }

  function cancelInlineTitleEdit(): void {
    const returnFocus = sidebarTitleReturnFocus ?? projectTitleReturnFocus;
    editingProjectTitle = false;
    editingSidebarItemId = "";
    projectTitleReturnFocus = undefined;
    sidebarTitleReturnFocus = undefined;
    void restoreWorkspaceFocus(returnFocus);
  }

  function openSidebarContextMenu(event: MouseEvent, item: SidebarItem): void {
    if (!hasSidebarContextMenu(item)) {
      return;
    }
    event.preventDefault();
    openSidebarContextMenuAt(event.clientX, event.clientY, item);
  }

  function openSidebarContextMenuAt(x: number, y: number, item: SidebarItem): void {
    focusedSidebarItemId = item.id;
    rememberSidebarFocus(item.id);
    contextMenu = { x, y, item };
  }

  function closeSidebarContextMenu(): void {
    const returnFocus =
      contextMenu === undefined
        ? undefined
        : { region: "sidebar" as const, itemId: contextMenu.item.id };
    contextMenu = undefined;
    if (returnFocus !== undefined) {
      void restoreWorkspaceFocus(returnFocus);
    }
  }

  function hasSidebarContextMenu(item: SidebarItem): boolean {
    return item.kind === "chapter" || item.kind === "scene";
  }

  function beginContextMenuTitleEdit(): void {
    if (contextMenu !== undefined) {
      beginSidebarTitleEdit(contextMenu.item);
    }
  }

  function canDeleteChapter(chapter: WorkspaceChapter): boolean {
    return chapters.length > 1 && scenes.some((scene) => scene.chapterId !== chapter.id);
  }

  function canDeleteScene(): boolean {
    return scenes.length > 1;
  }

  function chapterForItem(item: SidebarItem): WorkspaceChapter | undefined {
    return item.chapterId === undefined
      ? undefined
      : chapters.find((chapter) => chapter.id === item.chapterId);
  }

  function sceneForItem(item: SidebarItem): WorkspaceScene | undefined {
    return item.path === undefined ? undefined : scenes.find((scene) => scene.path === item.path);
  }

  function buildSidebarContextMenuItems(item: SidebarItem): ActionMenuItem[] {
    const menuItems: ActionMenuItem[] = [
      {
        label: "Change title",
        run: beginContextMenuTitleEdit,
      },
    ];

    if (item.kind === "chapter") {
      const chapter = chapterForItem(item);
      menuItems.push({
        label: "Delete chapter",
        disabled: chapter === undefined || !canDeleteChapter(chapter),
        run: () => {
          if (chapter !== undefined) {
            openDeleteChapterModal(chapter);
          }
        },
      });
      return menuItems;
    }

    const scene = sceneForItem(item);
    menuItems.push({
      label: "Delete scene",
      disabled: scene === undefined || !canDeleteScene(),
      run: () => {
        if (scene !== undefined) {
          openDeleteSceneModal(scene);
        }
      },
    });
    return menuItems;
  }

</script>

<svelte:head>
  <title>Claros</title>
</svelte:head>

<main bind:this={appShell} class={`app-shell ${projectIsOpen && sidebarOpen ? "sidebar-open" : ""}`}>
  {#if !startupReady}
    <section class="startup-screen" aria-label="Loading Claros">
      <span class="startup-spinner" aria-hidden="true"></span>
    </section>
  {:else}
    {#if projectIsOpen}
    {#if !sidebarOpen}
      <button
        type="button"
        class="sidebar-tab"
        aria-label="Open workspace sidebar"
        aria-expanded={sidebarOpen}
        on:click={toggleSidebar}
      >
        <Files size={19} weight="regular" />
      </button>
    {/if}

    <WorkspaceSidebar
      bind:sidebarNav
      bind:focusedItemId={focusedSidebarItemId}
      bind:titleDraft={sidebarTitleDraft}
      activePath={activePath}
      close={closeSidebar}
      commitTitle={(item) => void commitSidebarTitleEdit(item)}
      cancelTitleEdit={cancelInlineTitleEdit}
      editingItemId={editingSidebarItemId}
      handleContextMenu={openSidebarContextMenu}
      handleItemClick={handleSidebarItemClick}
      handleKeydown={handleSidebarKeydown}
      items={sidebarItems}
      open={sidebarOpen}
      rememberFocus={rememberSidebarFocus}
    />
    {/if}

    <section class="workspace">
    <header class="topbar" aria-label="Workspace">
      <div class="identity">
        {#if projectIsOpen && editingProjectTitle}
          <input
            class="project-title-input"
            bind:value={projectTitleDraft}
            aria-label="Project title"
            on:keydown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commitProjectTitleEdit();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancelInlineTitleEdit();
              }
            }}
            on:blur={() => void commitProjectTitleEdit()}
          />
        {:else if projectIsOpen}
          <button
            type="button"
            class="product title-button"
            on:mousedown={() => (projectTitleReturnFocus = captureWorkspaceFocus())}
            on:click={beginProjectTitleEdit}
          >
            {displayProjectTitle}
          </button>
        {:else}
          <span class="product static-title">{displayProjectTitle}</span>
        {/if}
        {#if projectIsOpen}
          <span class="draft-name">{activeTitle}</span>
          <span
            class={`save-state status-${saveState}`}
            aria-label={`${openStorageBackend.label}: ${saveStateLabel(saveState)}`}
            title={`${openStorageBackend.label}: ${saveStateLabel(saveState)}`}
          >
            <svelte:component this={openStorageBackend.icon} size={18} weight="regular" />
            <span class="save-state-dot"></span>
          </span>
        {/if}
      </div>
      <nav class="actions" aria-label="Editor actions">
        <button
          type="button"
          class="icon-button"
          aria-label="Open command palette"
          aria-expanded={paletteOpen}
          on:mousedown={() => (paletteReturnFocus = captureWorkspaceFocus())}
          on:click={togglePalette}
        >
          <Command size={19} weight="regular" />
        </button>
      </nav>
    </header>

    {#if projectIsOpen}
      <section class="editor-frame" aria-label="Markdown editor" on:focusin={rememberEditorFocus}>
        <div bind:this={editorHost} class="editor-host"></div>
      </section>
    {:else}
      <section class="project-empty-state" aria-label="Open project">
        <strong>Open a Claros project</strong>
        <span>
          {projectOpenState === "opening"
            ? "Opening project..."
            : projectOpenState === "creating"
              ? "Creating project..."
              : projectOpenState === "connecting"
                ? "Connecting local companion..."
              : projectOpenState === "error"
                ? projectError || "Unable to open project."
                : "Choose how Claros should access the project folder."}
        </span>
        <ProjectLauncher
          bind:createIntent={createProjectIntent}
          bind:menuOpen={storageBackendMenuOpen}
          createProject={(backend) => void createProjectWithBackend(backend.id)}
          openProject={(backend) => void openProjectWithBackend(backend.id)}
          options={storageBackendOptions}
          selected={selectedStorageBackend}
          selectedId={selectedStorageBackendId}
          selectBackend={selectStorageBackend}
        />
      </section>
    {/if}
    </section>

    {#if paletteOpen}
    <CommandPalette
      bind:commandInput
      bind:query={commandQuery}
      bind:selectedIndex={selectedCommandIndex}
      commands={filteredCommands}
      close={closePalette}
      handleInput={handleCommandInput}
      handleKeydown={handleCommandInputKeydown}
      runCommand={runCommand}
    />
    {/if}

    {#if contextMenu !== undefined}
    <button
      type="button"
      class="context-backdrop"
      aria-label="Close context menu"
      on:click={closeSidebarContextMenu}
    ></button>
    <ActionMenu
      ariaLabel={`${contextMenu.item.label} actions`}
      close={closeSidebarContextMenu}
      items={sidebarContextMenuItems}
      x={contextMenu.x}
      y={contextMenu.y}
    />
    {/if}

    {#if titleModal !== undefined}
    <TitleModal
      state={titleModal}
      close={closeTitleModal}
      submit={() => void submitTitleModal()}
    />
    {/if}

    {#if deleteModal !== undefined}
    <DeleteModal
      state={deleteModal}
      close={closeDeleteModal}
      submit={() => void submitDeleteModal()}
    />
    {/if}
  {/if}
</main>
