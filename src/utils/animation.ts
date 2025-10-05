/**
 * Applies a class to the specified element to animate it. Waits for all animations
 * triggered by the class to complete, then removes the class and resolves.
 *
 * If the element already has the class, the promise resolves immediately.
 * Handles multiple animations with different durations correctly.
 *
 * (Adapted from a similar function in webawesome/src/internal/animate.ts.)
 */
export function animateWithClass(element: Element, className: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (element.classList.contains(className)) {
      resolve();
      return;
    }

    const animationsBefore = new Set(
      element.getAnimations({ subtree: true }).map((anim) => anim.id),
    );
    element.classList.add(className);
    const newAnimations = element
      .getAnimations({ subtree: true })
      .filter((anim) => !animationsBefore.has(anim.id));

    if (newAnimations.length === 0) {
      element.classList.remove(className);
      resolve();
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;
    const cleanup = () => {
      element.classList.remove(className);
      controller.abort();
      resolve();
    };
    const checkCompletion = () => {
      const stillRunning = newAnimations.some(
        (anim) => anim.playState === "running" || anim.playState === "paused",
      );
      if (!stillRunning) {
        cleanup();
      }
    };

    element.addEventListener("animationend", checkCompletion, { signal });
    element.addEventListener("animationcancel", checkCompletion, { signal });
    checkCompletion();
  });
}
