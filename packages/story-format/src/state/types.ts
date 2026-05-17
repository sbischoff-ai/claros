/** Freeform state data — arbitrary nested key-value structure.
 *  Root keys are typically module namespaces (e.g. "mythic", "ironsworn"). */
export type StateData = Record<string, unknown>

/** A parsed state YAML file. */
export interface StateFile {
  data: StateData
}

/** Snapshot returned by StateAdapter.getAll().
 *  scenes and chapters are maps from ID to state data.
 *  Only IDs requested via getAll() are guaranteed to be populated. */
export interface ProjectStateSnapshot {
  story: StateData
  scenes: Record<string, StateData>    // keyed by scene ID (kebab-case slug)
  chapters: Record<string, StateData>  // keyed by chapter ID (kebab-case slug)
}

/**
 * Interface for reading and writing authoritative project state.
 *
 * State is scoped by kind:
 *   - story:   project-global (state/story.yaml)
 *   - scene:   per scene (state/scenes/<sceneId>.yaml)
 *   - chapter: per chapter (state/chapters/<chapterId>.yaml)
 *
 * Scene and chapter operations require an explicit ID. There is no implicit
 * "active scene" concept in this interface — the caller always names the scene.
 *
 * Implemented by:
 *   - InMemoryStateAdapter  (@claros/emergence-engine) — for tests
 *   - FileStateAdapter      (@claros/story-state)      — for real project files
 */
export interface StateAdapter {
  // Story scope — project-global
  getStory(path: string): unknown
  setStory(path: string, value: unknown): void

  // Scene scope — explicit scene ID
  getScene(sceneId: string, path: string): unknown
  setScene(sceneId: string, path: string, value: unknown): void

  // Chapter scope — explicit chapter ID
  getChapter(chapterId: string, path: string): unknown
  setChapter(chapterId: string, path: string, value: unknown): void

  /** Return a ProjectStateSnapshot suitable for macro expression evaluation.
   *  If sceneId or chapterId are provided, those scenes/chapters are guaranteed
   *  to appear in the snapshot's scenes/chapters maps (even if empty).
   *  Adapters may include additional loaded data at their discretion. */
  getAll(sceneId?: string, chapterId?: string): ProjectStateSnapshot
}
