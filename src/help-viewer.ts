import type WaDrawer from "@awesome.me/webawesome/dist/components/drawer/drawer.js";
import { css, html, LitElement, nothing } from "lit";
import { query } from "lit/decorators/query.js";
import { customElement, property, state } from "lit/decorators.js";
import { cssNative, cssWATweaks } from "./utils/css.ts";

// Components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/drawer/drawer.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "@awesome.me/webawesome/dist/components/include/include.js";

/**
 * Essentially a miniature browser in an wa-drawer, constrained to subpaths
 * of its initial src (other links open a new tab/window). Renders content
 * using wa-include with a local style sheet.
 */
@customElement("help-viewer")
export class HelpViewer extends LitElement {
  @property({ type: String })
  src = "";

  @property({ type: String })
  label = "";

  /**
   * Show an "Open in new tab" header button, which opens the current url
   * with target="_blank". (In an installed PWA, this generally opens
   * an embedded web view rather than the user's browser, which probably
   * isn't the desired behavior.)
   */
  @property({ type: Boolean, attribute: "show-popout" })
  showPopout = false;

  @query("wa-drawer")
  private drawer?: WaDrawer;

  @state()
  private currentTitle?: string;

  @state()
  private historyIndex = 0;

  @state()
  private history: URL[] = [];

  @state()
  private error?: number;

  override connectedCallback() {
    super.connectedCallback();
    this.shadowRoot?.addEventListener("click", this.handleDocumentClick);
  }

  override disconnectedCallback() {
    this.shadowRoot?.removeEventListener("click", this.handleDocumentClick);
    super.disconnectedCallback();
  }

  protected override willUpdate(changedProps: Map<string, unknown>) {
    if (changedProps.has("src")) {
      this.updateSrc();
    }
  }

  // TODO: handle key events: arrows and page scrolling, back/forward navigation
  // TODO: allow resizing (add a dragger grip on left edge)

  protected override render() {
    const currentSrc = this.history[this.historyIndex] ?? "";
    const title = this.currentTitle ?? this.label;
    // TODO: the new tab button (at least) needs a tooltip
    return html`
      <wa-drawer id="help" label=${title}>
        ${this.renderHistoryButtons()}
        ${
          this.showPopout
            ? html`
              <wa-button 
                  slot="header-actions"
                  href=${currentSrc}
                  target="_blank"
                  appearance="plain"
              >
                <wa-icon label="Open in new tab" name="offsite-link"></wa-icon>
              </wa-button>
            `
            : nothing
        }
        ${
          this.error !== undefined
            ? html`<div class="error">Error ${this.error} loading ${this.src}</div>`
            : html`
              <wa-include
                  src=${currentSrc}
                  mode="same-origin"
                  @wa-include-error=${this.handleDocumentError}
                  @wa-load=${this.handleDocumentLoad}
              ></wa-include>
            `
        }
      </wa-drawer>
    `;
  }

  private renderHistoryButtons() {
    if (this.history.length <= 1) {
      // Don't bother showing the history buttons until there's history available.
      return nothing;
    }
    return html`
      <wa-button
          slot="header-actions"
          appearance="plain"
          ?disabled=${this.historyIndex < 1}
          @click=${this.goHome}
      >
        <wa-icon label="Back to start" name="history-back-to-start"></wa-icon>
      </wa-button>
      <wa-button
          slot="header-actions"
          appearance="plain"
          ?disabled=${this.historyIndex < 1}
          @click=${this.goBack}
      >
        <wa-icon label="Back" name="history-back"></wa-icon>
      </wa-button>
      <wa-button
          slot="header-actions"
          appearance="plain"
          ?disabled=${this.historyIndex >= this.history.length - 1}
          @click=${this.goForward}
      >
        <wa-icon label="Forward" name="history-forward"></wa-icon>
      </wa-button>
    `;
  }

  private baseUrl: URL = new URL(window.location.href);
  private basePath = "";

  private updateSrc() {
    this.baseUrl = new URL(this.src, window.location.href);
    this.basePath = this.baseUrl.pathname.replace(/\/[^/]*$/, "");
    this.history = [this.baseUrl];
    this.historyIndex = 0;
    this.error = undefined;
  }

  private isOffsite(url: URL): boolean {
    return (
      url.origin !== this.baseUrl.origin || !url.pathname.startsWith(this.basePath)
    );
  }

