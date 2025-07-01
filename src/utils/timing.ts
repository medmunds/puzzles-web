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
export const debounce = <T extends (...args: unknown[]) => unknown>(
  func: T,
  delayMs: number,
): ((this: ThisParameterType<T>, ...args: Parameters<T>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    const later = () => {
      timeoutId = undefined;
      func.apply(this, args); // Apply with the captured context and arguments
    };
    clearTimeout(timeoutId);
    timeoutId = setTimeout(later, delayMs);
  };
};

/**
 * Method decorator version of debounce().
 */
export const debounced =
  (delayMs: number) =>
  (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => {
    descriptor.value = debounce(descriptor.value, delayMs);
    return descriptor;
  };

/**
 * Similar to debounce(), but allows one call to func every delayMs milliseconds.
 */
export const throttle = <T extends (...args: unknown[]) => unknown>(
  func: T,
  delayMs: number,
): ((this: ThisParameterType<T>, ...args: Parameters<T>) => void) => {
  let lastRun = 0;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    const now = Date.now();
    if (now - lastRun >= delayMs) {
      func.apply(this, args);
      lastRun = now;
    } else if (!timeoutId) {
      timeoutId = setTimeout(
        () => {
          func.apply(this, args);
          lastRun = Date.now();
          timeoutId = undefined;
        },
        delayMs - (now - lastRun),
      );
    }
  };
};

/**
 * Method decorator version of throttle().
 */
export const throttled =
  (delayMs: number) =>
  (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => {
    descriptor.value = throttle(descriptor.value, delayMs);
    return descriptor;
  };
