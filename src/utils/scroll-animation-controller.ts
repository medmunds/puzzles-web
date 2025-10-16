import type { LitElement, ReactiveController } from "lit";
import { getNumericProperty } from "./css.ts";
import { clamp } from "./math.ts";

export interface ScrollAnimationControllerOptions {
  /**
   * The element whose scrollTop is monitored. Defaults to the host element.
   */
  scrollContainer?: Element;

  /**
   * The element containing the animations to manually advance.
   * Defaults to the scrollContainer.
   */
  animationElement?: Element | (() => Element);

  /**
   * Duration of the manual CSS animations in seconds.
   * Defaults to the value of the --scroll-animation-duration custom property
   * on the animationElement, or 1.0 second if not provided.
   */
  animationDuration?: number;

  /**
   * The scrollTop value (in pixels) at which the scroll animation should
   * be complete. Defaults to the value of the --scroll-range-end custom property
   * on the animationElement, or scrollContainer.scrollHeight if not provided.
   */
  rangeEnd?: number;

  /**
   * Animations starting with this prefix will be tied to scrollTop.
   * Default "scroll-".
   */
  animationNamePrefix?: string;
}

/**
 * Lit controller that emulates `animation-timeline: scroll()` in browsers
 * that don't support it. Requires that the animations be set up in CSS
 * (with a duration rather than a scroll timeline) and initially paused.
 */
export class ScrollAnimationController implements ReactiveController {
  private installed = false;
  private hadFirstUpdate = false;
  private scrollContainer?: Element;
  private scrollListener?: Node;

  constructor(
    private readonly host: LitElement,
    private readonly options: ScrollAnimationControllerOptions = {},
  ) {
    this.host.addController(this);
  }

  hostConnected() {
    if (!this.installed && !CSS.supports("animation-timeline: scroll()")) {
      this.installed = true;
      this.scrollContainer = this.options.scrollContainer ?? this.host;
      // Scroll events on document.documentElement (<html> tag) are delivered to document
      this.scrollListener =
        this.scrollContainer === document.documentElement
          ? document
          : this.scrollContainer;
      this.scrollListener.addEventListener("scroll", this.update, { passive: true });
      window.addEventListener("pageshow", this.update);
    }
    this.hadFirstUpdate = false;
  }

  hostDisconnected() {
    if (this.installed) {
      this.scrollListener?.removeEventListener("scroll", this.update as EventListener);
      window.removeEventListener("pageshow", this.update as EventListener);
      this.scrollContainer = undefined;
      this.scrollListener = undefined;
      this.installed = false;
    }
  }

  hostUpdated() {
    if (this.installed && !this.hadFirstUpdate) {
      this.hadFirstUpdate = true;
      this.update();
    }
  }

  private update = () => {
    // (A lot of this could probably be cached somehow)
    if (!this.scrollContainer) {
      if (!import.meta.env.PROD) {
        throw new Error("Missing scrollContainer");
      }
      return;
    }

    const animationElement =
      (typeof this.options.animationElement === "function"
        ? this.options.animationElement()
        : this.options.animationElement) ?? this.scrollContainer;

    const animationDuration =
      this.options.animationDuration ??
      getNumericProperty(animationElement, "--scroll-animation-duration", 1.0);
    const rangeEnd =
      (this.options.rangeEnd ??
        getNumericProperty(
          animationElement,
          "--scroll-range-end",
          this.scrollContainer.scrollHeight,
        )) ||
      this.scrollContainer.scrollHeight;
    const namePrefix = this.options.animationNamePrefix ?? "scroll-";

    const scrollY = this.scrollContainer.scrollTop;
    const currentTime =
      1000 * clamp(0, (animationDuration * scrollY) / rangeEnd, animationDuration);

    const animations = animationElement
      .getAnimations({ subtree: true })
      .filter(
        (animation) =>
          animation instanceof CSSAnimation &&
          (animation as CSSAnimation).animationName.startsWith(namePrefix),
      );
    for (const animation of animations) {
      animation.currentTime = currentTime;
    }
  };
}
