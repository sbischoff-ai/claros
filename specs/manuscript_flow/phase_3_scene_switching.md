# Phase 3: Scene Switching From Context

## Goal

Let users move between scenes from the continuous manuscript presentation while retaining one editable CodeMirror document at a time.

## Implementation

- Clicking a readonly context scene switches `activePath` to that scene using the existing `openDocument` flow.
- If the clicked scene is already present as context, reuse its loaded body as an optimization only after `flushSave`; otherwise read it through `ProjectSession.readDocument`.
- After switching, CodeMirror receives only the new current scene body and focuses at the end of that scene.
- Sidebar highlight and header scene title update through the existing `activePath`/`activeTitle` state.
- Back/forward history records explicit scene switches from sidebar and context clicks.
- Arrow-key crossing from one scene to another remains out of scope for this phase.

## Public Interfaces

- No editor-core API changes.
- Add a web command method such as `openContextScene(path)` that delegates to `openDocument(path)`.

## Acceptance Criteria

- Sidebar scene selection still works exactly as before.
- Context scene click makes that scene current, updates header/sidebar, and places the cursor at scene end.
- If a scene is not currently loaded as context, selecting it reloads the context window around that scene.
- No cursor jumping occurs while typing or navigating inside the active scene.

## Tests

- Controller test: context click calls the same document-open path as sidebar selection.
- Controller test: active title/sidebar path update after context click.
- Regression test: typed normal letters do not change `activePath`.
- Regression test: ArrowUp/ArrowDown inside the active scene do not trigger scene switching.
