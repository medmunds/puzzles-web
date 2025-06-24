/**
 * Returns a promise that resolves on the next animation frame.
 */
export const nextAnimationFrame = () =>
  new Promise((resolve) => requestAnimationFrame(resolve));

/**
 * Returns a promise that resolves after ms milliseconds.
 */
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Returns a function that collapses multiple calls to func during delayMs
 * into a single call occurring at the end of delayMs. Timing restarts on each
 * call, so periodic calls at slightly less than delayMs will result in func
 * never getting called.
 *
 * Delay is in milliseconds, and may be 0 to debounce only until the next tick.
 */
export const debounce = (func: () => void, delayMs: number): (() => void) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  return () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(), delayMs);
  };
};

/**
 * Similar to debounce(), but allows one call to func every delayMs milliseconds.
 */
export const throttle = (func: () => void, delayMs: number): (() => void) => {
  let lastRun = 0;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return () => {
    const now = Date.now();
    if (now - lastRun >= delayMs) {
      func();
      lastRun = now;
    } else if (!timeoutId) {
      timeoutId = setTimeout(
        () => {
          func();
          lastRun = Date.now();
          timeoutId = undefined;
        },
        delayMs - (now - lastRun),
      );
    }
  };
};
