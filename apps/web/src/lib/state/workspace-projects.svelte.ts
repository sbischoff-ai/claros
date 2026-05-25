import {
  createNewCompanionProjectSession,
  createNewLocalProjectSession,
  firstDocumentPath,
  openCompanionProjectSession,
  openLocalProjectSession,
  saveCompanionConnection,
  type CompanionConnection,
} from "$lib/project-session";
import type { StorageBackendOption } from "$lib/storage-backends";
import type { StorageBackendId } from "$lib/workspace-types";
import type { WorkspaceContext } from "./workspace-context.svelte";
import type { WorkspaceDocuments } from "./workspace-documents.svelte";
import type { WorkspaceTitles } from "./workspace-titles.svelte";

export class WorkspaceProjects {
  titles: WorkspaceTitles | undefined;

  constructor(
    private readonly ctx: WorkspaceContext,
    private readonly documents: WorkspaceDocuments
  ) {}

  async openLocalProject(): Promise<void> {
    if (!this.ctx.canOpenLocalProject) {
      this.ctx.projectOpenState = "error";
      this.ctx.projectError = "Local folder access is not supported in this browser.";
      return;
    }

    this.documents.flushSaveWithoutWaiting();
    const hadOpenProject = this.ctx.projectIsOpen;
    if (!hadOpenProject) this.ctx.projectOpenState = "opening";
    this.ctx.projectError = "";
    try {
      const handle = await this.ctx.environment.pickWritableDirectory();
      this.ctx.project = await openLocalProjectSession(handle);
      this.ctx.activePath = firstDocumentPath(this.ctx.project);
      await this.documents.loadDocument(this.ctx.activePath);
      this.documents.resetDocumentTrail(this.ctx.activePath);
      this.ctx.projectOpenState = "open";
      this.ctx.openStorageBackendId = "file-picker";
      this.ctx.sidebarOpen = false;
      await this.documents.ensureEditor();
      this.documents.setEditorMarkdown(this.ctx.currentMarkdown);
      this.documents.focusEditorWithDefaultCursor();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        this.ctx.projectOpenState = this.ctx.project ? "open" : "idle";
        return;
      }
      this.ctx.projectOpenState = hadOpenProject ? "open" : "error";
      this.ctx.projectError = error instanceof Error ? error.message : "Unable to open project";
    }
  }

  async createNewProject(title = "Untitled Project"): Promise<void> {
    if (!this.ctx.canOpenLocalProject) {
      this.ctx.projectOpenState = "error";
      this.ctx.projectError = "Local folder access is not supported in this browser.";
      return;
    }

    this.documents.flushSaveWithoutWaiting();
    const hadOpenProject = this.ctx.projectIsOpen;
    if (!hadOpenProject) this.ctx.projectOpenState = "creating";
    this.ctx.projectError = "";
    try {
      const handle = await this.ctx.environment.pickWritableDirectory();
      this.ctx.project = await createNewLocalProjectSession(handle, title);
      this.ctx.activePath = firstDocumentPath(this.ctx.project);
      await this.documents.loadDocument(this.ctx.activePath);
      this.documents.resetDocumentTrail(this.ctx.activePath);
      this.ctx.projectOpenState = "open";
      this.ctx.openStorageBackendId = "file-picker";
      this.ctx.sidebarOpen = false;
      await this.documents.ensureEditor();
      this.documents.setEditorMarkdown(this.ctx.currentMarkdown);
      this.documents.focusEditorWithDefaultCursor();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        this.ctx.projectOpenState = this.ctx.project ? "open" : "idle";
        return;
      }
      this.ctx.projectOpenState = hadOpenProject ? "open" : "error";
      this.ctx.projectError = error instanceof Error ? error.message : "Unable to create project";
    }
  }

  async openProjectWithBackend(backendId: StorageBackendId): Promise<void> {
    this.ctx.storageBackendMenuOpen = false;
    if (backendId === "file-picker") {
      await this.openLocalProject();
      return;
    }
    await this.connectCompanionFromPrompt();
  }

  async createProjectWithBackend(backendId: StorageBackendId): Promise<void> {
    this.ctx.storageBackendMenuOpen = false;
    this.titles?.openTitleModal({
      target: "new-project",
      heading: "New Project",
      value: "",
      placeholder: "Untitled Project",
      storageBackendId: backendId,
    });
  }

  async createProjectWithBackendTitle(backendId: StorageBackendId, title: string): Promise<void> {
    if (backendId === "file-picker") {
      await this.createNewProject(title);
      return;
    }
    await this.createNewCompanionProject(title);
  }

  selectStorageBackend(backend: StorageBackendOption): void {
    if (!backend.available) return;
    this.ctx.selectedStorageBackendId = backend.id;
    this.ctx.storageBackendMenuOpen = false;
  }

  async connectCompanionFromPrompt(): Promise<void> {
    const url = this.ctx.environment.prompt(
      "Local companion URL",
      this.ctx.companionConnection?.url ?? "http://127.0.0.1:3000"
    );
    if (url === null || url.trim().length === 0) return;
    const token = this.ctx.environment.prompt(
      "Local companion token",
      this.ctx.companionConnection?.token ?? ""
    );
    if (token === null || token.trim().length === 0) return;
    const connection = { url: url.trim(), token: token.trim() };
    saveCompanionConnection(this.ctx.environment.storage, connection);
    await this.connectCompanion(connection);
  }

  async connectCompanion(connection: CompanionConnection): Promise<void> {
    this.documents.flushSaveWithoutWaiting();
    const hadOpenProject = this.ctx.projectIsOpen;
    if (!hadOpenProject) this.ctx.projectOpenState = "connecting";
    this.ctx.projectError = "";
    try {
      this.ctx.companionConnection = connection;
      this.ctx.project = await openCompanionProjectSession(connection);
      this.ctx.activePath = firstDocumentPath(this.ctx.project);
      await this.documents.loadDocument(this.ctx.activePath);
      this.documents.resetDocumentTrail(this.ctx.activePath);
      this.ctx.projectOpenState = "open";
      this.ctx.openStorageBackendId = "local-companion";
      this.ctx.sidebarOpen = false;
      await this.documents.ensureEditor();
      this.documents.setEditorMarkdown(this.ctx.currentMarkdown);
      this.documents.focusEditorWithDefaultCursor();
    } catch (error) {
      this.ctx.projectOpenState = hadOpenProject ? "open" : "error";
      this.ctx.projectError =
        error instanceof Error ? error.message : "Unable to connect local companion";
    }
  }

  async createNewCompanionProject(title = "Untitled Project"): Promise<void> {
    const connection = await this.connectionFromPromptIfNeeded();
    if (connection === undefined) return;
    this.documents.flushSaveWithoutWaiting();
    const hadOpenProject = this.ctx.projectIsOpen;
    if (!hadOpenProject) this.ctx.projectOpenState = "creating";
    this.ctx.projectError = "";
    try {
      this.ctx.companionConnection = connection;
      this.ctx.project = await createNewCompanionProjectSession(connection, title);
      this.ctx.activePath = firstDocumentPath(this.ctx.project);
      await this.documents.loadDocument(this.ctx.activePath);
      this.documents.resetDocumentTrail(this.ctx.activePath);
      this.ctx.projectOpenState = "open";
      this.ctx.openStorageBackendId = "local-companion";
      this.ctx.sidebarOpen = false;
      await this.documents.ensureEditor();
      this.documents.setEditorMarkdown(this.ctx.currentMarkdown);
      this.documents.focusEditorWithDefaultCursor();
    } catch (error) {
      this.ctx.projectOpenState = hadOpenProject ? "open" : "error";
      this.ctx.projectError = error instanceof Error ? error.message : "Unable to create project";
    }
  }

  private async connectionFromPromptIfNeeded(): Promise<CompanionConnection | undefined> {
    if (this.ctx.companionConnection !== undefined) return this.ctx.companionConnection;
    const url = this.ctx.environment.prompt("Local companion URL", "http://127.0.0.1:3000");
    if (url === null || url.trim().length === 0) return undefined;
    const token = this.ctx.environment.prompt("Local companion token", "");
    if (token === null || token.trim().length === 0) return undefined;
    const connection = { url: url.trim(), token: token.trim() };
    saveCompanionConnection(this.ctx.environment.storage, connection);
    return connection;
  }
}
