export { FileStateAdapter, StateAdapterError } from "./state/adapter.js";
export type { FileStateAdapterOptions } from "./state/adapter.js";
export { advanceScene } from "./state/scene.js";
export type { SceneAdvanceOptions } from "./state/scene.js";
export {
  NoteNotFoundError,
  getNoteFrontmatter,
  setNoteFrontmatter,
  getNoteFrontmatterPath,
  setNoteFrontmatterPath,
} from "./entity/state.js";
