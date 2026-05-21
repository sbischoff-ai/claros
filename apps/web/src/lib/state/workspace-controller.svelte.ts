import { WorkspaceContext } from "./workspace-context.svelte";
import { WorkspaceDocuments } from "./workspace-documents.svelte";
import { WorkspaceFocus } from "./workspace-focus.svelte";
import { WorkspaceLifecycle } from "./workspace-lifecycle.svelte";
import { WorkspaceManuscriptActions } from "./workspace-manuscript-actions.svelte";
import { WorkspaceOverlays } from "./workspace-overlays.svelte";
import { WorkspacePalette } from "./workspace-palette.svelte";
import { WorkspaceProjects } from "./workspace-projects.svelte";
import { WorkspaceSidebarController } from "./workspace-sidebar.svelte";
import { WorkspaceTitles } from "./workspace-titles.svelte";
import {
  createBrowserEnvironment,
  type BrowserEnvironment,
} from "$lib/services/browser-environment";
import {
  createMarkdownEditorRuntime,
  type MarkdownEditorRuntime,
} from "$lib/services/markdown-editor-runtime";
import type { WorkspaceController } from "./workspace-controller-types";

export type { WorkspaceController } from "./workspace-controller-types";

export function createWorkspaceController(
  environment: BrowserEnvironment = createBrowserEnvironment(),
  editorRuntime: MarkdownEditorRuntime = createMarkdownEditorRuntime()
): WorkspaceController {
  const ctx = new WorkspaceContext(environment, editorRuntime);
  const documents = new WorkspaceDocuments(ctx);
  const focus = new WorkspaceFocus(ctx, documents);
  const manuscript = new WorkspaceManuscriptActions(ctx, documents);
  const projects = new WorkspaceProjects(ctx, documents);
  const titles = new WorkspaceTitles(ctx, documents, focus, manuscript, projects);
  projects.titles = titles;
  const sidebar = new WorkspaceSidebarController(ctx, documents, focus, manuscript, titles);
  const overlays = new WorkspaceOverlays(ctx, documents, focus);
  const palette = new WorkspacePalette(
    ctx,
    documents,
    focus,
    manuscript,
    projects,
    sidebar,
    titles
  );
  const lifecycle = new WorkspaceLifecycle(
    ctx,
    documents,
    focus,
    overlays,
    palette,
    projects,
    sidebar,
    titles
  );

  return createWorkspaceFacade([
    lifecycle,
    palette,
    sidebar,
    titles,
    overlays,
    projects,
    manuscript,
    focus,
    documents,
    ctx,
  ]);
}

function createWorkspaceFacade(sources: object[]): WorkspaceController {
  const boundMethods = new Map<PropertyKey, unknown>();
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (boundMethods.has(property)) {
          return boundMethods.get(property);
        }
        const source = sources.find((candidate) => property in candidate);
        if (source === undefined) {
          return undefined;
        }
        const value = Reflect.get(source, property, source);
        if (typeof value !== "function") {
          return value;
        }
        const bound = value.bind(source);
        boundMethods.set(property, bound);
        return bound;
      },
      set(_target, property, value) {
        const source = [...sources].reverse().find((candidate) => property in candidate);
        if (source === undefined) {
          return false;
        }
        return Reflect.set(source, property, value, source);
      },
      has(_target, property) {
        return sources.some((source) => property in source);
      },
    }
  ) as WorkspaceController;
}
