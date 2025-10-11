/// <reference lib="webworker" />
import type { RouteHandlerCallback, RouteMatchCallback } from "workbox-core/src/types";
import {
  cleanupOutdatedCaches,
  matchPrecache,
  precacheAndRoute,
} from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { puzzleIds } from "./assets/puzzles/catalog.json";

declare let self: ServiceWorkerGlobalScope;

//
// Message handlers
//

self.addEventListener("message", async (event) => {
  switch (event.data?.type) {
    case "SKIP_WAITING":
      // Call to updateSW(true) from virtual:pwa-register
      await self.skipWaiting();
      break;
  }
});

//
// Caching
//

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

//
// MPA routing
//

const basePath = import.meta.env.BASE_URL;

const mpaFallbackRouteMatcher: RouteMatchCallback = ({ request, url }) => {
  if (request.mode !== "navigate") {
    return false;
  }

  // Check if it's an index route: /base/ or /base
  if (url.pathname === basePath || url.pathname === basePath.slice(0, -1)) {
    return true;
  }

  // Check if it's a puzzle route: /base/puzzleId or /base/puzzleId/
  if (url.pathname.startsWith(basePath)) {
    const relativePath = url.pathname.slice(basePath.length).replace(/\/$/, "");
    return puzzleIds.includes(relativePath);
  }

  return false;
};

const mpaFallbackRouteHandler: RouteHandlerCallback = async ({ url }) => {
  // Determine which precached file to serve (key is __WB_MANIFEST entry)
  let pathname = "index.html";
  if (url.pathname.startsWith(basePath)) {
    const relativePath = url.pathname.slice(basePath.length).replace(/\/$/, "");
    if (puzzleIds.includes(relativePath)) {
      pathname = "puzzle.html";
    }
  }

  // Serve from Workbox’s precache (handles cleanUrls and revision params)
  const precached = await matchPrecache(pathname);
  if (precached) {
    return precached;
  }

  // Fallback to network; follow redirects so we don’t return a 30x to a navigation
  return fetch(new Request(pathname, { redirect: "follow" }));
};

registerRoute(mpaFallbackRouteMatcher, mpaFallbackRouteHandler);
