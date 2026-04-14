import { defineConfig } from "vite";
import path from "path";

export default defineConfig(({ command }) => ({
  root: "src/widget",
  build:
    command === "build"
      ? {
          outDir: "../../dist/widget",
          emptyOutDir: true,
          lib: {
            entry: path.resolve(__dirname, "src/widget/main.ts"),
            name: "ORJNConcierge",
            formats: ["iife"],
            fileName: () => "orjn-concierge.js",
          },
        }
      : {
          outDir: "../../dist/widget",
          emptyOutDir: true,
        },
  envDir: path.resolve(__dirname),
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
}));
