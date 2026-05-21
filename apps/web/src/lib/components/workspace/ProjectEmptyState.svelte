<script lang="ts">
  import ProjectLauncher from "$lib/ProjectLauncher.svelte";
  import type { WorkspaceController } from "$lib/state/workspace-controller.svelte";

  let { controller }: { controller: WorkspaceController } = $props();

  let statusText = $derived(
    controller.projectOpenState === "opening"
      ? "Opening project..."
      : controller.projectOpenState === "creating"
        ? "Creating project..."
        : controller.projectOpenState === "connecting"
          ? "Connecting local companion..."
          : controller.projectOpenState === "error"
            ? controller.projectError || "Unable to open project."
            : "Choose how Claros should access the project folder."
  );
</script>

<section class="project-empty-state" aria-label="Open project">
  <strong>Open a Claros project</strong>
  <span>{statusText}</span>
  <ProjectLauncher
    bind:createIntent={controller.createProjectIntent}
    bind:menuOpen={controller.storageBackendMenuOpen}
    createProject={(backend) => void controller.createProjectWithBackend(backend.id)}
    openProject={(backend) => void controller.openProjectWithBackend(backend.id)}
    options={controller.storageBackendOptions}
    selected={controller.selectedStorageBackend}
    selectedId={controller.selectedStorageBackendId}
    selectBackend={(backend) => controller.selectStorageBackend(backend)}
  />
</section>
