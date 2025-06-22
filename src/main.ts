/// <reference types="vite-plugin-pwa/vanillajs" />
import { registerSW } from "virtual:pwa-register";
import type SlAlert from "@shoelace-style/shoelace/dist/components/alert/alert.js";
import { escapeHtml } from "./utils/html.ts";

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

export async function notify(
  message: string,
  variant: SlAlert["variant"] = "primary",
  icon?: string,
): Promise<void> {
  // Create and toast an sl-alert with the message
  const iconName = icon ?? `alert-${variant}`;
  const alert = Object.assign(document.createElement("sl-alert"), {
    variant,
    closable: true,
    innerHTML: `
        <sl-icon name=${iconName} slot="icon"></sl-icon>
        ${escapeHtml(message)}
      `,
  });
  document.body.append(alert);
  return alert.toast();
}

// Catch otherwise unhandled JavaScript errors
window.onerror = (message, source, lineno, colno, _error) => {
  const errorMessage = `Unhandled Error: ${message}${
    source ? ` at ${source}:${lineno}:${colno}` : ""
  }`;

  notify(errorMessage, "danger");
};

// Catch unhandled promise rejections
window.addEventListener("unhandledrejection", (event) => {
  const reason =
    event.reason instanceof Error ? event.reason.message : String(event.reason);
  const errorMessage = `Unhandled Promise Rejection: ${reason}`;
  notify(errorMessage, "danger");
});
