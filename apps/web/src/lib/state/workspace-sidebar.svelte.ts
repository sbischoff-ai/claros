import { directionalIntentFromKeydown } from "$lib/directional-navigation";
import { ManuscriptDragController } from "$lib/manuscript-drag";
import type { WorkspaceChapter, WorkspaceScene } from "$lib/project-session";
import type { ActionMenuItem, SidebarItem } from "$lib/workspace-types";
import type { WorkspaceContext } from "./workspace-context.svelte";
import type { WorkspaceDocuments } from "./workspace-documents.svelte";
import type { WorkspaceFocus } from "./workspace-focus.svelte";
import type { WorkspaceManuscriptActions } from "./workspace-manuscript-actions.svelte";
import type { WorkspaceTitles } from "./workspace-titles.svelte";

export class WorkspaceSidebarController {
  constructor(
    private readonly ctx: WorkspaceContext,
    private readonly documents: WorkspaceDocuments,
    private readonly focus: WorkspaceFocus,
    private readonly manuscript: WorkspaceManuscriptActions,
    private readonly titles: WorkspaceTitles
  ) {
    this.ctx.manuscriptDragController = new ManuscriptDragController({
      getChapters: () => this.ctx.chapters,
      getScenes: () => this.ctx.scenes,
      getCollapsedItems: () => this.ctx.collapsedItems,
      setCollapsedItems: (next) => {
        this.ctx.collapsedItems = next;
      },
      getSidebarNav: () => this.ctx.sidebarNav,
      isTitleEditing: () => this.ctx.editingSidebarItemId.length > 0,
      rowForItemId: (itemId) => this.sidebarItemElement(itemId),
      moveChapter: (chapterId, options) => this.manuscript.moveChapter(chapterId, options),
      moveScene: (scenePath, options) => this.manuscript.moveScene(scenePath, options),
    });
    this.ctx.dragUnsubscribe = this.ctx.manuscriptDragController.state.subscribe((drag) => {
      this.ctx.manuscriptDrag = drag;
    });
  }

  get manuscriptDragController(): ManuscriptDragController {
    if (this.ctx.manuscriptDragController === undefined) {
      throw new Error("Manuscript drag controller was not initialized");
    }
    return this.ctx.manuscriptDragController;
  }

  get sidebarContextMenuItems(): ActionMenuItem[] {
    return this.ctx.contextMenu === undefined ? [] : this.buildSidebarContextMenuItems(this.ctx.contextMenu.item);
  }

  toggleCollapsed(itemId: string): void {
    const next = new Set(this.ctx.collapsedItems);
    if (next.has(itemId)) {
      next.delete(itemId);
    } else {
      next.add(itemId);
    }
    this.ctx.collapsedItems = next;
  }

  handleSidebarItemClick(item: SidebarItem): void {
    if (item.kind === "add-chapter") {
      this.titles.openAppendChapterModal();
    } else if (item.kind === "add-scene") {
      this.titles.openAppendSceneModal();
    } else if (item.path !== undefined) {
      void this.documents.openDocument(item.path);
    } else if (item.collapsible) {
      this.toggleCollapsed(item.id);
    }
  }

  handleSidebarKeydown(event: KeyboardEvent): void {
    if (
      this.ctx.editingSidebarItemId.length > 0 ||
      !(event.target instanceof Node) ||
      !this.ctx.sidebarNav?.contains(event.target)
    ) {
      return;
    }
    const currentIndex = this.ctx.sidebarItems.findIndex((item) => item.id === this.ctx.focusedSidebarItemId);
    const intent = directionalIntentFromKeydown(event);

    if ((event.metaKey || event.ctrlKey) && event.key === "ArrowLeft") {
      event.preventDefault();
      this.focus.focusSidebar();
    } else if ((event.metaKey || event.ctrlKey) && event.key === "ArrowRight") {
      event.preventDefault();
      this.documents.focusEditorPreservingSidebar();
    } else if (intent === "down") {
      event.preventDefault();
      this.focusSidebarIndex(Math.min(currentIndex + 1, this.ctx.sidebarItems.length - 1));
    } else if (intent === "up") {
      event.preventDefault();
      this.focusSidebarIndex(Math.max(currentIndex - 1, 0));
    } else if (intent === "right") {
      event.preventDefault();
      if (!this.openFocusedSidebarContextMenu()) this.expandFocusedItem();
    } else if (intent === "left") {
      event.preventDefault();
      this.collapseFocusedItem();
    } else if (intent === "activate") {
      event.preventDefault();
      this.activateFocusedItem();
    } else if (event.key.toLowerCase() === "m") {
      event.preventDefault();
      this.focusFirstItemOfKind("scene");
    } else if (event.key.toLowerCase() === "n") {
      event.preventDefault();
      this.focusFirstItemOfKind("note");
    }
  }

