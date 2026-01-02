/**
 * Vite plugin that allows programmatically constructing additional index pages
 * from sets of markdown or html (or anything else) source files.
 *
 * Vite applies its static asset handling to any linked assets in the resulting
 * pages, so hashed assets are automatically included in the build.
 */

import fs from "node:fs";
import path from "node:path";
import { attrs as mditPluginAttrs } from "@mdit/plugin-attrs";
import { icon as mditPluginIcon } from "@mdit/plugin-icon";
import Handlebars from "handlebars";
import MarkdownIt, {
  type Options as MarkdownItOptions,
  type PresetName as MarkdownItPresetName,
} from "markdown-it";
import mditPluginAnchor from "markdown-it-anchor";
import { globSync } from "tinyglobby";
import {
  type Connect,
  createFilter,
  type MinimalPluginContextWithoutEnvironment,
  type Plugin,
  type PreviewServer,
  type ResolvedConfig,
  type ViteDevServer,
} from "vite";

const PLUGIN_ID = "extra-pages";

const escapeHtml = Handlebars.Utils.escapeExpression;

export type TransformAddWatchFile = (absolutePath: string) => void;
export type TransformData = Record<string, unknown>;
export type Transform = (
  this: MinimalPluginContextWithoutEnvironment,
  data: TransformData,
  addWatchFile?: TransformAddWatchFile, // triggers hot reload if changed
) => TransformData | Promise<TransformData>;

export interface ExtraPagesSet {
  /**
   * Glob expressions identifying source files to include/exclude from this set.
   * Uses tinyglobby.
   */
  sources: string | readonly string[];

  /**
   * Map sources to urls: the `url` prefix is replaced with `path` to get the
   * local file. (The resulting path must appear within `sources` globs.)
   */
  resolve?: {
    url: string;
    path: string;
  };

  /**
   * Whether to treat these files as entry points (rollup inputs).
   * Default true. Set to false for auxiliary files like _headers, robots.txt, etc.
   */
  entryPoint?: boolean;

  /**
   * Pipeline of transform functions.
   * Each is called with the result of the previous transform.
   *
   * The first function gets:
   *   sourceFile: absolute path to source file
   *   source: source file content
   *   urlPathname: pathname portion of requested url
   *
   * The last function in the pipeline must return (at least):
   *   html: the html content to serve.
   *
   * If not provided, the default transform outputs `source` as `html`.
   */
  transforms?: Transform[];
}

export interface VirtualPagesSet {
  virtualPages: Array<{
    urlPathname: string; // e.g. "puzzles/1.html"

    /**
     * Initial data to pass to the transform pipeline.
     * (Provide {source: htmlContent} if you aren't defining any transforms,
     * or arbitrary data objects for template transforms.)
     */
    data?: TransformData;
  }>;

  /**
   * Whether to treat these files as entry points (rollup inputs).
   * Default true. Set to false for auxiliary files like _headers, robots.txt, etc.
   */
  entryPoint?: boolean;

  /**
   * Pipeline of transform functions.
   * The first function gets:
   *   urlPathname: pathname portion of requested url
   *   ...data: from the matching virtualPages entry
   */
  transforms?: Transform[];
}

export interface ExtraPagesPluginOptions {
  /**
   * Sets of source files to treat as additional index pages,
   * possibly with transformations.
   */
  pages?: (ExtraPagesSet | VirtualPagesSet)[];

  /**
   * Whether to output routing information. Default false.
   */
  debug?: boolean;
}

// Build command helper
interface BuildPagesSet {
  transforms?: Transform[];
  entryPoint: boolean;

  // requested url.pathname => resolved absolute source path (ExtraPagesSet)
  //                        => initial transform pipeline data (VirtualPagesSet)
  pages: Map<string, { sourceFile?: string; data?: TransformData }>;
}

// Dev server helper
interface DevPagesSet {
  transforms?: Transform[];
  entryPoint: boolean;

  // For ExtraPagesSet:
  sources?: ExtraPagesSet["sources"];
  resolve?: ExtraPagesSet["resolve"];
  sourceExts?: string[];
  matchesSource?: (id: string) => boolean;

  // For VirtualPagesSet:
  virtualPages?: Map<string, TransformData>;
}

