import * as Sentry from "@sentry/browser";

/**
 * Try to work around a Safari IndexedDB bug where the connection to the IDB
 * server is lost after restoring the page from the bfcache. Dexie attempts to
 * reopen the DB three times, then throws a specific DatabaseClosedError.
 * Reloading the page (as suggested in the error message) can solve the problem.
 *
 * See discussion in https://github.com/dexie/Dexie.js/issues/2008.
 * Bug: https://bugs.webkit.org/show_bug.cgi?id=277615.
 * Fix may be available soon: https://bugs.webkit.org/show_bug.cgi?id=309386.
 */
export function installSafariIDBWorkaround() {
  window.addEventListener(
    "unhandledrejection",
    (event: PromiseRejectionEvent) => {
      const error = event.reason;
      if (
        error instanceof Error &&
        error.name === "DatabaseClosedError" &&
        error.message.includes("Refresh the page to try again") &&
        shouldTryToReloadPage()
      ) {
        // Block crash-dialog.
        event.stopImmediatePropagation();
        event.preventDefault();

        console.warn("Trying to resolve DatabaseClosedError by reloading page");
        if (import.meta.env.VITE_SENTRY_DSN) {
          // (Sentry has already recorded the console.warn as a breadcrumb.)
          Sentry.captureException(error);
        }

        window.location.reload();
      }
    },
    // Run in capture phase, before Sentry or crash-dialog error handling,
    // so stopImmediatePropagation can block the crash dialog.
    { capture: true },
  );
}

const RELOAD_TRACKING_KEY = "idb-page-reload-attempted";
const RELOAD_COOLDOWN_MS = 10_000;

/**
 * Returns true if we should try to reload the page in response to the Safari
 * IndexedDB bug.
 *
 * Checks:
 * - If sessionStorage is available (otherwise we can't keep track of attempts,
 *   so allow the crash dialog to show instead).
 * - If we've already tried a reload in the past 5 seconds (to avoid loops).
 *
 * If a reload should be attempted, also records the current time in sessionStorage
 * to enable checking future attempts.
 */
function shouldTryToReloadPage() {
  // This function must not be async.
  let lastAttemptStr = null;
  try {
    lastAttemptStr = sessionStorage.getItem(RELOAD_TRACKING_KEY);
  } catch {
    // Can't use session storage to track attempts, so don't try to reload.
    return false;
  }

  const now = Date.now();
  let lastAttempt = lastAttemptStr !== null ? Number.parseInt(lastAttemptStr, 10) : 0;
  if (Number.isNaN(lastAttempt)) {
    lastAttempt = 0;
  }

  const shouldReload = now - lastAttempt > RELOAD_COOLDOWN_MS;
  if (shouldReload) {
    try {
      sessionStorage.setItem(RELOAD_TRACKING_KEY, now.toString());
    } catch {
      return false;
    }
  }
  return shouldReload;
}
