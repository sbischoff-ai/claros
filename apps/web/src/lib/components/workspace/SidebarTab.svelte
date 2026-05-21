<script lang="ts">
  import Files from "phosphor-svelte/lib/Files";

  let { expanded = false, open }: { expanded?: boolean; open: () => void } = $props();
</script>

<button
  type="button"
  class="sidebar-tab"
  aria-label="Open workspace sidebar"
  aria-expanded={expanded}
  onclick={open}
>
  <Files size={19} weight="regular" />
</button>
