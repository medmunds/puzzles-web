/*
 * Vite plugin that handles MPA routing for puzzles
 */

import assert from "node:assert";
import type { Connect, Plugin } from "vite";
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

export { puzzleIds } from "./src/assets/puzzles/catalog.json";

/**
 * Returns a RegExp that exactly matches /:puzzleId or /:puzzleId/,
 * where :puzzleId is one of the given puzzleIds.
 * Any search params are allowed (/:puzzleId?type=3 matches),
 * but trailing path portions are not (/:puzzleId/other won't match).
 */
export const getPuzzleRouteRe = (puzzleIds: string[], base: string = "/"): RegExp => {
  validateBase(base);
  const puzzleIdsRe = puzzleIds.map(RegExp.escape).join("|");
  // Entire match must start at beginning and terminate either at end or at '?'.
  return new RegExp(`^${RegExp.escape(base)}(${puzzleIdsRe})/?($|[?])`);
};

/**
 * Returns a RegExp that exactly matches index route.
 */
export const getIndexRouteRe = (base: string = "/") => {
  validateBase(base);
  return new RegExp(`^${RegExp.escape(base)}?($|[?])`);
};

/**
 * Vite plugin that routes / to /index.html and /:puzzleId to /puzzle.html
 * (for known puzzle ids). Use with appType: "mpa". Puzzle ids are read
 * (at startup) from catalogFile.
 */
export const puzzlesMpaRouting = (): Plugin => {
  const createMiddleware = (base?: string): Connect.NextHandleFunction => {
    const puzzleRouteRe = getPuzzleRouteRe(puzzleIds, base);
    const indexRouteRe = getIndexRouteRe(base);

    return (req, _res, next) => {
      if (req.url) {
        if (indexRouteRe.test(req.url)) {
          req.url = `${base}index.html`;
        } else if (puzzleRouteRe.test(req.url)) {
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
      server.middlewares.use(createMiddleware(server.config.base));
    },
    configurePreviewServer(server) {
      assert(
        server.config.appType === "mpa",
        "puzzlesSpaRouting plugin requires appType 'mpa'",
      );
      server.middlewares.use(createMiddleware(server.config.base));
    },
  };
};
