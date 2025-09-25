// Last-resort error handling.

import {
  type WorkerUnhandledErrorMessage,
  workerUnhandledErrorMessageType,
} from "./errors-shared.ts";
import { escapeHtml } from "./html.ts";

// Register components
import "@awesome.me/webawesome/dist/components/callout/callout.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";

/**
 * Display a wa-callout toast with an error message.
 * Returned promise resolves when alert is dismissed.
 */
export async function notifyError(message: string): Promise<void> {
  // WebAwesome doesn't yet have toasts. Hack up a toast stack using wa-callout.
  let toastStack = document.getElementById("toasts");
  if (!toastStack) {
    toastStack = Object.assign(document.createElement("div"), {
      id: "toasts",
      style:
        "position: absolute; right: 0; bottom: 0; display: flex; flex-direction: column; gap: 1rem; padding: 1rem;",
    });
    document.body.append(toastStack);
  }

  return new Promise((resolve) => {
    const alert = Object.assign(document.createElement("wa-callout"), {
      variant: "danger",
      closable: true,
      innerHTML: `
        <wa-icon name="error" slot="icon"></wa-icon>
        ${escapeHtml(message).replace("\n", "<br>")}
      `,
    });
    alert.addEventListener(
      "click",
      () => {
        alert.remove();
        resolve();
      },
      { once: true },
    );
    toastStack.append(alert);
  });
}

/**
 * Install last-resort error handlers on the main thread.
 * These will report unhandled exceptions and promise rejections via wa-callout notifications.
 */
export function installErrorHandlers() {
  if (typeof window === "undefined") {
    throw new Error("installErrorHandlers must be called from the main thread");
  }

  // Catch otherwise unhandled JavaScript errors
  window.addEventListener("error", (event) => {
    try {
      const { message, filename, lineno, colno } = event;
      // (The message already starts with "Uncaught Error:".)
      const errorMessage = `${message}${
        filename ? ` at ${filename}:${lineno}:${colno}` : ""
      }`;
      void notifyError(errorMessage);
    } catch (error) {
      console.error("Error in onerror handler", error);
    }
  });

  // Catch unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    try {
      const description = String(
        event.reason instanceof Error && event.reason.stack
          ? event.reason.stack
          : event.reason,
      );
      const errorMessage = `Unhandled Promise Rejection: ${description}`;
      void notifyError(errorMessage);
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
    void notifyError(String(event.data.message));
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
