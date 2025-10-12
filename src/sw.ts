/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  precacheAndRoute,
  type urlManipulation,
} from "workbox-precaching";
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
// MPA routing
//

// BASE_URL ensuring trailing slash
const basePath = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

// Route /:puzzleId to /puzzle.html for known puzzle ids.
// (Workbox PrecacheController already handles / to /index.html routing.)
const routePuzzleUrls: urlManipulation = ({ url }) => {
  // (Could ignore trailing / and .html here too, but puzzle-screen would need
  // to do the same: effectively a client-side redirect to its canonical url.)
  const urls: URL[] = [];
  if (url.pathname.startsWith(basePath)) {
    const possiblePuzzleId = url.pathname.slice(basePath.length);
    if (puzzleIds.includes(possiblePuzzleId)) {
      urls.push(new URL("puzzle.html", self.location.href));
    }
  }
  return urls;
};

//
// Caching
//

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST, {
  // All URL parameters are handled locally
  ignoreURLParametersMatching: [/.*/],
  urlManipulation: routePuzzleUrls,
});
