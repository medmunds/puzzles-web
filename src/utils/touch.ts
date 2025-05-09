/*
 * Touch input utilities
 */

export interface DetectSecondaryButtonOptions {
  /**
   * Whether to detect long-press as the secondary button.
   */
  longPress?: boolean;

  /**
   * Whether to detect two-finger-tap as the secondary button. (Detection
   * occurs when the second finger is released; the first finger can remain
   * down for a right-drag.)
   */
  twoFingerTap?: boolean;

  /**
   * How long (in msec) to wait before deciding whether it's the secondary
   * button. This is both the minimum length of a long-press and the maximum
   * time between first and second fingers in a two-finger-tap.
   */
  timeout?: number;

  /**
   * If the finger moves further than this before timeout, it's _not_ the
   * secondary button. (CSS pixels, radius around the initial pointerdown.)
   */
  dragThreshold?: number;
}

export interface DetectSecondaryButtonResult {
  isSecondary: boolean;
  unhandledEvent?: PointerEvent;
}

/**
 * Detects emulated secondary (right-click) button on a touch device, using
 * either long-press, two-finger-tap, or both.
 *
 * May delay up to timeout msec. Note that browsers reuse event objects,
 * so the event should not be used after calling (since this is async).
 *
 * May also return a later PointerEvent that was received during the detection
 * process (e.g., the pointerup event for a short tap). This unhandledEvent
 * will have the same target as the initial event, but not necessarily the
 * same pointerId.
 */
export async function detectSecondaryButton(
  event: PointerEvent,
  {
    longPress = true,
    twoFingerTap = true,
    timeout = 350,
    dragThreshold = 8,
  }: DetectSecondaryButtonOptions,
): Promise<DetectSecondaryButtonResult> {
  if (!(longPress || twoFingerTap) || timeout <= 0 || event.pointerType !== "touch") {
    return { isSecondary: false };
  }
  if (
    event.type !== "pointerdown" ||
    !event.isPrimary ||
    !(event.target instanceof HTMLElement)
  ) {
    throw new TypeError(
      `Invalid initial event type=${event.type} isPrimary=${event.isPrimary}`,
    );
  }

  // Capture event properties we'll need later (since event may be reused)
  const { pointerId, pointerType, clientX, clientY, target } = event;

  return new Promise<DetectSecondaryButtonResult>((_resolve) => {
    const resolve = (result: DetectSecondaryButtonResult) => {
      clearTimeout(timeoutId);
      target.removeEventListener("pointermove", handleMove);
      target.removeEventListener("pointerup", handleUp);
      target.removeEventListener("pointercancel", handleCancel);
      _resolve(result);
    };

    const handleMove = (e: PointerEvent) => {
      if (e.pointerId === pointerId) {
        // Moved beyond radius dragThreshold?
        const dx = e.clientX - clientX;
        const dy = e.clientY - clientY;
        if (dx * dx + dy * dy > dragThreshold * dragThreshold) {
          resolve({ isSecondary: false, unhandledEvent: e }); // drag
        }
      }
    };

    const handleUp = (e: PointerEvent) => {
      if (e.pointerId === pointerId) {
        resolve({ isSecondary: false, unhandledEvent: e }); // single-finger-tap
      } else if (twoFingerTap && e.pointerType === pointerType) {
        resolve({ isSecondary: true, unhandledEvent: e });
      }
    };

    const handleCancel = (e: PointerEvent) => {
      if (e.pointerId === pointerId) {
        resolve({ isSecondary: false, unhandledEvent: e });
      }
    };

    target.addEventListener("pointermove", handleMove, { passive: true });
    target.addEventListener("pointerup", handleUp);
    target.addEventListener("pointercancel", handleCancel);

    const timeoutId = window.setTimeout(() => {
      resolve({ isSecondary: longPress });
    }, timeout);
  });
}
