import * as path from "node:path";
import license from "rollup-plugin-license";
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
  appType: "mpa",
  build: {
    assetsInlineLimit: 5120, // default 4096; this covers a few icons above that
    rollupOptions: {
      input: {
        main: "index.html",
      },
    },
    sourcemap: true,
    target: "es2022",
  },
  plugins: [
    license({
      thirdParty: {
        output: {
          file: path.join(__dirname, "dist", "dependencies-app.json"),
          template(deps) {
            const dependencies = deps.map(
              ({ name, version, license, licenseText, noticeText }) => {
                if (license === "Apache-2.0" && !noticeText && licenseText) {
                  // Some Apache-2.0 license users leave the required notice
                  // in the template at the end of the license. (Some don't even
                  // bother filling in the template, but that's a different issue).
                  // Extract that notice, from a line starting "Copyright" to the end.
                  const match =
                    /APPENDIX: How to apply the Apache License.*^\s*(Copyright.+)/ms.exec(
                      licenseText,
                    );
                  if (match) {
                    noticeText = match[1];
                  }
                }
                const notice = noticeText || licenseText;
                return {
                  name,
                  version,
                  license,
                  notice,
                };
              },
            );
            return JSON.stringify({ dependencies });
          },
        },
      },
    }),
    puzzlesSpaRouting(),
    VitePWA({
      injectRegister: null, // registered in main.ts
      includeAssets: ["dependencies.json", "favicon.svg", "help/**"],
      manifest: {
        name: process.env.VITE_APP_NAME ?? "Puzzles web app",
        short_name: "Puzzles",
        background_color: "#f1f2f3", // --wa-color-neutral-95
        theme_color: "#0071ec", // --wa-color-brand-50
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
          "**/*.{css,html,js,json,png,svg}",
          `assets/@(${puzzleIds.join("|")})*.wasm`,
        ],
        // Use same fallback routing as production and dev servers
        navigateFallback: "index.html",
        navigateFallbackAllowlist: [fallbackRouteRe],
      },
    }),
  ],
});
