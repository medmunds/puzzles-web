/**
 * Cloudflare Pages wildcard function to handle MPA routing for puzzles.
 * https://developers.cloudflare.com/pages/configuration/serving-pages/#route-matching
 * https://developers.cloudflare.com/pages/functions/routing/.
 *
 * Pages already handles these cases (for existing dist/ static assets):
 *   - / serves dist/index.html
 *   - /index and /index.html 308 redirect to /
 *   - /help/blackbox serves dist/help/blackbox.html
 *   - /help/blackbox/ and /help/blackbox.html 308 redirect to /help/blackbox
 *   - /help/ serves dist/help/index.html
 *   - /help and /help/index and /help/index.html 308 redirect to /help/
 *
 * This function implements:
 *   - /<puzzleId> serves dist/puzzle.html for known puzzle ids
 *   - /<puzzleId>/ and /<puzzleId>.html 308 redirect to /<puzzleId>
 *
 * Notes:
 *
 * 1. Trailing slashes are forced for asset dirs, stripped for files.
 *    (Doing the opposite here will cause a redirect loop.)
 *
 * 2. Our service worker precaching will fetch /puzzle.html?__WB_REVISION=<cachebuster>
 *    (and /index.html?__WB_REVISION, and similar for all the help files).
 *    Pages will 308 redirect those to strip .html, but the desired content
 *    should still end up in the cache via the redirect.
 */

import { puzzleIds } from "../src/assets/puzzles/catalog.json";

const PUZZLE_IDS = new Set(puzzleIds);

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const isPrecache = url.search.includes("__WB_REVISION");

  if (!isPrecache && parts.length === 1) {
    const puzzleId = parts[0].toLowerCase().replace(/\.html$/, "");
    if (PUZZLE_IDS.has(puzzleId)) {
      const canonicalPath = `/${puzzleId}`;
      if (url.pathname !== canonicalPath) {
        // Redirect to clean url
        const redirectUrl = new URL(canonicalPath, url);
        redirectUrl.search = url.search;
        const response = Response.redirect(redirectUrl.toString(), 308);
        const headers = new Headers(response.headers);
        headers.set("Cache-Control", "public, max-age=86400");
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }

      // Return puzzle.html content
      const response = await context.env.ASSETS.fetch(
        new URL("/puzzle.html", url.origin),
      );
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "public, max-age=60, must-revalidate");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
  }

  // All other requests are likely 404's (because Pages prefers serving
  // static assets to calling this [[path]] handler).
  // This will cover that and any unexpected corner cases.
  return context.env.ASSETS.fetch(context.request);
};
