import { tick } from "svelte";

import { directionalIntentFromKeydown } from "$lib/directional-navigation";
import type { ActionMenuItem } from "$lib/workspace-types";

export class ActionMenuController {
  selectedIndex = $state(0);
  submenuIndex = $state<number>();
  selectedSubmenuIndex = $state(0);

  constructor(private readonly close: () => void) {}

  get submenuItems(): ActionMenuItem[] {
    return this.submenuIndex === undefined ? [] : [];
  }

  normalize(items: ActionMenuItem[]): void {
    this.selectedIndex = this.enabledIndexAtOrAfter(items, this.selectedIndex);
    const submenuItems =
      this.submenuIndex === undefined ? [] : (items[this.submenuIndex]?.submenu ?? []);
    this.selectedSubmenuIndex = this.enabledIndexAtOrAfter(submenuItems, this.selectedSubmenuIndex);
  }

  handleKeydown(event: KeyboardEvent, items: ActionMenuItem[]): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }

    const intent = directionalIntentFromKeydown(event);
    if (intent === undefined) {
      return;
    }

    const submenuItems =
      this.submenuIndex === undefined ? [] : (items[this.submenuIndex]?.submenu ?? []);
    if (this.submenuIndex !== undefined && (intent === "down" || intent === "up")) {
      event.preventDefault();
      event.stopPropagation();
      this.moveSubmenuSelection(submenuItems, intent === "down" ? 1 : -1);
      return;
    }

    if (intent === "down" || intent === "up") {
      event.preventDefault();
      event.stopPropagation();
      this.moveSelection(items, intent === "down" ? 1 : -1);
      return;
    }

    if (intent === "left") {
      event.preventDefault();
      event.stopPropagation();
      if (this.submenuIndex !== undefined) {
        this.submenuIndex = undefined;
        return;
      }
      this.close();
      return;
    }

    if (intent === "right") {
      event.preventDefault();
      event.stopPropagation();
      this.openSelectedSubmenu(items);
      return;
    }

    if (intent === "activate") {
      event.preventDefault();
      event.stopPropagation();
      if (this.submenuIndex !== undefined) {
        this.runSubmenuItem(submenuItems[this.selectedSubmenuIndex]);
        return;
      }
      this.runSelectedItem(items);
    }
  }

  handleItemMouseenter(item: ActionMenuItem, index: number): void {
    if (item.disabled === true) {
      return;
    }
    this.selectedIndex = index;
    if (item.submenu !== undefined) {
      this.submenuIndex = index;
    }
  }

  handleItemClick(item: ActionMenuItem, index: number, items: ActionMenuItem[]): void {
    if (item.disabled === true) {
      return;
    }
    this.selectedIndex = index;
    if (item.submenu !== undefined) {
      this.openSelectedSubmenu(items);
      return;
    }
    item.run?.();
  }

  handleSubmenuMouseenter(item: ActionMenuItem, index: number): void {
    if (item.disabled !== true) {
      this.selectedSubmenuIndex = index;
    }
  }

  runSubmenuItem(item: ActionMenuItem | undefined): void {
    if (item?.disabled === true) {
      return;
    }
    item?.run?.();
  }

  async focusSelectedItem(
    menu: HTMLDivElement | undefined,
    items: ActionMenuItem[]
  ): Promise<void> {
    const index = this.selectedIndex;
    await tick();
    if (index !== this.selectedIndex) {
      return;
    }
    menu?.querySelector<HTMLButtonElement>(`button[data-action-menu-index="${index}"]`)?.focus();
    this.normalize(items);
  }

  private moveSelection(items: ActionMenuItem[], delta: number): void {
    const enabledIndexes = this.enabledIndexes(items);
    if (enabledIndexes.length === 0) {
      this.selectedIndex = 0;
      return;
    }

    const currentEnabledIndex = enabledIndexes.indexOf(this.selectedIndex);
    const nextEnabledIndex =
      currentEnabledIndex === -1
        ? 0
        : (currentEnabledIndex + delta + enabledIndexes.length) % enabledIndexes.length;
    this.selectedIndex = enabledIndexes[nextEnabledIndex];
    this.submenuIndex = undefined;
  }

  private moveSubmenuSelection(items: ActionMenuItem[], delta: number): void {
    const enabledIndexes = this.enabledIndexes(items);
    if (enabledIndexes.length === 0) {
      this.selectedSubmenuIndex = 0;
      return;
    }

    const currentEnabledIndex = enabledIndexes.indexOf(this.selectedSubmenuIndex);
    const nextEnabledIndex =
      currentEnabledIndex === -1
        ? 0
        : (currentEnabledIndex + delta + enabledIndexes.length) % enabledIndexes.length;
    this.selectedSubmenuIndex = enabledIndexes[nextEnabledIndex];
  }

  private runSelectedItem(items: ActionMenuItem[]): void {
    const item = items[this.selectedIndex];
    if (item === undefined || item.disabled === true) {
      return;
    }
    if (item.submenu !== undefined) {
      this.openSelectedSubmenu(items);
      return;
    }
    item.run?.();
  }

  private openSelectedSubmenu(items: ActionMenuItem[]): void {
    const item = items[this.selectedIndex];
    if (item?.submenu === undefined || item.disabled === true) {
      return;
    }
    this.submenuIndex = this.selectedIndex;
    this.selectedSubmenuIndex = this.enabledIndexAtOrAfter(item.submenu, this.selectedSubmenuIndex);
  }

  private enabledIndexAtOrAfter(items: ActionMenuItem[], index: number): number {
    if (items.length === 0) {
      return 0;
    }
    if (items[index]?.disabled !== true) {
      return Math.min(index, items.length - 1);
    }
    const nextEnabledIndex = items.findIndex((item) => item.disabled !== true);
    return nextEnabledIndex === -1 ? 0 : nextEnabledIndex;
  }

  private enabledIndexes(items: ActionMenuItem[]): number[] {
    return items
      .map((item, index) => (item.disabled === true ? -1 : index))
      .filter((index) => index >= 0);
  }
}
