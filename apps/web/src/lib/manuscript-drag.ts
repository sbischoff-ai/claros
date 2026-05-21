import { writable, type Readable } from "svelte/store";

import type { WorkspaceChapter, WorkspaceScene } from "./project-session";
import type { SidebarItem } from "./workspace-types";
import type { ManuscriptInsertionPlacement } from "@claros/story-state";

export type ManuscriptDragState =
  | {
      kind: "chapter";
      itemId: string;
      chapterId: string;
      label: string;
      pointerX: number;
      pointerY: number;
      previewWidth: number;
      targetChapterId?: string;
      placement?: "before" | "after";
    }
  | {
      kind: "scene";
      itemId: string;
      scenePath: string;
      label: string;
      pointerX: number;
      pointerY: number;
      previewWidth: number;
      targetScenePath?: string;
      targetChapterId?: string;
      placement?: ManuscriptInsertionPlacement;
    };

export type SceneMoveOptions = {
  placement: ManuscriptInsertionPlacement;
  targetScenePath?: string;
  targetChapterId?: string;
};

export interface ManuscriptDragControllerOptions {
  getChapters(): WorkspaceChapter[];
  getScenes(): WorkspaceScene[];
  getCollapsedItems(): Set<string>;
  setCollapsedItems(collapsedItems: Set<string>): void;
  getSidebarNav(): HTMLElement | undefined;
  isTitleEditing(): boolean;
  rowForItemId(itemId: string): HTMLElement | undefined;
  moveChapter(
    chapterId: string,
    options: { placement: "before" | "after"; targetChapterId: string }
  ): Promise<void>;
  moveScene(scenePath: string, options: SceneMoveOptions): Promise<void>;
}

export class ManuscriptDragController {
  private readonly dragStore = writable<ManuscriptDragState | undefined>(undefined);
  private drag: ManuscriptDragState | undefined;
  private collapsedHoverTimer: ReturnType<typeof setTimeout> | undefined;

  readonly state: Readable<ManuscriptDragState | undefined> = this.dragStore;

  constructor(private readonly options: ManuscriptDragControllerOptions) {}

  handlePointerDown(event: PointerEvent, item: SidebarItem): void {
    if (event.button !== 0 || this.options.isTitleEditing()) {
      return;
    }

    const row = this.options.rowForItemId(item.id);
    const rect = row?.getBoundingClientRect();
    const dragBase = {
      itemId: item.id,
      label: item.label,
      pointerX: event.clientX,
      pointerY: event.clientY,
      previewWidth: rect?.width ?? 220,
    };

    if (item.kind === "chapter" && item.chapterId !== undefined) {
      event.preventDefault();
      this.setDrag({ ...dragBase, kind: "chapter", chapterId: item.chapterId });
    }
    if (item.kind === "scene" && item.path !== undefined) {
      event.preventDefault();
      this.setDrag({ ...dragBase, kind: "scene", scenePath: item.path });
    }
    if (this.drag === undefined) {
      return;
    }
    if (typeof window !== "undefined") {
      window.addEventListener("pointermove", this.handlePointerMove);
      window.addEventListener("pointerup", this.handlePointerUp, { once: true });
    }
  }

