import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import {
  getFallbackRouteRe,
  getKnownPuzzleIds,
  puzzlesSpaRouting,
} from "./vitePuzzlesSpaRouting";

const puzzleIds = getKnownPuzzleIds();
const fallbackRouteRe = getFallbackRouteRe(puzzleIds);

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
  plugins: [
    puzzlesSpaRouting(),
    VitePWA({
      injectRegister: null, // registered in main.ts
      includeAssets: ["favicon.svg", "help/**"],
      manifest: {
        name: "Simon Tatham’s portable puzzles collection",
        short_name: "Puzzles",
        background_color: "#f9f9f9", // --sl-neutral-50
        theme_color: "#0284c7", // --sl-primary-600
      },
      registerType: "prompt",
      pwaAssets: {
        image: "public/favicon.svg",
      },
      workbox: {
        // mode: "development", // see workbox logging in production
        globPatterns: [
          // Include all help files, icons, etc.
          // But include wasm's only for the intended puzzles (skip nullgame, etc.)
          "**/*.{css,html,js,png,svg}",
          `assets/@(${puzzleIds.join("|")})*.wasm`,
        ],
        // Use same fallback routing as production and dev servers
        navigateFallback: "index.html",
        navigateFallbackAllowlist: [fallbackRouteRe],
      },
    }),
  ],
});
