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
import MarkdownIt, {
  type Options as MarkdownItOptions,
  type PresetName as MarkdownItPresetName,
} from "markdown-it";
import mditPluginAnchor from "markdown-it-anchor";
import { globSync } from "tinyglobby";
import {
  createFilter,
  type MinimalPluginContextWithoutEnvironment,
  type Plugin,
  type ResolvedConfig,
} from "vite";
import { isViteMagicUrl } from "./vite-puzzles-routing";

const PLUGIN_ID = "extra-pages";

export type TransformAddWatchFile = (absolutePath: string) => void;
export type TransformData = Record<string, string>;
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

export interface ExtraPagesPluginOptions {
  /**
   * Sets of source files to treat as additional index pages,
   * possibly with transformations.
   */
  pages?: ExtraPagesSet[];

  /**
   * Whether to output routing information. Default false.
   */
  debug?: boolean;
}

// Build command helper
interface BuildPagesSet extends ExtraPagesSet {
  // requested url.pathname => resolved absolute source path
  paths: Map<string, string>;
}

// Dev server helper
interface DevPagesSet extends ExtraPagesSet {
  // File extensions that might match a sources glob
  sourceExts: string[];
  // Glob filter built from pagesSet.sources (project-relative)
  matchesSource: (id: string) => boolean;
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

  function constructBuildPagesSet(pagesSet: ExtraPagesSet): BuildPagesSet {
    const paths: Map<string, string> = new Map();
    for (const filePath of globSync(pagesSet.sources)) {
      const absFilePath = makeAbsolutePath(filePath);
      let urlPath = filePath;
      if (pagesSet.resolve && filePath.startsWith(pagesSet.resolve.path)) {
        urlPath = pagesSet.resolve.url + filePath.slice(pagesSet.resolve.path.length);
      }
      // Switch source extension (e.g., .md) to .html to handle as index page.
      urlPath = urlPath.replace(/\.[^.]+$/, ".html");
      paths.set(urlPath, absFilePath);
    }

    return { ...pagesSet, paths };
  }

  function constructDevPagesSet(pagesSet: ExtraPagesSet): DevPagesSet {
    const sourceExts = extractGlobExtensions(pagesSet.sources);
    if (sourceExts.length < 1) {
      throw new Error(`Unable to extract extensions from glob ${pagesSet.sources}`);
    }
    const matchesSource = createFilter(pagesSet.sources, [], { resolve: false });
    return { ...pagesSet, sourceExts, matchesSource };
  }

  // Return pathname to the absolute source file path from pagesSet,
  // if one matches. pathname must be relative to base (no leading '/').
  // (This is meant to be the same logic as BuildPagesSet.paths,
  // but in reverse and on the fly for use on the dev server.)
  function resolveUrl(pathname: string, pagesSet: DevPagesSet): string | null {
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
    // because the build output of this plugin is html only. (We don't want to
    // accidentally handle a dev server request for url .../foo.md, because
    // that wouldn't work in production--the requested url should have been
    // .../foo.html or .../foo.) As a side effect, this also handles clean urls
    // for extra pages in the dev server.
    if (sourcePathRel.endsWith(".html")) {
      sourcePathRel = sourcePathRel.slice(0, -5);
    } else if (sourcePathRel.endsWith("/") || sourcePathRel === "") {
      // Index routing
      sourcePathRel = `${sourcePathRel}index`;
    }

    // Try each possible extension looking for a match
    for (const ext of pagesSet.sourceExts) {
      // Verify that the constructed source file path would match the glob...
      const possiblePath = `${sourcePathRel}${ext}`;
      if (pagesSet.matchesSource(possiblePath)) {
        // ... and that it exists
        const sourceFile = makeAbsolutePath(possiblePath);
        if (fs.existsSync(sourceFile) && fs.statSync(sourceFile).isFile()) {
          return sourceFile;
        }
      }
    }
    return null; // no matches
  }

  async function renderPage(
    sourceFile: string, // absolute path
    transforms: Transform[] | undefined,
    urlPathname: string,
    pluginContext: MinimalPluginContextWithoutEnvironment,
    extraData?: TransformData,
    addWatchFile?: TransformAddWatchFile,
  ) {
    addWatchFile?.(sourceFile);
    const source = fs.readFileSync(sourceFile).toString();

    let data: TransformData = { ...extraData, source, urlPathname, sourceFile };
    for (const transform of transforms ?? [defaultTransform]) {
      data = await transform.call(pluginContext, data, addWatchFile);
    }
    if (!Object.hasOwn(data, "html")) {
      const keys = Object.keys(data).join(", ");
      pluginContext.error(
        `transforms pipeline for ${sourceFile} did not return 'html'. Got ${keys}`,
      );
    }
    return data.html ?? "";
  }

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

