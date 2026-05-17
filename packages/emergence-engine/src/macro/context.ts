/** Invocation context passed to executeMacro and propagated through invoke chains.
 *  Provides the explicit scene and chapter IDs that macro expressions reference
 *  via state.scenes[scene_id].* and state.chapters[chapter_id].* */
export interface MacroInvocationContext {
  /** Kebab-case ID of the scene in which this macro was invoked.
   *  Propagated unchanged to all sub-macros via invoke steps. */
  sceneId?: string;
  /** Kebab-case ID of the chapter in which this macro was invoked. */
  chapterId?: string;
}
