<script lang="ts">
  import DotsSixVertical from "phosphor-svelte/lib/DotsSixVertical";

  import type { ManuscriptDragState } from "./manuscript-drag";

  export let drag: ManuscriptDragState | undefined;
</script>

{#if drag !== undefined}
  <div
    class="drag-preview"
    class:chapter-preview={drag.kind === "chapter"}
    style={`left: ${drag.pointerX + 10}px; top: ${drag.pointerY + 8}px; width: min(${drag.previewWidth}px, calc(100vw - 1rem));`}
    aria-hidden="true"
  >
    <DotsSixVertical size={15} weight="bold" />
    <span>{drag.label}</span>
  </div>
{/if}
