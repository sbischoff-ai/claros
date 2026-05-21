<script lang="ts">
  import Command from "phosphor-svelte/lib/Command";

  import WorkspaceTitleControl from "./WorkspaceTitleControl.svelte";
  import type { WorkspaceController } from "$lib/state/workspace-controller.svelte";
  import { saveStateLabel } from "$lib/workspace-view-model";

  let { controller }: { controller: WorkspaceController } = $props();
  let OpenStorageBackendIcon = $derived(controller.openStorageBackend.icon);
</script>

<header class="topbar" aria-label="Workspace">
  <div class="identity">
    <WorkspaceTitleControl {controller} />
    {#if controller.projectIsOpen}
      <span class="draft-name">{controller.activeTitle}</span>
      <span
        class={`save-state status-${controller.saveState}`}
        aria-label={`${controller.openStorageBackend.label}: ${saveStateLabel(controller.saveState)}`}
        title={`${controller.openStorageBackend.label}: ${saveStateLabel(controller.saveState)}`}
      >
        <OpenStorageBackendIcon size={18} weight="regular" />
        <span class="save-state-dot"></span>
      </span>
    {/if}
  </div>
  <nav class="actions" aria-label="Editor actions">
    <button
      type="button"
      class="icon-button"
      aria-label="Open command palette"
      aria-expanded={controller.paletteOpen}
      onmousedown={() => controller.preparePaletteReturnFocus()}
      onclick={() => controller.togglePalette()}
    >
      <Command size={19} weight="regular" />
    </button>
  </nav>
</header>
