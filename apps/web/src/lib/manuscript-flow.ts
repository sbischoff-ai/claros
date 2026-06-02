import type { WorkspaceChapter, WorkspaceDocument, WorkspaceScene } from "./project-session";

export interface ManuscriptChapterFlow {
  chapter: WorkspaceChapter;
  previousScenes: ManuscriptFlowSceneBlock[];
  currentScene: ManuscriptFlowSceneBlock;
  followingScenes: ManuscriptFlowSceneBlock[];
}

export interface ManuscriptFlowSceneBlock {
  scene: WorkspaceScene;
  markdown: string;
}

export interface BuildManuscriptChapterFlowOptions {
  chapters: WorkspaceChapter[];
  scenes: WorkspaceScene[];
  activePath: string;
  activeMarkdown: string;
  readDocument(ref: { path: string }): Promise<WorkspaceDocument>;
}

export async function buildManuscriptChapterFlow(
  options: BuildManuscriptChapterFlowOptions
): Promise<ManuscriptChapterFlow | undefined> {
  const activeScene = options.scenes.find((scene) => scene.path === options.activePath);
  if (activeScene === undefined) {
    return undefined;
  }

  const chapter = options.chapters.find((candidate) => candidate.id === activeScene.chapterId);
  if (chapter === undefined) {
    return undefined;
  }

  const chapterScenes = options.scenes.filter((scene) => scene.chapterId === chapter.id);
  const activeSceneIndex = chapterScenes.findIndex((scene) => scene.path === activeScene.path);
  if (activeSceneIndex === -1) {
    return undefined;
  }

  const sceneBlocks = await Promise.all(
    chapterScenes.map(async (scene): Promise<ManuscriptFlowSceneBlock> => {
      if (scene.path === activeScene.path) {
        return { scene, markdown: options.activeMarkdown };
      }
      const document = await options.readDocument({ path: scene.path });
      return { scene, markdown: document.body };
    })
  );

  return {
    chapter,
    previousScenes: sceneBlocks.slice(0, activeSceneIndex),
    currentScene: sceneBlocks[activeSceneIndex],
    followingScenes: sceneBlocks.slice(activeSceneIndex + 1),
  };
}

export function updateCurrentManuscriptFlowMarkdown(
  flow: ManuscriptChapterFlow | undefined,
  activePath: string,
  markdown: string
): ManuscriptChapterFlow | undefined {
  if (flow === undefined || flow.currentScene.scene.path !== activePath) {
    return flow;
  }
  return {
    ...flow,
    currentScene: {
      scene: flow.currentScene.scene,
      markdown,
    },
  };
}
