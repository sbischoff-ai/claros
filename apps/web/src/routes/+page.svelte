<script lang="ts">
  import "./page.css";

  import WorkspaceApp from "$lib/components/workspace/WorkspaceApp.svelte";
  import { createWorkspaceControllers } from "$lib/state/workspace-controller.svelte";

  const controllers = createWorkspaceControllers();
</script>

<svelte:head>
  <title>Claros</title>
</svelte:head>

<WorkspaceApp {controllers} />
