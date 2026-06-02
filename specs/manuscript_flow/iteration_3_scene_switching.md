# Iteration 3: Scene Switching From Rendered Context

## Goal

Let users click rendered markdown for another scene in the current chapter to make it the current editable scene. Scene switching must use the same document-open path as sidebar selection.

## Implementation

- Add a command on `WorkspaceEditorSurface`, for example `openManuscriptScene(path: string)`.
- Implement the command by delegating to `WorkspaceDocuments.openDocument(path)` so it:
  - flushes pending edits in the old active scene
  - loads the selected scene through `ProjectSession.readDocument`
  - updates `activePath`, `activeTitle`, `activeDocumentKind`, history, sidebar highlight, and topbar title through existing state
  - calls CodeMirror `setMarkdown` for only the selected scene body
  - focuses the editor at the default scene cursor, which is `"end"`
- When a scene switch completes, rebuild the full chapter flow for the selected scene's chapter, even when the selected scene is in the same chapter.
- Make the rendered scene block clickable as a scene-selection affordance without a button-like hover-highlight effect. Use accessible markup that supports keyboard activation if the element is focusable.
- Do not add arrow-key scene crossing. Arrow keys remain native CodeMirror movement inside the current scene.

## Interfaces

- `openManuscriptScene(path)` is web controller surface only.
- No new persistence, story-state, or editor-core scene-switching API.
- Do not reuse rendered markdown bodies as the source of truth for opening a scene unless this is a transparent optimization after the current scene has been flushed; correctness must come from `openDocument`.

## Acceptance Criteria

- Clicking a previous or following rendered scene makes that scene current.
- Sidebar active item, topbar title, `activePath`, and CodeMirror document id update together.
- The selected scene becomes the only editable CodeMirror content.
- The newly selected scene's chapter flow is rendered around it.
- Pending edits in the old scene are saved before switching.
- Normal typing, selection, mouse placement, undo, Vim mode, and ArrowUp/ArrowDown inside CodeMirror do not change `activePath`.

## Tests

- Controller-test that context scene selection calls the same document-open behavior as sidebar selection.
- Save regression: unsaved edits in the old current scene are written before context selection changes `activePath`.
- Regression-test that context scene selection calls `setMarkdown` with the selected scene body, cursor `"end"`, and selected scene path.
- Regression-test that ordinary editor changes and arrow-key movement do not trigger scene switching.
