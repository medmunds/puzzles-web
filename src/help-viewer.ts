import type SlDrawer from "@shoelace-style/shoelace/dist/components/drawer/drawer.js";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { query } from "lit/decorators/query.js";
import { when } from "lit/directives/when.js";

// Components
import "@shoelace-style/shoelace/dist/components/drawer/drawer.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/icon-button/icon-button.js";
import "@shoelace-style/shoelace/dist/components/include/include.js";

/**
 * Essentially a miniature browser in an sl-drawer, constrained to subpaths
 * of its initial src (other links open a new tab/window). Renders content
 * using sl-include with a local style sheet.
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

  @query("sl-drawer")
  private drawer?: SlDrawer;

  @state()
  private currentTitle?: string;

  @state()
  private historyIndex = 0;

  @state()
  private history: URL[] = [];

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
      <sl-drawer id="help" label=${title}>
        ${this.renderHistoryButtons()}
        ${when(
          this.showPopout,
          () => html`
            <sl-icon-button 
                slot="header-actions"
                label="Open in new tab"
                name="offsite-link" 
                href=${currentSrc}
                target="_blank"
            ></sl-icon-button>
          `,
        )}
        <sl-include 
            src=${currentSrc}
            mode="same-origin"
            @sl-error=${this.handleDocumentError}
            @sl-load=${this.handleDocumentLoad}
        ></sl-include>
      </sl-drawer>
    `;
  }

  private renderHistoryButtons() {
    if (this.history.length <= 1) {
      // Don't bother showing the history buttons until there's history available.
      return nothing;
    }
    return html`
      <sl-icon-button
          slot="header-actions"
          label="Back to start"
          name="history-back-to-start"
          ?disabled=${this.historyIndex < 1}
          @click=${this.goHome}></sl-icon-button>
      <sl-icon-button
          slot="header-actions"
          label="Back"
          name="history-back"
          ?disabled=${this.historyIndex < 1}
          @click=${this.goBack}></sl-icon-button>
      <sl-icon-button
          slot="header-actions"
          label="Forward"
          name="history-forward"
          ?disabled=${this.historyIndex >= this.history.length - 1}
          @click=${this.goForward}></sl-icon-button>
    `;
  }

  private baseUrl: URL = new URL(window.location.href);
  private basePath = "";

  private updateSrc() {
    this.baseUrl = new URL(this.src, window.location.href);
    this.basePath = this.baseUrl.pathname.replace(/\/[^/]*$/, "");
    const url = new URL(this.src, this.baseUrl);
    this.history = [url];
    this.historyIndex = 0;
  }

  private isOffsite(url: URL): boolean {
    return (
      url.origin !== this.baseUrl.origin || !url.pathname.startsWith(this.basePath)
    );
  }

  private handleDocumentError(event: CustomEvent<{ status: number }>) {
    // TODO: render some error visible to the user, too
    console.error(`help-viewer error ${event.detail.status} loading src=${this.src}`);
  }

  private handleDocumentLoad() {
    // sl-include fetches its src and displays it in this (light) dom.
    // This breaks any relative links in the src, as they resolve relative
    // to our current location rather than the src's location. Patch them up.
    const doc = this.shadowRoot?.querySelector("sl-include");
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
        if (!anchor.querySelector("sl-icon")) {
          const offsiteIcon = document.createElement("sl-icon");
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
    }
  };

  //
  // Public methods
  //

  show() {
    this.drawer?.show();
  }

  hide() {
    this.drawer?.hide();
  }

  goHome() {
    this.historyIndex = 0;
  }

  goBack() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
    }
  }

  goForward() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
    }
  }

  //
  // Styles
  //

  static styles = css`
    :host {
      display: contents;
    }
    
    sl-drawer {
      --size: max(50cqi, 25rem);
    }
    sl-drawer::part(title) {
      overflow: hidden;
      text-overflow: ellipsis;
      text-wrap: nowrap;
    }
    sl-drawer::part(header-actions) {
      padding-inline-start: 0;
    }
    sl-drawer::part(header) {
      border-bottom: 1px solid var(--sl-color-neutral-200);
    }
    
    /* TODO: share the base page styles somehow */
    sl-include {
      /* try to avoid horizontal scrolling on small screens */
      overflow-wrap: break-word;

      h1, h2, h3 {
        color: var(--sl-color-neutral-800);
        line-height: var(--sl-line-height-dense);
      }
      h1 {
        font-weight: var(--sl-font-weight-bold);
        font-size: var(--sl-font-size-x-large);
      }
      h2 {
        font-weight: var(--sl-font-weight-semibold);
        font-size: var(--sl-font-size-large);
      }
      h3 {
        font-weight: var(--sl-font-weight-semibold);
        font-size: var(--sl-font-size-medium);
      }
      
      hr {
        border: none;
        border-top: 1px solid var(--sl-color-neutral-200);
      }
      
      a > code {
        /* urls are all formatted as code; we'd prefer to skip the monoface font */
        font-family: inherit;
      }
      
      pre {
        /* try to avoid horizontal scrolling on small screens */
        white-space: pre-wrap;
      }
      
      sl-icon.offsite {
        margin-inline-start: 0.1em;
        vertical-align: -2px; /* visual baseline alignment*/
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "help-viewer": HelpViewer;
  }
}