// Fallback when no transforms provided: treats source as output html.
const defaultTransform: Transform = (data) => ({ html: data.source, ...data });

// Extract file extensions from globs. Handles:
//   **/*.md => ['.md']  (simple extension)
//   *.{md,html} => ['.md', '.html']  (brace extensions with leading dot)
//   README{.md,.rst,} => ['.md', '.rst', '']  (brace extensions with internal dots)
//   READ{ME,IT} => error
function extractGlobExtensions(patterns: string | readonly string[]): string[] {
  const exts = new Set<string>();
  for (const pattern of Array.isArray(patterns) ? patterns : [patterns]) {
    // Simple trailing extension like *.md
    const simple = pattern.match(/(\.\w+)$/);
    if (simple) {
      exts.add(simple[1]);
      continue;
    }

    // Trailing brace group like *.{md,html} or README{.md,.rst,}
    const brace = pattern.match(/(\.?)\{([^}]+)}$/);
    if (brace) {
      const outerDot = brace[1] ?? "";
      const parts = brace[2].split(",");
      for (const part of parts) {
        const ext = `${outerDot}${part}`;
        if (/^\.\w+$/.test(ext) || ext === "") {
          exts.add(ext);
        } else {
          throw new Error(
            `Unable to determine extensions for ${pattern}: invalid extension '${ext}'`,
          );
        }
      }
      continue;
    }
    throw new Error(`Unable to determine extensions for ${pattern}`);
  }
  return [...exts];
}

export function cleanUrl(pathname: string): string {
  if (!pathname.endsWith(".html")) {
    return pathname;
  }
  let cleaned = pathname.slice(0, -5);
  if (cleaned === "index") {
    cleaned = "";
  } else if (cleaned.endsWith("/index")) {
    cleaned = cleaned.slice(0, -5);
  }
  return cleaned;
}

/**
 * Return true if url is something we should let Vite handle.
 */
function isViteMagicUrl(url: URL) {
  if (url.pathname.includes("@vite")) return true;
  const viteMagicParams = ["import", "raw", "inline", "url", "v", "t"];
  return viteMagicParams.some((param) => url.searchParams.has(param));
}

/**
 * Vite plugin to generate additional index pages
 */
