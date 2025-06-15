import { type Dirent, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Connect, Plugin } from "vite";

/**
 * Vite plugin that disables SPA fallback on any path into a subdir
 * of the publicDir (including symlinks to directories in public).
 * Allows 404 for missing assets within public subdirectories.
 */
export const spaFallbackIgnorePublicSubdirs = (): Plugin => {
  const isDirectoryOrDirectoryLink = (dirent: Dirent) => {
    if (dirent.isDirectory()) {
      return true;
    }
    // Check if it's a symlink pointing to a directory
    if (dirent.isSymbolicLink()) {
      try {
        const fullPath = join(dirent.parentPath, dirent.name);
        return statSync(fullPath).isDirectory();
      } catch (error) {
        // Broken symlink or permission issue
        return false;
      }
    }
    return false;
  };

  const createMiddleware = (publicDir: string): Connect.NextHandleFunction => {
    // Get all subdirectories and directory symlinks in publicDir
    const getPublicPrefixes = () => {
      try {
        return readdirSync(publicDir, { withFileTypes: true })
          .filter(isDirectoryOrDirectoryLink)
          .map((dirent) => `/${dirent.name}/`);
      } catch (error) {
        console.warn(`Could not read public directory ${publicDir}:`, error);
        return [];
      }
    };

    const publicPrefixes = getPublicPrefixes();
    console.log("Public url prefixes that will 404 on missing files:", publicPrefixes);

    return (req, res, next) => {
      const url = req.url;

      // Check if the request is for any subfolder of publicDir
      if (url && publicPrefixes.some((subdir) => url.startsWith(subdir))) {
        const filePath = join(publicDir, url);
        if (!existsSync(filePath)) {
          res.statusCode = 404;
          res.end("Not Found");
          return;
        }
      }

      next();
    };
  };

  return {
    name: "spa-fallback-ignore-public-subdirs",
    configureServer(server) {
      server.middlewares.use(createMiddleware(server.config.publicDir));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createMiddleware(server.config.publicDir));
    },
  };
};
