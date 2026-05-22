# Frontend Architecture Guidelines (apps/web)

To prevent file bloating and maintain codebase scannability, all AI agents and human contributors must strictly follow these rules within the `apps/web` workspace:

1. **Routing File Constraints (+page.svelte):**
   - Maximum length: 50 lines of code.
   - Purpose: Purely a layout orchestrator. It orchestrates UI building blocks and passes client-side state or props down.
   - Prohibited: No complex logic loops, raw HTML layout skeletons, inline CSS blocks (`<style>`), or server-side load pipelines.

2. **Component File Limits:**
   - Presentational UI Components (buttons, cards, inputs): Max 150 lines.
   - Complex UI Modules (features, complex forms, dashboards): Max 300 lines.
   - If a file exceeds 300 lines, it MUST be broken into smaller sub-components or have its logic extracted.

3. **Logic & Environment Isolation:**
   - Keep Svelte files purely visual. Extract client-side data tracking, computations, and API operations into external `.ts` or `.svelte.ts` files using Svelte 5 Runes ($state, $derived, $effect).
   - Prohibited: Never import native client runtime APIs (e.g., `@tauri-apps/api/*`) directly inside `.svelte` files. Use an abstracted wrapper service class in `$lib/services/` that safely handles environment detection.
