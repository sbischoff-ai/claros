<script lang="ts">
  import type { PaletteCommand } from "./workspace-types";

  export let commandInput: HTMLInputElement | undefined;
  export let commands: PaletteCommand[] = [];
  export let query = "";
  export let selectedIndex = 0;
  export let close: () => void;
  export let handleInput: () => void;
  export let handleKeydown: (event: KeyboardEvent) => void;
  export let runCommand: (command: PaletteCommand) => void;
</script>

<div class="palette-layer">
  <button
    type="button"
    class="palette-backdrop"
    aria-label="Close command palette"
    on:click={close}
  ></button>
  <section class="palette" aria-label="Command palette">
    <input
      bind:this={commandInput}
      bind:value={query}
      placeholder="Command"
      aria-label="Command"
      role="combobox"
      aria-controls="command-list"
      aria-expanded="true"
      aria-activedescendant={`command-${selectedIndex}`}
      on:input={handleInput}
      on:keydown={handleKeydown}
    />
    <div id="command-list" role="listbox" class="command-list">
      {#each commands as command, index}
        <button
          id={`command-${index}`}
          type="button"
          role="option"
          class:active={command.active}
          class:selected={index === selectedIndex}
          class:disabled={command.disabled}
          disabled={command.disabled}
          aria-selected={index === selectedIndex}
          on:mouseenter={() => (selectedIndex = index)}
          on:click={() => runCommand(command)}
        >
          {command.label}
        </button>
      {:else}
        <p class="empty-command">No commands</p>
      {/each}
    </div>
  </section>
</div>
