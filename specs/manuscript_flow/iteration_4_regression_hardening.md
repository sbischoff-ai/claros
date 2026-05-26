# Iteration 4: Regression Hardening

## Goal

Lock down the simplified behavior so manuscript flow remains a presentation layer around one editable scene, not a second editor model.

## Implementation

- Ensure note documents bypass manuscript flow entirely and keep the current editor dimensions, focus behavior, first-heading cursor behavior, and save behavior.
- Ensure scene switching from notes to scenes rebuilds manuscript flow and places the cursor at the end of the selected scene.
- Ensure scene switching across chapters discards the previous chapter flow and renders only the new selected scene's chapter.
- Ensure the line containing the cursor is fully visible after scene selection. Prefer a minimal editor-runtime method that asks CodeMirror to scroll the selection into view after focus or `setMarkdown`; do not add manuscript-specific scroll math inside the editor core.
- Keep save isolation strict: autosave writes only `ctx.currentMarkdown` to `ctx.activePath`.
- Avoid derived-state drift. Any rendered context cache must be rebuilt from `ProjectSession.readDocument` and the active in-memory document state; it must not become a writable source.

## Acceptance Criteria

- Notes behave exactly as before this feature.
- Switching from note to scene, same-chapter scene to scene, or cross-chapter scene to scene always focuses the selected scene at the end.
- If the end cursor would otherwise be outside the browser viewport, the manuscript surface scrolls far enough to show the cursor line fully.
- Editing the active scene never changes rendered context blocks until the relevant flow is rebuilt from canonical state.
- No delimiter, chapter heading, rendered HTML, or other scene body is ever written into the active scene file.
- The implementation contains no lazy-loading window and no multi-scene editing path.

## Tests

- Controller-test note-to-scene and cross-chapter scene switching.
- DOM or browser-level test that selecting a lower rendered scene scrolls the focused editor cursor into view.
- Save isolation test proving edits in scene A write only scene A, while rendered context for scenes B/C is never persisted through scene A.
- Regression-test existing sidebar selection, file history navigation, topbar save status, wikilink open behavior, Vim toggle, and theme application.
- Static or unit test coverage for the absence of rendered delimiters and chapter headings in saved markdown.
