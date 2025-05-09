/**
 * Check browser capabilities we need. If any aren't available, redirect
 * to the "unsupported" page with details. This avoids the user getting ugly
 * error messages or subtly broken behavior in the middle of a game.
 *
 * To use, include this head block in each entry page:
 *
 *   <script nomodule>
 *     window.location.href = "/unsupported.html?f=script%20type%3D%22module%22";
 *   </script>
 *   <script type="module" src="%VITE_PREFLIGHT_CHECK%"></script>
 *   <script type="module" src="/src/<page-main>.ts"></script>
 *
 * The preflight script must be loaded separately from the main bundle to ensure
 * it gets a chance to run. (In older browsers, any newer syntax used in the
 * main bundle could cause parsing errors that block that entire script.) The
 * %VITE_PREFLIGHT_CHECK% is replaced in vite.config.ts with this module in dev,
 * and a bundled version of this module from /public/preflight at build time.
 *
 * This module must use only conservative es2017 syntax supported by the
 * earliest browsers that implemented `<script type="module">`. (So can't use
 * top-level await, dynamic import(), import.meta, etc. But it's OK to use
 * syntax TypeScript will convert or erase, like `??` or `as const`. And it's
 * OK to use import.meta.env.… which vite statically replaces during bundling.)
 */

const runAllChecks = false; // false means redirect on first detected problem

//
// Capability checks
// We generally expect Baseline 2023 and don't use polyfills
//

const preflightChecks: {
  // Checks return true for passed, return false or throw for failed
  [feature: string]: () => boolean;
} = {
  // We at least have <script type=module> (~2017) if this code is running.
  "CSS.supports": () => typeof CSS.supports === "function", // ~2017
  ResizeObserver: () => typeof ResizeObserver === "function", // Baseline 2020
  "Canvas.transferControlToOffscreen": // Baseline 2023
    () => "transferControlToOffscreen" in document.createElement("canvas"),
  "Custom elements": () => "customElements" in window, // ~2019
  "TextMetrics.actualBoundingBox": checkTextMetricsActualBoundingBox, // Baseline 2020
  "Array.at": () => typeof Array.prototype.at === "function", // es2022
  "Array.flat": () => typeof Array.prototype.flat === "function", // es2019
  "Array.flatMap": () => typeof Array.prototype.flatMap === "function", // es2019
  "Object.assign": () => typeof Object.assign === "function", // es2015
  // Object.entries (es2017) is checked manually in runPreflightChecks
  "Object.hasOwn": () => typeof Object.hasOwn === "function", // es2022
  "String.includes": () => typeof String.prototype.includes === "function", // es2016
  "DateTimeFormat.dateStyle": () =>
    Boolean(
      new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }),
    ), // throws if not supported -- ~2020

  // CSS -- mostly Baseline 2023
  "CSS nested selectors": () => CSS.supports("selector(& .foo)"),
  "CSS container queries": () => CSS.supports("container-type", "size"),
} as const;

const asyncPreflightChecks: {
  // async checks can indicate pass/fail either by returning true/false
  // or by throwing for fail, returning nothing for pass
  // biome-ignore lint/suspicious/noConfusingVoidType: try `() => Promise.reject()`
  [feature: string]: () => Promise<boolean | void>;
} = {
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
async function runPreflightChecks(runAll = false): Promise<string[]> {
  // First check some things we need to run the checks below
  if (typeof Object.entries !== "function") {
    return ["Object.entries"]; // es2017
  }
  if (typeof Promise !== "function") {
    return ["Promise"];
  }
  if (typeof Promise.allSettled !== "function") {
    return ["Promise.allSettled"];
  }

  const failed: string[] = [];
  for (const [feature, check] of Object.entries(preflightChecks)) {
    let passed: boolean | Promise<void>;
    try {
      passed = check();
    } catch (_error) {
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
      } else if (result.status === "rejected") {
        // This should have been converted to resolve(feature) by the logic above
        console.error(
          `Unprocessed rejection in preflight asyncResults: ${result.reason} `,
        );
      }
    }
  }

  return failed;
}

//
// On module load, run the checks and redirect if any fail
//
runPreflightChecks(runAllChecks)
  .then((failed) => {
    if (failed.length > 0) {
      // unsupported.html shows all `f` params
      const failureUrl = new URL("unsupported", window.location.href);
      for (const feature of failed) {
        failureUrl.searchParams.append("f", feature);
      }
      console.error(failed);
      window.location.href = failureUrl.href;
    }
  })
  .catch((error) => {
    // This shouldn't happen: runPreflightChecks should catch all errors.
    console.error(`Error in runPreflightChecks: ${error}`);
  });
