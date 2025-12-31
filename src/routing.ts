import { puzzleIds } from "./puzzle/catalog.ts";

export const validPuzzleIds = new Set(puzzleIds);

export const baseUrl = new URL(import.meta.env.BASE_URL, window.location.href);

export const homePageUrl = () => new URL("", baseUrl);

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

export const helpUrl = (puzzleId?: string) =>
  new URL(puzzleId ? `help/${puzzleId}` : "help/", baseUrl);

export const isHelpUrl = (href: string | URL): boolean =>
  relativePathname(href)?.startsWith("help") ?? false;

/**
 * If href is relative to baseUrl, returns its pathname portion after
 * baseUrl.pathname, with leading and trailing slashes removed.
 */
export const relativePathname = (href: string | URL): string | undefined => {
  const url = href instanceof URL ? href : new URL(href, baseUrl);
  if (url.origin !== baseUrl.origin || !url.pathname.startsWith(baseUrl.pathname)) {
    return undefined;
  }
  return (
    url.pathname
      // Remove baseUrl pathname
      .slice(baseUrl.pathname.length)
      // Strip leading/trailing slashes
      .replace(/^\/+/, "")
      .replace(/\/+$/, "")
  );
};

export function parsePuzzleUrl(href?: string | URL): PuzzleUrlParams | undefined {
  // Extract puzzleId from /:puzzleId
  const url = new URL(href ?? window.location.href, baseUrl);
  const path = relativePathname(url);
  if (path === undefined || !validPuzzleIds.has(path)) {
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

export function navigateToHomePage() {
  // If navigating back would get us to the index page, do that instead.
  const homeUrl = homePageUrl();
  if (document.referrer) {
    const referrer = new URL(document.referrer);
    if (referrer.origin === homeUrl.origin && referrer.pathname === homeUrl.pathname) {
      window.history.back();
      return;
    }
  }
  window.location.href = homeUrl.href;
}
