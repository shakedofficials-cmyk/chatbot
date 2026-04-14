import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: "src/widget",
  build: {
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
});
