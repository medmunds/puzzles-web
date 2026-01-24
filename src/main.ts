import { initSentry } from "./utils/sentry.ts";

initSentry();

import { patchLitForExternalDomManipulation } from "./utils/lit.ts";

patchLitForExternalDomManipulation();

import { installErrorHandlers } from "./utils/errors.ts";

installErrorHandlers();

// Install our icon library
import "./icons";

// Install PWA service worker
import { pwaManager } from "./utils/pwa.ts";

if (document.readyState === "complete") {
  void pwaManager.initialize();
} else {
  window.addEventListener("load", async () => {
    await pwaManager.initialize();
  });
}

// Use user's preferred color scheme
import { initializeColorScheme } from "./color-scheme.ts";

void initializeColorScheme();
