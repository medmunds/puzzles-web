import { puzzleDataMap } from "./puzzle/catalog.ts";

export const validPuzzleIds = new Set(Object.keys(puzzleDataMap));

const baseUrl = new URL(import.meta.env.BASE_URL, window.location.href);

export const indexPageUrl = () => new URL("", baseUrl);

export interface PuzzleUrlParams {
  puzzleId: string; // from path
  puzzleParams?: string; // from type param
  puzzleGameId?: string; // from id param
}

export const puzzlePageUrl = ({
  puzzleId,
  puzzleParams,
  puzzleGameId,
}: PuzzleUrlParams) => {
  const searchParams = new URLSearchParams();
  if (puzzleParams) {
    searchParams.set("type", puzzleParams);
  }
  if (puzzleGameId) {
    searchParams.set("id", puzzleGameId);
  }
  const url = new URL(`./${puzzleId}`, baseUrl);
  if (searchParams.size > 0) {
    url.search = searchParams.toString();
  }
  return url;
};

export const helpUrl = (puzzleId: string) =>
  new URL(`help/${puzzleId}-overview.html`, baseUrl);

export function parsePuzzleUrl(href?: string | URL): PuzzleUrlParams | undefined {
  // Extract puzzleId from /:puzzleId
  const url = new URL(href ?? window.location.href, baseUrl);
  if (!url.pathname.startsWith(baseUrl.pathname)) {
    return undefined;
  }

  const path = url.pathname
    // Remove baseUrl pathname
    .slice(baseUrl.pathname.length)
    // Strip leading/trailing slashes and trailing .html
    .replace(/^\/+/, "")
    .replace(/(\/+|\.html)$/, "");

  if (!validPuzzleIds.has(path)) {
    return undefined;
  }

  return {
    // The url is /:puzzleId?type=:puzzleParams
    // (e.g., "/blackbox?type=w8h8m5M5")
    puzzleId: path,
    puzzleParams: url.searchParams.get("type") ?? undefined,
    puzzleGameId: url.searchParams.get("id") ?? undefined,
  };
}

export function navigateToIndexPage() {
  // If navigating back would get us to the index page, do that instead.
  const indexUrl = indexPageUrl();
  if (document.referrer) {
    const referrer = new URL(document.referrer);
    if (
      referrer.origin === indexUrl.origin &&
      referrer.pathname === indexUrl.pathname
    ) {
      window.history.back();
      return;
    }
  }
  window.location.href = indexUrl.href;
}
