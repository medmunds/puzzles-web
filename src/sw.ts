/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  PrecacheController,
  type PrecacheEntry,
  PrecacheRoute,
  type urlManipulation,
} from "workbox-precaching";
import { registerRoute } from "workbox-routing/registerRoute";
import { puzzleIds } from "./assets/puzzles/catalog.json";

declare let self: ServiceWorkerGlobalScope;

//
// Message handlers
//

self.addEventListener("message", (event) => {
  switch (event.data?.type) {
    case "SKIP_WAITING":
      event.waitUntil(self.skipWaiting());
      break;
    case "INSTALL_OFFLINE":
      event.waitUntil(installOffline(event, event.ports[0]));
      break;
    case "CHECK_INSTALLED_OFFLINE":
      event.waitUntil(checkInstalledOffline(event, event.ports[0]));
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

// workbox-precache provides automatic revision management.
// Split the precache manifest into two sets: core assets that are always precached,
// and the remainder which are needed for fully offline use. These otherAssets are
// cached on demand in response to a client INSTALL_OFFLINE request.
// The code below is roughly equivalent to:
//   precacheAndRoute(await getOfflineFlag() ? allAssets : coreAssets);
// but made safe for service worker usage.

cleanupOutdatedCaches();

// Exclude *.wasm and help/** from default precache
const isCoreAsset = (url: string) =>
  !(url.endsWith(".wasm") || url.startsWith("help/"));

const allAssets = self.__WB_MANIFEST as PrecacheEntry[];
const coreAssets = allAssets.filter(({ url }) => isCoreAsset(url));
const otherAssets = allAssets.filter(({ url }) => !isCoreAsset(url));

const precacheController = new PrecacheController();
const precacheRoute = new PrecacheRoute(precacheController, {
  // All URL parameters are handled locally
  ignoreURLParametersMatching: [/.*/],
  urlManipulation: routePuzzleUrls,
});
registerRoute(precacheRoute);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const wantsOfflineInstall = await getOfflineFlag();
      precacheController.addToCacheList(wantsOfflineInstall ? allAssets : coreAssets);
      await precacheController.install(event);
    })(),
  );
});

self.addEventListener("activate", precacheController.activate);

// Add all lazy assets to the precache and record offline status.
// Posts { success?: boolean, error?: Error } to response port if provided.
async function installOffline(event: ExtendableEvent, port?: MessagePort) {
  try {
    precacheController.addToCacheList(otherAssets);
    await setOfflineFlag(true);

    if (self.serviceWorker && self.serviceWorker.state !== "activated") {
      // installOffline should only be called via the INSTALL_OFFLINE message
      // from the client, which should only be sending it to the active worker.
      // (Firefox doesn't implement ServiceWorkerGlobalScope.serviceWorker.)
      console.warn(`installOffline called on ${self.serviceWorker.state} worker`);
    }

    // Re-run PrecacheController.install() to cache otherAssets.
    // This is ugly: PrecacheStrategy._handle() only caches when event.type is "install".
    // We can trick it with a constructed event, but must provide a real waitUntil():
    const syntheticInstallEvent = Object.assign(new ExtendableEvent("install"), {
      waitUntil: event.waitUntil.bind(event),
    });
    const { updatedURLs } = await precacheController.install(syntheticInstallEvent);
    console.log(`installOffline: cached ${updatedURLs?.length} lazy assets`);

    // (There's no need to re-run PrecacheController.activate(). *All* revisions
    // of lazy assets will have already been purged during the initial activate.)

    port?.postMessage({ success: true });
  } catch (error) {
    console.error(error);
    port?.postMessage({ success: false, error });
  }
}

// Return true if offline flag is set and allAssets are cached.
// Posts { wantsOfflineInstall: boolean, isInstalledOffline: boolean }
// to response port if provided.
async function checkInstalledOffline(_event: ExtendableEvent, port?: MessagePort) {
  let isInstalledOffline = false;
  const wantsOfflineInstall = await getOfflineFlag();
  if (wantsOfflineInstall) {
    // Verify assets are actually cached
    const cache = await caches.open(precacheController.strategy.cacheName);
    const cachedRequests = await cache.keys();
    const cachedUrls = new Set(cachedRequests.map(({ url }) => url));

    isInstalledOffline = allAssets.every(({ url }) => {
      const key = precacheController.getCacheKeyForURL(url);
      if (!key) {
        // This shouldn't happen
        console.warn(`checkInstalledOffline: no cache key for ${url}`);
        return false;
      }
      if (!cachedUrls.has(key)) {
        console.log(`checkInstalledOffline: cache missing ${url}`);
        return false;
      }
      return true;
    });
  }
  port?.postMessage({ wantsOfflineInstall, isInstalledOffline });
  return isInstalledOffline;
}

//
// Persistent options in IndexedDB
// (We'd like to use Dexie, but it quadruples the gzipped sw size.)
//

const DB_NAME = "PuzzleAppSWState";
const STORE_NAME = "flags";
const OFFLINE_FLAG_KEY = "isInstalledOffline";

async function getOfflineFlag(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(OFFLINE_FLAG_KEY);
      getRequest.onsuccess = () => resolve(getRequest.result ?? false);
      getRequest.onerror = () => reject(getRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
}

async function setOfflineFlag(value: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const putRequest = store.put(value, OFFLINE_FLAG_KEY);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
}
