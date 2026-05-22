import { tick } from "svelte";
import type { ManuscriptInsertionPlacement } from "@claros/story-state/browser";

import {
  normalizedChapterTitle,
  normalizedProjectTitle,
  normalizedSceneTitle,
} from "$lib/title-model";
import type { SidebarItem, TitleModalState } from "$lib/workspace-types";
import type { WorkspaceContext } from "./workspace-context.svelte";
import type { WorkspaceDocuments } from "./workspace-documents.svelte";
import type { WorkspaceFocus } from "./workspace-focus.svelte";
import type { WorkspaceManuscriptActions } from "./workspace-manuscript-actions.svelte";
import type { WorkspaceProjects } from "./workspace-projects.svelte";

export class WorkspaceTitles {
  constructor(
    private readonly ctx: WorkspaceContext,
    private readonly documents: WorkspaceDocuments,
    private readonly focus: WorkspaceFocus,
    private readonly manuscript: WorkspaceManuscriptActions,
    private readonly projects: WorkspaceProjects
  ) {}

  openTitleModal(state: TitleModalState): void {
    const returnFocus =
      state.returnFocus ?? this.ctx.paletteReturnFocus ?? this.focus.captureWorkspaceFocus();
    this.ctx.paletteOpen = false;
    this.ctx.contextMenu = undefined;
    this.ctx.titleModal = { ...state, returnFocus };
  }

  openProjectTitleModal(): void {
    this.openTitleModal({
      target: "project",
      heading: "Project Title",
      value: this.ctx.displayProjectTitle,
      placeholder: "Untitled Project",
    });
  }

  openAppendChapterModal(): void {
    this.openChapterCreationModal("append");
  }

  openInsertChapterModal(
    placement: Exclude<ManuscriptInsertionPlacement, "append">,
    chapter = this.ctx.activeChapter
  ): void {
    if (chapter !== undefined) this.openChapterCreationModal(placement, chapter.id);
  }

  openChapterCreationModal(
    placement: ManuscriptInsertionPlacement,
    targetChapterId?: string
  ): void {
    this.openTitleModal({
      target: "new-chapter",
      heading: "New Chapter",
      value: "",
      placeholder: `Chapter ${this.manuscript.chapterCreationSequence(placement, targetChapterId)}`,
      createPlacement: placement,
      targetChapterId,
    });
  }

  openAppendSceneModal(): void {
    this.openSceneCreationModal("append");
  }

  openInsertSceneModal(
    placement: Exclude<ManuscriptInsertionPlacement, "append">,
    scene = this.ctx.activeScene
  ): void {
    if (scene !== undefined) this.openSceneCreationModal(placement, scene.path);
  }

  openSceneCreationModal(placement: ManuscriptInsertionPlacement, targetScenePath?: string): void {
    this.openTitleModal({
      target: "new-scene",
      heading: "New Scene",
      value: "",
      placeholder: `Scene ${this.manuscript.sceneCreationSequence(placement, targetScenePath)}`,
      createPlacement: placement,
      targetScenePath,
    });
  }

  openCurrentChapterTitleModal(): void {
    if (this.ctx.activeChapter === undefined) return;
    this.openTitleModal({
      target: "chapter",
      heading: "Chapter Title",
      value: this.ctx.activeChapter.title,
      placeholder: `Chapter ${this.ctx.activeChapter.sequence}`,
      chapterId: this.ctx.activeChapter.id,
    });
  }

  openCurrentSceneTitleModal(): void {
    if (this.ctx.activeScene === undefined) return;
    this.openTitleModal({
      target: "scene",
      heading: "Scene Title",
      value: this.ctx.activeScene.title,
      placeholder: `Scene ${this.ctx.activeScene.sequence}`,
      scenePath: this.ctx.activeScene.path,
    });
  }

