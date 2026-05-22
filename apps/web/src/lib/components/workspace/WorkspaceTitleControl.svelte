<script lang="ts">
  import type { WorkspaceTitleSurface } from "$lib/state/workspace-controller.svelte";

  let { controller }: { controller: WorkspaceTitleSurface } = $props();
</script>

{#if controller.projectIsOpen && controller.editingProjectTitle}
  <input
    class="project-title-input"
    bind:value={controller.projectTitleDraft}
    aria-label="Project title"
    onkeydown={(event) => controller.handleProjectTitleKeydown(event)}
    onblur={() => void controller.commitProjectTitleEdit()}
  />
{:else if controller.projectIsOpen}
  <button
    type="button"
    class="product title-button"
    onmousedown={() => controller.prepareProjectTitleEdit()}
    onclick={() => controller.beginProjectTitleEdit()}
  >
    {controller.displayProjectTitle}
  </button>
{:else}
  <span class="product static-title">{controller.displayProjectTitle}</span>
{/if}
