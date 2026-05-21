<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import ManuscriptDragPreview from "$lib/ManuscriptDragPreview.svelte";
  import WorkspaceSidebar from "$lib/WorkspaceSidebar.svelte";
  import type { WorkspaceController } from "$lib/state/workspace-controller.svelte";
  import ProjectEmptyState from "./ProjectEmptyState.svelte";
  import SidebarTab from "./SidebarTab.svelte";
  import WorkspaceEditorFrame from "./WorkspaceEditorFrame.svelte";
  import WorkspaceOverlays from "./WorkspaceOverlays.svelte";
  import WorkspaceTopbar from "./WorkspaceTopbar.svelte";

  let { controller }: { controller: WorkspaceController } = $props();

  onMount(() => {
    void controller.mount();
  });

  onDestroy(() => {
    controller.destroy();
  });
</script>

<main
  bind:this={controller.appShell}
  class={`app-shell ${controller.projectIsOpen && controller.sidebarOpen ? "sidebar-open" : ""}`}
>
  {#if !controller.startupReady}
    <section class="startup-screen" aria-label="Loading Claros">
      <span class="startup-spinner" aria-hidden="true"></span>
    </section>
  {:else}
    {#if controller.projectIsOpen}
      {#if !controller.sidebarOpen}
        <SidebarTab expanded={controller.sidebarOpen} open={() => controller.toggleSidebar()} />
      {/if}
      <WorkspaceSidebar
        bind:sidebarNav={controller.sidebarNav}
        bind:focusedItemId={controller.focusedSidebarItemId}
        bind:titleDraft={controller.sidebarTitleDraft}
        activePath={controller.activePath}
        close={() => controller.closeSidebar()}
        commitTitle={(item) => void controller.commitSidebarTitleEdit(item)}
        cancelTitleEdit={() => controller.cancelInlineTitleEdit()}
        dragging={controller.manuscriptDrag !== undefined}
        draggingItemId={controller.manuscriptDrag?.itemId ?? ""}
        ghostChapterId={controller.manuscriptDrag?.kind === "chapter" ? controller.manuscriptDrag.chapterId : ""}
        dropIndicatorItemId={controller.chapterDropIndicatorItemId}
        dropIndicatorPlacement={controller.manuscriptDrag?.kind === "chapter" ? controller.manuscriptDrag.placement : undefined}
        editingItemId={controller.editingSidebarItemId}
        handleContextMenu={(event, item) => controller.openSidebarContextMenu(event, item)}
        handleDragPointerDown={(event, item) => controller.manuscriptDragController.handlePointerDown(event, item)}
        handleItemClick={(item) => controller.handleSidebarItemClick(item)}
        handleKeydown={(event) => controller.handleSidebarKeydown(event)}
        items={controller.sidebarItems}
        open={controller.sidebarOpen}
        rememberFocus={(itemId) => controller.rememberSidebarFocus(itemId)}
      />
      <ManuscriptDragPreview drag={controller.manuscriptDrag} />
    {/if}

    <section class="workspace">
      <WorkspaceTopbar {controller} />
      {#if controller.projectIsOpen}
        <WorkspaceEditorFrame {controller} />
      {:else}
        <ProjectEmptyState {controller} />
      {/if}
    </section>

    <WorkspaceOverlays {controller} />
  {/if}
</main>
