import * as Sentry from "@sentry/browser";
import { wasmIntegration } from "@sentry/wasm";

if (import.meta.env.VITE_SENTRY_DSN) {
  const primitives = new Set(
    [
      "button",
      "wa-button",
      "wa-checkbox",
      "wa-dropdown-item",
      "wa-option",
      "wa-radio",
      "wa-slider",
    ].map((tagName) => tagName.toUpperCase()),
  );
  const describeElement = (el: Element) => {
    const parts = [el.tagName.toLowerCase()];
    if (el.id) {
      parts.push(`#${el.id}`);
    }
    parts.push(...Array.from(el.classList).map((cls) => `.${cls}`));
    for (const attr of ["data-command", "href", "label"]) {
      const value = el.getAttribute(attr);
      if (value) {
        parts.push(`[${attr}="${value}"]`);
      }
    }
    return parts.join("");
  };

  const integrations = [Sentry.browserTracingIntegration(), wasmIntegration()];
  if (import.meta.env.VITE_SENTRY_FILTER_APPLICATION_ID) {
    integrations.push(
      Sentry.thirdPartyErrorFilterIntegration({
        filterKeys: [import.meta.env.VITE_SENTRY_FILTER_APPLICATION_ID],
        // don't use "drop-if" here -- see beforeSend below.
        // (Also, Sentry likely identifies our wasm as third-party frames.)
        behaviour: "apply-tag-if-contains-third-party-frames",
      }),
    );
  }

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    sendDefaultPii: false,
    release: import.meta.env.VITE_GIT_SHA,
    transport: Sentry.makeBrowserOfflineTransport(Sentry.makeFetchTransport),
    integrations,
    ignoreErrors: [
      // Emscripten runtime aborted wasm load on navigation/refresh:
      /RuntimeError:\s*Aborted\s*\(NetworkError.*Build with -sASSERTIONS/i,
    ],
    beforeBreadcrumb(breadcrumb, hint) {
      try {
        // Skip breadcrumbs for fetch("data:...") URIs (like all of our icon images)
        if (
          breadcrumb.type === "http" &&
          typeof breadcrumb.data?.url === "string" &&
          breadcrumb.data.url.startsWith("data:")
        ) {
          return null;
        }
        // Replace ui.click message "body > top-component" with shadow path
        if (breadcrumb.category === "ui.click" && hint?.event instanceof Event) {
          const composedPathElements = hint.event
            .composedPath()
            .filter((el) => el instanceof Element)
            .reverse();
          const descriptions: string[] = [];
          for (const el of composedPathElements) {
            if (el.tagName === "SLOT") {
              continue;
            }
            const description = describeElement(el);
            if (primitives.has(el.tagName)) {
              // There is little value in digging into wa-button and similar
              // shadow DOMs. Just extract the text label (or icon button label).
              const label =
                el.textContent.trim().replace(/\s+/g, " ") ||
                el.querySelector("wa-icon[label]")?.getAttribute("label");
              if (label) {
                descriptions.push(`${description}{${label}}`);
                break;
              }
            }
            descriptions.push(description);
          }
          breadcrumb.message = descriptions.reverse().join(" < ");
        }
      } catch {}
      return breadcrumb;
    },
    beforeSend(event, hint) {
      // If thirdPartyErrorFilterIntegration identified third_party_code,
      // mark the original error instance for crash-dialog to ignore.
      if (event.tags?.third_party_code) {
        if (hint?.originalException instanceof Error) {
          // @ts-expect-error: TS2339: Adding custom property to Error object
          hint.originalException.__third_party_code__ = true;
        }
        // For drop-if-contains-third-party-frames, return null here.
      }
      return event;
    },
  });
}

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
