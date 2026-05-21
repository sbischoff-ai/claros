<script lang="ts">
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import Plus from "phosphor-svelte/lib/Plus";

  import type { StorageBackendOption } from "./storage-backends";

  export let createIntent = false;
  export let createProject: (backend: StorageBackendOption) => void;
  export let menuOpen = false;
  export let openProject: (backend: StorageBackendOption) => void;
  export let options: StorageBackendOption[] = [];
  export let selected: StorageBackendOption;
  export let selectedId = "";
  export let selectBackend: (backend: StorageBackendOption) => void;
</script>

<div class="project-launcher" class:menu-open={menuOpen}>
  <div class="backend-select">
    <button
      type="button"
      class="backend-trigger"
      aria-label={`Storage backend: ${selected.label}`}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      on:click={() => (menuOpen = !menuOpen)}
    >
      <svelte:component this={selected.icon} size={19} weight="regular" />
      <CaretDown size={13} weight="bold" />
    </button>
    {#if menuOpen}
      <div class="backend-menu" role="menu" aria-label="Storage backends">
        {#each options as backend}
          <button
            type="button"
            role="menuitem"
            class:selected={backend.id === selectedId}
            disabled={!backend.available}
            on:click={() => selectBackend(backend)}
          >
            <svelte:component this={backend.icon} size={18} weight="regular" />
            <span>{backend.label}</span>
            {#if !backend.available && backend.unavailableReason !== undefined}
              <small>{backend.unavailableReason}</small>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
  <button
    type="button"
    class="project-launcher-main"
    aria-label={`Open Project: ${selected.label}`}
    on:click={() => openProject(selected)}
  >
    {createIntent ? "New Project" : "Open Project"}
  </button>
  <button
    type="button"
    class="project-launcher-create"
    aria-label={`New Project: ${selected.label}`}
    on:mouseenter={() => (createIntent = true)}
    on:mouseleave={() => (createIntent = false)}
    on:focus={() => (createIntent = true)}
    on:blur={() => (createIntent = false)}
    on:click={() => createProject(selected)}
  >
    <Plus size={18} weight="bold" />
  </button>
</div>
