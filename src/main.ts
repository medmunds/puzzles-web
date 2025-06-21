/// <reference types="vite-plugin-pwa/vanillajs" />
import { registerSW } from "virtual:pwa-register";

// Register components (that are used directly by index.html)
import "./icons";
import "./app-router";

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
