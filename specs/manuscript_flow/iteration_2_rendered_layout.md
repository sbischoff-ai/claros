# Iteration 2: Rendered Chapter Layout

## Goal

Render the chapter flow around the existing CodeMirror host. The current scene remains the only editable content. All other chapter scenes are parsed and rendered markdown blocks.

## Implementation

- Update `WorkspaceEditorFrame.svelte` so scene mode renders this structure:
  - chapter heading containing `manuscriptFlow.chapter.title`
  - each previous scene block, followed by a centered `***` delimiter
  - the existing CodeMirror `editorHost`
  - for each following scene, a centered `***` delimiter followed by that scene block
- Keep note mode as the existing editor-only layout.
- Use a standard markdown renderer in `apps/web`, specifically `marked`, and sanitize rendered HTML with `DOMPurify` before passing it to Svelte `{@html ...}`.
- Render context blocks from scene document bodies. Do not add separate scene-title chrome; any scene heading should come only from that scene's markdown body.
- Render readonly scene wikilinks without `[[` / `]]` syntax and bind them through the shared `@claros/editor-core` wikilink interaction adapter so previews, ambiguity lists, opening, and unresolved-link creation match CodeMirror.
- Style rendered context blocks with the same Claros prose font, size, line height, column width, and heading rhythm as CodeMirror, but use a slightly muted text color based on `--claros-prose-muted`.
- Do not make context blocks look like buttons. Avoid hover backgrounds, borders, cards, or button cursor styling.
- Make manuscript scene mode scroll as one document surface: chapter heading, previous scenes, CodeMirror, and following scenes move together. CodeMirror should grow with its active scene instead of owning the whole viewport scroll in this mode.

## Interfaces

- `WorkspaceEditorSurface` provides the derived `manuscriptFlow`.
- Add no editor-core API for rendered scenes.
- Add dependencies only to `apps/web`: `marked` and `dompurify`, with appropriate TypeScript types if required.

## Acceptance Criteria

- The chapter heading is visible above the first rendered or editable scene for every active scene.
- Previous scene delimiters appear below previous scene blocks.
- Following scene delimiters appear above following scene blocks.
- The active scene markdown appears only in CodeMirror, not duplicated as rendered markdown.
- Delimiters and chapter headings are outside CodeMirror and cannot receive a CodeMirror cursor.
- Notes have no manuscript flow layout changes.

## Tests

- Component-test the DOM order for first, middle, last, and single-scene chapter cases.
- Component-test that the active scene is represented by the editor host and not by a rendered context block.
- Regression-test that rendered delimiters and chapter headings are not present in `currentMarkdown` or editor runtime `setMarkdown` calls.
