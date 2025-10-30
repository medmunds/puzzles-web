import { runPreflightChecksOrRedirect } from "./preflight.ts";

// @ts-expect-error:TS6133 (usage commented out below)
let _preflightChecksPassed = false;
runPreflightChecksOrRedirect(true)
  .then((result) => {
    _preflightChecksPassed = result;
  })
  .catch((error) => {
    // Preflight checks should handle all their own errors
    Sentry.captureException(error);
    _preflightChecksPassed = false;
  });

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
    // Not applying this filtering yet:
    // it can prevent startup error reporting in supported browsers, too
    // beforeSend(event) {
    //   // Don't report errors from unsupported browsers
    //   return _preflightChecksPassed ? event : null;
    // },
  });
}

import { installErrorHandlers } from "./utils/errors.ts";

installErrorHandlers();

// Install our icon library
import "./icons";

// Install PWA service worker
import { pwaManager } from "./utils/pwa.ts";

if (document.readyState === "complete") {
  await pwaManager.initialize();
} else {
  window.addEventListener("load", async () => {
    await pwaManager.initialize();
  });
}
