import * as Sentry from "@sentry/browser";
import { wasmIntegration } from "@sentry/wasm";

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    sendDefaultPii: false,
    release: import.meta.env.VITE_GIT_SHA,
    transport: Sentry.makeBrowserOfflineTransport(Sentry.makeFetchTransport),
    integrations: [Sentry.browserTracingIntegration(), wasmIntegration()],
    beforeBreadcrumb(breadcrumb, _hint) {
      // Skip breadcrumbs for fetch("data:...") URIs (like all of our icon images)
      if (
        breadcrumb.type === "http" &&
        typeof breadcrumb.data?.url === "string" &&
        breadcrumb.data.url.startsWith("data:")
      ) {
        return null;
      }
      return breadcrumb;
    },
  });
}

import { installErrorHandlers } from "./utils/errors.ts";

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
    // @ts-expect-error
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

import { installWebAwesomeHacks } from "./utils/webawesomehacks.ts";

installWebAwesomeHacks();

// Register components (that are used here or directly by index.html)
import "./icons";
import "./app-router";

// Install PWA service worker
import { pwaManager } from "./utils/pwa.ts";

pwaManager.registerSW();
