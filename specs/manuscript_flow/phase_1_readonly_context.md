# Phase 1: Readonly Context Scenes

## Goal

Show manuscript continuity without changing the editable CodeMirror document model. The current scene remains the only editable text. Previous and next scenes are rendered as readonly context panels above and below the editor, not inside the CodeMirror document.

## Implementation

- Keep `@claros/editor-core` in single-document mode for scenes.
- In `apps/web`, load the active scene body into CodeMirror exactly as today.
- Add a web-only manuscript context layer around the editor host:
  - previous scene preview above the editor content when available
  - next scene preview below the editor content when available
  - enough context to hint continuity, not a virtualized full manuscript
- Render context scene text with the same prose typography but muted color.
- Context scene previews are readonly and non-focusable in this phase.
- The top fade applies only to the CodeMirror/content text layer, not to topbar, file navigation, command button, save status, project title, or scene title.

## Public Interfaces

- No new `@claros/editor-core` public API.
- Add a web-side view model helper that derives `{ previousScene, activeScene, nextScene }` from ordered `WorkspaceScene[]` and `activePath`.

## Acceptance Criteria

- Opening a scene from the sidebar loads only that scene body into CodeMirror.
- Header scene title and sidebar highlight match `activePath`.
- Context scenes appear muted and cannot be edited or receive cursor placement.
- Cursor movement, typing, selection, undo, Vim insert/normal mode, and mouse clicks behave exactly as before this feature.

## Tests

- Controller test: opening scene A exposes previous/next scene metadata in the view model.
- DOM/component test: context scenes render outside the editor host and are marked readonly.
- Regression test: sidebar scene click still calls `setMarkdown` with the selected scene body and cursor `"end"`.
