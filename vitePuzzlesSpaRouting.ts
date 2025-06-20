import assert from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Connect, Plugin } from "vite";

/**
 * Vite plugin that routes / and /:puzzleId (for known puzzle ids)
 * to /index.html. Use with appType: "mpa". Puzzle ids are read (at startup)
 * from catalogFile.
 */
export const puzzlesSpaRouting = (
  catalogFile = "src/assets/puzzles/catalog.json",
): Plugin => {
  const getPuzzlePaths = (catalogPath: string): string[] => {
    try {
      const catalogContent = readFileSync(catalogPath, "utf-8");
      const catalog = JSON.parse(catalogContent);
      const puzzleIds = Object.keys(catalog.puzzles);
      return puzzleIds.map((id) => `/${id}`);
    } catch (error) {
      console.error(`Failed to load puzzle IDs from ${catalogPath}:`, error);
      return [];
    }
  };

  const createMiddleware = (root: string): Connect.NextHandleFunction => {
    const catalogPath = resolve(root, catalogFile);
    const fallbackPaths = ["/", ...getPuzzlePaths(catalogPath)];
    // console.log("Fallback paths:", fallbackPaths);
    // RegExp.escape requires node v24 or later
    const fallbackPathsRe = fallbackPaths.map((path) => RegExp.escape(path)).join("|");
    const fallbackRe = new RegExp(`^(${fallbackPathsRe})/?($|[?#])`);

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
