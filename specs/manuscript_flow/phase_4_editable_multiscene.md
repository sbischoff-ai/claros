# Phase 4: Optional Editable Multi-Scene Mode

## Goal

Only if phases 1-3 are stable, evaluate true multi-scene editing where loaded scenes can all be edited in one apparent manuscript surface.

## Required Design Constraints

- Do not override ArrowUp/ArrowDown or Vim `j/k` movement.
- Do not dispatch editor selection updates from a selection-change listener.
- Do not model scene/chapter delimiters as editable text or protected newline ranges in the main document.
- Do not replace the entire CodeMirror document during scroll or active-scene changes.
- Dirty scene tracking must be deterministic and must write only the scene body that changed.

## Candidate Architecture

- Prefer separate CodeMirror instances per loaded scene inside a virtualized manuscript column.
- Keep delimiters as ordinary DOM between editor instances.
- The focused CodeMirror instance determines the current scene.
- Autosave remains per scene, using existing `ProjectSession.writeDocument`.
- Lazy loading adds/removes whole scene editor instances only after dirty scenes have been flushed.

## Acceptance Criteria

- Cursor movement and text input are indistinguishable from a normal single CodeMirror editor within each scene.
- Focusing another scene updates sidebar/header current scene.
- Sidebar selection scrolls to an already mounted scene editor or mounts it and focuses its end.
- Dirty off-screen scene editors flush before unmount.
- Performance remains acceptable for manuscript projects with at least 100 scenes by mounting only a bounded window.

## Tests

- Browser-level tests with real CodeMirror DOM for ArrowUp/ArrowDown, mouse placement, typing near delimiters, and Vim insert/normal movement.
- Save tests proving edits in scene A cannot be written to scene B.
- Virtualization tests proving mounted window changes do not alter text, cursor, or active scene unexpectedly.

## Gate

Do not implement this phase until phases 1-3 pass their tests and manual exploratory editing confirms stable navigation.
