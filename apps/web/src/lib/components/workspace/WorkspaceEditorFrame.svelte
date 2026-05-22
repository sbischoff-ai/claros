<script lang="ts">
  import { onMount } from "svelte";
  import type { WorkspaceEditorSurface } from "$lib/state/workspace-controller.svelte";

  let { controller }: { controller: WorkspaceEditorSurface } = $props();

  onMount(() => {
    void controller.ensureEditor();
  });
</script>

<section class="editor-frame" aria-label="Markdown editor" onfocusin={() => controller.rememberEditorFocus()}>
  <div bind:this={controller.editorHost} class="editor-host"></div>
</section>