  focusSidebarIndex(index: number): void {
    this.ctx.focusedSidebarItemId = this.ctx.sidebarItems[index]?.id ?? this.ctx.focusedSidebarItemId;
  }

  expandFocusedItem(): void {
    const item = this.focusedItem();
    if (item?.collapsible && item.collapsed) this.toggleCollapsed(item.id);
  }

  openFocusedSidebarContextMenu(): boolean {
    const item = this.focusedItem();
    if (item === undefined || !this.hasSidebarContextMenu(item)) return false;
    const anchor = this.sidebarItemElement(item.id);
    const rect = anchor?.getBoundingClientRect();
    this.openSidebarContextMenuAt(rect === undefined ? 0 : rect.right + 6, rect?.top ?? 0, item);
    return true;
  }

  collapseFocusedItem(): void {
    const item = this.focusedItem();
    if (item?.collapsible && !item.collapsed) this.toggleCollapsed(item.id);
  }

  activateFocusedItem(): void {
    const item = this.focusedItem();
    if (item !== undefined) this.handleSidebarItemClick(item);
  }

  focusFirstItemOfKind(kind: "scene" | "note"): void {
    const item = this.ctx.sidebarItems.find((candidate) => candidate.kind === kind);
    if (item !== undefined) this.ctx.focusedSidebarItemId = item.id;
  }

  sidebarItemElement(itemId: string): HTMLElement | undefined {
    return Array.from(this.ctx.sidebarNav?.querySelectorAll<HTMLElement>("[data-sidebar-item-id]") ?? []).find(
      (element) => element.dataset.sidebarItemId === itemId
    );
  }

  openSidebarContextMenu(event: MouseEvent, item: SidebarItem): void {
    if (!this.hasSidebarContextMenu(item)) return;
    event.preventDefault();
    this.openSidebarContextMenuAt(event.clientX, event.clientY, item);
  }

  openSidebarContextMenuAt(x: number, y: number, item: SidebarItem): void {
    this.ctx.focusedSidebarItemId = item.id;
    this.focus.rememberSidebarFocus(item.id);
    this.ctx.contextMenu = { x, y, item };
  }

  closeSidebarContextMenu(): void {
    const returnFocus =
      this.ctx.contextMenu === undefined
        ? undefined
        : { region: "sidebar" as const, itemId: this.ctx.contextMenu.item.id };
    this.ctx.contextMenu = undefined;
    if (returnFocus !== undefined) void this.focus.restoreWorkspaceFocus(returnFocus);
  }

  hasSidebarContextMenu(item: SidebarItem): boolean {
    return item.kind === "chapter" || item.kind === "scene";
  }

  beginContextMenuTitleEdit(): void {
    if (this.ctx.contextMenu !== undefined) this.titles.beginSidebarTitleEdit(this.ctx.contextMenu.item);
  }

  buildSidebarContextMenuItems(item: SidebarItem): ActionMenuItem[] {
    const menuItems: ActionMenuItem[] = [{ label: "Change title", run: () => this.beginContextMenuTitleEdit() }];
    if (item.kind === "chapter") {
      this.appendChapterMenuItems(menuItems, this.chapterForItem(item));
    } else {
      this.appendSceneMenuItems(menuItems, this.sceneForItem(item));
    }
    return menuItems;
  }

