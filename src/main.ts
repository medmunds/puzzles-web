/// <reference types="vite-plugin-pwa/vanillajs" />
import { registerSW } from "virtual:pwa-register";
import { registerIconLibrary } from "@shoelace-style/shoelace/dist/utilities/icon-library.js";

// Register components (that are used directly by index.html)
import "./app-router";

// Register Lucide icons for use by Shoelace
// TODO: bundle necessary icons (this is just for easier development)
//   - also remove vite config VitePWA.workbox.runtimeCaching entry
//   - also remove index.html dns-prefetch and preconnect
registerIconLibrary("default", {
  resolver: (name) =>
    `https://cdn.jsdelivr.net/npm/lucide-static@0.511.0/icons/${name}.svg`,
});

// Install PWA service worker (from vite-pwa)
export const updateSW: (reloadPage?: boolean) => Promise<void> = registerSW({
  onNeedRefresh() {
    // TODO: auto-update (preserving game state) when refresh needed
    console.log("App needs refresh");
  },
  onOfflineReady() {
    console.log("App is ready for offline use");
  },
});
