import type { ProjectFileReader, ProjectFileWriter } from "@claros/story-format";

export interface InitializeProjectOptions {
  title?: string;
}

export async function initializeProjectFiles(
  root: string,
  fileReader: ProjectFileReader,
  fileWriter: ProjectFileWriter,
  options: InitializeProjectOptions = {}
): Promise<void> {
  const manifestPath = joinProjectPath(root, "claros.yaml");
  const manifestStat = await fileReader.stat(manifestPath);
  if (manifestStat.exists) {
    throw new ProjectAlreadyExistsError("claros.yaml already exists");
  }

  const title = normalizedProjectTitle(options.title ?? "Untitled Project");
  await fileWriter.mkdir(joinProjectPath(root, "manuscript/001-draft"), true);
  await fileWriter.mkdir(joinProjectPath(root, "notes"), true);
  await fileWriter.writeFileAtomic(manifestPath, `claros: 1\ntitle: ${JSON.stringify(title)}\n`);
  await fileWriter.writeFileAtomic(
    joinProjectPath(root, "manuscript/001-draft/chapter.yaml"),
    "title: Draft\n"
  );
  await fileWriter.writeFileAtomic(
    joinProjectPath(root, "manuscript/001-draft/001-opening.md"),
    "---\ntitle: Opening\n---\n\n# Draft\n\n## Opening\n\n"
  );
}

export class ProjectAlreadyExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectAlreadyExistsError";
  }
}

export function normalizedProjectTitle(title: string): string {
  const normalized = title.trim();
  return normalized.length > 0 ? normalized : "Untitled Project";
}

function joinProjectPath(root: string, relativePath: string): string {
  const normalizedRoot = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedRelative = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalizedRoot.length === 0 || normalizedRoot === ".") {
    return normalizedRelative;
  }
  if (normalizedRoot === "/") {
    return `/${normalizedRelative}`;
  }
  return `${normalizedRoot}/${normalizedRelative}`;
}