export const extraPages = (options: ExtraPagesPluginOptions = {}): Plugin => {
  const { debug = false } = options;

  let config: Readonly<ResolvedConfig>;
  let buildPagesSets: BuildPagesSet[] = [];
  let devPagesSets: DevPagesSet[] = [];

  const makeAbsolutePath = (filePath: string) =>
    path.isAbsolute(filePath) ? filePath : path.join(config.root, filePath);

  function constructBuildPagesSet(
    pagesSet: ExtraPagesSet | VirtualPagesSet,
  ): BuildPagesSet {
    const pages = new Map<string, { sourceFile?: string; data?: TransformData }>();

    if ("virtualPages" in pagesSet) {
      for (const { urlPathname, data } of pagesSet.virtualPages) {
        pages.set(urlPathname, { data });
      }
    } else {
      for (const filePath of globSync(pagesSet.sources)) {
        const absFilePath = makeAbsolutePath(filePath);
        let urlPath = filePath;
        if (pagesSet.resolve && filePath.startsWith(pagesSet.resolve.path)) {
          urlPath = pagesSet.resolve.url + filePath.slice(pagesSet.resolve.path.length);
        }
        // Switch source extension (e.g., .md) to .html to handle as index page.
        urlPath = urlPath.replace(/\.[^.]+$/, ".html");
        pages.set(urlPath, { sourceFile: absFilePath });
      }
    }

    return {
      transforms: pagesSet.transforms,
      entryPoint: pagesSet.entryPoint ?? true,
      pages,
    };
  }

  function constructDevPagesSet(
    pagesSet: ExtraPagesSet | VirtualPagesSet,
  ): DevPagesSet {
    if ("virtualPages" in pagesSet) {
      const virtualPages = new Map<string, TransformData>();
      for (const { urlPathname, data } of pagesSet.virtualPages) {
        virtualPages.set(urlPathname, data ?? {});
      }
      return {
        transforms: pagesSet.transforms,
        entryPoint: pagesSet.entryPoint ?? true,
        virtualPages,
      };
    } else {
      const sourceExts = extractGlobExtensions(pagesSet.sources);
      if (sourceExts.length < 1) {
        throw new Error(`Unable to extract extensions from glob ${pagesSet.sources}`);
      }
      const matchesSource = createFilter(pagesSet.sources, [], { resolve: false });
      return {
        transforms: pagesSet.transforms,
        entryPoint: pagesSet.entryPoint ?? true,
        sources: pagesSet.sources,
        resolve: pagesSet.resolve,
        sourceExts,
        matchesSource,
      };
    }
  }

  // Return resolved source file or virtual data for a pathname, if one matches.
  // pathname must be relative to base (no leading '/').
  function resolveUrl(
    pathname: string,
    pagesSet: DevPagesSet,
  ): {
    sourceFile?: string;
    data?: TransformData;
    resolvedPathname?: string;
  } | null {
    if (pagesSet.virtualPages) {
      if (pagesSet.virtualPages.has(pathname)) {
        return {
          data: pagesSet.virtualPages.get(pathname),
          resolvedPathname: pathname,
        };
      }
      // Clean URLs: /foo -> foo.html
      if (pathname !== "" && !pathname.endsWith("/") && !/\.[^.]+$/.test(pathname)) {
        const withHtml = `${pathname}.html`;
        if (pagesSet.virtualPages.has(withHtml)) {
          return {
            data: pagesSet.virtualPages.get(withHtml),
            resolvedPathname: withHtml,
          };
        }
      }
      // Index routing: /foo/ -> foo/index.html, or / -> index.html
      if (pathname.endsWith("/") || pathname === "") {
        const withIndex = `${pathname}index.html`;
        if (pagesSet.virtualPages.has(withIndex)) {
          return {
            data: pagesSet.virtualPages.get(withIndex),
            resolvedPathname: withIndex,
          };
        }
      }
      return null;
    }

    // First, reverse resolve (url -> path) if configured; else keep as-is
    let sourcePathRel: string;
    if (pagesSet.resolve) {
      if (!pathname.startsWith(pagesSet.resolve.url)) {
        // Not in this pages set
        return null;
      }
      sourcePathRel =
        pagesSet.resolve.path + pathname.slice(pagesSet.resolve.url.length);
    } else {
      sourcePathRel = pathname;
    }

    // Remove any .html extension and handle index routing before testing
    // pagesSet.sourceExts. We only remove .html, not arbitrary extensions,
    // because the build output of this plugin is html only.
    if (sourcePathRel.endsWith(".html")) {
      sourcePathRel = sourcePathRel.slice(0, -5);
    } else if (sourcePathRel.endsWith("/") || sourcePathRel === "") {
      // Index routing
      sourcePathRel = `${sourcePathRel}index`;
    }

    // Try each possible extension looking for a match
    for (const ext of pagesSet.sourceExts ?? []) {
      // Verify that the constructed source file path would match the glob...
      const possiblePath = `${sourcePathRel}${ext}`;
      if (pagesSet.matchesSource?.(possiblePath)) {
        // ... and that it exists
        const sourceFile = makeAbsolutePath(possiblePath);
        if (fs.existsSync(sourceFile) && fs.statSync(sourceFile).isFile()) {
          // Canonical URL for physical files always ends in .html
          let resolvedPathname = sourcePathRel;
          if (pagesSet.resolve) {
            // Restore URL prefix: replace resolve.path with resolve.url
            resolvedPathname =
              pagesSet.resolve.url + sourcePathRel.slice(pagesSet.resolve.path.length);
          }
          resolvedPathname += ".html";
          return { sourceFile, resolvedPathname };
        }
      }
    }
    return null; // no matches
  }

  function findManagedPage(pathname: string) {
    for (const pagesSet of devPagesSets) {
      const resolved = resolveUrl(pathname, pagesSet);
      if (resolved) {
        return { pagesSet, resolved };
      }
    }
    return null;
  }

  function isSourceFile(pathname: string) {
    for (const pagesSet of devPagesSets) {
      if (pagesSet.matchesSource?.(pathname)) {
        return true;
      }
    }
    return false;
  }

  async function renderPage(
    urlPathname: string,
    transforms: Transform[] | undefined,
    pluginContext: MinimalPluginContextWithoutEnvironment,
    initialData: TransformData = {},
    sourceFile?: string, // absolute path
    addWatchFile?: TransformAddWatchFile,
  ) {
    let data: TransformData = { ...initialData, urlPathname };
    if (sourceFile) {
      addWatchFile?.(sourceFile);
      const source = fs.readFileSync(sourceFile).toString();
      data = { ...data, source, sourceFile };
    }

    for (const transform of transforms ?? [defaultTransform]) {
      data = await transform.call(pluginContext, data, addWatchFile);
    }
    if (!Object.hasOwn(data, "html")) {
      const keys = Object.keys(data).join(", ");
      const context = sourceFile ? `page ${sourceFile}` : `virtual page ${urlPathname}`;
      pluginContext.error(
        `transforms pipeline for ${context} did not return 'html'. Got ${keys}`,
      );
    }
    return data.html ? String(data.html) : "";
  }

  const createMiddleware = (
    server: ViteDevServer | PreviewServer,
    isDev: boolean,
    addDependency?: (sourceFile: string, urlPathname: string) => void,
  ): Connect.NextHandleFunction => {
    const base = config.base ?? "/";
    const servableDirs = isDev
      ? [config.publicDir, config.root]
      : [config.build.outDir];

    const checkFileExists = (pathname: string): boolean => {
      const rel = pathname.startsWith("/") ? pathname.slice(1) : pathname;
      for (const dir of servableDirs) {
        const resolved = path.join(dir, rel);
        if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
          return true;
        }
      }
      return false;
    };

    // Add vite's transformIndexHtml to the end of each pipeline
    // for env substitution, HMR, etc.
    const transformIndexHtml: Transform = async (data) => {
      if (!isDev) {
        return data;
      }
      const devServer = server as ViteDevServer;
      return {
        ...data,
        html: await devServer.transformIndexHtml(
          String(data.urlPathname),
          String(data.html),
          data.originalUrl ? String(data.originalUrl) : undefined,
        ),
      };
    };

    // Surrogate plugin context for rendering outside hooks
    const pluginContextProxy = {
      info: (msg: string) => config.logger.info(msg, { timestamp: true }),
      warn: (msg: string) => config.logger.warn(msg, { timestamp: true }),
      error: (msg: string) => config.logger.error(msg, { timestamp: true }),
    } as unknown as MinimalPluginContextWithoutEnvironment;

    return (req, res, next) => {
      if (!req.url) {
        return next();
      }
      const url = new URL(req.url, "http://origin-unused");
      if (isViteMagicUrl(url)) {
        // Don't process vite internals or requests for ?raw, etc.
        return next();
      }

      const originalReqUrl = req.url;
      let pathname = url.pathname;
      if (pathname.startsWith(base)) {
        pathname = pathname.slice(base.length);
      }

      // 2. Block source files
      // (Don't serve source files that are part of an extra pages set.)
      if (isDev && isSourceFile(pathname)) {
        res.statusCode = 404;
        res.end();
        return;
      }

      // 3. Resolve page (canonical, clean, or index)
      const managed = findManagedPage(pathname);
      const canonical = managed
        ? (managed.resolved.resolvedPathname ?? pathname)
        : pathname.endsWith(".html")
          ? pathname
          : checkFileExists(`${pathname.replace(/\/$/, "") || "/index"}.html`)
            ? `${pathname.replace(/\/$/, "") || "/index"}.html`
            : null;

      const isPage = managed || (canonical && checkFileExists(canonical));

      if (isPage && canonical) {
        // 4. Handle Redirects (e.g. /foo.html -> /foo)
        const cleaned = cleanUrl(pathname);
        if (cleaned !== pathname) {
          // Redirect to clean version
          const targetPath = base + cleaned;
          if (targetPath !== url.pathname) {
            const newUrl = new URL(req.url, "http://origin-unused");
            newUrl.pathname = targetPath;
            res.statusCode = 308;
            res.setHeader("Location", newUrl.pathname + newUrl.search + newUrl.hash);
            res.end();
            return;
          }
        }

        // 5. Handle Rewrites and Rendering
        if (canonical !== pathname) {
          // Rewrite internal URL
          const newUrl = new URL(req.url, "http://origin-unused");
          newUrl.pathname = base + canonical;
          req.url = newUrl.pathname + newUrl.search + newUrl.hash;

          // If we're in preview, let Vite serve the rewritten URL from dist
          if (!isDev) {
            return next();
          }
        }

        // In dev, render managed pages on the fly
        if (isDev && managed) {
          const { data, sourceFile, resolvedPathname } = managed.resolved;
          const urlPathname = resolvedPathname ?? pathname;
          if (debug) {
            config.logger.info(
              `responding to ${req.url} with ${sourceFile ?? "virtual page"} (${urlPathname})`,
              { timestamp: true },
            );
          }
          const transforms = managed.pagesSet.transforms
            ? [...managed.pagesSet.transforms]
            : [defaultTransform];
          if (managed.pagesSet.entryPoint) {
            transforms.push(transformIndexHtml);
          }
          renderPage(
            pathname,
            transforms,
            pluginContextProxy,
            { ...data, originalUrl: originalReqUrl },
            sourceFile,
            (watchFile) => addDependency?.(watchFile, pathname),
          )
            .then((html) => {
              if (managed.pagesSet.entryPoint) {
                res.setHeader("Content-Type", "text/html");
              }
              res.statusCode = 200;
              res.end(html);
            })
            .catch((err) => {
              res.statusCode = 500;
              res.end(`Error rendering page: ${err}`);
              config.logger.error(`error rendering ${urlPathname}: ${err}`, {
                timestamp: true,
              });
            });
          return;
        }
      }

      next();
    };
  };

  return {
    name: PLUGIN_ID,

    configResolved(resolvedConfig) {
      config = resolvedConfig;
      if (!options.pages) {
        return;
      }
      if (config.command === "build") {
        buildPagesSets = options.pages.map(constructBuildPagesSet);
      }
      if (config.command === "serve") {
        devPagesSets = options.pages.map(constructDevPagesSet);
      }
    },

    configureServer(devServer) {
      // Track dependencies: map from source/template file -> set of url pathnames that depend on it
      const fileDependencies = new Map<string, Set<string>>();
      const addDependency = (sourceFile: string, urlPathname: string) => {
        const absPath = makeAbsolutePath(sourceFile);
        let dependencies = fileDependencies.get(absPath);
        if (!dependencies) {
          dependencies = new Set();
          fileDependencies.set(absPath, dependencies);
          devServer.watcher.add(absPath);
        }
        dependencies.add(urlPathname);
      };

      // Watch for changes to dependency files and trigger HMR
      devServer.watcher.on("change", (changedFile) => {
        const dependentPages = fileDependencies.get(changedFile);
        if (dependentPages && dependentPages.size > 0) {
          if (debug) {
            config.logger.info(
              `${changedFile} changed, reloading pages: ${[...dependentPages].join(", ")}`,
              { timestamp: true },
            );
          }
          // Trigger HMR for all pages that depend on this file
          for (const urlPathname of dependentPages) {
            devServer.hot.send({
              type: "full-reload",
              path: urlPathname,
            });
          }
        }
      });

      devServer.middlewares.use(createMiddleware(devServer, true, addDependency));
    },

    configurePreviewServer(previewServer) {
      previewServer.middlewares.use(createMiddleware(previewServer, false));
    },

    // Safari workaround:
    // Vite's code splitting injects _shared_ chunks (used by multiple entry points)
    // as parallel <script type="module" src="...">, to prevent waterfalls.
    // This can cause a broken Safari module graph, stalling execution, if any
    // two modules import from a third module that uses top-level await.
    // https://bugs.webkit.org/show_bug.cgi?id=242740
    // An effective workaround seems to be converting hoisted, code-split chunks
    // to <link rel="modulepreload">, which somehow avoids the problem. (Vite
    // already prefers <link rel="modulepreload"> for non-shared chunks.)
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        // Only run if we have a bundle (build mode).
        // Only process entry chunks (which includes html entry points).
        if (!ctx.bundle || !ctx.chunk?.isEntry) {
          return html;
        }

        // Figure out which scripts are the root modules from the original html
        // and which were added by Vite's code splitting.
        // (Looking at a single level of imports is sufficient.)
        const rootImports = new Set(ctx.chunk.imports);
        const codeSplitImports = new Set<string>();
        for (const rootImport of rootImports) {
          const chunk = ctx.bundle[rootImport];
          if (chunk && "imports" in chunk) {
            for (const subImport of chunk.imports) {
              codeSplitImports.add(subImport);
              rootImports.delete(subImport);
            }
          }
        }
        if (codeSplitImports.size < 1) {
          return html;
        }
        // console.log(`Transforming ${ctx.chunk.facadeModuleId} (${ctx.chunk.fileName})`);
        // console.log(`  Root imports: ${[...rootImports].join(", ")}`);
        // console.log(`  Code-split imports: ${[...codeSplitImports].join(", ")}`);

        // For the codeSplitImports, convert:
        //   <script type="module" [crossorigin] src="..."></script>
        // to:
        //   <link rel="modulepreload" [crossorigin] href="...">
        //
        // In non-shared-chunk cases, vite may have _already_ generated
        // <link rel="modulepreload"> for what we've (mis-)identified as rootImports.
        // That's OK, leave those unchanged. (vite has also included an actual root
        // script module, probably ctx.chunk.fileName.)
        return html.replace(
          /<script\s+type="module"\s+([^>]*)\s*src="\/([^"]+)"([^>]*)><\/script>/g,
          (scriptTag, attrs1, src, attrs2) => {
            if (codeSplitImports.has(src)) {
              // Preserve crossorigin, integrity, nonce, etc. attrs.
              return `<link rel="modulepreload" ${attrs1}href="/${src}"${attrs2}>`;
            } else {
              return scriptTag;
            }
          },
        );
      },
    },

    options: {
      handler(options) {
        // Add entryPoint pages to rollup inputs
        const extraInputs = buildPagesSets
          .filter(({ entryPoint }) => entryPoint)
          .flatMap((pagesSet) => [...pagesSet.pages.keys()]);
        if (extraInputs.length === 0) {
          return;
        }

        if (typeof options.input === "string") {
          options.input = [...new Set([...extraInputs, options.input])];
        } else if (Array.isArray(options.input)) {
          options.input = [...new Set([...extraInputs, ...options.input])];
        } else if (typeof options.input === "object") {
          options.input = {
            ...Object.fromEntries(extraInputs.map((id) => [id, id])),
            ...options.input,
          };
        } else if (options.input === undefined) {
          options.input = extraInputs;
        }
      },
    },

    resolveId(id, _importer, _options) {
      for (const pagesSet of buildPagesSets) {
        if (pagesSet.pages.has(id)) {
          return {
            id,
            meta: { [PLUGIN_ID]: { pagesSet } },
          };
        }
      }
      return null;
    },

    async load(id) {
      const pagesSet: BuildPagesSet | undefined =
        this.getModuleInfo(id)?.meta?.[PLUGIN_ID]?.pagesSet;
      if (pagesSet) {
        const page = pagesSet.pages.get(id);
        if (!page) {
          // Shouldn't have meta[PLUGIN_ID] if id not in pagesSet
          throw new Error(`Inconsistency between resolveId and load for id='${id}'`);
        }
        const html = await renderPage(
          cleanUrl(id),
          pagesSet.transforms,
          this,
          page.data,
          page.sourceFile,
          (file) => this.addWatchFile(file),
        );
        if (debug) {
          const from = page.sourceFile ?? "virtual page";
          this.info(`generated ${id} from ${from}`);
        }
        return html;
      }
      return null;
    },

    async generateBundle(_options, _bundle) {
      // Emit non-entryPoint pages
      for (const pagesSet of buildPagesSets.filter(({ entryPoint }) => !entryPoint)) {
        for (const [id, page] of pagesSet.pages) {
          const content = await renderPage(
            cleanUrl(id),
            pagesSet.transforms,
            this,
            page.data,
            page.sourceFile,
            (file) => this.addWatchFile(file),
          );
          this.emitFile({
            type: "asset",
            fileName: id,
            source: content,
          });
        }
      }
    },
  };
};

