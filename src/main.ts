/// <reference types="vite-plugin-pwa/vanillajs" />
import { registerSW } from "virtual:pwa-register";
import { installErrorHandlers } from "./utils/errors.ts";
import { escapeHtml } from "./utils/html.ts";

if (new URL(window.location.href).searchParams.has("console")) {
  // Inject an in-document emulated console
  // const src = "https://cdn.jsdelivr.net/npm/eruda@3.4.3"; // too heavy for mobile
  const version = "51239dd85ea707bd06159024a8ad64028d0862f6"; // 2.0.7
  const src = `https://cdn.jsdelivr.net/gh/c-kick/mobileConsole@${version}/hnl.mobileconsole.min.js`;
  const script = Object.assign(document.createElement("script"), { src });
  await new Promise((resolve) => {
    script.onload = resolve;
    document.head.appendChild(script);
  });
  if (src.indexOf("eruda") !== -1) {
    // @ts-ignore
    window.eruda?.init();
  } else {
    // mobileConsole treats assert(assertion, ...) as a log level
    console.assert = (assertion?: boolean, ...data: unknown[]) => {
      if (!assertion) {
        console.error("assert failed", ...data);
      }
    };
  }
} else {
  installErrorHandlers();
}

// Register components (that are used here or directly by index.html)
import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import "./icons";
import "./app-router";

// Install PWA service worker (from vite-pwa)
const updateSW = registerSW({
  onNeedRefresh() {
    // TODO: auto-update (preserving game state) when refresh needed
    console.log("App needs refresh");
    notify("Update is available; dismiss to install and reload").then(() =>
      updateSW(/* reloadPage= */ true),
    );
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
