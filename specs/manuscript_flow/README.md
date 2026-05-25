# Manuscript Flow Rebuild

This spec set defines a safer phased rebuild for continuous manuscript view after the first composite CodeMirror implementation proved unstable.

The primary rule for all phases: CodeMirror navigation and ordinary text input must remain native and predictable. Do not override vertical cursor movement, do not dispatch selection changes from selection-change handlers, and do not replace the editor document as a side effect of cursor movement.

## Phase Order

1. `phase_1_readonly_context.md` - current scene remains the only editable CodeMirror document; surrounding scenes render as readonly context outside the editor document.
2. `phase_2_delimiters.md` - add visual scene and chapter delimiters outside editable markdown content.
3. `phase_3_scene_switching.md` - allow sidebar/click/keyboard-driven scene switching while keeping a single editable document.
4. `phase_4_editable_multiscene.md` - optional future true multi-scene editing, gated by cursor-stability tests.

## Shared Acceptance Criteria

- The header and editor controls never fade; only editor text content can fade.
- Sidebar active scene, header scene title, and editor current scene agree at all times.
- Selecting a scene in the sidebar remains reliable and places the cursor at the end of the selected scene.
- Arrow keys, Vim movement, mouse placement, and normal typing behave like the underlying CodeMirror editor unless a phase explicitly adds a tested behavior.
