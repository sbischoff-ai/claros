import type { WorkspaceContext } from "./workspace-context.svelte";
import type { WorkspaceDocuments } from "./workspace-documents.svelte";
import type { WorkspaceFocus } from "./workspace-focus.svelte";

export class WorkspaceOverlays {
  constructor(
    private readonly ctx: WorkspaceContext,
    private readonly documents: WorkspaceDocuments,
    private readonly focus: WorkspaceFocus
  ) {}

  async submitDeleteModal(): Promise<void> {
    if (
      this.ctx.deleteModal === undefined ||
      this.ctx.project === undefined ||
      this.ctx.deleteModal.confirmation !== "delete"
    ) {
      return;
    }
    const modal = this.ctx.deleteModal;
    this.ctx.deleteModal = undefined;
    await this.documents.flushSave();
    if (modal.target === "chapter" && modal.chapterId !== undefined) {
      const nextPath = await this.ctx.project.deleteChapter(modal.chapterId);
      this.documents.refreshProjectView();
      await this.documents.openDocument(nextPath, { forceReload: true, skipSave: true });
    } else if (modal.target === "scene" && modal.scenePath !== undefined) {
      const nextPath = await this.ctx.project.deleteScene(modal.scenePath);
      this.documents.refreshProjectView();
      await this.documents.openDocument(nextPath, { forceReload: true, skipSave: true });
    }
  }

  closeDeleteModal(): void {
    this.ctx.deleteModal = undefined;
    void this.focus.restoreWorkspaceFocus();
  }

  closeConfirmationModal(): void {
    this.ctx.confirmationModal = undefined;
    void this.focus.restoreWorkspaceFocus();
  }

  submitConfirmationModal(): void {
    const modal = this.ctx.confirmationModal;
    this.ctx.confirmationModal = undefined;
    modal?.onConfirm();
  }
}