    //
    // Dev server handling
    //
    // Synthesize missing .html files on the fly, from corresponding .md sources.
    //
    configureServer(devServer) {
      // Add vite's transformIndexHtml to the end of each pipeline
      // for env substitution, HMR, etc.
      const transformIndexHtml: Transform = async (data) => ({
        ...data,
        html: await devServer.transformIndexHtml(
          data.urlPathname,
          data.html,
          data.originalUrl || undefined,
        ),
      });

      // Track dependencies: map from source/template file -> set of url pathnames that depend on it
      const fileDependencies = new Map<string, Set<string>>();
      const addDependency = (sourceFile: string, urlPathname: string) => {
        const absPath = makeAbsolutePath(sourceFile);
        let dependencies = fileDependencies.get(absPath);
        if (!dependencies) {
          dependencies = new Set();
          fileDependencies.set(absPath, dependencies);
        }
        dependencies.add(urlPathname);
      };

      // Watch for changes to dependency files and trigger HMR
      devServer.watcher.on("change", (changedFile) => {
        const dependentPages = fileDependencies.get(changedFile);
        if (dependentPages && dependentPages.size > 0) {
          if (debug) {
            this.info(
              `${changedFile} changed, reloading pages: ${[...dependentPages].join(", ")}`,
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

      devServer.middlewares.use((req, res, next) => {
        // Get the pathname component of the url (relative to base)
        const url = new URL(req.url ?? "", "http://origin-unused");
        let pathname = url.pathname;
        if (pathname.startsWith(config.base)) {
          pathname = pathname.slice(config.base.length);
        }

        // Ignore vite internals
        if (pathname.includes("@vite") || isViteMagicUrl(url)) {
          return next();
        }

        // If there's an extension, only .html could be an extra pages request.
        // (Extensionless urls like foo/bar and index urls like foo/ also could be.)
        if (/\.[^.]+$/.test(pathname) && !pathname.endsWith(".html")) {
          return next();
        }

        // Try to dynamically resolve from dev page sets
        for (const pagesSet of devPagesSets) {
          const sourceFile = resolveUrl(pathname, pagesSet);
          if (sourceFile) {
            if (debug) {
              this.info(`responding to ${req.url} with ${sourceFile}`);
            }
            renderPage(
              sourceFile,
              [...(pagesSet.transforms ?? [defaultTransform]), transformIndexHtml],
              pathname,
              this,
              { originalUrl: req.url ?? "" },
              (watchFile) => addDependency(watchFile, pathname),
            )
              .then((html) => {
                res.setHeader("Content-Type", "text/html");
                res.statusCode = 200;
                res.end(html);
              })
              .catch((err) => {
                res.statusCode = 500;
                res.end(`Error rendering page: ${err}`);
                this.error(`error rendering ${pathname} from ${sourceFile}: ${err}`);
              });
            return;
          }
        }

        return next();
      });
    },

    //
    // Build time handling
    //
    // Synthesize missing build.rollupOptions.input .html files
    // from corresponding .md sources.
    //
    // (Input must be specified as .html, not .md, so that vite's index html
    // processing is applied -- including static asset management.
    // See https://github.com/vitejs/vite/discussions/10922.)
    //

    options: {
      handler(options) {
        const extraInputs = buildPagesSets.flatMap((pagesSet) => [
          ...pagesSet.paths.keys(),
        ]);
        if (typeof options.input === "string") {
          options.input = [...extraInputs, options.input];
        } else if (Array.isArray(options.input)) {
          options.input = [...extraInputs, ...options.input];
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

    resolveId: {
      order: "pre",
      filter: {
        id: /\.html$/,
      },
      handler(id, _importer, _options) {
        // TODO: only run this when options.isEntry?
        for (const pagesSet of buildPagesSets) {
          if (pagesSet.paths.has(id)) {
            return {
              id,
              meta: { [PLUGIN_ID]: { pagesSet } },
            };
          }
        }
        return null;
      },
    },

    load: {
      order: "pre",
      filter: {
        id: /\.html$/,
      },
      async handler(id, _options) {
        const pagesSet: BuildPagesSet | undefined =
          this.getModuleInfo(id)?.meta?.[PLUGIN_ID]?.pagesSet;
        if (pagesSet) {
          const sourceFile = pagesSet.paths.get(id);
          if (!sourceFile) {
            // Shouldn't have meta[PLUGIN_ID] if id not in pagesSet
            throw new Error(`Inconsistency between resolveId and load for id='${id}'`);
          }
          const html = await renderPage(sourceFile, pagesSet.transforms, id, this);
          if (debug) {
            this.info(`generated ${id} from ${pagesSet.paths.get(id)}`);
          }
          return html;
        }
        return null;
      },
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
      data.source.match(/^#\s+(.+)$/m)?.[1] ??
      path.basename(data.sourceFile ?? "", ".md");
    const html = md.render(data.source);
    return {
      ...data,
      title,
      body_html: html,
      html,
    };
  };
};

// A simple default template for rendered markdown
const defaultTemplateContent = `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>=TITLE=</title>
</head>
<body>
=BODY_HTML=
</body>
</html>
`;

/**
 * Creates a transform function that renders a simple template,
 * given either the template content or a file containing it.
 *
 * Within the template, `=NAME=` variables will be replaced with data["name"].
 * Values will be escaped as html unless the name ends in _HTML.
 */
export const renderTemplate = (
  options: { content: string } | { file: string } = { content: defaultTemplateContent },
): Transform =>
  function (data, addWatchFile) {
    let template: string;
    if ("file" in options) {
      // TODO: resolve relative options.file from config.root (need config param, or root in data)
      // TODO: could cache template file content (at least in build)
      addWatchFile?.(options.file);
      template = fs.readFileSync(options.file, "utf8");
    } else {
      template = options.content;
    }

    const html = template.replace(/=(\w+)=/g, (match, name: string) => {
      const value = data[name] ?? data[name.toLowerCase()];
      if (value === undefined) {
        this.warn(`unresolved template variable ${match}`);
        return match;
      }
      return name.endsWith("_HTML") ? value : escapeHtml(value);
    });
    return { ...data, html };
  };

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
