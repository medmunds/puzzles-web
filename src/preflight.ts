/**
 * Browser capabilities to check before letting the user into the site.
 * (We generally expect Baseline 2023 and don't use polyfills.)
 */
const preflightChecks: {
  // Checks return true for passed, false for failed
  [feature: string]: () => boolean;
} = {
  "CSS.supports": () => typeof CSS.supports === "function",
  ResizeObserver: () => typeof "ResizeObserver" !== "undefined", // Baseline 2020
  "Canvas.transferControlToOffscreen": // Baseline 2023
    () => "transferControlToOffscreen" in document.createElement("canvas"),
  "Custom elements": () => "customElements" in window,
  "TextMetrics.actualBoundingBox": checkTextMetricsActualBoundingBox,
  "Object.assign": () => typeof Object.assign === "function", // es2015
  "Object.hasOwn": () => typeof Object.hasOwn === "function", // es2022

  // CSS -- mostly Baseline 2023
  "CSS nested selectors": () => CSS.supports("selector(& .foo)"),
  "CSS container queries": () => CSS.supports("container-type", "size"),
  // @property syntax - baseline 2024 - can't yet test with CSS.supports:
  //   "CSS @property syntax": () => CSS.supports("at-rule(@property)"),
  // Look for registerProperty added at same time:
  "CSS @property syntax": () => typeof CSS.registerProperty === "function",
} as const;

const asyncPreflightChecks: {
  // async checks can indicate pass/fail either by returning true/false
  // or by throwing for fail, returning nothing for pass
  // biome-ignore lint/suspicious/noConfusingVoidType: try `() => Promise.reject()`
  [feature: string]: () => Promise<boolean | void>;
} = {
  // TODO: top-level await (supported if modules are) -- Baseline 2021
  //   May not be relevant
  // TODO: WorkerGlobalContext.requestAnimationFrame -- Baseline 2023
  //   Only real way to know is fire up a worker (with an async check).
  //   Is there any main thread functionality that likely released together?
} as const;

function checkTextMetricsActualBoundingBox() {
  // Baseline 2020
  // If this is a performance problem, could instead check prototype
  // (works in all major browsers):
  //   typeof TextMetrics !== "undefined"
  //   && "actualBoundingBoxAscent" in TextMetrics.prototype
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return false;
  }
  const metrics = ctx.measureText("0");
  return "actualBoundingBoxAscent" in metrics && "actualBoundingBoxDescent" in metrics;
}

/**
 * Runs preflight checks and returns list of failed features.
 * If runAll is false (the default), stops at first failed feature.
 */
export async function runPreflightChecks(runAll = false) {
  if (typeof Object.entries !== "function") {
    return ["Object.entries"]; // ~2017
  }
  if (typeof Promise !== "function") {
    return ["Promise"];
  }

  const failed: string[] = [];
  for (const [feature, check] of Object.entries(preflightChecks)) {
    let passed: boolean | Promise<void>;
    try {
      passed = check();
    } catch {
      passed = false;
    }
    if (!passed) {
      failed.push(feature);
      if (!runAll) {
        break;
      }
    }
  }

  if (runAll || failed.length === 0) {
    // Run async checks concurrently (even when not runAll).
    // Resolve each to `undefined` for passed, feature name for failed.
    const asyncResults = await Promise.allSettled(
      Object.entries(asyncPreflightChecks).map(
        ([feature, check]) =>
          new Promise<string | undefined>(
            (resolve) =>
              check()
                .then(
                  (result) =>
                    result || result === undefined
                      ? resolve(undefined) // passed (returned true or nothing)
                      : resolve(feature), // failed (returned false)
                )
                .catch(() => resolve(feature)), // failed (rejected)
          ),
      ),
    );
    for (const result of asyncResults) {
      if (result.status === "fulfilled" && result.value) {
        failed.push(result.value);
        if (!runAll) {
          break;
        }
      } else if (!import.meta.env.PROD && result.status === "rejected") {
        // This should have been converted to resolve(feature) by the logic above
        throw new Error(
          `Unprocessed rejection in preflight asyncResults: ${result.reason} `,
        );
      }
    }
  }

  return failed;
}

/**
 * Resolves true if all preflight checks passed,
 * otherwise resolves false and redirects to unsupported page with details
 */
export async function runPreflightChecksOrRedirect(runAll = false) {
  const failed = await runPreflightChecks(runAll);
  if (failed.length > 0) {
    // unsupported.html shows all `f` params
    const failureUrl = new URL("unsupported", window.location.href);
    for (const feature of failed) {
      failureUrl.searchParams.append("f", feature);
    }
    console.error(failed);
    window.location.href = failureUrl.href;
  }
  return failed.length === 0;
}
