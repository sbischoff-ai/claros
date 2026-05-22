<script lang="ts">
  import ActionMenu from "$lib/ActionMenu.svelte";
  import CommandPalette from "$lib/CommandPalette.svelte";
  import ConfirmationModal from "$lib/ConfirmationModal.svelte";
  import DeleteModal from "$lib/DeleteModal.svelte";
  import TitleModal from "$lib/TitleModal.svelte";
  import type { WorkspaceOverlaysSurface } from "$lib/state/workspace-controller.svelte";

  let { controller }: { controller: WorkspaceOverlaysSurface } = $props();
</script>

{#if controller.paletteOpen}
  <CommandPalette
    bind:commandInput={controller.commandInput}
    bind:query={controller.commandQuery}
    bind:selectedIndex={controller.selectedCommandIndex}
    commands={controller.filteredCommands}
    close={() => controller.closePalette()}
    handleInput={() => controller.handleCommandInput()}
    handleKeydown={(event) => controller.handleCommandInputKeydown(event)}
    runCommand={(command) => controller.runCommand(command)}
  />
{/if}

{#if controller.contextMenu !== undefined}
  <button
    type="button"
    class="context-backdrop"
    aria-label="Close context menu"
    onclick={() => controller.closeSidebarContextMenu()}
  ></button>
  <ActionMenu
    ariaLabel={`${controller.contextMenu.item.label} actions`}
    close={() => controller.closeSidebarContextMenu()}
    items={controller.sidebarContextMenuItems}
    x={controller.contextMenu.x}
    y={controller.contextMenu.y}
  />
{/if}

{#if controller.titleModal !== undefined}
  <TitleModal
    state={controller.titleModal}
    close={() => controller.closeTitleModal()}
    submit={() => void controller.submitTitleModal()}
  />
{/if}

{#if controller.deleteModal !== undefined}
  <DeleteModal
    state={controller.deleteModal}
    close={() => controller.closeDeleteModal()}
    submit={() => void controller.submitDeleteModal()}
  />
{/if}

{#if controller.confirmationModal !== undefined}
  <ConfirmationModal
    state={controller.confirmationModal}
    close={() => controller.closeConfirmationModal()}
    submit={() => controller.submitConfirmationModal()}
  />
{/if}
