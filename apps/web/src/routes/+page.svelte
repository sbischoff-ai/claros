<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import {
    CLAROS_THEMES,
    applyNamedTheme,
    createMarkdownEditor,
    type ClarosMarkdownEditor,
    type ClarosThemeId,
  } from "@claros/editor-core";
  import { loadDraft, saveDraft } from "$lib/draft";
  import { loadTheme, saveTheme } from "$lib/theme";

  let appShell: HTMLElement;
  let editorHost: HTMLDivElement;
  let editor: ClarosMarkdownEditor | undefined;
  let commandInput: HTMLInputElement;
  let vimMode = false;
  let paletteOpen = false;
  let commandQuery = "";
  let selectedCommandIndex = 0;
  let activeTheme: ClarosThemeId = "default-light";

  interface PaletteCommand {
    label: string;
    active?: boolean;
    run(): void;
  }

  $: paletteCommands = buildPaletteCommands(activeTheme, vimMode);
  $: filteredCommands = filterCommands(paletteCommands, commandQuery);
  $: selectedCommandIndex = clampCommandIndex(
    selectedCommandIndex,
    filteredCommands.length
  );

  $: if (paletteOpen) {
    selectedCommandIndex = 0;
    void tick().then(() => commandInput?.focus());
  }

  onMount(() => {
    activeTheme = loadTheme(window.localStorage);
    applyNamedTheme(appShell, activeTheme);

    editor = createMarkdownEditor({
      parent: editorHost,
      doc: loadDraft(window.localStorage),
      vimMode,
      theme: activeTheme,
      onChange: (markdown) => saveDraft(window.localStorage, markdown),
    });
    editor.focus();

    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        togglePalette();
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "v"
      ) {
        event.preventDefault();
        toggleVimMode();
      }

      if (event.key === "Escape" && paletteOpen) {
        paletteOpen = false;
        editor?.focus();
      }
    };

    window.addEventListener("keydown", handleKeydown);

    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  });

  onDestroy(() => {
    editor?.destroy();
  });

  function toggleVimMode(): void {
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
    editor?.focus();
  }

  function togglePalette(): void {
    paletteOpen = !paletteOpen;
    if (paletteOpen) {
      commandQuery = "";
      selectedCommandIndex = 0;
    } else {
      editor?.focus();
    }
  }

  function setTheme(themeId: ClarosThemeId): void {
    activeTheme = themeId;
    saveTheme(window.localStorage, themeId);
    applyNamedTheme(appShell, themeId);
    editor?.setTheme(themeId);
    focusEditor();
  }

  function runCommand(command: PaletteCommand): void {
    command.run();
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
      (selectedCommandIndex + delta + filteredCommands.length) %
      filteredCommands.length;
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
    currentVimMode: boolean
  ): PaletteCommand[] {
    return [
      {
        label: currentVimMode ? "Disable Vim" : "Enable Vim",
        active: currentVimMode,
        run: toggleVimMode,
      },
      ...CLAROS_THEMES.map((theme) => ({
        label: `Theme: ${theme.label}`,
        active: theme.id === currentTheme,
        run: () => setTheme(theme.id),
      })),
      {
        label: "Return to Draft",
        run: focusEditor,
      },
    ];
  }

  function filterCommands(
    commands: PaletteCommand[],
    query: string
  ): PaletteCommand[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return commands;
    }

    return commands.filter((command) =>
      command.label.toLowerCase().includes(normalizedQuery)
    );
  }

  function clampCommandIndex(index: number, commandCount: number): number {
    if (commandCount === 0) {
      return 0;
    }

    return Math.min(index, commandCount - 1);
  }
</script>

<svelte:head>
  <title>Claros</title>
</svelte:head>

<main bind:this={appShell} class="app-shell">
  <header class="topbar" aria-label="Workspace">
    <div class="identity">
      <span class="product">Claros</span>
      <span class="draft-name">Draft</span>
    </div>
    <nav class="actions" aria-label="Editor actions">
      <button type="button" on:click={focusEditor}>Focus</button>
      <button
        type="button"
        class:active={vimMode}
        aria-pressed={vimMode}
        on:click={toggleVimMode}
      >
        Vim
      </button>
      <button
        type="button"
        aria-expanded={paletteOpen}
        on:click={togglePalette}
      >
        Commands
      </button>
    </nav>
  </header>

  <section class="editor-frame" aria-label="Markdown editor">
    <div bind:this={editorHost} class="editor-host"></div>
  </section>

  {#if paletteOpen}
    <div class="palette-layer">
      <button
        type="button"
        class="palette-backdrop"
        aria-label="Close command palette"
        on:click={focusEditor}
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
    padding: 0 1rem;
    color: var(--claros-prose-muted);
    pointer-events: none;
  }

  .identity,
  .actions {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    pointer-events: auto;
  }

  .product {
    color: var(--claros-prose-text);
    font: 600 0.92rem/1.2 system-ui, sans-serif;
  }

  .draft-name {
    font: 0.84rem/1.2 system-ui, sans-serif;
  }

  .actions {
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

  .editor-frame {
    min-height: 100vh;
    background: var(--claros-editor-background);
  }

  .editor-host {
    min-height: 100vh;
  }

  .palette-layer {
    position: fixed;
    z-index: 20;
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

  @media (max-width: 700px) {
    .topbar {
      align-items: flex-start;
      min-height: auto;
      padding: 0.75rem;
    }

    .actions {
      flex-wrap: wrap;
      justify-content: flex-end;
    }
  }
</style>
