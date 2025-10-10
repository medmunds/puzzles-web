/*
 * Cloudflare Pages Function to handle MPA routing for puzzles.
 *   - `/` serves /index.html
 *   - `/:puzzleId` serves /puzzle.html (for a known puzzleId)
 * (keeping the original URL in the browser).
 *
 * Also redirects to strip trailing slashes and .html from MPA routes.
 */

import { puzzleIds } from "../src/assets/puzzles/catalog.json";

const PUZZLE_IDS = new Set(puzzleIds);

const redirect = (path: string, base: URL) => {
  const redirectUrl = new URL(path, base.origin);
  redirectUrl.search = base.search;
  return Response.redirect(redirectUrl.toString(), 301);
};

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const isPrecache = url.search.includes("__WB_REVISION");

  // Redirect to strip trailing slashes (must be before /<puzzleId> routing)
  if (!isPrecache && url.pathname.length > 1 && url.pathname.endsWith("/")) {
    const stripped = url.pathname.replace(/\/+$/, "") || "/";
    return redirect(stripped, url);
  }

  // Route / to /index.html
  if (parts.length === 0) {
    return context.env.ASSETS.fetch(new URL("/index.html", url.origin));
  }

  // Route /<puzzleId> to /puzzle.html (for known puzzle ids)
  if (parts.length === 1 && PUZZLE_IDS.has(parts[0])) {
    return context.env.ASSETS.fetch(new URL("/puzzle.html", url.origin));
  }

  // Redirect /index.html to /
  if (!isPrecache && url.pathname === "/index.html") {
    return redirect("/", url);
  }

  // Redirect /<puzzleId>.html to /<puzzleId> (for known puzzle ids)
  if (!isPrecache && parts.length === 1 && parts[0].endsWith(".html")) {
    const possibleId = parts[0].slice(0, -5);
    if (PUZZLE_IDS.has(possibleId)) {
      return redirect(`/${possibleId}`, url);
    }
  }

  // All other requests are likely 404's (because Pages prefers serving
  // static assets to calling this [[path]] handler).
  // This will cover that and any unexpected corner cases.
  return context.env.ASSETS.fetch(context.request);
};
