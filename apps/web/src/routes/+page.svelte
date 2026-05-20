<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import FolderOpen from "phosphor-svelte/lib/FolderOpen";
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
  } from "$lib/project-session";
  import type { BrowserDirectoryPicker } from "$lib/browser-file-system";
  import { loadTheme, saveTheme } from "$lib/theme";

  type SaveState = "saved" | "dirty" | "saving" | "error";
  type ProjectOpenState = "idle" | "opening" | "creating" | "connecting" | "open" | "error";
  type StorageBackendId = "file-picker" | "local-companion";
  type SidebarItemKind = "section" | "chapter" | "folder" | "scene" | "note";

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
  }

  interface StorageBackendOption {
    id: StorageBackendId;
    label: string;
    available: boolean;
    unavailableReason?: string;
  }

  let appShell: HTMLElement;
  let editorHost: HTMLDivElement;
  let editor: ClarosMarkdownEditor | undefined;
  let commandInput: HTMLInputElement;
  let sidebarNav: HTMLElement;
  let project: ProjectSession | undefined;
  let activePath = "";
  let activeTitle = "Draft";
  let activeKind: "scene" | "note" = "scene";
  let currentMarkdown = "";
  let vimMode = false;
  let paletteOpen = false;
  let commandQuery = "";
  let selectedCommandIndex = 0;
  let activeTheme: ClarosThemeId = "default-light";
  let sidebarOpen = false;
  let focusedSidebarItemId = "";
  let saveState: SaveState = "saved";
  let projectOpenState: ProjectOpenState = "idle";
  let projectError = "";
  let canOpenLocalProject = false;
  let selectedStorageBackendId: StorageBackendId = "file-picker";
  let storageBackendMenuOpen = false;
  let createProjectIntent = false;
  let companionConnection: CompanionConnection | undefined;
  let collapsedItems = new Set<string>(["notes"]);
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  $: chapters = project?.listChapters() ?? [];
  $: notes = project?.listNotes() ?? [];
  $: sidebarItems = buildSidebarItems(chapters, notes, collapsedItems);
  $: storageBackendOptions = buildStorageBackendOptions(canOpenLocalProject);
  $: selectedStorageBackend =
    storageBackendOptions.find((backend) => backend.id === selectedStorageBackendId) ??
    storageBackendOptions[0];
  $: projectIsOpen = projectOpenState === "open";
  $: paletteCommands = buildPaletteCommands(activeTheme, vimMode, projectIsOpen, canOpenLocalProject);
  $: filteredCommands = filterCommands(paletteCommands, commandQuery);
  $: selectedCommandIndex = clampCommandIndex(selectedCommandIndex, filteredCommands.length);

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
      void connectCompanion(companionConnection);
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

  async function createNewProject(): Promise<void> {
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
      project = await createNewLocalProjectSession(handle);
      activePath = firstDocumentPath(project);
      await loadDocument(activePath);
      projectOpenState = "open";
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
    if (backendId === "file-picker") {
      await createNewProject();
      return;
    }
    await createNewCompanionProject();
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
      sidebarOpen = false;
      await ensureEditor();
      editor?.setMarkdown(currentMarkdown);
      editor?.focus();
    } catch (error) {
      projectOpenState = hadOpenProject ? "open" : "error";
      projectError = error instanceof Error ? error.message : "Unable to connect local companion";
    }
  }

  async function createNewCompanionProject(): Promise<void> {
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
      project = await createNewCompanionProjectSession(connection);
      activePath = firstDocumentPath(project);
      await loadDocument(activePath);
      projectOpenState = "open";
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

  async function loadDocument(path: string): Promise<void> {
    if (!project) {
      return;
    }

    const document = await project.readDocument({ path });
    activePath = document.path;
    activeTitle = document.title;
    activeKind = document.kind;
    currentMarkdown = document.body;
    saveState = "saved";
  }

  async function openDocument(path: string): Promise<void> {
    if (path === activePath) {
      return;
    }

    await flushSave();
    await loadDocument(path);
    editor?.setMarkdown(currentMarkdown);
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
        available: localProjectSupported,
        unavailableReason: localProjectSupported ? undefined : "Not supported by this browser",
      },
      {
        id: "local-companion",
        label: "Local Companion",
        available: true,
      },
    ];
  }

  function buildSidebarItems(
    chapterList: WorkspaceChapter[],
    noteList: WorkspaceNote[],
    collapsed: Set<string>
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
          label: chapter.title || `Chapter ${chapter.sequence}`,
          depth: 1,
          collapsible: true,
          collapsed: collapsed.has(chapterId),
        });

        if (!collapsed.has(chapterId)) {
          for (const scene of chapter.scenes) {
            items.push({
              id: scene.path,
              kind: "scene",
              label: scene.title || `Scene ${scene.sequence}`,
              depth: 2,
              collapsible: false,
              collapsed: false,
              path: scene.path,
            });
          }
        }
      }
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
  {#if projectIsOpen}
    <button
      type="button"
      class="sidebar-tab"
      aria-label={sidebarOpen ? "Close workspace sidebar" : "Open workspace sidebar"}
      aria-expanded={sidebarOpen}
      on:click={toggleSidebar}
    >
      <span>Project</span>
    </button>

    <aside class:open={sidebarOpen} class="sidebar" aria-label="Project sidebar">
      <div class="sidebar-head">
        <span>{project?.manifest.title ?? "Claros"}</span>
        <button type="button" aria-label="Close sidebar" on:click={closeSidebar}>Close</button>
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
            style={`--depth: ${item.depth}`}
            role="treeitem"
            aria-selected={item.id === focusedSidebarItemId}
            aria-current={item.path === activePath ? "page" : undefined}
            aria-expanded={item.collapsible ? !item.collapsed : undefined}
            on:focus={() => (focusedSidebarItemId = item.id)}
            on:click={() => {
              focusedSidebarItemId = item.id;
              if (item.path !== undefined) {
                void openDocument(item.path);
              } else if (item.collapsible) {
                toggleCollapsed(item.id);
              }
            }}
          >
            <span class="item-caret">{item.collapsible ? (item.collapsed ? "+" : "-") : ""}</span>
            <span>{item.label}</span>
          </button>
        {/each}
      </div>
    </aside>
  {/if}

  <section class="workspace">
    <header class="topbar" aria-label="Workspace">
      <div class="identity">
        <span class="product">{project?.manifest.title ?? "Claros"}</span>
        {#if projectIsOpen}
          <span class="draft-name">{activeTitle}</span>
          <span class="document-kind">{activeKind}</span>
          <span class:error={saveState === "error"} class="save-state">{saveStateLabel(saveState)}</span>
        {/if}
      </div>
      <nav class="actions" aria-label="Editor actions">
        <button
          type="button"
          aria-expanded={paletteOpen}
          on:click={togglePalette}
        >
          Commands
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
              {#if selectedStorageBackendId === "file-picker"}
                <FolderOpen size={19} weight="regular" />
              {:else}
                <TerminalWindow size={19} weight="regular" />
              {/if}
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
                    {#if backend.id === "file-picker"}
                      <FolderOpen size={18} weight="regular" />
                    {:else}
                      <TerminalWindow size={18} weight="regular" />
                    {/if}
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
    --claros-app-background: #f7f5f0;
    --claros-editor-background: #fffdf8;
    --claros-prose-text: #27241f;
    --claros-prose-muted: #7a746b;
    --claros-prose-focus-ring: rgba(70, 95, 124, 0.26);
    --claros-prose-widget-background: #f0ede5;
    --claros-prose-widget-border: #d8d1c4;
    min-height: 100vh;
    background: var(--claros-app-background);
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
    width: 1.65rem;
    min-height: 5.75rem;
    border: 1px solid var(--claros-prose-widget-border);
    border-left: 0;
    border-radius: 0 6px 6px 0;
    padding: 0;
    background: var(--claros-editor-background);
    color: var(--claros-prose-muted);
    box-shadow: 0 0.75rem 2rem color-mix(in srgb, var(--claros-prose-text) 8%, transparent);
  }

  .sidebar-tab span {
    display: inline-block;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font: 600 0.7rem/1 system-ui, sans-serif;
    letter-spacing: 0;
    text-transform: uppercase;
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
    grid-template-columns: 1rem 1fr;
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

  .sidebar-item span:last-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar-item.branch {
    color: var(--claros-prose-text);
    font-weight: 600;
  }

  .item-caret {
    color: var(--claros-prose-muted);
    font: 0.8rem/1 var(--claros-prose-mono-font, monospace);
  }

  .sidebar-item:hover,
  .sidebar-item:focus-visible,
  .sidebar-item.focused,
  .sidebar-item.active {
    border-color: var(--claros-prose-focus-ring);
    background: var(--claros-prose-widget-background);
    color: var(--claros-prose-text);
    outline: none;
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

  .draft-name {
    min-width: 0;
    overflow: hidden;
    color: var(--claros-prose-text);
    font: 0.84rem/1.2 system-ui, sans-serif;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .document-kind,
  .save-state {
    color: var(--claros-prose-muted);
    font: 0.72rem/1.2 system-ui, sans-serif;
    text-transform: uppercase;
  }

  .save-state.error {
    color: #9d3d3d;
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
    align-items: start;
    justify-items: center;
    padding-top: 12vh;
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
    gap: 0.375rem;
    width: min(34rem, calc(100vw - 2rem));
    border: 1px solid var(--claros-prose-widget-border);
    border-radius: 8px;
    padding: 0.5rem;
    background: var(--claros-editor-background);
    box-shadow: 0 1.25rem 4rem color-mix(in srgb, var(--claros-prose-text) 16%, transparent);
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
    gap: 0.375rem;
  }

  .palette button {
    justify-content: flex-start;
    width: 100%;
    text-align: left;
  }

  .empty-command {
    margin: 0;
    padding: 0.65rem 0.5rem;
    color: var(--claros-prose-muted);
    font: 0.95rem/1.3 system-ui, sans-serif;
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
