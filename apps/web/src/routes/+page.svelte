<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import {
    createMarkdownEditor,
    type ClarosMarkdownEditor,
  } from "@claros/editor-core";
  import { loadDraft, saveDraft } from "$lib/draft";

  let editorHost: HTMLDivElement;
  let editor: ClarosMarkdownEditor | undefined;
  let commandInput: HTMLInputElement;
  let vimMode = false;
  let paletteOpen = false;

  $: if (paletteOpen) {
    void tick().then(() => commandInput?.focus());
  }

  onMount(() => {
    editor = createMarkdownEditor({
      parent: editorHost,
      doc: loadDraft(window.localStorage),
      vimMode,
      onChange: (markdown) => saveDraft(window.localStorage, markdown),
    });
    editor.focus();

    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        paletteOpen = !paletteOpen;
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
    editor?.focus();
  }

  function focusEditor(): void {
    paletteOpen = false;
    editor?.focus();
  }
</script>

<svelte:head>
  <title>Claros</title>
</svelte:head>

<main class="app-shell">
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
        on:click={() => (paletteOpen = !paletteOpen)}
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
        <input bind:this={commandInput} placeholder="Command" aria-label="Command" />
        <button type="button" on:click={toggleVimMode}>
          {vimMode ? "Disable Vim" : "Enable Vim"}
        </button>
        <button type="button" on:click={focusEditor}>Return to Draft</button>
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
  button.active {
    border-color: var(--claros-prose-focus-ring);
    background: rgba(255, 253, 248, 0.74);
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
    background: rgba(39, 36, 31, 0.12);
    cursor: default;
  }

  .palette-backdrop:hover,
  .palette-backdrop:focus-visible {
    border-color: transparent;
    background: rgba(39, 36, 31, 0.12);
    outline: none;
  }

  .palette {
    position: relative;
    display: grid;
    gap: 0.375rem;
    width: min(34rem, calc(100vw - 2rem));
    border: 1px solid rgba(39, 36, 31, 0.12);
    border-radius: 8px;
    padding: 0.5rem;
    background: var(--claros-editor-background);
    box-shadow: 0 1.25rem 4rem rgba(39, 36, 31, 0.16);
  }

  .palette input {
    min-height: 2.75rem;
    border: 0;
    border-bottom: 1px solid rgba(39, 36, 31, 0.12);
    background: transparent;
    color: var(--claros-prose-text);
    font: 1rem/1.3 system-ui, sans-serif;
    outline: none;
    padding: 0 0.5rem 0.35rem;
  }

  .palette button {
    justify-content: flex-start;
    width: 100%;
    text-align: left;
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
