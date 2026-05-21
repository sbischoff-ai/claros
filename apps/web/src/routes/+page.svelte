<script lang="ts">
  import "./page.css";

  import WorkspaceApp from "$lib/components/workspace/WorkspaceApp.svelte";
  import { createWorkspaceController } from "$lib/state/workspace-controller.svelte";

  const controller = createWorkspaceController();
</script>

<svelte:head>
  <title>Claros</title>
</svelte:head>

<WorkspaceApp {controller} />
