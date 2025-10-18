import { html, LitElement, nothing } from "lit";
import { query } from "lit/decorators/query.js";
import { property, state } from "lit/decorators.js";
import { helpUrl, homePageUrl, isHelpUrl, navigateToHomePage } from "./routing.ts";
import { hasAnyModifier } from "./utils/events.ts";

export abstract class Screen extends LitElement {
  //
  // Layout and sizing
  //

  @property({ type: String, reflect: true })
  size: "large" | "medium" | "small" = "large";

  @property({ type: String, reflect: true })
  orientation: "horizontal" | "vertical" = "vertical";

  @state()
  protected themeColor?: string;

  protected get compactButtons(): boolean {
    return this.size !== "large";
  }

  protected handleResize = () => {
    if (this.isConnected) {
      // Update layout attrs from token calculations in common.css
      const styles = window.getComputedStyle(this);
      const orientation = styles.getPropertyValue("--app-orientation");
      const size = styles.getPropertyValue("--app-size");
      if (!import.meta.env.PROD) {
        if (orientation !== "horizontal" && orientation !== "vertical") {
          throw new Error(`Unknown --app-orientation='${orientation}'`);
        }
        if (size !== "large" && size !== "medium" && size !== "small") {
          throw new Error(`Unknown --app-size='${size}'`);
        }
      }
      this.orientation = orientation as Screen["orientation"];
      this.size = size as Screen["size"];
    }
  };

  protected captureThemeColor() {
    if (this.isConnected) {
      this.themeColor = window
        .getComputedStyle(this)
        .getPropertyValue("--app-theme-color");
    }
  }

  //
  // Routing and command handling
  //

  protected interceptHrefClicks = async (event: MouseEvent) => {
    if (event.defaultPrevented) {
      // Don't intercept clicks that have already been handled
      return;
    }

    // If the click was within an element with an href (`<a>`, wa-button, etc.),
    // and the href matches a route, intercept it.
    for (const target of event.composedPath()) {
      const href =
        target instanceof HTMLElement
          ? (target.getAttribute("href") ?? target.getAttribute("data-command"))
          : null;
      if (href) {
        if (href === homePageUrl().href) {
          if (!hasAnyModifier(event)) {
            event.preventDefault();
            navigateToHomePage();
          }
          // Otherwise let the browser handle it: click with modifier key
          // typically opens a new tab or window or saves the link
          // rather than navigating the current tab.
        } else if (isHelpUrl(href)) {
          if (!hasAnyModifier(event)) {
            event.preventDefault();
            await this.showHelpViewer(href);
          }
        } else if (href === "#about") {
          event.preventDefault();
          await this.showAboutDialog();
        } else if (href === "#settings") {
          event.preventDefault();
          await this.showSettingsDialog();
        }
        break; // stop at first element with an href or data-command
      }
    }
  };

  //
  // Dynamic content
  //

  @query("dynamic-content")
  protected dynamicContent?: HTMLElementTagNameMap["dynamic-content"];

  protected async showAboutDialog() {
    await import("./about-dialog.ts");
    const dialog = await this.dynamicContent?.addItem({
      tagName: "about-dialog",
      render: () => html`<about-dialog></about-dialog>`,
    });
    if (dialog && !dialog.open) {
      dialog.open = true;
    }
  }

  protected defaultHelpHref: string = helpUrl().href;
  protected defaultHelpLabel: string | undefined = "Help"; // for pages with no <title>

  protected async showHelpViewer(href?: string) {
    await import("./help-viewer.ts");
    const helpViewer = await this.dynamicContent?.addItem({
      tagName: "help-viewer",
      render: () => html`
        <help-viewer 
            src=${href ?? this.defaultHelpHref} 
            label=${this.defaultHelpLabel ?? nothing}
        ></help-viewer>
      `,
    });
    // TODO: if already visible, navigate help-viewer to href?
    helpViewer?.show();
  }

  protected async showSettingsDialog() {
    await import("./settings-dialog.ts");
    const dialog = await this.dynamicContent?.addItem({
      tagName: "settings-dialog",
      render: () => html`<settings-dialog></settings-dialog>`,
    });
    if (dialog && !dialog.open) {
      await dialog.show();
    }
  }

  //
  // Lifecycle
  //

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener("resize", this.handleResize);
    this.addEventListener("click", this.interceptHrefClicks);

    // Get initial values
    this.handleResize();
    this.captureThemeColor();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("resize", this.handleResize);
    this.removeEventListener("click", this.interceptHrefClicks);
  }

  protected override updated() {
    if (!import.meta.env.PROD && this.isConnected && !this.dynamicContent) {
      throw new Error("Screen subclass must render <dynamic-content> element");
    }
  }
}
