// TODO: use separate tsconfig.json for worker.ts (without DOM)
/// <reference lib="webworker" />
declare var self: DedicatedWorkerGlobalScope;

import {
  type WorkerUnhandledErrorMessage,
  workerUnhandledErrorMessageType,
} from "./errors-shared.ts";

// Construct a WorkerUnhandledErrorMessage
const workerUnhandledErrorMessage = (
  message: string,
  error?: Error,
): WorkerUnhandledErrorMessage => ({
  type: workerUnhandledErrorMessageType,
  message,
  error,
});

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

  // Unhandled errors (but not promise rejections) already propagate
  // to the main thread's onerror, but not when using mobile emulated console.
  self.addEventListener("error", (event) => {
    try {
      const { message, filename, lineno, colno, error } = event;
      // (The message already starts with "Uncaught Error:".)
      const errorMessage = `${message}${
        filename ? ` at ${filename}:${lineno}:${colno}` : ""
      }`;
      self.postMessage(workerUnhandledErrorMessage(errorMessage, error));
    } catch (error) {
      console.error("Error in onerror handler", error);
    }
  });

  self.addEventListener("unhandledrejection", (event) => {
    try {
      const error = event.reason instanceof Error ? event.reason : undefined;
      const description = String(error?.stack ?? event.reason);
      const message = `Unhandled Promise Rejection in worker: ${description}`;
      self.postMessage(workerUnhandledErrorMessage(message, error));
    } catch (error) {
      console.error("Error in worker onunhandledrejection handler", error);
    }
  });
}
