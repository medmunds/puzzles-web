import assert from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Connect, Plugin } from "vite";

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
 * Returns a RegExp that exactly matches any of these urls, where :puzzleId
 * is one of puzzleIds:
 *    /
 *    /:puzzleId
 *    /:puzzleId/  (trailing slash allowed)
 * Any search params are allowed (/:puzzleId?type=3 matches),
 * but trailing path portions are not (/:puzzleId/other won't match).
 */
export const getFallbackRouteRe = (puzzleIds: string[]): RegExp => {
  const puzzleIdsRe = puzzleIds.join("|");
  // Matches '/', optionally followed by :puzzleId (itself optionally followed by '/').
  // Entire match must start at beginning and terminate either at end or at '?'.
  return new RegExp(`^/((${puzzleIdsRe})/?)?($|[?])`);
};

/**
 * Vite plugin that routes / and /:puzzleId (for known puzzle ids)
 * to /index.html. Use with appType: "mpa". Puzzle ids are read (at startup)
 * from catalogFile.
 */
export const puzzlesSpaRouting = (catalogFile?: string): Plugin => {
  const createMiddleware = (projectRoot?: string): Connect.NextHandleFunction => {
    const puzzleIds = getKnownPuzzleIds({ catalogFile, projectRoot });
    const fallbackRe = getFallbackRouteRe(puzzleIds);

    return (req, _res, next) => {
      if (req.url && fallbackRe.test(req.url)) {
        req.url = "/index.html";
      }
      next();
    };
  };

  return {
    name: "puzzles-spa-routing",
    configureServer(server) {
      assert(
        server.config.appType === "mpa",
        "puzzlesSpaRouting plugin requires appType 'mpa'",
      );
      server.middlewares.use(createMiddleware(server.config.root));
    },
    configurePreviewServer(server) {
      assert(
        server.config.appType === "mpa",
        "puzzlesSpaRouting plugin requires appType 'mpa'",
      );
      server.middlewares.use(createMiddleware(server.config.root));
    },
  };
};
