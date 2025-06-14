/**
 * Returns a promise that resolves when element's size has remained stable
 * for at least stabilityMs milliseconds (default 50). Useful for waiting
 * to restore scroll position until the element and its descendants
 * have fully rendered.
 *
 * If size has not stabilized by timeoutMs (default 10 * stabilityMs), resolves
 * anyway to prevent hanging. Set timeoutMs to 0 to wait as long as necessary.
 */
export const waitForStableSize = (
  element: HTMLElement,
  options: { stabilityMs?: number; timeoutMs?: number } = {},
): Promise<void> =>
  new Promise((resolve) => {
    const { stabilityMs = 50 } = options;
    const { timeoutMs = 10 * stabilityMs } = options;
    let stabilityTimerId: number;

    const done = () => {
      clearTimeout(stabilityTimerId);
      if (timeoutTimerId !== null) {
        clearTimeout(timeoutTimerId);
      }
      observer.disconnect();
      resolve();
    };

    const timeoutTimerId = timeoutMs > 0 ? setTimeout(done, timeoutMs) : null;

    const observer = new ResizeObserver(() => {
      clearTimeout(stabilityTimerId);
      stabilityTimerId = setTimeout(done, stabilityMs);
    });

    observer.observe(element);
  });
