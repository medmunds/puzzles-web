import { defineConfig } from "vite";
import { spaFallbackIgnorePublicSubdirs } from "./viteSpaFallbackIgnorePublicSubdirs";

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
  appType: "spa",
  server: {
    middlewareMode: false,
    fs: {
      strict: false,
    },
  },
  plugins: [spaFallbackIgnorePublicSubdirs()],
});
