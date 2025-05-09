/*
 * Vite plugin that handles MPA routing for puzzles
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import type { Connect, Plugin, PreviewServer, ViteDevServer } from "vite";
import { puzzleIds } from "./src/assets/puzzles/catalog.json";

declare global {
  // RegExp.escape available in node v24
  // https://github.com/microsoft/TypeScript/issues/61321
  interface RegExpConstructor {
    escape(str: string): string;
  }
}

function validateBase(base: string) {
  if (!base.startsWith("/") || !base.endsWith("/")) {
    throw new Error(`base='${base}' must start and end with '/'`);
  }
}

export function isViteMagicUrl(url: URL) {
  const viteMagicParams = ["import", "raw", "inline", "url", "v", "t"];
  return viteMagicParams.some((param) => url.searchParams.has(param));
}

export { puzzleIds } from "./src/assets/puzzles/catalog.json";

/**
 * Returns a RegExp that exactly matches base:puzzleId,
 * where :puzzleId is one of the given puzzleIds.
 */
export const getPuzzleRouteRe = (puzzleIds: string[], base: string = "/"): RegExp => {
  validateBase(base);
  const puzzleIdsRe = puzzleIds.map(RegExp.escape).join("|");
  return new RegExp(`^${RegExp.escape(base)}(${puzzleIdsRe})$`);
};

/**
 * Vite plugin that replicates Cloudflare Pages' index routing
 * and clean urls plus with our custom puzzles MPA routing:
 * - Index routing: /base/help/ serves /dist/help/index.html
 *   - /base/help/index.html redirects to /base/help/
 * - Clean URLs: /base/help/intro serves /dist/help/intro.html
 *   - /base/help/intro.html redirects to /base/help/intro
 * - Puzzles MPA: /base/:puzzleId serves /dist/puzzle.html for known puzzleIds
 *   - but /base/help/:puzzleId or /base/assets/:puzzleId is not affected
 */
export const puzzlesMpaRouting = (): Plugin => {
  const createMiddleware = (
    server: ViteDevServer | PreviewServer,
    { isDevServer }: { isDevServer: boolean },
  ): Connect.NextHandleFunction => {
    const base = server.config?.base ?? "/";
    const puzzleRouteRe = getPuzzleRouteRe(puzzleIds, base);

    // Resolving urls to files like Vite does:
    const servableDirs = isDevServer
      ? [server.config.publicDir, server.config.root]
      : [server.config.build.outDir];

    const fileExists = (pathname: string): boolean => {
      const relativePathname = pathname.startsWith(base)
        ? pathname.slice(base.length)
        : pathname;
      for (const dir of servableDirs) {
        const resolvedPath = path.join(dir, relativePathname);
        if (fs.existsSync(resolvedPath)) {
          return true;
        }
      }
      return false;
    };

    return (req, res, next) => {
      if (req.url) {
        // Get req.url's pathname (without query params)
        const fakeOrigin = "http://origin-unused";
        const url = new URL(`${fakeOrigin}${req.url}`);
        const pathname = url.pathname;

        const redirect = () => {
          const location = url.href.replace(fakeOrigin, "");
          // console.log(`Redirecting ${req.url} to ${location}`);
          res.statusCode = 308;
          res.setHeader("Location", location);
          res.end();
        };

        if (pathname.endsWith("/")) {
          // TODO: doesn't vite already do this?
          const indexFile = `${pathname}index.html`;
          if (fileExists(indexFile)) {
            // "Index routing": serve /foo/bar/index.html for /foo/bar/
            // console.log(`Index route ${req.url} -> ${indexFile}`);
            req.url = indexFile;
          }
        } else if (pathname.endsWith(".html") && !isViteMagicUrl(url)) {
          // "Clean url": strip .html (and index.html)
          let cleaned = pathname.slice(0, -5);
          if (cleaned.endsWith("/index")) {
            cleaned = cleaned.slice(0, -5);
          }
          url.pathname = cleaned;
          return redirect();
        } else if (fileExists(`${pathname}.html`)) {
          // "Clean url" part 2: serve /foo/bar.html for /foo/bar
          // console.log(`Clean url ${req.url} -> ${pathname}.html`);
          req.url = `${pathname}.html`;
        } else if (puzzleRouteRe.test(pathname)) {
          // MPA routing: serve /puzzle.html for /:puzzleId
          // console.log(`Puzzle route ${req.url} -> ${base}puzzle.html`);
          req.url = `${base}puzzle.html`;
        }
      }
      next();
    };
  };

  return {
    name: "puzzles-mpa-routing",
    configureServer(server) {
      assert(
        server.config.appType === "mpa",
        "puzzlesSpaRouting plugin requires appType 'mpa'",
      );
      server.middlewares.use(createMiddleware(server, { isDevServer: true }));
    },
    configurePreviewServer(server) {
      assert(
        server.config.appType === "mpa",
        "puzzlesSpaRouting plugin requires appType 'mpa'",
      );
      server.middlewares.use(createMiddleware(server, { isDevServer: false }));
    },
  };
};