  async submitTitleModal(): Promise<void> {
    if (this.ctx.titleModal === undefined) return;
    const modal = this.ctx.titleModal;
    this.ctx.titleModal = undefined;
    await this.documents.flushSave();
    if (modal.target === "new-project" && modal.storageBackendId !== undefined) {
      await this.projects.createProjectWithBackendTitle(modal.storageBackendId, modal.value);
      return;
    }
    if (this.ctx.project === undefined) return;
    if (modal.target === "project") {
      await this.setProjectTitleFromInput(modal.value);
      await this.focus.restoreWorkspaceFocus(modal.returnFocus);
      return;
    }
    if (modal.target === "new-chapter") {
      this.openTitleModal({
        target: "new-chapter-scene",
        heading: "New Scene",
        value: "",
        placeholder: `Scene ${this.manuscript.firstSceneSequenceForChapterCreation(
          modal.createPlacement,
          modal.targetChapterId
        )}`,
        chapterTitle: modal.value,
        createPlacement: modal.createPlacement,
        targetChapterId: modal.targetChapterId,
        returnFocus: modal.returnFocus,
      });
      return;
    }
    await this.submitDocumentTitleModal(modal);
  }

  closeTitleModal(): void {
    const returnFocus = this.ctx.titleModal?.returnFocus;
    this.ctx.titleModal = undefined;
    void this.focus.restoreWorkspaceFocus(returnFocus);
  }

  prepareProjectTitleEdit(): void {
    this.ctx.projectTitleReturnFocus = this.focus.captureWorkspaceFocus();
  }

  beginProjectTitleEdit(): void {
    if (!this.ctx.projectIsOpen) return;
    this.ctx.projectTitleReturnFocus =
      this.ctx.projectTitleReturnFocus ?? this.focus.captureWorkspaceFocus();
    this.ctx.projectTitleDraft = this.ctx.project?.manifest.title ?? "";
    this.ctx.editingProjectTitle = true;
    void tick().then(() => this.focusTitleInput(".project-title-input"));
  }

  handleProjectTitleKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      void this.commitProjectTitleEdit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.cancelInlineTitleEdit();
    }
  }

  async commitProjectTitleEdit(): Promise<void> {
    if (!this.ctx.project || !this.ctx.editingProjectTitle) return;
    const returnFocus = this.ctx.projectTitleReturnFocus;
    this.ctx.projectTitleReturnFocus = undefined;
    this.ctx.editingProjectTitle = false;
    await this.setProjectTitleFromInput(this.ctx.projectTitleDraft);
    await this.focus.restoreWorkspaceFocus(returnFocus);
  }

  async setProjectTitleFromInput(title: string): Promise<void> {
    if (this.ctx.project === undefined) return;
    this.ctx.optimisticProjectTitle = normalizedProjectTitle(title);
    try {
      await this.ctx.project.setProjectTitle(title);
    } finally {
      this.ctx.optimisticProjectTitle = undefined;
      this.documents.refreshProjectView();
    }
  }

  async setChapterTitleFromInput(chapterId: string, title: string): Promise<void> {
    if (this.ctx.project === undefined) return;
    const nextTitle = normalizedChapterTitle(chapterId, title, this.ctx.chapters);
    const activeSceneSequence =
      this.ctx.activeChapter?.id === chapterId ? this.ctx.activeScene?.sequence : undefined;
    this.ctx.optimisticChapterTitles = new Map(this.ctx.optimisticChapterTitles).set(
      chapterId,
      nextTitle
    );
    try {
      const updatedChapter = await this.ctx.project.setChapterTitle(chapterId, title);
      const updatedActiveScene =
        activeSceneSequence === undefined
          ? undefined
          : updatedChapter.scenes.find((scene) => scene.sequence === activeSceneSequence);
      if (updatedActiveScene !== undefined) {
        await this.documents.loadDocument(updatedActiveScene.path);
        this.documents.setEditorMarkdown(this.ctx.currentMarkdown);
      }
    } finally {
      const next = new Map(this.ctx.optimisticChapterTitles);
      next.delete(chapterId);
      this.ctx.optimisticChapterTitles = next;
      this.documents.refreshProjectView();
    }
  }

  async setSceneTitleFromInput(scenePath: string, title: string): Promise<void> {
    if (this.ctx.project === undefined) return;
    const nextTitle = normalizedSceneTitle(scenePath, title, this.ctx.scenes);
    this.ctx.optimisticSceneTitles = new Map(this.ctx.optimisticSceneTitles).set(
      scenePath,
      nextTitle
    );
    if (scenePath === this.ctx.activePath) this.ctx.activeTitle = nextTitle;
    try {
      const updatedScene = await this.ctx.project.setSceneTitle(scenePath, title);
      if (scenePath === this.ctx.activePath) {
        await this.documents.loadDocument(updatedScene.path);
        this.documents.setEditorMarkdown(this.ctx.currentMarkdown);
      }
    } finally {
      const next = new Map(this.ctx.optimisticSceneTitles);
      next.delete(scenePath);
      this.ctx.optimisticSceneTitles = next;
      this.documents.refreshProjectView();
    }
  }

  beginSidebarTitleEdit(item: SidebarItem): void {
    this.ctx.sidebarTitleReturnFocus = this.focus.captureWorkspaceFocus();
    this.ctx.editingSidebarItemId = item.id;
    this.ctx.sidebarTitleDraft = item.label;
    this.ctx.contextMenu = undefined;
    void tick().then(() => this.focusTitleInput(".sidebar-title-input"));
  }

  async commitSidebarTitleEdit(item: SidebarItem): Promise<void> {
    if (!this.ctx.project || this.ctx.editingSidebarItemId !== item.id) return;
    const returnFocus = this.ctx.sidebarTitleReturnFocus;
    this.ctx.sidebarTitleReturnFocus = undefined;
    this.ctx.editingSidebarItemId = "";
    if (item.kind === "chapter" && item.chapterId !== undefined) {
      await this.setChapterTitleFromInput(item.chapterId, this.ctx.sidebarTitleDraft);
    }
    if (item.kind === "scene" && item.path !== undefined) {
      await this.setSceneTitleFromInput(item.path, this.ctx.sidebarTitleDraft);
      if (item.path === this.ctx.activePath) await this.documents.loadDocument(this.ctx.activePath);
    }
    await this.focus.restoreWorkspaceFocus(returnFocus);
  }

  cancelInlineTitleEdit(): void {
    const returnFocus = this.ctx.sidebarTitleReturnFocus ?? this.ctx.projectTitleReturnFocus;
    this.ctx.editingProjectTitle = false;
    this.ctx.editingSidebarItemId = "";
    this.ctx.projectTitleReturnFocus = undefined;
    this.ctx.sidebarTitleReturnFocus = undefined;
    void this.focus.restoreWorkspaceFocus(returnFocus);
  }

  private async submitDocumentTitleModal(modal: TitleModalState): Promise<void> {
    if (this.ctx.project === undefined) return;
    if (modal.target === "new-chapter-scene") {
      const scene = await this.ctx.project.createChapter(modal.chapterTitle ?? "", modal.value, {
        placement: modal.createPlacement,
        targetChapterId: modal.targetChapterId,
      });
      this.documents.refreshProjectView();
      await this.documents.openDocument(scene.path);
    } else if (modal.target === "new-scene") {
      const scene = await this.ctx.project.createScene(modal.value, {
        placement: modal.createPlacement,
        targetScenePath: modal.targetScenePath,
      });
      this.documents.refreshProjectView();
      await this.documents.openDocument(scene.path);
    } else if (modal.target === "chapter" && modal.chapterId !== undefined) {
      await this.setChapterTitleFromInput(modal.chapterId, modal.value);
      await this.focus.restoreWorkspaceFocus(modal.returnFocus);
    } else if (modal.target === "scene" && modal.scenePath !== undefined) {
      await this.setSceneTitleFromInput(modal.scenePath, modal.value);
      if (modal.scenePath === this.ctx.activePath)
        await this.documents.loadDocument(this.ctx.activePath);
      await this.focus.restoreWorkspaceFocus(modal.returnFocus);
    }
  }

  private focusTitleInput(selector: string): void {
    const input = this.ctx.environment.querySelector<HTMLInputElement>(selector);
    input?.focus();
    input?.select();
  }
}
