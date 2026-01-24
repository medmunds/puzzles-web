import * as Sentry from "@sentry/browser";
import { wasmIntegration } from "@sentry/wasm";

// This is a shorter version of the ignoreErrors list in crash-dialog.
// (Sentry ignores many errors by default. Also there are some where
// we don't want to show the crash-dialog but we *do* want Sentry capture.)
const ignoreErrors: (string | RegExp)[] = [
  // Emscripten runtime aborted wasm load on navigation/refresh:
  /RuntimeError:\s*Aborted\s*\(NetworkError.*Build with -sASSERTIONS/i,
  "Network error: Response body loading was aborted",
  // Chrome iOS "Translate" bug (in anonymous script):
  /^RangeError: Maximum call stack size exceeded.*at \?.*undefined:/,
];

export function initSentry() {
  if (import.meta.env.VITE_SENTRY_DSN) {
    const integrations = [wasmIntegration()];

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
      ignoreErrors,
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
            breadcrumb.message = describeEventComposedPath(hint.event);
          }
        } catch {}
        return breadcrumb;
      },
      beforeSend(event, hint) {
        // An error in wasm loaded from the worker will be incorrectly identified
        // as third-party: https://github.com/getsentry/sentry-javascript/issues/18779.
        // Undo that if any stack frame's filename is (roughly):
        //   /assets/[puzzleid]-[hash].wasm
        //   /src/assets/puzzles/[puzzleid].wasm  (dev)
        const reWasm = /\/(assets|src\/assets\/puzzles)\/[^/]+\.wasm/;
        if (
          event.tags?.third_party_code &&
          event.exception?.values?.some((exception) =>
            exception.stacktrace?.frames?.some(
              (frame) => frame.filename && reWasm.test(frame.filename),
            ),
          )
        ) {
          delete event.tags.third_party_code;
        }

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

    // Add some additional context (synchronously) to all events.
    Sentry.addEventProcessor((event, _hint) => {
      try {
        const root = document.documentElement;
        const rootStyle = getComputedStyle(root);
        const viewport = window.visualViewport;
        event.contexts = {
          ...event.contexts,
          Display: {
            "Window Size": `${window.innerWidth}x${window.innerHeight}`,
            "Document Size": `${root.clientWidth}x${root.clientHeight}`,
            "Visual Viewport": viewport
              ? `${viewport.width}x${viewport.height}`
              : "n/a",
            DPR: window.devicePixelRatio,
            "Dark Mode": window.matchMedia("(prefers-color-scheme: dark)").matches,
            "Touch Points": navigator.maxTouchPoints,
            "Root Font Size": rootStyle.fontSize,
            Direction: rootStyle.direction,
          },
        };
      } catch {}
      return event;
    });
  }
}

/**
 * Return a CSS-selector-ish description of the element,
 * including tag name, #id, .class.names, and [attr="value"]
 * for a handful of descriptive attributes.
 */
function describeElement(el: Element, skipClasses = false) {
  const parts = [el.tagName.toLowerCase()];
  if (el.id) {
    parts.push(`#${el.id}`);
  }
  if (!skipClasses) {
    parts.push(...Array.from(el.classList).map((cls) => `.${cls}`));
  }
  for (const attr of ["data-command", "href", "label"]) {
    const value = el.getAttribute(attr);
    if (value) {
      parts.push(`[${attr}="${value}"]`);
    }
  }
  return parts.join("");
}

// describeEventComposedPath won't dive into these elements
const primitiveElements = new Set(
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

/**
 * Return a '<' separated list of CSS-selector-ish descriptions of the elements
 * in event's composed path, starting with the innermost primitive element.
 */
function describeEventComposedPath(event: Event) {
  const composedPathElements = event
    .composedPath()
    .filter((el) => el instanceof Element)
    .reverse();
  const descriptions: string[] = [];
  for (const el of composedPathElements) {
    if (el.tagName === "SLOT") {
      continue;
    }
    // Skip class names for wa-button, which gets a *lot* of them in a wa-button-group.
    const description = describeElement(el, el.tagName === "WA-BUTTON");
    if (primitiveElements.has(el.tagName)) {
      // There is little value in digging into wa-button and similar
      // shadow DOMs. Just extract the text label (or icon button label).
      const label =
        el.textContent.trim().replace(/\s+/g, " ") ||
        el.querySelector("wa-icon[label]")?.getAttribute("label");
      if (label) {
        descriptions.push(`${description}{${label.slice(0, 20)}}`);
        break;
      }
    }
    descriptions.push(description);
  }
  return descriptions.reverse().join(" < ");
}
