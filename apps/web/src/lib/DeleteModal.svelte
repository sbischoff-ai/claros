<script lang="ts">
  import { onMount, tick } from "svelte";

  import type { DeleteModalState } from "./workspace-types";

  export let state: DeleteModalState;
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
    aria-label="Close delete dialog"
    on:click={close}
  ></button>
  <section class="modal" aria-label={state.heading}>
    <h2>{state.heading}</h2>
    <p>Type delete to confirm.</p>
    <form on:submit|preventDefault={submit}>
      <input
        bind:this={input}
        bind:value={state.confirmation}
        placeholder="delete"
        aria-label={`Confirm ${state.label}`}
      />
      <div class="modal-actions">
        <button type="button" on:click={close}>Cancel</button>
        <button type="submit" disabled={state.confirmation !== "delete"}>Delete</button>
      </div>
    </form>
  </section>
</div>
