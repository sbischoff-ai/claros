<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import Book from "phosphor-svelte/lib/Book";
  import CaretLeft from "phosphor-svelte/lib/CaretLeft";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import Command from "phosphor-svelte/lib/Command";
  import Files from "phosphor-svelte/lib/Files";
  import FolderOpen from "phosphor-svelte/lib/FolderOpen";
  import Notebook from "phosphor-svelte/lib/Notebook";
  import Plus from "phosphor-svelte/lib/Plus";
  import TerminalWindow from "phosphor-svelte/lib/TerminalWindow";
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
    type WorkspaceNote,
    type WorkspaceScene,
  } from "$lib/project-session";
  import type { BrowserDirectoryPicker } from "$lib/browser-file-system";
  import { loadTheme, saveTheme } from "$lib/theme";

  type SaveState = "saved" | "dirty" | "saving" | "error";
  type ProjectOpenState = "idle" | "opening" | "creating" | "connecting" | "open" | "error";
  type StorageBackendId = "file-picker" | "local-companion";
  type SidebarItemKind = "section" | "chapter" | "folder" | "scene" | "note" | "add-chapter" | "add-scene";
  type TitleModalTarget =
    | "new-project"
    | "project"
    | "new-chapter"
    | "new-chapter-scene"
    | "new-scene"
    | "chapter"
    | "scene";
  type DeleteModalTarget = "chapter" | "scene";

  interface PaletteCommand {
    label: string;
    active?: boolean;
    disabled?: boolean;
    focusAfter?: "editor" | "sidebar" | "none";
    run(): void;
  }

  interface SidebarItem {
    id: string;
    kind: SidebarItemKind;
    label: string;
    depth: number;
    collapsible: boolean;
    collapsed: boolean;
    path?: string;
    chapterId?: string;
  }

  interface TitleModalState {
    target: TitleModalTarget;
    heading: string;
    value: string;
    placeholder: string;
    storageBackendId?: StorageBackendId;
    chapterTitle?: string;
    chapterId?: string;
    scenePath?: string;
  }

  interface DeleteModalState {
    target: DeleteModalTarget;
    heading: string;
    label: string;
    chapterId?: string;
    scenePath?: string;
    confirmation: string;
  }

  interface ContextMenuState {
    x: number;
    y: number;
    item: SidebarItem;
  }

  interface StorageBackendOption {
    id: StorageBackendId;
    label: string;
    icon: typeof FolderOpen;
    available: boolean;
    unavailableReason?: string;
  }

  let appShell: HTMLElement;
  let editorHost: HTMLDivElement;
  let editor: ClarosMarkdownEditor | undefined;
  let commandInput: HTMLInputElement;
  let sidebarNav: HTMLElement;
  let project: ProjectSession | undefined;
  let projectRevision = 0;
  let activePath = "";
  let activeTitle = "Draft";
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
  let titleModalInput: HTMLInputElement;
  let deleteModalInput: HTMLInputElement;
  let contextMenu: ContextMenuState | undefined;
  let editingProjectTitle = false;
  let projectTitleDraft = "";
  let optimisticProjectTitle: string | undefined;
  let displayProjectTitle = "Claros";
  let optimisticChapterTitles = new Map<string, string>();
  let optimisticSceneTitles = new Map<string, string>();
  let editingSidebarItemId = "";
  let sidebarTitleDraft = "";
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

  $: if (paletteOpen) {
    selectedCommandIndex = 0;
    void tick().then(() => commandInput?.focus());
  }

  $: if (titleModal !== undefined) {
    void tick().then(() => titleModalInput?.focus());
  }

  $: if (deleteModal !== undefined) {
    void tick().then(() => deleteModalInput?.focus());
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
          contextMenu = undefined;
          return;
        }
        if (editingProjectTitle || editingSidebarItemId.length > 0) {
          cancelInlineTitleEdit();
          return;
        }
        if (titleModal !== undefined) {
          titleModal = undefined;
          return;
        }
        if (deleteModal !== undefined) {
          deleteModal = undefined;
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

    window.addEventListener("keydown", handleKeydown);

    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  });

  async function finishStartup(): Promise<void> {
    startupReady = true;
    if (projectIsOpen) {
      await ensureEditor();
      editor?.setMarkdown(currentMarkdown);
      editor?.focus();
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
      editor?.setMarkdown(currentMarkdown);
      editor?.focus();
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
      editor?.setMarkdown(currentMarkdown);
      editor?.focus();
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
      editor?.setMarkdown(currentMarkdown);
      editor?.focus();
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
      editor?.setMarkdown(currentMarkdown);
      editor?.focus();
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
    editor?.setMarkdown(currentMarkdown);
    await focusEditorAfterOpen();
  }

  async function focusEditorAfterOpen(): Promise<void> {
    await tick();
    editor?.focus();
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
      editor?.focus();
    }
  }

  function focusEditor(): void {
    paletteOpen = false;
    commandQuery = "";
    selectedCommandIndex = 0;
    if (projectIsOpen) {
      editor?.focus();
    }
  }

  function focusEditorPreservingSidebar(): void {
    paletteOpen = false;
    commandQuery = "";
    selectedCommandIndex = 0;
    if (projectIsOpen) {
      editor?.focus();
    }
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
    void tick().then(() => sidebarNav?.focus());
  }

  function togglePalette(): void {
    paletteOpen = !paletteOpen;
    if (paletteOpen) {
      commandQuery = "";
      selectedCommandIndex = 0;
    } else if (projectIsOpen) {
      editor?.focus();
    }
  }

  function closePalette(): void {
    paletteOpen = false;
    commandQuery = "";
    selectedCommandIndex = 0;
    if (projectIsOpen) {
      editor?.focus();
    }
  }

  function toggleSidebar(): void {
    if (!projectIsOpen) {
      return;
    }
    sidebarOpen = !sidebarOpen;
    if (sidebarOpen) {
      focusedSidebarItemId = activePath || sidebarItems[0]?.id || "";
      void tick().then(() => sidebarNav?.focus());
    } else {
      editor?.focus();
    }
  }

  function closeSidebar(): void {
    sidebarOpen = false;
    if (projectIsOpen) {
      editor?.focus();
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

    if (command.focusAfter === "sidebar" && projectIsOpen) {
      void tick().then(() => sidebarNav?.focus());
      return;
    }

    if (command.focusAfter !== "none" && projectIsOpen) {
      void tick().then(() => editor?.focus());
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

  function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return commands;
    }

    return commands.filter((command) => command.label.toLowerCase().includes(normalizedQuery));
  }

  function clampCommandIndex(index: number, commandCount: number): number {
    if (commandCount === 0) {
      return 0;
    }

    return Math.min(index, commandCount - 1);
  }

  function buildStorageBackendOptions(localProjectSupported: boolean): StorageBackendOption[] {
    return [
      {
        id: "file-picker",
        label: "Local Folder",
        icon: FolderOpen,
        available: localProjectSupported,
        unavailableReason: localProjectSupported ? undefined : "Not supported by this browser",
      },
      {
        id: "local-companion",
        label: "Local Companion",
        icon: TerminalWindow,
        available: true,
      },
    ];
  }

  function listProjectChapters(
    revision: number,
    session: ProjectSession | undefined
  ): WorkspaceChapter[] {
    return revision < 0 ? [] : (session?.listChapters() ?? []);
  }

  function listProjectScenes(
    revision: number,
    session: ProjectSession | undefined
  ): WorkspaceScene[] {
    return revision < 0 ? [] : (session?.listScenes() ?? []);
  }

  function listProjectNotes(
    revision: number,
    session: ProjectSession | undefined
  ): WorkspaceNote[] {
    return revision < 0 ? [] : (session?.listNotes() ?? []);
  }

  function projectTitleForDisplay(
    revision: number,
    session: ProjectSession | undefined,
    optimisticTitle: string | undefined
  ): string {
    if (optimisticTitle !== undefined) {
      return optimisticTitle;
    }
    return revision < 0 ? "Claros" : (session?.manifest.title ?? "Claros");
  }

  function buildSidebarItems(
    chapterList: WorkspaceChapter[],
    noteList: WorkspaceNote[],
    collapsed: Set<string>,
    optimisticChapters: Map<string, string>,
    optimisticScenes: Map<string, string>
  ): SidebarItem[] {
    const items: SidebarItem[] = [
      {
        id: "manuscript",
        kind: "section",
        label: "Manuscript",
        depth: 0,
        collapsible: true,
        collapsed: collapsed.has("manuscript"),
      },
    ];

    if (!collapsed.has("manuscript")) {
      for (const chapter of chapterList) {
        const chapterId = `chapter:${chapter.id}`;
        items.push({
          id: chapterId,
          kind: "chapter",
          label: optimisticChapters.get(chapter.id) ?? chapter.title ?? `Chapter ${chapter.sequence}`,
          depth: 1,
          collapsible: true,
          collapsed: collapsed.has(chapterId),
          chapterId: chapter.id,
        });

        if (!collapsed.has(chapterId)) {
          for (const scene of chapter.scenes) {
            items.push({
              id: scene.path,
              kind: "scene",
              label: optimisticScenes.get(scene.path) ?? scene.title ?? `Scene ${scene.sequence}`,
              depth: 2,
              collapsible: false,
              collapsed: false,
              path: scene.path,
              chapterId: chapter.id,
            });
          }

          if (chapter.id === chapterList.at(-1)?.id) {
            items.push({
              id: "action:add-scene:append",
              kind: "add-scene",
              label: "Add Scene",
              depth: 2,
              collapsible: false,
              collapsed: false,
              chapterId: chapter.id,
            });
          }
        }
      }

      items.push({
        id: "action:add-chapter:append",
        kind: "add-chapter",
        label: "Add Chapter",
        depth: 1,
        collapsible: false,
        collapsed: false,
      });
    }

    items.push({
      id: "notes",
      kind: "section",
      label: "Notes",
      depth: 0,
      collapsible: true,
      collapsed: collapsed.has("notes"),
    });

    if (!collapsed.has("notes")) {
      appendNoteItems(items, noteList, [], 1, collapsed);
    }

    return items;
  }

  function appendNoteItems(
    items: SidebarItem[],
    noteList: WorkspaceNote[],
    folderPath: string[],
    depth: number,
    collapsed: Set<string>
  ): void {
    const childFolderNames = Array.from(
      new Set(
        noteList
          .filter((note) => startsWithPath(note.folderPath, folderPath))
          .map((note) => note.folderPath[folderPath.length])
          .filter((folderName): folderName is string => folderName !== undefined)
      )
    ).sort((left, right) => left.localeCompare(right));

    for (const folderName of childFolderNames) {
      const nextFolderPath = [...folderPath, folderName];
      const folderId = `folder:${nextFolderPath.join("/")}`;
      items.push({
        id: folderId,
        kind: "folder",
        label: titleFromSlug(folderName),
        depth,
        collapsible: true,
        collapsed: collapsed.has(folderId),
      });

      if (!collapsed.has(folderId)) {
        appendNoteItems(items, noteList, nextFolderPath, depth + 1, collapsed);
      }
    }

    noteList
      .filter((note) => pathsEqual(note.folderPath, folderPath))
      .sort((left, right) => left.title.localeCompare(right.title))
      .forEach((note) => {
        items.push({
          id: note.path,
          kind: "note",
          label: note.title,
          depth,
          collapsible: false,
          collapsed: false,
          path: note.path,
        });
      });
  }

  function startsWithPath(path: string[], prefix: string[]): boolean {
    return prefix.every((part, index) => path[index] === part);
  }

  function pathsEqual(left: string[], right: string[]): boolean {
    return left.length === right.length && startsWithPath(left, right);
  }

  function titleFromSlug(slug: string): string {
    return slug
      .split("-")
      .filter((part) => part.length > 0)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(" ");
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

  function handleSidebarKeydown(event: KeyboardEvent): void {
    if (editingSidebarItemId.length > 0 || event.target !== sidebarNav) {
      return;
    }

    const currentIndex = sidebarItems.findIndex((item) => item.id === focusedSidebarItemId);

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

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusSidebarIndex(Math.min(currentIndex + 1, sidebarItems.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusSidebarIndex(Math.max(currentIndex - 1, 0));
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      expandFocusedItem();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      collapseFocusedItem();
      return;
    }

    if (event.key === "Enter") {
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

  function openTitleModal(state: TitleModalState): void {
    paletteOpen = false;
    contextMenu = undefined;
    titleModal = state;
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
      return;
    }
    if (modal.target === "new-chapter") {
      openTitleModal({
        target: "new-chapter-scene",
        heading: "New Scene",
        value: "",
        placeholder: `Scene ${scenes.length + 1}`,
        chapterTitle: modal.value,
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
      return;
    }
    if (modal.target === "scene" && modal.scenePath !== undefined) {
      await setSceneTitleFromInput(modal.scenePath, modal.value);
      if (modal.scenePath === activePath) {
        await loadDocument(activePath);
      }
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

  function beginProjectTitleEdit(): void {
    if (!projectIsOpen) {
      return;
    }
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
    editingProjectTitle = false;
    await setProjectTitleFromInput(projectTitleDraft);
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
    const nextTitle = normalizedChapterTitle(chapterId, title);
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
    const nextTitle = normalizedSceneTitle(scenePath, title);
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
  }

  function cancelInlineTitleEdit(): void {
    editingProjectTitle = false;
    editingSidebarItemId = "";
  }

  function openSidebarContextMenu(event: MouseEvent, item: SidebarItem): void {
    if (item.kind !== "chapter" && item.kind !== "scene") {
      return;
    }
    event.preventDefault();
    focusedSidebarItemId = item.id;
    contextMenu = { x: event.clientX, y: event.clientY, item };
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

  function normalizedProjectTitle(title: string): string {
    const normalized = title.trim();
    return normalized.length > 0 ? normalized : "Untitled Project";
  }

  function normalizedChapterTitle(chapterId: string, title: string): string {
    const normalized = title.trim();
    if (normalized.length > 0) {
      return normalized;
    }
    const chapter = chapters.find((candidate) => candidate.id === chapterId);
    return `Chapter ${chapter?.sequence ?? 1}`;
  }

  function normalizedSceneTitle(scenePath: string, title: string): string {
    const normalized = title.trim();
    if (normalized.length > 0) {
      return normalized;
    }
    const scene = scenes.find((candidate) => candidate.path === scenePath);
    return `Scene ${scene?.sequence ?? 1}`;
  }

  function chapterForItem(item: SidebarItem): WorkspaceChapter | undefined {
    return item.chapterId === undefined
      ? undefined
      : chapters.find((chapter) => chapter.id === item.chapterId);
  }

  function sceneForItem(item: SidebarItem): WorkspaceScene | undefined {
    return item.path === undefined ? undefined : scenes.find((scene) => scene.path === item.path);
  }

  function saveStateLabel(state: SaveState): string {
    if (state === "dirty") {
      return "Unsaved";
    }
    if (state === "saving") {
      return "Saving";
    }
    if (state === "error") {
      return "Save failed";
    }
    return "Saved";
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

    <aside class:open={sidebarOpen} class="sidebar" aria-label="Project sidebar">
      <div class="sidebar-head">
        <span>Project Workspace</span>
        <button type="button" class="icon-button" aria-label="Close sidebar" on:click={closeSidebar}>
          <CaretLeft size={18} weight="bold" />
        </button>
      </div>
      <div
        bind:this={sidebarNav}
        class="sidebar-nav"
        tabindex="-1"
        role="tree"
        aria-label="Project documents"
        on:keydown={handleSidebarKeydown}
      >
        {#each sidebarItems as item}
          <button
            type="button"
            class="sidebar-item"
            class:active={item.path === activePath}
            class:focused={item.id === focusedSidebarItemId}
            class:branch={item.collapsible}
            class:add-line={item.kind === "add-chapter" || item.kind === "add-scene"}
            style={`--depth: ${item.depth}`}
            role="treeitem"
            aria-selected={item.path === activePath}
            aria-current={item.path === activePath ? "page" : undefined}
            aria-expanded={item.collapsible ? !item.collapsed : undefined}
            on:focus={() => (focusedSidebarItemId = item.id)}
            on:contextmenu={(event) => openSidebarContextMenu(event, item)}
            on:click={() => {
              if (editingSidebarItemId === item.id) {
                return;
              }
              focusedSidebarItemId = item.id;
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
              } else if (item.collapsible) {
                toggleCollapsed(item.id);
              }
            }}
          >
            <span class="item-caret">{item.collapsible ? (item.collapsed ? "+" : "-") : ""}</span>
            {#if item.id === "manuscript"}
              <Book size={16} weight="regular" />
            {:else if item.id === "notes"}
              <Notebook size={16} weight="regular" />
            {:else}
              <span class="item-icon-spacer"></span>
            {/if}
            {#if editingSidebarItemId === item.id}
              <input
                class="sidebar-title-input"
                bind:value={sidebarTitleDraft}
                aria-label="Title"
                on:click|stopPropagation
                on:keydown|stopPropagation={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void commitSidebarTitleEdit(item);
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelInlineTitleEdit();
                  }
                }}
                on:blur={() => void commitSidebarTitleEdit(item)}
              />
            {:else}
              <span class="item-label">{item.label}</span>
            {/if}
          </button>
        {/each}
      </div>
    </aside>
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
          on:click={togglePalette}
        >
          <Command size={19} weight="regular" />
        </button>
      </nav>
    </header>

    {#if projectIsOpen}
      <section class="editor-frame" aria-label="Markdown editor">
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
        <div
          class="project-launcher"
          class:menu-open={storageBackendMenuOpen}
        >
          <div class="backend-select">
            <button
              type="button"
              class="backend-trigger"
              aria-label={`Storage backend: ${selectedStorageBackend.label}`}
              aria-haspopup="menu"
              aria-expanded={storageBackendMenuOpen}
              on:click={() => (storageBackendMenuOpen = !storageBackendMenuOpen)}
            >
              <svelte:component this={selectedStorageBackend.icon} size={19} weight="regular" />
              <CaretDown size={13} weight="bold" />
            </button>
            {#if storageBackendMenuOpen}
              <div class="backend-menu" role="menu" aria-label="Storage backends">
                {#each storageBackendOptions as backend}
                  <button
                    type="button"
                    role="menuitem"
                    class:selected={backend.id === selectedStorageBackendId}
                    disabled={!backend.available}
                    on:click={() => selectStorageBackend(backend)}
                  >
                    <svelte:component this={backend.icon} size={18} weight="regular" />
                    <span>{backend.label}</span>
                    {#if !backend.available && backend.unavailableReason !== undefined}
                      <small>{backend.unavailableReason}</small>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          <button
            type="button"
            class="project-launcher-main"
            aria-label={`Open Project: ${selectedStorageBackend.label}`}
            on:click={() => void openProjectWithBackend(selectedStorageBackend.id)}
          >
            {createProjectIntent ? "New Project" : "Open Project"}
          </button>
          <button
            type="button"
            class="project-launcher-create"
            aria-label={`New Project: ${selectedStorageBackend.label}`}
            on:mouseenter={() => (createProjectIntent = true)}
            on:mouseleave={() => (createProjectIntent = false)}
            on:focus={() => (createProjectIntent = true)}
            on:blur={() => (createProjectIntent = false)}
            on:click={() => void createProjectWithBackend(selectedStorageBackend.id)}
          >
            <Plus size={18} weight="bold" />
          </button>
        </div>
      </section>
    {/if}
    </section>

    {#if paletteOpen}
    <div class="palette-layer">
      <button
        type="button"
        class="palette-backdrop"
        aria-label="Close command palette"
        on:click={closePalette}
      ></button>
      <section class="palette" aria-label="Command palette">
        <input
          bind:this={commandInput}
          bind:value={commandQuery}
          placeholder="Command"
          aria-label="Command"
          role="combobox"
          aria-controls="command-list"
          aria-expanded="true"
          aria-activedescendant={`command-${selectedCommandIndex}`}
          on:input={handleCommandInput}
          on:keydown={handleCommandInputKeydown}
        />
        <div id="command-list" role="listbox" class="command-list">
          {#each filteredCommands as command, index}
            <button
              id={`command-${index}`}
              type="button"
              role="option"
              class:active={command.active}
              class:selected={index === selectedCommandIndex}
              class:disabled={command.disabled}
              disabled={command.disabled}
              aria-selected={index === selectedCommandIndex}
              on:mouseenter={() => (selectedCommandIndex = index)}
              on:click={() => runCommand(command)}
            >
              {command.label}
            </button>
          {:else}
            <p class="empty-command">No commands</p>
          {/each}
        </div>
      </section>
    </div>
    {/if}

    {#if contextMenu !== undefined}
    <button
      type="button"
      class="context-backdrop"
      aria-label="Close context menu"
      on:click={() => (contextMenu = undefined)}
    ></button>
    <div
      class="context-menu"
      style={`left: ${contextMenu.x}px; top: ${contextMenu.y}px`}
      role="menu"
    >
      <button type="button" role="menuitem" on:click={beginContextMenuTitleEdit}>
        Change title
      </button>
      {#if contextMenu.item.kind === "chapter"}
        {@const chapter = chapterForItem(contextMenu.item)}
        <button
          type="button"
          role="menuitem"
          disabled={chapter === undefined || !canDeleteChapter(chapter)}
          on:click={() => chapter !== undefined && openDeleteChapterModal(chapter)}
        >
          Delete chapter
        </button>
      {:else}
        {@const scene = sceneForItem(contextMenu.item)}
        <button
          type="button"
          role="menuitem"
          disabled={scene === undefined || !canDeleteScene()}
          on:click={() => scene !== undefined && openDeleteSceneModal(scene)}
        >
          Delete scene
        </button>
      {/if}
    </div>
    {/if}

    {#if titleModal !== undefined}
    <div class="modal-layer">
      <button
        type="button"
        class="modal-backdrop"
        aria-label="Close title dialog"
        on:click={() => (titleModal = undefined)}
      ></button>
      <section class="modal" aria-label={titleModal.heading}>
        <h2>{titleModal.heading}</h2>
        <form on:submit|preventDefault={() => void submitTitleModal()}>
          <input
            bind:this={titleModalInput}
            bind:value={titleModal.value}
            placeholder={titleModal.placeholder}
            aria-label={titleModal.heading}
          />
          <div class="modal-actions">
            <button type="button" on:click={() => (titleModal = undefined)}>Cancel</button>
            <button type="submit">Save</button>
          </div>
        </form>
      </section>
    </div>
    {/if}

    {#if deleteModal !== undefined}
    <div class="modal-layer">
      <button
        type="button"
        class="modal-backdrop"
        aria-label="Close delete dialog"
        on:click={() => (deleteModal = undefined)}
      ></button>
      <section class="modal" aria-label={deleteModal.heading}>
        <h2>{deleteModal.heading}</h2>
        <p>Type delete to confirm.</p>
        <form on:submit|preventDefault={() => void submitDeleteModal()}>
          <input
            bind:this={deleteModalInput}
            bind:value={deleteModal.confirmation}
            placeholder="delete"
            aria-label={`Confirm ${deleteModal.label}`}
          />
          <div class="modal-actions">
            <button type="button" on:click={() => (deleteModal = undefined)}>Cancel</button>
            <button type="submit" disabled={deleteModal.confirmation !== "delete"}>Delete</button>
          </div>
        </form>
      </section>
    </div>
    {/if}
  {/if}
</main>

<style>
  :global(html) {
    background: var(--claros-app-background, #f7f5f0);
  }

  :global(body) {
    margin: 0;
    min-width: 320px;
    background: var(--claros-app-background, #f7f5f0);
    color: var(--claros-prose-text, #27241f);
  }

  :global(button),
  :global(input) {
    font: inherit;
  }

  .app-shell {
    min-height: 100vh;
    background: var(--claros-app-background);
  }

  .startup-screen {
    display: grid;
    min-height: 100vh;
    place-items: center;
    background: var(--claros-app-background);
    color: var(--claros-prose-text);
  }

  .startup-spinner {
    width: 2.1rem;
    height: 2.1rem;
    border: 2px solid color-mix(in srgb, var(--claros-startup-spinner, currentColor) 24%, transparent);
    border-top-color: var(--claros-startup-spinner, currentColor);
    border-radius: 999px;
    animation: startup-spin 760ms linear infinite;
  }

  @keyframes startup-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .workspace {
    min-height: 100vh;
    transition: margin-left 180ms ease;
  }

  .sidebar-open .workspace {
    margin-left: 16.5rem;
  }

  .sidebar-tab {
    position: fixed;
    z-index: 30;
    top: 45vh;
    left: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    min-height: 2.25rem;
    border: 1px solid var(--claros-prose-widget-border);
    border-left: 0;
    border-radius: 0 6px 6px 0;
    padding: 0;
    background: var(--claros-editor-background);
    color: var(--claros-prose-muted);
    box-shadow: 0 0.75rem 2rem color-mix(in srgb, var(--claros-prose-text) 8%, transparent);
  }

  .sidebar {
    position: fixed;
    z-index: 25;
    inset: 0 auto 0 0;
    display: grid;
    grid-template-rows: auto 1fr;
    width: 16.5rem;
    border-right: 1px solid var(--claros-prose-widget-border);
    background: color-mix(in srgb, var(--claros-editor-background) 94%, var(--claros-app-background));
    box-shadow: 1rem 0 3rem color-mix(in srgb, var(--claros-prose-text) 10%, transparent);
    transform: translateX(-100%);
    transition: transform 180ms ease;
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .sidebar-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 3.25rem;
    padding: 0 0.75rem 0 1rem;
    border-bottom: 1px solid var(--claros-prose-widget-border);
    color: var(--claros-prose-text);
    font: 600 0.86rem/1.2 system-ui, sans-serif;
  }

  .sidebar-head span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar-nav {
    overflow: auto;
    padding: 0.65rem 0.5rem 1rem;
    outline: none;
  }

  .sidebar-item {
    display: grid;
    grid-template-columns: 1rem 1.25rem 1fr;
    column-gap: 0.15rem;
    align-items: center;
    width: 100%;
    min-height: 1.9rem;
    border: 1px solid transparent;
    border-radius: 5px;
    padding: 0 0.45rem 0 calc(0.35rem + var(--depth) * 0.82rem);
    background: transparent;
    color: var(--claros-prose-muted);
    cursor: pointer;
    font: 0.82rem/1.2 system-ui, sans-serif;
    text-align: left;
  }

  .sidebar-item .item-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-icon-spacer {
    display: block;
    width: 1.25rem;
  }

  .sidebar-item.branch {
    color: var(--claros-prose-text);
    font-weight: 600;
  }

  .item-caret {
    color: var(--claros-prose-muted);
    font: 0.8rem/1 var(--claros-prose-mono-font, monospace);
  }

  .sidebar-item.active {
    background: var(--claros-prose-widget-background);
    color: var(--claros-prose-text);
  }

  .sidebar-item:hover,
  .sidebar-item:focus-visible,
  .sidebar-item.focused {
    border-color: var(--claros-prose-focus-ring);
    background: transparent;
    color: var(--claros-prose-text);
    outline: none;
  }

  .sidebar-item.active:hover,
  .sidebar-item.active:focus-visible,
  .sidebar-item.active.focused {
    border-color: var(--claros-prose-focus-ring);
    background: var(--claros-prose-widget-background);
  }

  .sidebar-item.add-line {
    position: relative;
    grid-template-columns: 1fr;
    min-height: 1.55rem;
    border-color: transparent;
    padding-left: calc(0.35rem + var(--depth) * 0.82rem);
    color: var(--claros-prose-muted);
  }

  .sidebar-item.add-line .item-label {
    position: absolute;
    z-index: 1;
    left: 50%;
    top: 50%;
    max-width: max-content;
    padding: 0 0.35rem;
    transform: translate(-50%, -50%);
    background: color-mix(in srgb, var(--claros-editor-background) 94%, var(--claros-app-background));
    color: var(--claros-prose-text);
    font-weight: 600;
    visibility: hidden;
  }

  .sidebar-item.add-line .item-caret,
  .sidebar-item.add-line .item-icon-spacer {
    display: none;
  }

  .sidebar-item.add-line::before {
    content: "";
    position: absolute;
    left: calc(0.55rem + var(--depth) * 0.82rem);
    right: 0.55rem;
    top: 50%;
    height: 1px;
    background: var(--claros-prose-widget-border);
  }

  .sidebar-item.add-line::after {
    content: "+";
    position: absolute;
    left: 50%;
    top: 50%;
    z-index: 1;
    min-width: 1.2rem;
    transform: translate(-50%, -50%);
    background: color-mix(in srgb, var(--claros-editor-background) 94%, var(--claros-app-background));
    color: var(--claros-prose-muted);
    font: 0.86rem/1 system-ui, sans-serif;
    text-align: center;
  }

  .sidebar-item.add-line.focused::before,
  .sidebar-item.add-line:hover::before,
  .sidebar-item.add-line:focus-visible::before {
    height: 2px;
    background: var(--claros-prose-focus-ring);
  }

  .sidebar-item.add-line.focused::after,
  .sidebar-item.add-line:hover::after,
  .sidebar-item.add-line:focus-visible::after {
    content: "";
  }

  .sidebar-item.add-line.focused .item-label,
  .sidebar-item.add-line:hover .item-label,
  .sidebar-item.add-line:focus-visible .item-label {
    visibility: visible;
  }

  .sidebar-title-input {
    min-width: 0;
    width: 100%;
    border: 0;
    border-bottom: 1px solid var(--claros-prose-focus-ring);
    background: transparent;
    color: var(--claros-prose-text);
    outline: none;
    font: inherit;
  }

  .topbar {
    position: fixed;
    z-index: 10;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 3.25rem;
    padding: 0 1rem 0 2.4rem;
    color: var(--claros-prose-muted);
    pointer-events: none;
  }

  .sidebar-open .topbar {
    left: 16.5rem;
  }

  .identity,
  .actions {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    min-width: 0;
    pointer-events: auto;
  }

  .identity {
    overflow: hidden;
  }

  .product {
    color: var(--claros-prose-text);
    font: 600 0.92rem/1.2 system-ui, sans-serif;
  }

  .title-button {
    min-height: 1.8rem;
    padding: 0 0.25rem;
    color: var(--claros-prose-text);
  }

  .title-button:disabled {
    cursor: default;
    opacity: 1;
  }

  .static-title {
    display: inline-flex;
    align-items: center;
    min-height: 1.8rem;
  }

  .project-title-input {
    width: min(18rem, 38vw);
    min-height: 1.8rem;
    border: 0;
    border-bottom: 1px solid var(--claros-prose-focus-ring);
    background: transparent;
    color: var(--claros-prose-text);
    outline: none;
    font: 600 0.92rem/1.2 system-ui, sans-serif;
  }

  .draft-name {
    min-width: 0;
    overflow: hidden;
    color: var(--claros-prose-text);
    font: 0.84rem/1.2 system-ui, sans-serif;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .save-state {
    color: var(--claros-prose-muted);
    font: 0.72rem/1.2 system-ui, sans-serif;
    text-transform: uppercase;
  }

  .save-state {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.35rem;
    height: 1.35rem;
    color: var(--claros-prose-muted);
  }

  .save-state-dot {
    position: absolute;
    top: 0.05rem;
    right: 0.05rem;
    width: 0.42rem;
    height: 0.42rem;
    border: 1px solid var(--claros-editor-background);
    border-radius: 999px;
    background: var(--claros-status-okay);
  }

  .save-state.status-dirty .save-state-dot,
  .save-state.status-saving .save-state-dot {
    background: var(--claros-status-warning);
  }

  .save-state.status-error .save-state-dot {
    background: var(--claros-status-error);
  }

  .actions {
    flex-shrink: 0;
    opacity: 0.52;
    transition: opacity 140ms ease;
  }

  .topbar:focus-within .actions,
  .topbar:hover .actions {
    opacity: 1;
  }

  button {
    min-height: 2rem;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 0 0.65rem;
    background: transparent;
    color: var(--claros-prose-muted);
    cursor: pointer;
  }

  button:hover,
  button:focus-visible,
  button.active,
  button.selected {
    border-color: var(--claros-prose-focus-ring);
    background: var(--claros-prose-widget-background);
    color: var(--claros-prose-text);
    outline: none;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    padding: 0;
  }

  .editor-frame {
    position: relative;
    min-height: 100vh;
    background: var(--claros-editor-background);
  }

  .editor-host {
    min-height: 100vh;
  }

  .project-empty-state {
    position: absolute;
    z-index: 5;
    top: 5rem;
    left: 50%;
    display: grid;
    gap: 0.8rem;
    width: min(24rem, calc(100vw - 2rem));
    transform: translateX(-50%);
    color: var(--claros-prose-muted);
    font: 0.88rem/1.4 system-ui, sans-serif;
    text-align: center;
  }

  .project-empty-state strong {
    color: var(--claros-prose-text);
    font: 600 1rem/1.2 system-ui, sans-serif;
  }

  .project-empty-state button {
    border-color: var(--claros-prose-widget-border);
    background: var(--claros-prose-widget-background);
    color: var(--claros-prose-text);
  }

  .project-launcher {
    position: relative;
    display: inline-grid;
    grid-template-columns: 3rem minmax(11rem, 14rem) 3rem;
    justify-self: center;
    min-height: 2.75rem;
    border: 1px solid var(--claros-prose-widget-border);
    border-radius: 8px;
    background: var(--claros-prose-widget-background);
    box-shadow: 0 0.75rem 2rem color-mix(in srgb, var(--claros-prose-text) 9%, transparent);
  }

  .project-launcher button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.75rem;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--claros-prose-text);
  }

  .project-launcher button:hover,
  .project-launcher button:focus-visible,
  .project-launcher button.selected {
    background: color-mix(in srgb, var(--claros-editor-background) 70%, var(--claros-prose-widget-background));
  }

  .backend-select {
    position: relative;
    min-width: 0;
  }

  .backend-trigger {
    gap: 0.15rem;
    width: 100%;
    border-radius: 7px 0 0 7px !important;
    border-right: 1px solid var(--claros-prose-widget-border) !important;
    padding: 0;
  }

  .project-launcher-main {
    min-width: 0;
    border-right: 1px solid var(--claros-prose-widget-border) !important;
    padding: 0 1rem;
    font-weight: 600;
  }

  .project-launcher-create {
    width: 100%;
    border-radius: 0 7px 7px 0 !important;
    padding: 0;
  }

  .backend-menu {
    position: absolute;
    z-index: 15;
    top: calc(100% + 0.45rem);
    left: 0;
    display: grid;
    gap: 0.25rem;
    width: max-content;
    min-width: 14rem;
    border: 1px solid var(--claros-prose-widget-border);
    border-radius: 8px;
    padding: 0.35rem;
    background: var(--claros-editor-background);
    box-shadow: 0 1rem 2.5rem color-mix(in srgb, var(--claros-prose-text) 14%, transparent);
  }

  .backend-menu button {
    display: grid;
    grid-template-columns: 1.25rem 1fr;
    column-gap: 0.55rem;
    row-gap: 0.1rem;
    justify-items: start;
    min-height: 2.3rem;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 0.35rem 0.55rem;
    color: var(--claros-prose-text);
    text-align: left;
  }

  .backend-menu button small {
    grid-column: 2;
    color: var(--claros-prose-muted);
    font: 0.72rem/1.2 system-ui, sans-serif;
  }

  .backend-menu button:disabled {
    color: var(--claros-prose-muted);
    opacity: 0.54;
  }

  .backend-menu button:disabled:hover {
    background: transparent;
  }

  .palette-layer {
    position: fixed;
    z-index: 40;
    inset: 0;
    display: grid;
    align-items: center;
    justify-items: center;
    padding: 1rem;
  }

  .palette-backdrop {
    position: absolute;
    inset: 0;
    width: 100%;
    min-height: 100%;
    border: 0;
    border-radius: 0;
    padding: 0;
    background: color-mix(in srgb, var(--claros-app-background) 60%, transparent);
    cursor: default;
  }

  .palette-backdrop:hover,
  .palette-backdrop:focus-visible {
    border-color: transparent;
    background: color-mix(in srgb, var(--claros-app-background) 60%, transparent);
    outline: none;
  }

  .palette {
    position: relative;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0.375rem;
    width: min(34rem, calc(100vw - 2rem));
    min-height: min(18rem, calc(100vh - 2rem));
    max-height: min(38rem, calc(100vh - 2rem));
    border: 1px solid var(--claros-prose-widget-border);
    border-radius: 8px;
    padding: 0.5rem;
    background: var(--claros-editor-background);
    box-shadow: 0 1.25rem 4rem color-mix(in srgb, var(--claros-prose-text) 16%, transparent);
    overflow: hidden;
  }

  .palette input {
    min-height: 2.75rem;
    border: 0;
    border-bottom: 1px solid var(--claros-prose-widget-border);
    background: transparent;
    color: var(--claros-prose-text);
    font: 1rem/1.3 system-ui, sans-serif;
    outline: none;
    padding: 0 0.5rem 0.35rem;
  }

  .command-list {
    display: grid;
    align-content: start;
    gap: 0.375rem;
    min-height: 0;
    overflow-y: auto;
    padding-right: 0.15rem;
  }

  .palette button {
    justify-content: flex-start;
    width: 100%;
    text-align: left;
  }

  .palette button.active {
    background: var(--claros-prose-widget-background);
    color: var(--claros-prose-text);
  }

  .palette button:hover,
  .palette button:focus-visible,
  .palette button.selected {
    border-color: var(--claros-prose-focus-ring);
    background: transparent;
    color: var(--claros-prose-text);
    outline: none;
  }

  .palette button.active:hover,
  .palette button.active:focus-visible,
  .palette button.active.selected {
    background: var(--claros-prose-widget-background);
  }

  .empty-command {
    margin: 0;
    padding: 0.65rem 0.5rem;
    color: var(--claros-prose-muted);
    font: 0.95rem/1.3 system-ui, sans-serif;
  }

  .context-backdrop,
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 45;
    width: 100%;
    min-height: 100%;
    border: 0;
    border-radius: 0;
    padding: 0;
    background: transparent;
    cursor: default;
  }

  .context-backdrop:hover,
  .context-backdrop:focus-visible {
    border-color: transparent;
    background: transparent;
    outline: none;
  }

  .modal-backdrop:hover,
  .modal-backdrop:focus-visible {
    border-color: transparent;
    background: color-mix(in srgb, var(--claros-app-background) 62%, transparent);
    outline: none;
  }

  .context-menu {
    position: fixed;
    z-index: 50;
    display: grid;
    gap: 0.2rem;
    min-width: 11rem;
    border: 1px solid var(--claros-prose-widget-border);
    border-radius: 8px;
    padding: 0.35rem;
    background: var(--claros-editor-background);
    box-shadow: 0 1rem 2.5rem color-mix(in srgb, var(--claros-prose-text) 14%, transparent);
  }

  .context-menu button {
    justify-content: flex-start;
    width: 100%;
    text-align: left;
  }

  .modal-layer {
    position: fixed;
    z-index: 55;
    inset: 0;
    display: grid;
    align-items: start;
    justify-items: center;
    padding-top: 16vh;
  }

  .modal-backdrop {
    background: color-mix(in srgb, var(--claros-app-background) 62%, transparent);
  }

  .modal {
    position: relative;
    z-index: 56;
    display: grid;
    gap: 0.8rem;
    width: min(24rem, calc(100vw - 2rem));
    border: 1px solid var(--claros-prose-widget-border);
    border-radius: 8px;
    padding: 1rem;
    background: var(--claros-editor-background);
    box-shadow: 0 1.25rem 4rem color-mix(in srgb, var(--claros-prose-text) 16%, transparent);
  }

  .modal h2,
  .modal p {
    margin: 0;
  }

  .modal h2 {
    color: var(--claros-prose-text);
    font: 600 0.98rem/1.2 system-ui, sans-serif;
  }

  .modal p {
    color: var(--claros-prose-muted);
    font: 0.84rem/1.4 system-ui, sans-serif;
  }

  .modal form {
    display: grid;
    gap: 0.75rem;
  }

  .modal input {
    min-height: 2.5rem;
    border: 0;
    border-bottom: 1px solid var(--claros-prose-widget-border);
    background: transparent;
    color: var(--claros-prose-text);
    outline: none;
  }

  .modal input:focus {
    border-bottom-color: var(--claros-prose-focus-ring);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
  }

  @media (max-width: 800px) {
    .sidebar-open .workspace {
      margin-left: 0;
    }

    .sidebar {
      width: min(18rem, calc(100vw - 2.25rem));
    }

    .sidebar-open .topbar {
      left: 0;
    }

    .topbar {
      align-items: flex-start;
      min-height: auto;
      padding: 0.75rem 0.75rem 0.75rem 2.4rem;
    }

    .actions {
      flex-wrap: wrap;
      justify-content: flex-end;
    }
  }
</style>
