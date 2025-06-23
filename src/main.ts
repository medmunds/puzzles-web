/// <reference types="vite-plugin-pwa/vanillajs" />
import { registerSW } from "virtual:pwa-register";
import { installErrorHandlers } from "./utils/errors.ts";
import { escapeHtml } from "./utils/html.ts";

installErrorHandlers();

// Register components (that are used here or directly by index.html)
import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import "./icons";
import "./app-router";

// Install PWA service worker (from vite-pwa)
export const updateSW: (reloadPage?: boolean) => Promise<void> = registerSW({
  onNeedRefresh() {
    // TODO: auto-update (preserving game state) when refresh needed
    console.log("App needs refresh");
    notify("An update is available");
  },
  onOfflineReady() {
    console.log("App is ready for offline use");
    notify("Ready for offline use");
  },
});

export async function notify(message: string) {
  // Create and toast an sl-alert with the message
  const alert = Object.assign(document.createElement("sl-alert"), {
    variant: "primary",
    closable: true,
    innerHTML: `
        <sl-icon name="info" slot="icon"></sl-icon>
        ${escapeHtml(message)}
      `,
  });
  document.body.append(alert);
  return alert.toast();
}
