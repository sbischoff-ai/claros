# Manuscript Flow

This spec set defines the web editor manuscript flow for scenes. It is chapter-scoped:
the editor surface shows one chapter at a time, and only the current scene is editable in
CodeMirror. Notes are not part of manuscript flow and keep the existing single-document
editor view.

The primary rule for every iteration: `@claros/editor-core` remains a single-document
Markdown editor. Do not introduce composite CodeMirror documents, protected delimiter
ranges, lazy-loaded scene windows, keyboard-driven scene crossing, or multi-scene editing.

## Iteration Order

1. `iteration_1_chapter_flow_model.md` - derive a chapter-scoped view model around the active scene.
2. `iteration_2_rendered_layout.md` - render the chapter heading, readonly markdown scene blocks, delimiters, and current CodeMirror host.
3. `iteration_3_scene_switching.md` - make readonly scene blocks switch scenes through the existing document-open flow.
4. `iteration_4_regression_hardening.md` - harden notes, saving, cursor placement, scrolling, and no-regression behavior.

## Shared Acceptance Criteria

- Opening a scene loads that scene body into CodeMirror and loads all other scenes in the same chapter as rendered readonly context.
- Opening a note renders only the normal editor; no chapter heading, delimiters, or scene context appears.
- Sidebar active scene, topbar scene title, CodeMirror document id, and current scene block agree with `activePath`.
- Selecting a scene from the sidebar or manuscript context places the cursor at the end of that scene.
- The chapter heading and centered `***` delimiters are DOM-only presentation and are never written to markdown files.
- Arrow keys, Vim movement, mouse placement, selection, undo, and normal typing behave like the underlying single CodeMirror editor.
