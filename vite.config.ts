import * as path from "node:path";
import license from "rollup-plugin-license";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import type { RouteHandlerCallback, RouteMatchCallback } from "workbox-core/src/types";
import { getKnownPuzzleIds, puzzlesMpaRouting } from "./vite-puzzles-routing";

const base = process.env.BASE_URL || "/";
if (!base.startsWith("/") || !base.endsWith("/")) {
  throw new Error(`BASE_URL='${base}' must start and end with '/'`);
}

const puzzleIds = getKnownPuzzleIds();

// Create the runtime caching handler functions as strings with inlined values.
// This is necessary for inline generateSW workbox configuration in VitePWA below.
// TODO: Switch to injectManifest and define these in our hand-coded sw.js.
const createRuntimeCaching = () => {
  const basePathStr = JSON.stringify(base);
  const puzzleIdsStr = JSON.stringify(puzzleIds);
  const urlPattern = new Function(
    "{ request, url }",
    `
      if (request.mode !== "navigate") {
        return false;
      }
      
      console.log('runtimeCaching.urlPattern:', url.pathname);
      
      const basePath = ${basePathStr};
      const puzzleIds = ${puzzleIdsStr};
      
      // Check if it's an index route: /base/ or /base
      if (url.pathname === basePath || url.pathname === basePath.slice(0, -1)) {
        return true;
      }
      
      // Check if it's a puzzle route: /base/puzzleId or /base/puzzleId/
      if (url.pathname.startsWith(basePath)) {
        const relativePath = url.pathname.slice(basePath.length).replace(/\\/$/, '');
        return puzzleIds.includes(relativePath);
      }
      
      return false;
    `,
  ) as RouteMatchCallback;

  const handler = new Function(
    "{ url }",
    `
      console.log('runtimeCaching.handler:', url.pathname);
      
      const basePath = ${basePathStr};
      const puzzleIds = ${puzzleIdsStr};
      
      // Determine which file to serve
      let file = "index.html";
      if (url.pathname.startsWith(basePath)) {
        const relativePath = url.pathname.slice(basePath.length).replace(/\\/$/, '');
        if (puzzleIds.includes(relativePath)) {
          file = "puzzle.html";
        }
      }
      
      return caches.match(file).then(response => response || fetch(file));
    `,
  ) as RouteHandlerCallback;

  return [
    {
      urlPattern,
      handler,
      options: {
        cacheName: "page-cache",
      },
    },
  ];
};

export default defineConfig({
  appType: "mpa",
  base: base,
  build: {
    assetsInlineLimit: 5120, // default 4096; this covers a few icons above that
    rollupOptions: {
      input: {
        main: "index.html",
        puzzle: "puzzle.html",
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
    puzzlesMpaRouting(),
    VitePWA({
      injectRegister: null, // registered in main.ts
      includeAssets: ["dependencies.json", "favicon.svg", "help/**"],
      manifest: {
        name: process.env.VITE_APP_NAME ?? "Puzzles web app",
        short_name: "Puzzles",
        background_color: "#e8f3ff", // --wa-color-brand-fill-quiet (page bg)
        theme_color: "#d1e8ff", // --wa-color-brand-fill-normal (app bar)
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
        // Use our MPA routing in the service worker:
        navigateFallback: null,
        runtimeCaching: createRuntimeCaching(),
      },
    }),
  ],
});
