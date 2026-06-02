# Iteration 1: Chapter Flow View Model

## Goal

Create the app-side data model for chapter-scoped manuscript flow without changing editor behavior. The model exists only for `apps/web` scene rendering and does not add public APIs to `@claros/editor-core`, `@claros/story-state`, or lower packages.

## Implementation

- Add a web-only helper that derives the active chapter flow from existing workspace state:
  - `WorkspaceChapter[]`
  - `WorkspaceScene[]`
  - `activePath`
  - `ProjectSession.readDocument`
- Return no flow when `activePath` is a note, missing, or not found in `WorkspaceScene[]`.
- For scene paths, find the active scene, its chapter, and all scenes whose `chapterId` matches the active chapter.
- Load the body for every scene in that chapter. The active scene body must stay sourced from the same document state used by CodeMirror, so unsaved edits in the active scene are not overwritten by a background read.
- Preserve existing scene order from `WorkspaceScene[]`; do not sort independently or infer order from paths.
- Treat the chapter title as metadata from `WorkspaceChapter.title`; do not parse chapter titles from scene markdown.

## Interfaces

Add app-side types equivalent to:

```ts
interface ManuscriptChapterFlow {
  chapter: WorkspaceChapter;
  previousScenes: ManuscriptFlowSceneBlock[];
  currentScene: ManuscriptFlowSceneBlock;
  followingScenes: ManuscriptFlowSceneBlock[];
}

interface ManuscriptFlowSceneBlock {
  scene: WorkspaceScene;
  markdown: string;
}
```

Expose the current flow through `WorkspaceEditorSurface` as readonly state. Keep mutation commands separate from the model.

## Acceptance Criteria

- A first scene in a chapter has no `previousScenes` and includes later same-chapter scenes in `followingScenes`.
- A middle scene has same-chapter scenes split before and after it.
- A last scene has no `followingScenes`.
- A single-scene chapter produces only `currentScene`.
- Scenes in other chapters are excluded completely.
- Notes produce `undefined` or an equivalent empty state.

## Tests

- Unit-test the helper for first, middle, last, single-scene, cross-chapter, and note-active cases.
- Controller-test that loading a scene exposes a chapter flow whose current scene matches `activePath`.
- Regression-test that loading a note clears manuscript flow.
