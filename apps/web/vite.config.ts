import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // @sveltejs/kit@2 pins vite@5.0.x; vitest pins vite@5.4.x. The types are structurally
  // compatible at runtime — cast to suppress the phantom mismatch.
  plugins: [sveltekit() as any],
  ssr: {
    noExternal: ["phosphor-svelte"],
  },
  test: {
    include: ["src/**/*.{test,spec}.{js,ts}"],
  },
});
