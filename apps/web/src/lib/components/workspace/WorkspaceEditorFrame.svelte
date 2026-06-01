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
          <article
            class="manuscript-context-scene"
            data-scene-path={block.scene.path}
            use:bindReadonlyWikilinks={{ markdown: block.markdown, path: block.scene.path }}
          >
            {@html renderReadonlyMarkdown(block.markdown).html}
          </article>
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
          <article
            class="manuscript-context-scene"
            data-scene-path={block.scene.path}
            use:bindReadonlyWikilinks={{ markdown: block.markdown, path: block.scene.path }}
          >
            {@html renderReadonlyMarkdown(block.markdown).html}
          </article>
        {/each}
      </div>
    {/if}
  </div>
</section>
