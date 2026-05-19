import { defineConfig } from "vitest/config";
import * as path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@claros/emergence-engine": path.resolve(
        __dirname,
        "..",
        "emergence-engine",
        "src",
        "index.ts"
      ),
    },
  },
});
