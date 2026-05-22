<script lang="ts">
  import { ActionMenuController } from "$lib/state/action-menu-controller.svelte";
  import type { ActionMenuItem } from "./workspace-types";

  let {
    ariaLabel = "Actions",
    close,
    items = [],
    x = 0,
    y = 0,
  }: {
    ariaLabel?: string;
    close: () => void;
    items?: ActionMenuItem[];
    x?: number;
    y?: number;
  } = $props();

  let menu: HTMLDivElement;
  const controller = new ActionMenuController(() => close());

  let submenuItems = $derived(
    controller.submenuIndex === undefined
      ? []
      : (items[controller.submenuIndex]?.submenu ?? [])
  );
  $effect(() => {
    controller.normalize(items);
  });
  $effect(() => {
    void controller.focusSelectedItem(menu, items);
  });
</script>

<div
  bind:this={menu}
  class="context-menu"
  style={`left: ${x}px; top: ${y}px`}
  role="menu"
  aria-label={ariaLabel}
  tabindex="-1"
  onkeydown={(event) => controller.handleKeydown(event, items)}
>
  {#each items as item, index}
    <button
      type="button"
      role="menuitem"
      data-action-menu-index={index}
      class:selected={index === controller.selectedIndex}
      disabled={item.disabled}
      aria-haspopup={item.submenu !== undefined ? "menu" : undefined}
      aria-expanded={item.submenu !== undefined ? controller.submenuIndex === index : undefined}
      onmouseenter={() => controller.handleItemMouseenter(item, index)}
      onclick={() => controller.handleItemClick(item, index, items)}
    >
      {item.label}
      {#if item.submenu !== undefined}
        <span class="submenu-caret" aria-hidden="true">›</span>
      {/if}
    </button>
  {/each}
  {#if controller.submenuIndex !== undefined && submenuItems.length > 0}
    <div
      class="context-submenu"
      role="menu"
      aria-label={`${items[controller.submenuIndex]?.label} options`}
    >
      {#each submenuItems as item, index}
        <button
          type="button"
          role="menuitem"
          class:selected={index === controller.selectedSubmenuIndex}
          disabled={item.disabled}
          onmouseenter={() => controller.handleSubmenuMouseenter(item, index)}
          onclick={() => controller.runSubmenuItem(item)}
        >
          {item.label}
        </button>
      {/each}
    </div>
  {/if}
</div>