  private appendChapterMenuItems(menuItems: ActionMenuItem[], chapter: WorkspaceChapter | undefined): void {
    menuItems.push({
      label: "Add new chapter",
      disabled: chapter === undefined,
      submenu: [
        { label: "Before", run: () => this.titles.openInsertChapterModal("before", chapter) },
        { label: "After", run: () => this.titles.openInsertChapterModal("after", chapter) },
      ],
    });
    menuItems.push({
      label: "Move",
      disabled: chapter === undefined,
      submenu: this.moveChapterItems(chapter),
    });
    menuItems.push({
      label: "Delete chapter",
      disabled: chapter === undefined || !this.manuscript.canDeleteChapter(chapter),
      run: () => chapter !== undefined && this.openDeleteChapterModal(chapter),
    });
  }

  private appendSceneMenuItems(menuItems: ActionMenuItem[], scene: WorkspaceScene | undefined): void {
    menuItems.push({
      label: "Add new scene",
      disabled: scene === undefined,
      submenu: [
        { label: "Before", run: () => this.titles.openInsertSceneModal("before", scene) },
        { label: "After", run: () => this.titles.openInsertSceneModal("after", scene) },
      ],
    });
    menuItems.push({ label: "Move", disabled: scene === undefined, submenu: this.moveSceneItems(scene) });
    menuItems.push({
      label: "Delete scene",
      disabled: scene === undefined || !this.manuscript.canDeleteScene(),
      run: () => scene !== undefined && this.openDeleteSceneModal(scene),
    });
  }

  openCurrentChapterDeleteModal(): void {
    const chapter = this.ctx.activeChapter;
    if (chapter !== undefined && this.manuscript.canDeleteChapter(chapter)) this.openDeleteChapterModal(chapter);
  }

  openCurrentSceneDeleteModal(): void {
    const scene = this.ctx.activeScene;
    if (scene !== undefined && this.manuscript.canDeleteScene()) this.openDeleteSceneModal(scene);
  }

  openDeleteChapterModal(chapter: WorkspaceChapter): void {
    this.ctx.contextMenu = undefined;
    this.ctx.deleteModal = { target: "chapter", heading: "Delete Chapter", label: chapter.title, chapterId: chapter.id, confirmation: "" };
  }

  openDeleteSceneModal(scene: WorkspaceScene): void {
    this.ctx.contextMenu = undefined;
    this.ctx.deleteModal = { target: "scene", heading: "Delete Scene", label: scene.title, scenePath: scene.path, confirmation: "" };
  }

  private moveChapterItems(chapter: WorkspaceChapter | undefined): ActionMenuItem[] {
    return [
      { label: "Up", disabled: chapter === undefined || !this.manuscript.canMoveChapter(chapter, "up"), run: () => chapter !== undefined && void this.manuscript.moveChapterByDirection(chapter, "up") },
      { label: "Down", disabled: chapter === undefined || !this.manuscript.canMoveChapter(chapter, "down"), run: () => chapter !== undefined && void this.manuscript.moveChapterByDirection(chapter, "down") },
    ];
  }

  private moveSceneItems(scene: WorkspaceScene | undefined): ActionMenuItem[] {
    return [
      { label: "Up", disabled: scene === undefined || !this.manuscript.canMoveScene(scene, "up"), run: () => scene !== undefined && void this.manuscript.moveSceneByDirection(scene, "up") },
      { label: "Down", disabled: scene === undefined || !this.manuscript.canMoveScene(scene, "down"), run: () => scene !== undefined && void this.manuscript.moveSceneByDirection(scene, "down") },
    ];
  }

  private focusedItem(): SidebarItem | undefined {
    return this.ctx.sidebarItems.find((candidate) => candidate.id === this.ctx.focusedSidebarItemId);
  }

  private chapterForItem(item: SidebarItem): WorkspaceChapter | undefined {
    return item.chapterId === undefined ? undefined : this.ctx.chapters.find((chapter) => chapter.id === item.chapterId);
  }

  private sceneForItem(item: SidebarItem): WorkspaceScene | undefined {
    return item.path === undefined ? undefined : this.ctx.scenes.find((scene) => scene.path === item.path);
  }
}