//
// Some helpful transforms
//

/**
 * Creates a transform function that renders 'source' as markdown.
 * Adds 'html' and 'body' (both set to rendered markdown)
 * and 'title' (first H1 in markdown) to the output data.
 */
export const renderMarkdown = (
  config?: MarkdownItPresetName | MarkdownItOptions,
): Transform => {
  const md = // ugh, TS overload confusion
    config === undefined
      ? new MarkdownIt()
      : typeof config === "string"
        ? new MarkdownIt(config)
        : new MarkdownIt(config);

  // Remap logical icon names to Lucide names. See src/icons.ts.
  // (Only a few that we happen to use in the help docs.)
  const logicalIconNames: Record<string, string> = {
    "checkpoint-add": "shield-check",
    "checkpoint-remove": "trash-2",
    experimental: "flask-conical",
    "game-in-progress": "play",
    "generic-puzzle": "box",
    history: "history",
    "mouse-left-button": "/src/assets/mouse-left-button.svg",
    "mouse-right-button": "/src/assets/mouse-right-button.svg",
    "puzzle-type": "swatch-book",
    redo: "redo-2",
    "save-game": "download",
    "load-game": "upload",
    share: "share-2",
    "show-solution": "sparkles",
    undo: "undo-2",
    unfinished: "traffic-cone",
    // A few custom icons for the install page
    "firefox-web-apps": "/src/assets/firefox-web-apps.svg",
    "edge-app-available": "/src/assets/edge-app-available.svg",
    "install-desktop":
      "/node_modules/@material-design-icons/svg/outlined/install_desktop.svg",
    "ios-share": "/node_modules/@material-design-icons/svg/outlined/ios_share.svg",
  } as const;

  md.use(mditPluginIcon, {
    render: (raw) => {
      const parts = raw.split("|");
      if (parts.length < 1) {
        return `::${escapeHtml(raw)}::`; // ???
      }
      const iconName = parts.shift()?.trim() ?? "";
      const iconId = logicalIconNames[iconName] ?? iconName;
      const src = iconId.startsWith("/")
        ? iconId
        : `/node_modules/lucide-static/icons/${iconId}.svg`;
      const style = `style="--icon: url('${escapeHtml(src)}')"`;
      const label = parts.length > 0 ? parts.join("|").trim() : iconName;
      const ariaLabel = label ? `aria-label="${escapeHtml(label)}"` : "";
      // Use an image mask (baseline 2023) to render icon in currentColor
      // (for dark mode, etc.). See corresponding rule in help.css.
      return `<span class="icon" role="img" ${ariaLabel} ${style}></span>`;
    },
  });

  md.use(mditPluginAttrs);
  md.use(mditPluginAnchor);

  return (data) => {
    if (!data.source) {
      throw new Error(
        `renderMarkdown transform requires source, got ${Object.keys(data).join(", ")}`,
      );
    }

    // Extract first h1 from markdown as title, else fall back to source basename
    const title =
      String(data.source).match(/^#\s+(.+)$/m)?.[1] ??
      path.basename(data.sourceFile ? String(data.sourceFile) : "", ".md");
    const html = md.render(String(data.source));
    return {
      ...data,
      title,
      body_html: html,
      html,
    };
  };
};

/**
 * Creates a transform function that renders a Handlebars template.
 */
export interface RenderHandlebarsOptions {
  content?: string;
  file?: string;
  partials?: Record<string, string>;
  partialFiles?: Record<string, string>;
}

export const renderHandlebars =
  (options: RenderHandlebarsOptions): Transform =>
  async (data, addWatchFile) => {
    let templateContent: string;
    if (options.file) {
      addWatchFile?.(options.file);
      templateContent = fs.readFileSync(options.file, "utf8");
    } else {
      templateContent = options.content ?? "";
    }

    const instance = Handlebars.create();

    if (options.partials) {
      for (const [name, content] of Object.entries(options.partials)) {
        instance.registerPartial(name, content);
      }
    }
    if (options.partialFiles) {
      for (const [name, filePath] of Object.entries(options.partialFiles)) {
        addWatchFile?.(filePath);
        instance.registerPartial(name, fs.readFileSync(filePath, "utf8"));
      }
    }

    const template = instance.compile(templateContent);
    const html = template(data);
    return { ...data, html };
  };