  private handleDocumentError(event: CustomEvent<{ status: number }>) {
    console.error(`help-viewer error ${event.detail.status} loading src=${this.src}`);
    this.error = event.detail.status;
  }

  private handleDocumentLoad() {
    // wa-include fetches its src and displays it in this (light) dom.
    // This breaks any relative links in the src, as they resolve relative
    // to our current location rather than the src's location. Patch them up.
    const doc = this.shadowRoot?.querySelector("wa-include");
    if (!doc) {
      return;
    }

    const currentUrl = this.history[this.historyIndex];
    const anchors = doc.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [];
    for (const anchor of anchors) {
      const href = anchor.getAttribute("href");
      if (!href) {
        continue;
      }
      let resolved: URL;
      try {
        resolved = new URL(href, currentUrl);
      } catch {
        continue; // skip malformed links
      }
      anchor.href = resolved.href;

      if (this.isOffsite(resolved)) {
        anchor.target = "_blank";
        if (!anchor.querySelector("wa-icon")) {
          const offsiteIcon = document.createElement("wa-icon");
          offsiteIcon.classList.add("offsite");
          offsiteIcon.setAttribute("name", "offsite-link");
          offsiteIcon.setAttribute("label", "Opens in new tab");
          anchor.appendChild(offsiteIcon);
        }
      }
    }

    // Use the title tag if available
    this.currentTitle = doc.querySelector("title")?.innerText;

    // Scroll to the hash, or to the top
    // TODO: when navigating back, restore scroll position
    let scrollTo: Element | null = null;
    if (currentUrl.hash) {
      const anchor = currentUrl.hash.slice(1);
      scrollTo = doc.querySelector(`[name="${anchor}"]`);
    }
    if (scrollTo) {
      scrollTo.scrollIntoView({});
    } else {
      doc.scrollTo(0, 0);
    }
  }

  private handleDocumentClick = (event: Event) => {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) {
      return;
    }
    // TODO: don't prevent default if any modifiers pressed (new tab, new window)
    event.preventDefault();
    const url = new URL(anchor.href, window.location.href);
    if (this.isOffsite(url)) {
      window.open(url, "_blank");
    } else {
      this.history = [...this.history.slice(0, this.historyIndex + 1), url];
      this.historyIndex++;
      this.error = undefined;
    }
  };

  //
  // Public methods
  //

  show() {
    if (this.drawer) {
      this.drawer.open = true;
    }
  }

  hide() {
    if (this.drawer) {
      this.drawer.open = false;
    }
  }

  goHome() {
    this.historyIndex = 0;
    this.error = undefined;
  }

  goBack() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.error = undefined;
    }
  }

  goForward() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.error = undefined;
    }
  }

  //
  // Styles
  //

  static styles = [
    cssNative,
    cssWATweaks,
    css`
      :host {
        display: contents;
      }
      
      wa-drawer {
        --size: max(50cqi, 25rem);
      }
      wa-drawer::part(title) {
        overflow: hidden;
        text-overflow: ellipsis;
        text-wrap: nowrap;
      }
      wa-drawer::part(header-actions) {
        padding-inline-start: 0;
      }
      wa-drawer::part(header) {
        /* Match bottom padding to top */
        padding-block-end: calc(var(--spacing) - var(--wa-form-control-padding-block));
        border-bottom: 1px solid var(--wa-color-neutral-border-normal);
      }
      
      /* TODO: share the base page styles somehow */
      wa-include {
        /* try to avoid horizontal scrolling on small screens */
        overflow-wrap: break-word;
  
        a > code {
          /* urls are all formatted as code; we'd prefer to skip the monoface font */
          font-family: inherit;
        }
        
        /* Restore some margin removed by cssNative */
        h1 {
          margin-block-start: var(--wa-space-xl);
        }
        h2 {
          margin-block-start: var(--wa-space-l);
        }
        h3, h4, h5, h6 {
          margin-block-start: var(--wa-space-m);
        }
        
        pre {
          /* try to avoid horizontal scrolling on small screens */
          white-space: pre-wrap;
        }
        
        wa-icon.offsite {
          margin-inline-start: 0.1em;
          vertical-align: -2px; /* visual baseline alignment*/
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "help-viewer": HelpViewer;
  }
}
