// Last-resort error handling.
import { escapeHtml } from "./html.ts";

/**
 * Display an sl-alert toast with an error message.
 * Returned promise resolves when alert is dismissed.
 */
export async function notifyError(message: string): Promise<void> {
  const alert = Object.assign(document.createElement("sl-alert"), {
    variant: "danger",
    closable: true,
    innerHTML: `
      <sl-icon name="error" slot="icon"></sl-icon>
      ${escapeHtml(message).replace("\n", "<br>")}
    `,
  });
  document.body.append(alert);
  return alert.toast();
}

/**
 * Install last-resort error handlers on the main thread.
 * These will report unhandled exceptions and promise rejections via sl-alert notifications.
 */
export function installErrorHandlers() {
  if (typeof window === "undefined") {
    throw new Error("installErrorHandlers must be called from the main thread");
  }

  // Catch otherwise unhandled JavaScript errors
  window.onerror = (message, filename, lineno, colno, _error) => {
    try {
      // (The message already starts with "Uncaught Error:".)
      const errorMessage = `${message}${
        filename ? ` at ${filename}:${lineno}:${colno}` : ""
      }`;
      notifyError(errorMessage);
    } catch (error) {
      console.error("Error in onerror handler", error);
    }
  };

  // Catch unhandled promise rejections
  window.onunhandledrejection = (event) => {
    try {
      const description = String(
        event.reason instanceof Error && event.reason.stack
          ? event.reason.stack
          : event.reason,
      );
      const errorMessage = `Unhandled Promise Rejection: ${description}`;
      notifyError(errorMessage);
    } catch (error) {
      console.error("Error in onunhandledrejection handler", error);
    }
  };
}

//
// Worker unhandled errors
//

const workerUnhandledErrorMessageType = "worker-unhandlederror";
interface WorkerUnhandledErrorMessage {
  type: typeof workerUnhandledErrorMessageType;
  errorMessage: string;
}

// Construct a WorkerUnhandledErrorMessage
const workerUnhandledErrorMessage = (
  errorMessage: string,
): WorkerUnhandledErrorMessage => ({
  type: workerUnhandledErrorMessageType,
  errorMessage,
});

const isWorkerUnhandledErrorMessage = (
  event: MessageEvent<unknown>,
): event is MessageEvent<WorkerUnhandledErrorMessage> =>
  typeof event.data === "object" &&
  event.data !== null &&
  "type" in event.data &&
  event.data.type === workerUnhandledErrorMessageType;

const handleWorkerMessage = (event: MessageEvent<unknown>) => {
  if (isWorkerUnhandledErrorMessage(event)) {
    notifyError(String(event.data.errorMessage));
  }
};

/**
 * Install last-resort error handlers in a worker thread.
 * These will report unhandled promise rejections to the main thread.
 * (You must call installWorkerErrorReceivers(worker)
 * in the main thread to receive them.)
 */
export function installErrorHandlersInWorker() {
  if (typeof window !== "undefined") {
    throw new Error("installErrorHandlersInWorker must be called from a worker");
  }

  // Unhandled errors (but not promise rejections) already propagate to the main,
  // so this is unnecessary:
  //   self.onerror = (...) => { self.postMessage(...); }

  self.onunhandledrejection = (event) => {
    try {
      const description = String(
        event.reason instanceof Error && event.reason.stack
          ? event.reason.stack
          : event.reason,
      );
      const errorMessage = `Unhandled Promise Rejection in worker: ${description}`;
      self.postMessage(workerUnhandledErrorMessage(errorMessage));
    } catch (error) {
      console.error("Error in worker onunhandledrejection handler", error);
    }
  };
}

/**
 * Counterpart to installErrorHandlersInWorker(). Listens for unhandled
 * errors in the worker and notifies about them.
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
