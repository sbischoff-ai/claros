<script lang="ts">
  import { onMount } from "svelte";
  import ArrowLeft from "phosphor-svelte/lib/ArrowLeft";
  import ArrowRight from "phosphor-svelte/lib/ArrowRight";

  import { renderReadonlyMarkdown } from "$lib/rendered-markdown";
  import type { WorkspaceEditorSurface } from "$lib/state/workspace-controller.svelte";

  let { controller }: { controller: WorkspaceEditorSurface } = $props();

  function bindReadonlyWikilinks(
    node: HTMLElement,
    scene: { markdown: string; path: string }
  ): { update(scene: { markdown: string; path: string }): void; destroy(): void } {
    let cleanup = bind(scene);
    function bind(value: { markdown: string; path: string }): () => void {
      return controller.bindReadonlyWikilinks(
        node,
        renderReadonlyMarkdown(value.markdown).wikilinks,
        value.path
      );
    }
    return {
      update(value) {
        cleanup();
        cleanup = bind(value);
      },
      destroy() {
        cleanup();
      },
    };
  }

  function openManuscriptScene(event: MouseEvent | KeyboardEvent, path: string): void {
    if (event.target instanceof Element && event.target.closest("button, a, input, textarea")) {
      return;
    }
    if (event instanceof KeyboardEvent) {
      if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
    }
    void controller.openManuscriptScene(path);
  }

  onMount(() => {
    void controller.ensureEditor();
  });
</script>

<section
  class="editor-frame"
  aria-label="Markdown editor"
  onfocusin={() => controller.rememberEditorFocus()}
>
  <nav class="editor-file-nav" aria-label="Editor file history">
    <button
      type="button"
      class="icon-button"
      aria-label="Open previous file"
      title="Open previous file"
      disabled={!controller.canNavigateBack}
      onclick={() => void controller.navigateBack()}
    >
      <ArrowLeft size={18} weight="regular" />
    </button>
    <button
      type="button"
      class="icon-button"
      aria-label="Open next file"
      title="Open next file"
      disabled={!controller.canNavigateForward}
      onclick={() => void controller.navigateForward()}
    >
      <ArrowRight size={18} weight="regular" />
    </button>
  </nav>
  <div
    class:manuscript-mode={controller.manuscriptChapterFlow !== undefined}
    class="manuscript-scroll"
  >
    {#if controller.manuscriptChapterFlow !== undefined}
      <div class="manuscript-flow" aria-label="Chapter manuscript">
        <h1 class="manuscript-chapter-heading">
          {controller.manuscriptChapterFlow.chapter.title}
        </h1>
        {#each controller.manuscriptChapterFlow.previousScenes as block (block.scene.path)}
          <div
            class="manuscript-context-scene"
            data-scene-path={block.scene.path}
            role="button"
            tabindex="0"
            onclick={(event) => openManuscriptScene(event, block.scene.path)}
            onkeydown={(event) => openManuscriptScene(event, block.scene.path)}
            use:bindReadonlyWikilinks={{ markdown: block.markdown, path: block.scene.path }}
          >
            {@html renderReadonlyMarkdown(block.markdown).html}
          </div>
          <div class="manuscript-delimiter" aria-hidden="true">***</div>
        {/each}
      </div>
    {/if}
    <div
      bind:this={controller.editorHost}
      class="editor-host"
      data-scene-path={controller.manuscriptChapterFlow?.currentScene.scene.path}
    ></div>
    {#if controller.manuscriptChapterFlow !== undefined}
      <div class="manuscript-flow" aria-label="Chapter manuscript continuation">
        {#each controller.manuscriptChapterFlow.followingScenes as block (block.scene.path)}
          <div class="manuscript-delimiter" aria-hidden="true">***</div>
          <div
            class="manuscript-context-scene"
            data-scene-path={block.scene.path}
            role="button"
            tabindex="0"
            onclick={(event) => openManuscriptScene(event, block.scene.path)}
            onkeydown={(event) => openManuscriptScene(event, block.scene.path)}
            use:bindReadonlyWikilinks={{ markdown: block.markdown, path: block.scene.path }}
          >
            {@html renderReadonlyMarkdown(block.markdown).html}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>
