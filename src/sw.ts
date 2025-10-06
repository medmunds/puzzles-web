/// <reference lib="webworker" />
import type { RouteHandlerCallback, RouteMatchCallback } from "workbox-core/src/types";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";

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
const puzzleIds = __PUZZLE_IDS__;

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
  // Determine which file to serve
  let file = "index.html";
  if (url.pathname.startsWith(basePath)) {
    const relativePath = url.pathname.slice(basePath.length).replace(/\/$/, "");
    if (puzzleIds.includes(relativePath)) {
      file = "puzzle.html";
    }
  }

  const cache = await caches.open("page-cache");
  const cachedResponse = await cache.match(file);
  if (cachedResponse) {
    return cachedResponse;
  }

  return fetch(file);
};

registerRoute(mpaFallbackRouteMatcher, mpaFallbackRouteHandler);
