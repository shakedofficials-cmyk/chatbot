import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@server": path.resolve(__dirname, "src/server"),
      "@widget": path.resolve(__dirname, "src/widget"),
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
  test: {
    globals: true,
    environment: "node",
  },
});
