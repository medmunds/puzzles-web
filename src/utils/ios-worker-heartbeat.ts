import { isIOS } from "./events.ts";

const HEARTBEAT_INTERVAL = 950;
const HEARTBEAT_MESSAGE = "ios-worker-heartbeat";

/**
 * Work around iOS Safari 1s intermittent worker communication delay.
 * Returns a disposer that should be called when terminating the worker.
 *
 * Starting in iOS 26.4.2, Safari seems to aggressively suspend our worker (after only
 * a few seconds of inactivity), then takes nearly a full second to wake it on the next
 * message ("macrotask queue"?). This is awful for interactivity.
 *
 * As a workaround, install a heartbeat that keeps the worker active whenever the page
 * is visible and the user is likely to be interacting with it. (This trades power
 * consumption for responsiveness.)
 */
export function installIOSWorkerHeartbeat(worker: Worker): () => void {
  if (!isIOS) {
    return () => {};
  }

  let intervalId: ReturnType<typeof setInterval> | undefined;

  const activate = () => {
    if (!intervalId) {
      intervalId = window.setInterval(() => {
        worker.postMessage(HEARTBEAT_MESSAGE);
      }, HEARTBEAT_INTERVAL);
    }
  };

  const deactivate = () => {
    if (intervalId) {
      window.clearInterval(intervalId);
      intervalId = undefined;
    }
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      activate();
    } else {
      deactivate();
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  handleVisibilityChange();
  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    deactivate();
  };
}
