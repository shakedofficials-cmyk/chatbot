import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: "src/widget",
  resolve: {
    alias: {
      "@widget": path.resolve(__dirname, "src/widget"),
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
  build: {
    outDir: "../../dist/widget",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "orjn-concierge.js",
        assetFileNames: "orjn-concierge.[ext]",
      },
    },
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
