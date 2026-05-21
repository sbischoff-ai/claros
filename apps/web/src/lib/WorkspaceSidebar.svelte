<script lang="ts">
  import { flip } from "svelte/animate";
  import Book from "phosphor-svelte/lib/Book";
  import CaretLeft from "phosphor-svelte/lib/CaretLeft";
  import DotsSixVertical from "phosphor-svelte/lib/DotsSixVertical";
  import Notebook from "phosphor-svelte/lib/Notebook";

  import type { SidebarItem } from "./workspace-types";

  export let activePath = "";
  export let close: () => void;
  export let commitTitle: (item: SidebarItem) => void;
  export let cancelTitleEdit: () => void;
  export let editingItemId = "";
  export let focusedItemId = "";
  export let handleContextMenu: (event: MouseEvent, item: SidebarItem) => void;
  export let handleDragPointerDown: (event: PointerEvent, item: SidebarItem) => void;
  export let handleItemClick: (item: SidebarItem) => void;
  export let handleKeydown: (event: KeyboardEvent) => void;
  export let items: SidebarItem[] = [];
  export let open = false;
  export let rememberFocus: (itemId: string) => void;
  export let sidebarNav: HTMLElement;
  export let titleDraft = "";
  export let draggingItemId = "";
  export let dragging = false;
  export let ghostChapterId = "";
  export let dropIndicatorItemId = "";
  export let dropIndicatorPlacement: "before" | "after" | undefined;
</script>

<aside class:open class:dragging class="sidebar" aria-label="Project sidebar">
  <div class="sidebar-head">
    <span>Project Workspace</span>
    <button type="button" class="icon-button" aria-label="Close sidebar" on:click={close}>
      <CaretLeft size={18} weight="bold" />
    </button>
  </div>
  <div
    bind:this={sidebarNav}
    class="sidebar-nav"
    tabindex="-1"
    role="tree"
    aria-label="Project documents"
    on:keydown={handleKeydown}
  >
    {#each items as item (item.id)}
      <div
        class="sidebar-row"
        class:dragging-origin={item.id === draggingItemId}
        class:chapter-ghost={ghostChapterId.length > 0 && item.chapterId === ghostChapterId}
        class:drop-before={item.id === dropIndicatorItemId && dropIndicatorPlacement === "before"}
        class:drop-after={item.id === dropIndicatorItemId && dropIndicatorPlacement === "after"}
        data-sidebar-item-id={item.id}
        data-sidebar-kind={item.kind}
        data-sidebar-chapter-id={item.chapterId}
        data-sidebar-path={item.path}
        animate:flip={{ duration: 155 }}
      >
        {#if item.kind === "chapter" || item.kind === "scene"}
          <span
            class="drag-handle"
            role="button"
            tabindex="-1"
            aria-label={`Move ${item.label}`}
            on:pointerdown={(event) => handleDragPointerDown(event, item)}
          >
            <DotsSixVertical size={15} weight="bold" />
          </span>
        {/if}
        <button
          type="button"
          class="sidebar-item"
          class:active={item.path === activePath}
          class:focused={item.id === focusedItemId}
          class:branch={item.collapsible}
          class:add-line={item.kind === "add-chapter" || item.kind === "add-scene"}
          style={`--depth: ${item.depth}`}
          role="treeitem"
          aria-selected={item.path === activePath}
          aria-current={item.path === activePath ? "page" : undefined}
          aria-expanded={item.collapsible ? !item.collapsed : undefined}
          aria-haspopup={item.kind === "chapter" || item.kind === "scene" ? "menu" : undefined}
          on:focus={() => {
            focusedItemId = item.id;
            rememberFocus(item.id);
          }}
          on:contextmenu={(event) => handleContextMenu(event, item)}
          on:click={(event) => {
            if (editingItemId === item.id) {
              return;
            }
            focusedItemId = item.id;
            handleItemClick(item);
            if (event.detail > 0 && item.collapsible && item.path === undefined) {
              event.currentTarget.blur();
              focusedItemId = "";
            }
          }}
        >
          <span class="item-caret">{item.collapsible ? (item.collapsed ? "+" : "-") : ""}</span>
          {#if item.id === "manuscript"}
            <Book size={16} weight="regular" />
          {:else if item.id === "notes"}
            <Notebook size={16} weight="regular" />
          {:else}
            <span class="item-icon-spacer"></span>
          {/if}
          {#if editingItemId === item.id}
            <input
              class="sidebar-title-input"
              bind:value={titleDraft}
              aria-label="Title"
              on:click|stopPropagation
              on:keydown|stopPropagation={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitTitle(item);
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelTitleEdit();
                }
              }}
              on:blur={() => commitTitle(item)}
            />
          {:else}
            <span class="item-label">{item.label}</span>
          {/if}
        </button>
      </div>
    {/each}
  </div>
</aside>
