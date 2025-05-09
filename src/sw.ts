/// <reference lib="webworker" />
import type { WorkboxPlugin } from "workbox-core";
import {
  addPlugins,
  cleanupOutdatedCaches,
  precacheAndRoute,
  type urlManipulation,
} from "workbox-precaching";
import { puzzleIds } from "./assets/puzzles/catalog.json";

declare let self: ServiceWorkerGlobalScope;

const manifest = self.__WB_MANIFEST;

//
// Message handlers
//

self.addEventListener("message", (event) => {
  switch (event.data?.type) {
    case "SKIP_WAITING":
      event.waitUntil(self.skipWaiting());
      break;
  }
});

async function sendMessageToClients(message: unknown, event: ExtendableEvent) {
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        includeUncontrolled: true,
        type: "window",
      });
      for (const client of clients) {
        client.postMessage(message);
      }
    })(),
  );
}

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
// Installation progress reporting
//

let precacheCount = 0;

// Custom plugin to track file precaching progress.
// handlerDidComplete runs when the caching handler for a request is completed.
const progressPlugin: WorkboxPlugin = {
  handlerDidComplete: async ({ event, request, error }) => {
    if (event.type === "install") {
      precacheCount++;

      await sendMessageToClients(
        {
          type: "PRECACHE_PROGRESS",
          url: request.url,
          count: precacheCount,
          total: manifest.length,
          success: !error,
        },
        event,
      );

      if (precacheCount >= manifest.length) {
        await sendMessageToClients({ type: "PRECACHE_COMPLETE" }, event);
      }
    }
  },
};

//
// Caching
//

cleanupOutdatedCaches();
addPlugins([progressPlugin]);
precacheAndRoute(manifest, {
  // All URL parameters are handled locally:
  ignoreURLParametersMatching: [/.*/],
  // Use our MPA routing:
  urlManipulation: routePuzzleUrls,
});
