import { defineConfig } from "vite";
import { spaFallbackIgnorePublicSubdirs } from "./viteSpaFallbackIgnorePublicSubdirs";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
      },
    },
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
