import { defineConfig } from "vite";
import { puzzlesSpaRouting } from "./vitePuzzlesSpaRouting";

export default defineConfig({
  build: {
    assetsInlineLimit: 5120, // default 4096; this covers a few icons above that
    rollupOptions: {
      input: {
        main: "index.html",
      },
    },
    sourcemap: true,
  },
  appType: "mpa",
  server: {
    middlewareMode: false,
    fs: {
      strict: false,
    },
  },
  plugins: [puzzlesSpaRouting()],
});
