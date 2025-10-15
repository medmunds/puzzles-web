import { SignalWatcher } from "@lit-labs/signals";
import { css, html } from "lit";
import { customElement } from "lit/decorators.js";
import { Screen } from "./screen.ts";
import { cssWATweaks } from "./utils/css.ts";
import { clamp } from "./utils/math.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "./catalog-list.ts";
import "./dynamic-content.ts";

@customElement("home-screen")
export class HomeScreen extends SignalWatcher(Screen) {
  override connectedCallback() {
    super.connectedCallback();
    this.installScrollAnimationFallback();

    // TODO: move dynamic content into here; remove js-ready class logic
    document.body.classList.add("js-ready");
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.removeScrollAnimationFallback();
  }

  protected override render() {
    return html`
      <slot name="header"></slot>
      <slot name="before"></slot>
      <catalog-list></catalog-list>
      <slot name="after"></slot>
      <slot name="footer"></slot>
      <dynamic-content></dynamic-content>
    `;
  }

  //
  // Scroll animation fallback
  //

  // TODO: could this be extracted to a controller?

  /**
   * Emulate animation-timeline: scroll() for our CSS shrinking header animations
   * in browsers that don't support it. This assumes that in those browsers,
   * the CSS animations:
   *   - are installed as ordinary animations in "paused" state
   *   - have a duration of 1000ms
   *   - have names starting with "scroll-"
   */
  private updateScrollAnimation = () => {
    const header = this.shadowRoot
      ?.querySelector<HTMLSlotElement>('slot[name="header"]')
      ?.assignedElements()[0];
    if (!header) {
      throw new Error("header is missing");
    }

    const animationDuration = 1000; // all css animations are set to this duration
    const rangeEndStr = window
      .getComputedStyle(header)
      .getPropertyValue("--scroll-range-end");
    let rangeEnd = Number.parseFloat(rangeEndStr);
    if (Number.isNaN(rangeEnd) || rangeEnd <= 0) {
      console.warn(`Couldn't parse --scroll-range-end=${rangeEndStr}`);
      rangeEnd = 120;
    }

    const scrollY = document.documentElement.scrollTop ?? 0;
    const currentTime = clamp(
      0,
      (animationDuration * scrollY) / rangeEnd,
      animationDuration,
    );
    const animations = header
      .getAnimations({ subtree: true })
      .filter(
        (animation) =>
          animation instanceof CSSAnimation &&
          animation.animationName.startsWith("scroll-"),
      );
    for (const animation of animations) {
      animation.currentTime = currentTime;
    }
  };

  private installedScrollAnimationFallback = false;

  private installScrollAnimationFallback() {
    if (
      !CSS.supports("animation-timeline: scroll()") &&
      !this.installedScrollAnimationFallback
    ) {
      this.installedScrollAnimationFallback = true;
      // document.documentElement (<html>) scroll events are delivered to document:
      document.addEventListener("scroll", this.updateScrollAnimation, {
        passive: true,
      });
      // pageshow covers scroll position restoration after navigation:
      window.addEventListener("pageshow", this.updateScrollAnimation);
      // get initial position:
      this.updateComplete.then(this.updateScrollAnimation);
    }
  }

  private removeScrollAnimationFallback() {
    if (this.installedScrollAnimationFallback) {
      document.removeEventListener("scroll", this.updateScrollAnimation);
      window.removeEventListener("pageshow", this.updateScrollAnimation);
      this.installedScrollAnimationFallback = false;
    }
  }

  //
  // Styles
  //

  static styles = [
    cssWATweaks,
    css`
      :host {
        display: contents;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "home-screen": HomeScreen;
  }
}
