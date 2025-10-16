import { SignalWatcher } from "@lit-labs/signals";
import { css, html, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { canonicalBaseUrl } from "./routing.ts";
import { Screen } from "./screen.ts";
import { cssWATweaks } from "./utils/css.ts";
import { ScrollAnimationController } from "./utils/scroll-animation-controller.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "./catalog-list.ts";
import "./dynamic-content.ts";
import "./head-matter.ts";

@customElement("home-screen")
export class HomeScreen extends SignalWatcher(Screen) {
  constructor() {
    super();
    // Fallback for shrinking sticky header using animation-timeline: scroll()
    new ScrollAnimationController(this, {
      scrollContainer: document.documentElement,
      animationElement: (): Element =>
        this.shadowRoot
          ?.querySelector<HTMLSlotElement>('slot[name="header"]')
          ?.assignedElements()[0] ?? this,
    });
  }

  override connectedCallback() {
    super.connectedCallback();

    // TODO: move dynamic content into here; remove js-ready class logic
    document.body.classList.add("js-ready");
  }

  protected override render() {
    return html`
      <head-matter>
        ${this.themeColor ? html`<meta name="theme-color" content=${this.themeColor}>` : nothing}
        ${canonicalBaseUrl ? html`<link rel="canonical" href="${canonicalBaseUrl}">` : nothing}
      </head-matter>
      
      <slot name="header"></slot>
      <slot name="before"></slot>
      
      <catalog-list></catalog-list>
      
      <slot name="after"></slot>
      <slot name="footer"></slot>
      <dynamic-content></dynamic-content>
    `;
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
