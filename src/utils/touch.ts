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
  holdTime?: number;

  /**
   * If the finger moves further than this before holdTime, it's _not_ the
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
 * May delay up to twice holdTime. Note that browsers reuse event objects,
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
    holdTime = 350,
    dragThreshold = 8,
  }: DetectSecondaryButtonOptions,
): Promise<DetectSecondaryButtonResult> {
  if (!(longPress || twoFingerTap) || holdTime <= 0 || event.pointerType !== "touch") {
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
    // Event properties for a second tap
    let pointerId2: number | null = null;
    let clientX2 = 0;
    let clientY2 = 0;

    const resolve = (result: DetectSecondaryButtonResult) => {
      clearTimeout(timeoutId);
      target.removeEventListener("pointermove", handleMove);
      target.removeEventListener("pointerup", handleUp);
      target.removeEventListener("pointercancel", handleCancel);
      window.removeEventListener("pointerdown", handleWindowDown);
      window.removeEventListener("pointermove", handleWindowMove);
      window.removeEventListener("pointerup", handleWindowUp);
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
        // If two fingers are down, releasing either is a two finger tap
        const isSecondary = pointerId2 !== null;
        resolve({ isSecondary, unhandledEvent: e });
      } else if (e.pointerType === pointerType) {
        // Any other finger is some other gesture
        resolve({ isSecondary: false });
      }
    };

    const handleCancel = (e: PointerEvent) => {
      if (e.pointerId === pointerId) {
        resolve({ isSecondary: false, unhandledEvent: e });
      } else if (e.pointerType === pointerType) {
        resolve({ isSecondary: false });
      }
    };

    // For two finger tap, must watch entire window, not just the target element.
    // (Also used to reject long press if another finger goes down anywhere.)
    // These are passive, capture phase handlers on the window, so the events
    // are never unhandledEvent.

    const handleWindowDown = (e: PointerEvent) => {
      if (e.pointerType === pointerType) {
        if (
          e.pointerId === pointerId || // double click?
          e.pointerId === pointerId2 || // multi double click?
          !twoFingerTap ||
          pointerId2 !== null // three or more fingers down
        ) {
          resolve({ isSecondary: false });
        } else {
          // A second finger is down; reset timeout and wait for up
          pointerId2 = e.pointerId;
          clientX2 = e.clientX;
          clientY2 = e.clientY;
          clearTimeout(timeoutId);
          timeoutId = window.setTimeout(() => {
            // Since two fingers were involved, cannot be a long press
            resolve({ isSecondary: false });
          }, holdTime);
        }
      }
    };

    const handleWindowMove = (e: PointerEvent) => {
      if (e.pointerId === pointerId2) {
        const dx = e.clientX - clientX2;
        const dy = e.clientY - clientY2;
        if (dx * dx + dy * dy > dragThreshold * dragThreshold) {
          resolve({ isSecondary: false });
        }
      }
    };

    const handleWindowUp = (e: PointerEvent) => {
      if (e.pointerId === pointerId2) {
        // Second finger up before timeout: two finger tap
        resolve({ isSecondary: true });
      } else if (e.pointerType === pointerType && e.pointerId !== pointerId) {
        resolve({ isSecondary: false });
      } // else pointerId covered in target.handleUp above
    };

    target.addEventListener("pointermove", handleMove, { passive: true });
    target.addEventListener("pointerup", handleUp);
    target.addEventListener("pointercancel", handleCancel);

    const windowOptions = { capture: true, passive: true };
    window.addEventListener("pointerdown", handleWindowDown, windowOptions);
    window.addEventListener("pointermove", handleWindowMove, windowOptions);
    window.addEventListener("pointerup", handleWindowUp, windowOptions);

    let timeoutId = window.setTimeout(() => {
      resolve({ isSecondary: longPress });
    }, holdTime);
  });
}
