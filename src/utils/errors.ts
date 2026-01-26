// Last-resort error handling.

import { reportError } from "../crash-dialog.ts";
import {
  type WorkerUnhandledErrorMessage,
  workerUnhandledErrorMessageType,
} from "./errors-shared.ts";

/**
 * Install last-resort error handlers on the main thread.
 * These will report unhandled exceptions and promise rejections.
 */
export function installErrorHandlers() {
  if (typeof window === "undefined") {
    throw new Error("installErrorHandlers must be called from the main thread");
  }

  // Catch otherwise unhandled JavaScript errors
  window.addEventListener("error", (event) => {
    try {
      const { message, filename, lineno, colno, error } = event;
      // (The message already starts with "Uncaught Error:".)
      const errorMessage = `${message}${
        filename ? ` at ${filename}:${lineno}:${colno}` : ""
      }`;
      void reportError(errorMessage, error);
    } catch (error) {
      console.error("Error in onerror handler", error);
    }
  });

  // Catch unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    try {
      const error = event.reason instanceof Error ? event.reason : undefined;
      const errorMessage = [
        `${String(event.reason).trim()} [unhandled rejection]`,
        // Chrome includes the error message in the stack, others don't:
        (error?.stack || "")
          .replace(String(error), "")
          .trim(),
      ]
        .filter(Boolean)
        .join("\n");
      void reportError(errorMessage, error);
    } catch (error) {
      console.error("Error in onunhandledrejection handler", error);
    }
  });
}

//
// Worker unhandled errors
//

const isWorkerUnhandledErrorMessage = (
  event: MessageEvent<unknown>,
): event is MessageEvent<WorkerUnhandledErrorMessage> =>
  typeof event.data === "object" &&
  event.data !== null &&
  "type" in event.data &&
  event.data.type === workerUnhandledErrorMessageType;

const handleWorkerMessage = (event: MessageEvent<unknown>) => {
  if (isWorkerUnhandledErrorMessage(event)) {
    console.error(event.data.message, event.data.error);
    void reportError(event.data.message, event.data.error);
  }
};

/**
 * Counterpart to installErrorHandlersInWorker(). Listens for unhandled
 * errors coming from the worker and notifies about them.
 */
export function installWorkerErrorReceivers(worker: Worker) {
  if (typeof window === "undefined") {
    // handleWorkerMessage assumes it's in the main thread so can post UI.
    // (If needed, we could create a "forwarding" handler for workers-of-workers.)
    throw new Error("installWorkerErrorReceivers must be called from main thread");
  }

  worker.addEventListener("message", handleWorkerMessage);
}

/**
 * Remove any listeners added by installWorkerErrorReceivers().
 */
export function uninstallWorkerErrorReceivers(worker: Worker) {
  worker.removeEventListener("message", handleWorkerMessage);
}
