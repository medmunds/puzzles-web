/*
 * Vite plugin that handles MPA routing for puzzles
 */

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Connect, Plugin } from "vite";

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

/**
 * Returns a list of known puzzleIds from the generated catalog.json data.
 * catalogFile must point to catalog.json relative to projectRoot.
 */
export const getKnownPuzzleIds = (
  options: { catalogFile?: string; projectRoot?: string } = {},
): string[] => {
  const { catalogFile = "src/assets/puzzles/catalog.json", projectRoot = "." } =
    options;
  try {
    const catalogPath = resolve(projectRoot, catalogFile);
    const catalogContent = readFileSync(catalogPath, "utf-8");
    const catalog = JSON.parse(catalogContent);
    return Object.keys(catalog.puzzles);
  } catch (error) {
    throw new Error(`Failed to load puzzle IDs from ${catalogFile}: ${error}`);
  }
};

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
export const puzzlesMpaRouting = (catalogFile?: string): Plugin => {
  const createMiddleware = (
    projectRoot?: string,
    base?: string,
  ): Connect.NextHandleFunction => {
    const puzzleIds = getKnownPuzzleIds({ catalogFile, projectRoot });
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
      server.middlewares.use(createMiddleware(server.config.root, server.config.base));
    },
    configurePreviewServer(server) {
      assert(
        server.config.appType === "mpa",
        "puzzlesSpaRouting plugin requires appType 'mpa'",
      );
      server.middlewares.use(createMiddleware(server.config.root, server.config.base));
    },
  };
};
