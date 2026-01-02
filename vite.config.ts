import * as child from "node:child_process";
import fs from "node:fs";
import * as path from "node:path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import license from "rollup-plugin-license";
import { build, defineConfig, loadEnv, type UserConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { puzzleIds, puzzles } from "./src/assets/puzzles/catalog.json";
import { extraPages, renderHandlebars, renderMarkdown } from "./vite-extra-pages";
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

// Arbitrary metadata to identify own stack frames.
// Used as Sentry.thirdPartyErrorFilterIntegration filterKeys
const sentryFilterApplicationId = "code-from-puzzles-web";

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
  const preflightSrc =
    command === "build" ? await buildProductionPreflightModule() : "/src/preflight.ts";
  let canonicalBaseUrl = env.VITE_CANONICAL_BASE_URL;
  if (canonicalBaseUrl && !canonicalBaseUrl.endsWith("/")) {
    canonicalBaseUrl += "/";
  }
  const analytics_html = env.VITE_ANALYTICS_BLOCK;
  const commonTemplateData = { preflightSrc, analytics_html };
  const sentryDsnOrigin = env.VITE_SENTRY_DSN
    ? new URL(env.VITE_SENTRY_DSN).origin
    : "";

  return {
    appType: "mpa",
    build: {
      assetsInlineLimit: 5120, // default 4096; this covers a few icons above that
      rollupOptions: {
        input: [
          // See also extraPages plugin below, which adds index, puzzle and help page inputs
          "unsupported.html",
        ],
        output: {
          validate: true,
        },
      },
      sourcemap: true,
      target: "es2022",
    },
    esbuild: {
      supported: {
        // Avoid a Safari bug that breaks the module graph
        // if two modules import a third that uses top-level await.
        // https://bugs.webkit.org/show_bug.cgi?id=242740
        "top-level-await": false,
      },
    },
    define: {
      "import.meta.env.VITE_CANONICAL_BASE_URL": JSON.stringify(
        env.VITE_CANONICAL_BASE_URL ?? "",
      ),
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(
        env.VITE_APP_VERSION ?? defaultAppVersion(env),
      ),
      "import.meta.env.VITE_SENTRY_FILTER_APPLICATION_ID": JSON.stringify(
        sentryFilterApplicationId,
      ),
    },
    preview: {
      headers: sentryDsnOrigin
        ? {
            "Accept-CH":
              "Sec-CH-UA-Platform-Version, Sec-CH-UA-Full-Version-List, Sec-CH-UA-Model",
            "Permissions-Policy": ["platform-version", "full-version-list", "model"]
              .map((perm) => `ch-ua-${perm}=("${sentryDsnOrigin}")`)
              .join(", "),
          }
        : {},
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
      extraPages({
        // debug: true,
        pages: [
          {
            virtualPages: [
              {
                urlPathname: "index.html",
                data: {
                  ...commonTemplateData,
                  canonicalUrl: canonicalBaseUrl || undefined,
                },
              },
            ],
            transforms: [renderHandlebars({ file: "index.html.hbs" })],
          },
          {
            virtualPages: Object.entries(puzzles).map(([id, puzzleData]) => {
              const canonicalUrl = canonicalBaseUrl
                ? new URL(id, canonicalBaseUrl).href
                : undefined;
              let iconUrl: string | undefined = `src/assets/icons/${id}-64d8.png`;
              if (!fs.existsSync(iconUrl)) {
                iconUrl = undefined;
              }
              return {
                urlPathname: `${id}.html`,
                data: {
                  ...commonTemplateData,
                  puzzle: {
                    id,
                    isOriginal: puzzleData.collection === "original",
                    ...puzzleData,
                  },
                  iconUrl,
                  canonicalUrl,
                },
              };
            }),
            transforms: [renderHandlebars({ file: "puzzle.html.hbs" })],
          },
          {
            // Our own help pages, served at /help/...
            sources: "help/**/*.md",
            transforms: [
              renderMarkdown({
                html: true, // allow HTML tags in markdown
                linkify: true,
                typographer: true,
              }),
              (data) => ({ ...commonTemplateData, ...data }),
              renderHandlebars({ file: "help/_template.html.hbs" }),
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
                const [title, ...lines] = String(source).split("\n");
                const body_html = lines.join("\n");
                // TODO: add warning notice for unfinished puzzles
                // manpage (relative to the overview page) if manual page exists
                const basename = path.basename(String(data.urlPathname), ".html");
                const manpage = fs.existsSync(
                  `src/assets/puzzles/manual/${basename}.html`,
                )
                  ? `manual/${basename}#${basename}`
                  : undefined;

                return {
                  ...commonTemplateData,
                  ...data,
                  source,
                  manpage,
                  title,
                  body_html,
                };
              },
              renderHandlebars({ file: "help/_overview.html.hbs" }),
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
                ...commonTemplateData,
                source: String(source).replace(
                  /^(\s*!\[]\(.*\))$/m,
                  "$1 {.standalone-only}",
                ),
                ...data,
              }),
              renderMarkdown({
                html: true, // allow HTML tags in markdown
                linkify: true,
                typographer: true,
              }),
              renderHandlebars({ file: "help/_unreleased.html.hbs" }),
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
                html: String(source)
                  .replace(/<!DOCTYPE[^>]*>/m, "<!doctype html>")
                  .replace("<html>", '<html lang="en">')
                  .replace("</head>", `${manualAdditionalHeadTags}\n</head>`)
                  .replace("</body>", `${analytics_html}</body>`),
              }),
            ],
          },
          {
            // Cloudflare Pages HTTP headers
            virtualPages: [
              { urlPathname: "_headers", data: { puzzleIds, sentryDsnOrigin } },
            ],
            transforms: [renderHandlebars({ file: "_headers.txt.hbs" })],
            entryPoint: false,
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
      sentryVitePlugin({
        // Must be last plugin
        applicationKey: sentryFilterApplicationId,
      }),
    ],
  } satisfies UserConfig;
});
