import * as child from "node:child_process";
import * as path from "node:path";
import license from "rollup-plugin-license";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { puzzleIds, puzzlesMpaRouting } from "./vite-puzzles-routing";

function defaultAppVersion(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const gitSha = process.env.VITE_GIT_SHA
    ? process.env.VITE_GIT_SHA.slice(0, 7)
    : child.execSync("git rev-parse --short HEAD").toString().trim();
  return `${dateStr}.${gitSha || "unknown"}`;
}

export default defineConfig({
  appType: "mpa",
  build: {
    assetsInlineLimit: 5120, // default 4096; this covers a few icons above that
    rollupOptions: {
      input: {
        main: "index.html",
        puzzle: "puzzle.html",
        unsupported: "unsupported.html",
      },
    },
    sourcemap: true,
    target: "es2022",
  },
  define: {
    "import.meta.env.VITE_ANALYTICS_BLOCK": JSON.stringify(
      process.env.VITE_ANALYTICS_BLOCK ?? "",
    ),
    "import.meta.env.VITE_CANONICAL_BASE_URL": JSON.stringify(
      process.env.VITE_CANONICAL_BASE_URL ?? "",
    ),
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(
      process.env.VITE_APP_VERSION ?? defaultAppVersion(),
    ),
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
                if (name === "workbox-window") {
                  // The service worker uses several other workbox-* packages.
                  // All share the same copyright and license (from their monorepo).
                  // To avoid repeating this plugin in the VitePWA config,
                  // use "workbox" to refer to all workbox packages used.
                  name = "workbox";
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
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        // enableWorkboxModulesLogs: true, // see workbox logging in production
        globIgnores: ["404.html"],
        globPatterns: [
          // Include all help files, icons, etc.
          // But include wasm's only for the intended puzzles (skip nullgame, etc.)
          "**/*.{css,html,js,json,png,svg}",
          `assets/@(${puzzleIds.join("|")})*.wasm`,
        ],
      },
    }),
  ],
});
