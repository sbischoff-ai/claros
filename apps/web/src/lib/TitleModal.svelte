<script lang="ts">
  import { onMount, tick } from "svelte";

  import type { TitleModalState } from "./workspace-types";

  export let state: TitleModalState;
  export let close: () => void;
  export let submit: () => void;

  let input: HTMLInputElement;

  onMount(() => {
    void tick().then(() => input?.focus());
  });
</script>

<div class="modal-layer">
  <button
    type="button"
    class="modal-backdrop"
    aria-label="Close title dialog"
    on:click={close}
  ></button>
  <section class="modal" aria-label={state.heading}>
    <h2>{state.heading}</h2>
    <form on:submit|preventDefault={submit}>
      <input
        bind:this={input}
        bind:value={state.value}
        placeholder={state.placeholder}
        aria-label={state.heading}
      />
      <div class="modal-actions">
        <button type="button" on:click={close}>Cancel</button>
        <button type="submit">Save</button>
      </div>
    </form>
  </section>
</div>
