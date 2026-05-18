import * as fs from "node:fs";
import * as path from "node:path";
import { parseStateFile, serializeStateFile } from "@claros/story-format";
import type { StateData } from "@claros/story-format";

export interface SceneAdvanceOptions {
  projectRoot: string;
  fromSceneId: string;
  toSceneId: string;
}

/** Create state/scenes/<toSceneId>.yaml as a copy of state/scenes/<fromSceneId>.yaml.
 *  If the source file does not exist, the new file is written with empty state ({}).
 *  The source file is never modified. Parent directories are created if needed. */
export async function advanceScene(options: SceneAdvanceOptions): Promise<void> {
  const sourcePath = path.join(options.projectRoot, "state", "scenes", `${options.fromSceneId}.yaml`);
  const targetPath = path.join(options.projectRoot, "state", "scenes", `${options.toSceneId}.yaml`);

  let sourceData: StateData = {};
  if (fs.existsSync(sourcePath)) {
    sourceData = parseStateFile(fs.readFileSync(sourcePath, "utf-8")).data;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, serializeStateFile({ data: sourceData }));
}
