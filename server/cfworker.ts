/**
 * Cloudflare Worker to handle MPA routing for puzzles.
 * If a request matches `/puzzles/<puzzleId>`, it serves the content
 * of `/puzzles/puzzle.html` from the S3 origin, keeping the original URL in the browser.
 * (S3 already resolves `/puzzles/` to `/puzzles/index.html`.)
 */

import { puzzleIds } from "../src/assets/puzzles/catalog.json";

// Prefix within S3 bucket where puzzles are deployed.
// (Should match deployment BASE_URL without leading/trailing slashes.)
const S3_BUCKET_PREFIX = "puzzles";

// Path to puzzles page within the bucket
const PUZZLE_HTML_PATH = `/${S3_BUCKET_PREFIX}/puzzle.html`;

const PUZZLE_IDS = new Set(puzzleIds);

addEventListener("fetch", (evt) => {
  const event = evt as FetchEvent;
  event.respondWith(handleRequest(event.request));
});

/**
 * Handles incoming requests.
 */
async function handleRequest(request: Request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);

  // TODO: This should really also redirect:
  //    puzzles/<puzzleId>.html
  //    puzzles/<puzzleId>/  (trailing slash)
  //    to puzzles/<puzzleId>

  // Rewrite to puzzle.html if the path matches the pattern `/puzzles/<puzzle_name>`
  if (parts.length === 2 && parts[0] === S3_BUCKET_PREFIX && PUZZLE_IDS.has(parts[1])) {
    const puzzleUrl = new URL(PUZZLE_HTML_PATH, url.origin);
    puzzleUrl.search = url.search;

    console.log(`Rewriting "${url.pathname}" to "${puzzleUrl.pathname}".`);

    // Important: Preserve original request details (to avoid breaking cloudflare features)
    const puzzleRequest = new Request(puzzleUrl.toString(), request);
    return fetch(puzzleRequest);
  }

  // Use default handling for all other requests.
  return fetch(request);
}
