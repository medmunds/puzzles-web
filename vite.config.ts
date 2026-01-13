import * as child from "node:child_process";
import fs from "node:fs";
import * as path from "node:path";
import license from "rollup-plugin-license";
import { build, defineConfig, loadEnv, type UserConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { puzzleIds, puzzles } from "./src/assets/puzzles/catalog.json";
import { extraPages, renderHandlebars, renderMarkdown } from "./vite-extra-pages";
import { sentryVitePlugin } from "./vite-sentry-plugin"; // from "@sentry/vite-plugin";
import { wasmSourcemaps } from "./vite-wasm-sourcemaps";

type Env = Record<string, string>;
type Headers = Record<string, string>;

function getGitSha(env: Env): string {
  return env.VITE_GIT_SHA
    ? env.VITE_GIT_SHA
    : child.execSync("git rev-parse HEAD").toString().trim();
}

function defaultAppVersion(env: Record<string, string>): string {
  const dateStr = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const gitSha = getGitSha(env);
  return `${dateStr}.${gitSha ? gitSha.slice(0, 7) : "unknown"}`;
}

function securityHeaders(env: Env, cspReportOnly = false): Headers {
  const headers: Headers = {
    // Cloudflare defaults to Referrer-Policy: same-origin; we relax that a bit
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    // (Change this to "SAMEORIGIN" if we rework help-viewer to use an iframe)
    "X-Frame-Options": "NONE",
    // Cloudflare also adds its own Expect-CT and Strict-Transport-Security,
    // plus the obsolete X-Xss-Protection
  };

  const csp: Record<string, string> = {
    "default-src": "'self'",
    // wa-icon uses fetch on icon urls that vite has inlined as data: uris
    "connect-src": `'self' data: blob: https://cloudflareinsights.com`,
    "img-src": "'self' data: blob:",
    "manifest-src": "'self'",
    "object-src": "'none'",
    // Chromium currently requires 'wasm-unsafe-eval' for WebAssembly.instantiateStreaming
    "script-src":
      "'self' 'wasm-unsafe-eval' https://static.cloudflareinsights.com 'report-sample'",
    // Web Awesome uses inline styles in several places (and we do too in one place)
    "style-src": "'self' 'unsafe-inline' 'report-sample'",
    "worker-src": "'self'",
    "base-uri": "'none'",
    // (Change this to 'self' if we rework help-viewer to use an iframe)
    "frame-ancestors": "'none'",
  };

  if (env.VITE_SENTRY_DSN) {
    const sentryDsnOrigin = new URL(env.VITE_SENTRY_DSN).origin;
    csp["connect-src"] += ` ${sentryDsnOrigin}`;

    // Provide Sentry with high-entropy UA versions
    const clientHints = ["Platform-Version", "Full-Version-List", "Model"];
    headers["Accept-CH"] = clientHints.map((hint) => `Sec-CH-UA-${hint}`).join(", ");
    headers["Permissions-Policy"] = clientHints
      .map((hint) => `ch-ua-${hint.toLowerCase()}=("${sentryDsnOrigin}")`)
      .join(", ");
  }

  if (env.VITE_CSP_REPORT_URI) {
    let cspReportUri = env.VITE_CSP_REPORT_URI;
    if (
      cspReportUri.includes("sentry_key") &&
      !cspReportUri.includes("sentry_release")
    ) {
      // Sentry CSP reporting allows a release id.
      // Should match Sentry.init 'release' param (see main.ts).
      const gitSha = getGitSha(env);
      if (gitSha) {
        cspReportUri += `&sentry_release=${encodeURIComponent(gitSha)}`;
      }
    }
    const cspReportOrigin = new URL(cspReportUri).origin;
    if (!csp["connect-src"].includes(cspReportOrigin)) {
      // (might already be in there if same as sentryDsnOrigin)
      csp["connect-src"] += ` ${cspReportOrigin}`;
    }
    csp["report-uri"] = cspReportUri;
    csp["report-to"] = "csp-endpoint";

    headers["Reporting-Endpoints"] = `csp-endpoint="${cspReportUri}"`;
    // Sentry recommends also setting the Report-To JSON header,
    // but every browser we support either prefers Reporting-Endpoints
    // or (Firefox) only uses the report-uri from the CSP.
  }

  headers[
    cspReportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy"
  ] = Object.entries(csp)
    .map(([directive, values]) => `${directive} ${values}`)
    .join("; ");

  // Cloudflare: "Each line in the _headers file has a 2,000 character limit. The entire
  // line, including spacing, header name, and value, counts towards this limit."
  for (const [field, value] of Object.entries(headers)) {
    const length = `  ${field}: ${value}`.length;
    if (length > 2000) {
      throw new Error(`_headers line for ${field} too long: ${length} > 2000`);
    }
  }

  return headers;
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
  const createSentryVitePlugin = () =>
    sentryVitePlugin({
      applicationKey: sentryFilterApplicationId,

      // We're not currently uploading sourcemaps or notifying releases from here,
      // and we use a different mechanism to include the release id in the code.
      sourcemaps: { disable: true },
      release: { create: false, inject: false, deploy: false, finalize: false },
    });

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
      headers: securityHeaders(env),
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
              {
                urlPathname: "_headers",
                data: {
                  puzzleIds,
                  securityHeaders: securityHeaders(env, /*cspReportOnly=*/ true),
                },
              },
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
          globIgnores: ["404.html", "**/unsupported*.{html,css,js}"],
          globPatterns: [
            // Include all help files, icons, etc.
            // But include wasm's only for the intended puzzles (skip nullgame, etc.)
            "**/*.{css,html,js,json,png,svg}",
            `assets/@(${puzzleIds.join("|")})*.wasm`,
          ],
        },
      }),
      createSentryVitePlugin(), // Must be last plugin
    ],
    worker: {
      plugins: () => [createSentryVitePlugin()],
    },
  } satisfies UserConfig;
});