  cancel(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("pointermove", this.handlePointerMove);
    }
    this.clearCollapsedHoverTimer();
    this.setDrag(undefined);
  }

  destroy(): void {
    this.cancel();
  }

  previewChapters(
    chapterList: WorkspaceChapter[],
    drag: ManuscriptDragState | undefined
  ): WorkspaceChapter[] {
    return previewChaptersForDrag(chapterList, this.options.getScenes(), drag);
  }

  chapterDropIndicatorItemId(
    chapterList: WorkspaceChapter[],
    drag: ManuscriptDragState | undefined
  ): string {
    return chapterDropIndicatorItemId(chapterList, this.options.getCollapsedItems(), drag);
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.drag === undefined) {
      return;
    }
    this.setDrag({ ...this.drag, pointerX: event.clientX, pointerY: event.clientY });
    const row = this.sidebarRowFromPoint(event.clientX, event.clientY);
    if (row === undefined) {
      this.clearCollapsedHoverTimer();
      this.setDrag({ ...this.drag, targetChapterId: undefined });
      return;
    }
    if (this.drag.kind === "chapter") {
      this.updateChapterTarget(event, row);
      return;
    }
    this.updateSceneTarget(event, row);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (typeof window !== "undefined") {
      window.removeEventListener("pointermove", this.handlePointerMove);
    }
    this.clearCollapsedHoverTimer();
    const drag = this.drag;
    this.setDrag(undefined);
    if (
      drag === undefined ||
      this.sidebarRowFromPoint(event.clientX, event.clientY) === undefined
    ) {
      return;
    }
    if (
      drag.kind === "chapter" &&
      drag.targetChapterId !== undefined &&
      drag.placement !== undefined
    ) {
      void this.options.moveChapter(drag.chapterId, {
        placement: drag.placement,
        targetChapterId: drag.targetChapterId,
      });
    }
    if (drag.kind === "scene" && drag.placement !== undefined) {
      void this.options.moveScene(drag.scenePath, {
        placement: drag.placement,
        targetScenePath: drag.targetScenePath,
        targetChapterId: drag.targetChapterId,
      });
    }
  };

  private updateChapterTarget(event: PointerEvent, row: HTMLElement): void {
    if (this.drag?.kind !== "chapter") {
      return;
    }
    const targetChapterId = row.dataset.sidebarChapterId;
    if (targetChapterId === undefined || targetChapterId === this.drag.chapterId) {
      this.setDrag({ ...this.drag, targetChapterId: undefined, placement: undefined });
      return;
    }
    if (row.dataset.sidebarKind === "scene") {
      this.setDrag({ ...this.drag, targetChapterId, placement: "after" });
      return;
    }
    if (row.dataset.sidebarKind !== "chapter") {
      return;
    }
    const rect = row.getBoundingClientRect();
    const placement = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    this.setDrag({ ...this.drag, targetChapterId, placement });
  }

  private updateSceneTarget(event: PointerEvent, row: HTMLElement): void {
    if (this.drag?.kind !== "scene") {
      return;
    }
    if (row.dataset.sidebarKind === "scene") {
      const targetScenePath = row.dataset.sidebarPath;
      if (targetScenePath === undefined || targetScenePath === this.drag.scenePath) {
        this.setDrag({ ...this.drag, targetScenePath: undefined, placement: undefined });
        return;
      }
      this.clearCollapsedHoverTimer();
      const rect = row.getBoundingClientRect();
      const placement = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
      this.setDrag({
        ...this.drag,
        targetScenePath,
        targetChapterId: row.dataset.sidebarChapterId,
        placement,
      });
      return;
    }
    if (row.dataset.sidebarKind === "chapter") {
      const targetChapterId = row.dataset.sidebarChapterId;
      if (targetChapterId === undefined) {
        return;
      }
      this.scheduleCollapsedChapterExpansion(row.dataset.sidebarItemId, targetChapterId);
      this.setDrag({
        ...this.drag,
        targetScenePath: undefined,
        targetChapterId,
        placement: "append",
      });
    }
  }

  private sidebarRowFromPoint(x: number, y: number): HTMLElement | undefined {
    if (typeof document === "undefined") {
      return undefined;
    }
    const sidebarNav = this.options.getSidebarNav();
    const element = document.elementFromPoint(x, y);
    if (!(element instanceof HTMLElement) || !sidebarNav?.contains(element)) {
      return undefined;
    }
    return element.closest<HTMLElement>("[data-sidebar-item-id]") ?? undefined;
  }

  private scheduleCollapsedChapterExpansion(itemId: string | undefined, chapterId: string): void {
    const drag = this.drag;
    const collapsedItems = this.options.getCollapsedItems();
    if (drag?.kind !== "scene" || itemId === undefined || !collapsedItems.has(itemId)) {
      this.clearCollapsedHoverTimer();
      return;
    }
    if (drag.targetChapterId === chapterId && this.collapsedHoverTimer !== undefined) {
      return;
    }
    this.clearCollapsedHoverTimer();
    this.collapsedHoverTimer = setTimeout(() => {
      const next = new Set(this.options.getCollapsedItems());
      next.delete(itemId);
      this.options.setCollapsedItems(next);
      this.collapsedHoverTimer = undefined;
    }, 500);
  }

  private clearCollapsedHoverTimer(): void {
    if (this.collapsedHoverTimer !== undefined) {
      clearTimeout(this.collapsedHoverTimer);
      this.collapsedHoverTimer = undefined;
    }
  }

  private setDrag(drag: ManuscriptDragState | undefined): void {
    this.drag = drag;
    this.dragStore.set(drag);
  }
}

