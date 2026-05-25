<script lang="ts">
  import { onMount } from "svelte";
  import ArrowLeft from "phosphor-svelte/lib/ArrowLeft";
  import ArrowRight from "phosphor-svelte/lib/ArrowRight";

  import type { WorkspaceEditorSurface } from "$lib/state/workspace-controller.svelte";

  let { controller }: { controller: WorkspaceEditorSurface } = $props();

  onMount(() => {
    void controller.ensureEditor();
  });
</script>

<section
  class="editor-frame"
  aria-label="Markdown editor"
  onfocusin={() => controller.rememberEditorFocus()}
>
  <nav class="editor-file-nav" aria-label="Editor file history">
    <button
      type="button"
      class="icon-button"
      aria-label="Open previous file"
      title="Open previous file"
      disabled={!controller.canNavigateBack}
      onclick={() => void controller.navigateBack()}
    >
      <ArrowLeft size={18} weight="regular" />
    </button>
    <button
      type="button"
      class="icon-button"
      aria-label="Open next file"
      title="Open next file"
      disabled={!controller.canNavigateForward}
      onclick={() => void controller.navigateForward()}
    >
      <ArrowRight size={18} weight="regular" />
    </button>
  </nav>
  <div bind:this={controller.editorHost} class="editor-host"></div>
</section>
