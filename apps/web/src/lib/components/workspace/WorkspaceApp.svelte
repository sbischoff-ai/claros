<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import ManuscriptDragPreview from "$lib/ManuscriptDragPreview.svelte";
  import WorkspaceSidebar from "$lib/WorkspaceSidebar.svelte";
  import type { WorkspaceControllers } from "$lib/state/workspace-controller.svelte";
  import ProjectEmptyState from "./ProjectEmptyState.svelte";
  import SidebarTab from "./SidebarTab.svelte";
  import WorkspaceEditorFrame from "./WorkspaceEditorFrame.svelte";
  import WorkspaceOverlays from "./WorkspaceOverlays.svelte";
  import WorkspaceTopbar from "./WorkspaceTopbar.svelte";

  let { controllers }: { controllers: WorkspaceControllers } = $props();
  let { lifecycle, sidebar, dragPreview, topbar, editor, projectLauncher, overlays } = $derived(
    controllers
  );

  onMount(() => {
    void lifecycle.mount();
  });

  onDestroy(() => {
    lifecycle.destroy();
  });
</script>

<main
  bind:this={lifecycle.appShell}
  class={`app-shell ${lifecycle.projectIsOpen && lifecycle.sidebarOpen ? "sidebar-open" : ""}`}
>
  {#if !lifecycle.startupReady}
    <section class="startup-screen" aria-label="Loading Claros">
      <span class="startup-spinner" aria-hidden="true"></span>
    </section>
  {:else}
    {#if lifecycle.projectIsOpen}
      {#if !lifecycle.sidebarOpen}
        <SidebarTab expanded={lifecycle.sidebarOpen} open={() => lifecycle.toggleSidebar()} />
      {/if}
      <WorkspaceSidebar
        bind:sidebarNav={sidebar.sidebarNav}
        bind:focusedItemId={sidebar.focusedItemId}
        bind:titleDraft={sidebar.titleDraft}
        activePath={sidebar.activePath}
        close={() => sidebar.close()}
        commitTitle={(item) => void sidebar.commitTitle(item)}
        cancelTitleEdit={() => sidebar.cancelTitleEdit()}
        dragging={sidebar.dragging}
        draggingItemId={sidebar.draggingItemId}
        ghostChapterId={sidebar.ghostChapterId}
        dropIndicatorItemId={sidebar.dropIndicatorItemId}
        dropIndicatorPlacement={sidebar.dropIndicatorPlacement}
        editingItemId={sidebar.editingItemId}
        handleContextMenu={(event, item) => sidebar.handleContextMenu(event, item)}
        handleDragPointerDown={(event, item) => sidebar.handleDragPointerDown(event, item)}
        handleItemClick={(item) => sidebar.handleItemClick(item)}
        handleKeydown={(event) => sidebar.handleKeydown(event)}
        items={sidebar.items}
        open={sidebar.open}
        rememberFocus={(itemId) => sidebar.rememberFocus(itemId)}
      />
      <ManuscriptDragPreview drag={dragPreview.drag} />
    {/if}

    <section class="workspace">
      <WorkspaceTopbar controller={topbar} />
      {#if lifecycle.projectIsOpen}
        <WorkspaceEditorFrame controller={editor} />
      {:else}
        <ProjectEmptyState controller={projectLauncher} />
      {/if}
    </section>

    <WorkspaceOverlays controller={overlays} />
  {/if}
</main>