export function previewChaptersForDrag(
  chapterList: WorkspaceChapter[],
  sceneList: WorkspaceScene[],
  drag: ManuscriptDragState | undefined
): WorkspaceChapter[] {
  if (drag?.kind !== "scene" || drag.placement === undefined) {
    return chapterList;
  }
  const movingScene = sceneList.find((scene) => scene.path === drag.scenePath);
  if (movingScene === undefined) {
    return chapterList;
  }
  const remainingScenes = sceneList.filter((scene) => scene.path !== drag.scenePath);
  const previewScene = { ...movingScene, chapterId: drag.targetChapterId ?? movingScene.chapterId };
  let insertionIndex = -1;
  if (drag.placement === "append" && drag.targetChapterId !== undefined) {
    insertionIndex = appendSceneIndexForChapter(remainingScenes, chapterList, drag.targetChapterId);
  }
  if (drag.placement !== "append" && drag.targetScenePath !== undefined) {
    const targetIndex = remainingScenes.findIndex((scene) => scene.path === drag.targetScenePath);
    insertionIndex = drag.placement === "before" ? targetIndex : targetIndex + 1;
  }
  if (insertionIndex < 0) {
    return chapterList;
  }
  const nextScenes = [
    ...remainingScenes.slice(0, insertionIndex),
    previewScene,
    ...remainingScenes.slice(insertionIndex),
  ];
  return chapterList.map((chapter) => ({
    ...chapter,
    scenes: nextScenes.filter((scene) => scene.chapterId === chapter.id),
  }));
}

export function chapterDropIndicatorItemId(
  chapterList: WorkspaceChapter[],
  collapsedItems: Set<string>,
  drag: ManuscriptDragState | undefined
): string {
  if (drag?.kind !== "chapter" || drag.targetChapterId === undefined) {
    return "";
  }
  if (drag.placement === "after") {
    const chapter = chapterList.find((candidate) => candidate.id === drag.targetChapterId);
    if (chapter === undefined) {
      return `chapter:${drag.targetChapterId}`;
    }
    const lastScene = chapter.scenes.at(-1);
    if (lastScene !== undefined && !collapsedItems.has(`chapter:${chapter.id}`)) {
      return lastScene.path;
    }
  }
  return `chapter:${drag.targetChapterId}`;
}

function appendSceneIndexForChapter(
  sceneList: WorkspaceScene[],
  chapterList: WorkspaceChapter[],
  chapterId: string
): number {
  const targetChapterIndex = chapterList.findIndex((chapter) => chapter.id === chapterId);
  if (targetChapterIndex === -1) {
    return sceneList.length;
  }
  let index = 0;
  sceneList.forEach((scene) => {
    const chapterIndex = chapterList.findIndex((chapter) => chapter.id === scene.chapterId);
    if (chapterIndex <= targetChapterIndex) {
      index += 1;
    }
  });
  return index;
}
