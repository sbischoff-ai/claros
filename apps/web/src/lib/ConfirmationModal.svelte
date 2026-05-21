<script lang="ts">
  import { onMount, tick } from "svelte";

  import type { ConfirmationModalState } from "./workspace-types";

  export let state: ConfirmationModalState;
  export let close: () => void;
  export let submit: () => void;

  let confirmButton: HTMLButtonElement;

  onMount(() => {
    void tick().then(() => confirmButton?.focus());
  });
</script>

<div class="modal-layer">
  <button
    type="button"
    class="modal-backdrop"
    aria-label="Close confirmation dialog"
    on:click={close}
  ></button>
  <section class="modal" aria-label={state.heading}>
    <h2>{state.heading}</h2>
    <p>{state.message}</p>
    <div class="modal-actions">
      <button type="button" on:click={close}>{state.cancelLabel}</button>
      <button bind:this={confirmButton} type="button" on:click={submit}>
        {state.confirmLabel}
      </button>
    </div>
  </section>
</div>
