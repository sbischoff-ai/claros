<script lang="ts">
  import { tick } from "svelte";

  import { directionalIntentFromKeydown } from "./directional-navigation";
  import type { ActionMenuItem } from "./workspace-types";

  export let ariaLabel = "Actions";
  export let close: () => void;
  export let items: ActionMenuItem[] = [];
  export let x = 0;
  export let y = 0;

  let menu: HTMLDivElement;
  let selectedIndex = 0;
  let submenuIndex: number | undefined;
  let selectedSubmenuIndex = 0;

  $: selectedIndex = enabledIndexAtOrAfter(selectedIndex);
  $: submenuItems =
    submenuIndex === undefined ? [] : (items[submenuIndex]?.submenu ?? []);
  $: selectedSubmenuIndex = enabledSubmenuIndexAtOrAfter(selectedSubmenuIndex);
  $: void focusSelectedItem(items, selectedIndex);

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }

    const intent = directionalIntentFromKeydown(event);
    if (intent === undefined) {
      return;
    }

    if (submenuIndex !== undefined && (intent === "down" || intent === "up")) {
      event.preventDefault();
      event.stopPropagation();
      moveSubmenuSelection(intent === "down" ? 1 : -1);
      return;
    }

    if (intent === "down") {
      event.preventDefault();
      event.stopPropagation();
      moveSelection(1);
      return;
    }

    if (intent === "up") {
      event.preventDefault();
      event.stopPropagation();
      moveSelection(-1);
      return;
    }

    if (intent === "left") {
      event.preventDefault();
      event.stopPropagation();
      if (submenuIndex !== undefined) {
        submenuIndex = undefined;
        return;
      }
      close();
      return;
    }

    if (intent === "right") {
      event.preventDefault();
      event.stopPropagation();
      openSelectedSubmenu();
      return;
    }

    if (intent === "activate") {
      event.preventDefault();
      event.stopPropagation();
      if (submenuIndex !== undefined) {
        const item = submenuItems[selectedSubmenuIndex];
        if (item !== undefined) {
          runSubmenuItem(item);
        }
        return;
      }
      runSelectedItem();
    }
  }

  function moveSelection(delta: number): void {
    const enabledIndexes = items
      .map((item, index) => (item.disabled === true ? -1 : index))
      .filter((index) => index >= 0);
    if (enabledIndexes.length === 0) {
      selectedIndex = 0;
      return;
    }

    const currentEnabledIndex = enabledIndexes.indexOf(selectedIndex);
    const nextEnabledIndex =
      currentEnabledIndex === -1
        ? 0
        : (currentEnabledIndex + delta + enabledIndexes.length) % enabledIndexes.length;
    selectedIndex = enabledIndexes[nextEnabledIndex];
    submenuIndex = undefined;
  }

  function moveSubmenuSelection(delta: number): void {
    const enabledIndexes = submenuItems
      .map((item, index) => (item.disabled === true ? -1 : index))
      .filter((index) => index >= 0);
    if (enabledIndexes.length === 0) {
      selectedSubmenuIndex = 0;
      return;
    }

    const currentEnabledIndex = enabledIndexes.indexOf(selectedSubmenuIndex);
    const nextEnabledIndex =
      currentEnabledIndex === -1
        ? 0
        : (currentEnabledIndex + delta + enabledIndexes.length) % enabledIndexes.length;
    selectedSubmenuIndex = enabledIndexes[nextEnabledIndex];
  }

  function runSelectedItem(): void {
    const item = items[selectedIndex];
    if (item === undefined || item.disabled === true) {
      return;
    }
    if (item.submenu !== undefined) {
      openSelectedSubmenu();
      return;
    }
    item.run?.();
  }

  function openSelectedSubmenu(): void {
    const item = items[selectedIndex];
    if (item?.submenu === undefined || item.disabled === true) {
      return;
    }
    submenuIndex = selectedIndex;
    selectedSubmenuIndex = enabledSubmenuIndexAtOrAfter(selectedSubmenuIndex);
  }

  function runSubmenuItem(item: ActionMenuItem): void {
    if (item.disabled === true) {
      return;
    }
    item.run?.();
  }

  function enabledIndexAtOrAfter(index: number): number {
    if (items.length === 0) {
      return 0;
    }
    if (items[index]?.disabled !== true) {
      return Math.min(index, items.length - 1);
    }
    const nextEnabledIndex = items.findIndex((item) => item.disabled !== true);
    return nextEnabledIndex === -1 ? 0 : nextEnabledIndex;
  }

  function enabledSubmenuIndexAtOrAfter(index: number): number {
    if (submenuItems.length === 0) {
      return 0;
    }
    if (submenuItems[index]?.disabled !== true) {
      return Math.min(index, submenuItems.length - 1);
    }
    const nextEnabledIndex = submenuItems.findIndex((item) => item.disabled !== true);
    return nextEnabledIndex === -1 ? 0 : nextEnabledIndex;
  }

  async function focusSelectedItem(currentItems: ActionMenuItem[], index: number): Promise<void> {
    await tick();
    if (currentItems !== items || index !== selectedIndex) {
      return;
    }
    menu
      ?.querySelector<HTMLButtonElement>(`button[data-action-menu-index="${selectedIndex}"]`)
      ?.focus();
  }
</script>

<div
  bind:this={menu}
  class="context-menu"
  style={`left: ${x}px; top: ${y}px`}
  role="menu"
  aria-label={ariaLabel}
  tabindex="-1"
  on:keydown={handleKeydown}
>
  {#each items as item, index}
    <button
      type="button"
      role="menuitem"
      data-action-menu-index={index}
      class:selected={index === selectedIndex}
      disabled={item.disabled}
      aria-haspopup={item.submenu !== undefined ? "menu" : undefined}
      aria-expanded={item.submenu !== undefined ? submenuIndex === index : undefined}
      on:mouseenter={() => {
        if (item.disabled !== true) {
          selectedIndex = index;
          if (item.submenu !== undefined) {
            submenuIndex = index;
          }
        }
      }}
      on:click={() => {
        if (item.disabled !== true) {
          selectedIndex = index;
          if (item.submenu !== undefined) {
            openSelectedSubmenu();
          } else {
            item.run?.();
          }
        }
      }}
    >
      {item.label}
      {#if item.submenu !== undefined}
        <span class="submenu-caret" aria-hidden="true">›</span>
      {/if}
    </button>
  {/each}
  {#if submenuIndex !== undefined && submenuItems.length > 0}
    <div class="context-submenu" role="menu" aria-label={`${items[submenuIndex]?.label} options`}>
      {#each submenuItems as item, index}
        <button
          type="button"
          role="menuitem"
          class:selected={index === selectedSubmenuIndex}
          disabled={item.disabled}
          on:mouseenter={() => {
            if (item.disabled !== true) {
              selectedSubmenuIndex = index;
            }
          }}
          on:click={() => runSubmenuItem(item)}
        >
          {item.label}
        </button>
      {/each}
    </div>
  {/if}
</div>
