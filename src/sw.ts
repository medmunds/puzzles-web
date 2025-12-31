/// <reference lib="webworker" />
import type { WorkboxPlugin } from "workbox-core";
import {
  addPlugins,
  cleanupOutdatedCaches,
  precacheAndRoute,
} from "workbox-precaching";

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
});
