import * as child from "node:child_process";
import * as path from "node:path";
import license from "rollup-plugin-license";
import { build, defineConfig, loadEnv, type UserConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { extraPages, renderMarkdown, renderTemplate } from "./vite-extra-pages";
import { puzzleIds, puzzlesMpaRouting } from "./vite-puzzles-routing";
import { wasmSourcemaps } from "./vite-wasm-sourcemaps";

function defaultAppVersion(env: Record<string, string>): string {
  const dateStr = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const gitSha = env.VITE_GIT_SHA
    ? env.VITE_GIT_SHA.slice(0, 7)
    : child.execSync("git rev-parse --short HEAD").toString().trim();
  return `${dateStr}.${gitSha || "unknown"}`;
}

const manualAdditionalHeadTags = `\
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="/src/css/help-page.css">`;

// Build src/preflight.ts for production and return its (public) url.
// (It needs a lower build target than the main bundle, and must be kept
// separate from it by placing in the public dir.)
async function buildProductionPreflightModule() {
  const result = await build({
    configFile: false,
    build: {
      // Public files are not bundled into the main chunk.
      // (Use a subdirectory to avoid clobbering all of public.)
      outDir: "public/preflight",
      rollupOptions: {
        input: {
          preflight: "src/preflight.ts",
        },
        output: {
          entryFileNames: "preflight-[hash].js",
        },
      },
      manifest: false,
      sourcemap: true,
      // To avoid parse errors, syntax must target the earliest browsers
      // that supported <script type="module">. That's Chrome 61 and Safari 11
      // in September 2017.
      target: "es2017",
    },
    publicDir: false,
  });
  if (!("output" in result) || result.output.length !== 2) {
    // result should be a single RollupOutput object containing
    // two output entries: the built chunk and its sourcemap asset
    console.log(result);
    throw new Error("buildProductionPreflightModule unexpected build result");
  }
  const generatedFile = result.output[0].fileName;
  return `/preflight/${generatedFile}`; // url, not file path
}

export default defineConfig(async ({ command, mode }) => {
  const env = loadEnv(mode, process.cwd());
  const preflightPath =
    command === "build" ? await buildProductionPreflightModule() : "/src/preflight.ts";

  return {
    appType: "mpa",
    build: {
      assetsInlineLimit: 5120, // default 4096; this covers a few icons above that
      rollupOptions: {
        input: [
          "index.html",
          "puzzle.html",
          "unsupported.html",
          // See also extraPages plugin below, which adds help page inputs
        ],
      },
      sourcemap: true,
      target: "es2022",
    },
    define: {
      "import.meta.env.VITE_ANALYTICS_BLOCK": JSON.stringify(
        env.VITE_ANALYTICS_BLOCK ?? "",
      ),
      "import.meta.env.VITE_CANONICAL_BASE_URL": JSON.stringify(
        env.VITE_CANONICAL_BASE_URL ?? "",
      ),
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(
        env.VITE_APP_VERSION ?? defaultAppVersion(env),
      ),
      "import.meta.env.VITE_PREFLIGHT_CHECK": JSON.stringify(preflightPath),
    },
    plugins: [
      wasmSourcemaps(),
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
      extraPages({
        // debug: true,
        pages: [
          {
            // Our own help pages, served at /help/...
            sources: "help/**/*.md",
            transforms: [
              renderMarkdown({
                html: true, // allow HTML tags in markdown
                linkify: true,
                typographer: true,
              }),
              renderTemplate({ file: "help/_template.html" }),
            ],
          },
          {
            // Puzzle overview pages, served at /help/<puzzleId>.html,
            // from html fragments provided with puzzles source
            sources: "puzzles/html/**/*.html",
            resolve: { url: "help/", path: "puzzles/html/" },
            transforms: [
              ({ source, ...data }) => {
                // first line of fragment is (bare) title; remainder is html body
                const [title, ...lines] = source.split("\n");
                const body_html = lines.join("\n");
                // basename is used to construct "full manual page" link
                // TODO: only add "full manual page" link if manual page exists?
                // TODO: add warning notice for unfinished puzzles
                const basename = encodeURIComponent(
                  path.basename(data.urlPathname, ".html"),
                );
                return { ...data, source, basename, title, body_html };
              },
              renderTemplate({ file: "help/_overview.html" }),
            ],
          },
          {
            // Puzzles-unreleased help pages, served at /help/<puzzleId>.html
            // from markdown provided with puzzles-unreleased source
            sources: "puzzles/unreleased/docs/*.md",
            resolve: { url: "help/", path: "puzzles/unreleased/docs/" },
            transforms: [
              // In markdown source, make the image standalone-only
              ({ source, ...data }) => ({
                source: source.replace(/^(\s*!\[]\(.*\))$/m, "$1 {.standalone-only}"),
                ...data,
              }),
              renderMarkdown({
                html: true, // allow HTML tags in markdown
                linkify: true,
                typographer: true,
              }),
              renderTemplate({ file: "help/_unreleased.html" }),
            ],
          },
          {
            // Puzzle manual, generated by emcc build process
            sources: "src/assets/puzzles/manual/**/*.html",
            resolve: { url: "help/manual/", path: "src/assets/puzzles/manual/" },
            transforms: [
              // Clean up and augment the halibut-generated html
              // TODO: convert internal links to clean urls
              ({ source, ...data }) => ({
                ...data,
                html: source
                  .replace(/<!DOCTYPE[^>]*>/m, "<!doctype html>")
                  .replace("<html>", '<html lang="en">')
                  .replace("</head>", `${manualAdditionalHeadTags}\n</head>`)
                  .replace("</body>", "%VITE_ANALYTICS_BLOCK%\n</body>"),
              }),
            ],
          },
        ],
      }),
      VitePWA({
        injectRegister: null, // registered in main.ts
        manifest: {
          name: env.VITE_APP_NAME || "Puzzles web app",
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
  } satisfies UserConfig;
});
