/**
 * Browser capabilities to check before letting the user into the site.
 * (We tend to develop with Baseline 2023 as the minimum.)
 */
const preflightChecks: {
  [feature: string]: boolean | (() => boolean) | (() => Promise<boolean>);
} = {
  "CSS.supports": typeof "CSS" !== "undefined" && "supports" in CSS, // ~2015; needed below
  ResizeObserver: typeof "ResizeObserver" !== "undefined", // Baseline 2020
  // TODO: top-level await (supported if modules are) -- Baseline 2021
  //   May not be relevant
  "Canvas.transferControlToOffscreen": // Baseline 2023
    "transferControlToOffscreen" in document.createElement("canvas"),
  // TODO: WorkerGlobalContext.requestAnimationFrame -- Baseline 2023
  //   Only real way to know is fire up a worker (with an async check).
  //   Is there any main thread functionality that likely released together?
  "CustomStateSet un-prefixed states": checkCustomStateSetUnprefixedStates,

  // CSS -- all Baseline 2023
  "CSS nested selectors": CSS.supports("selector(& .foo)"),
  "CSS container queries": CSS.supports("container-type", "size"),
};

function checkCustomStateSetUnprefixedStates() {
  // Baseline 2024?
  // Web Awesome seems to depend on un-prefixed custom states
  // (though tries to run with ElementInternals missing entirely).
  // Some earlier versions of Chrome *do* support CustomStateSet
  // but throw errors on custom states that aren't --prefixed.
  try {
    class TestElement extends HTMLElement {
      internals = this.attachInternals();
    }
    window.customElements.define("test-element", TestElement);

    const element = document.createElement("test-element") as TestElement;
    element.internals.states.add("unprefixed-token");
    return element.internals.states.has("unprefixed-token");
  } catch (error) {
    console.error(error);
    return false;
  }
}

/**
 * Runs preflight checks and returns list of failed features.
 * If runAll is false (the default), stops at first failed feature.
 */
export async function runPreflightChecks(runAll = false) {
  if (typeof Object.entries !== "function") {
    return ["Object.entries"]; // ~2017
  }

  // TODO: run async checks in parallel
  const failed: string[] = [];
  for (const [feature, check] of Object.entries(preflightChecks)) {
    let passed = false;
    try {
      passed = typeof check === "function" ? await check() : check;
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
