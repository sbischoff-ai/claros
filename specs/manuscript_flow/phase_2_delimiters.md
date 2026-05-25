# Phase 2: Visual Scene and Chapter Delimiters

## Goal

Add manuscript-style separators without inserting delimiter text into editable markdown and without protecting fake ranges inside CodeMirror.

## Implementation

- Render delimiters in the web context layer between scene preview blocks and the editable scene.
- Scene delimiter: centered `***`.
- Chapter delimiter: centered chapter title styled like an H1 heading, without a leading `#`.
- Use chapter metadata from `WorkspaceChapter`; do not parse chapter title from scene markdown.
- If adjacent scenes are in different chapters, render the chapter delimiter instead of a scene delimiter.
- Chapter title editing remains out of scope unless it can reuse the existing sidebar/title modal flow without inline CodeMirror widgets.

## Public Interfaces

- No new `@claros/editor-core` API.
- Add a pure helper that returns delimiter descriptors:
  - `{ kind: "scene" }`
  - `{ kind: "chapter", chapterId, title }`

## Acceptance Criteria

- Scene delimiter is centered between same-chapter scene previews.
- Chapter delimiter is centered and displays the chapter title between chapter transitions.
- Delimiters are not part of `currentMarkdown` and are never saved into scene files.
- Delimiters cannot receive a CodeMirror cursor because they are outside CodeMirror.

## Tests

- Unit test delimiter helper for same-chapter and cross-chapter transitions.
- Component test visual delimiter placement around active scene.
- Save regression: editing a scene never writes `***` or chapter title delimiter text into markdown.
