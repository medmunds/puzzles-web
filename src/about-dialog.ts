import { SignalWatcher } from "@lit-labs/signals";
import {
  css,
  type HTMLTemplateResult,
  html,
  LitElement,
  nothing,
  type TemplateResult,
} from "lit";
import { query } from "lit/decorators/query.js";
import { customElement, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { version } from "./puzzle/catalog.ts";
import { cssNative, cssWATweaks } from "./utils/css.ts";
import { pwaManager, UpdateStatus } from "./utils/pwa.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/details/details.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import "@awesome.me/webawesome/dist/components/divider/divider.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "@awesome.me/webawesome/dist/components/spinner/spinner.js";

// Raw content
import licenseText from "../LICENSE?raw";
import sgtPuzzlesLicenseText from "../puzzles/LICENCE?raw";
import privacyHtml from "./assets/privacy.html?raw";

// The name of this repo's project (which is covered by its LICENSE)
const repoName = "Puzzles web app";
// The (potentially branded) name of the PWA built from this repo
const appName = import.meta.env.VITE_APP_NAME || repoName;

// Form of dependencies.json
interface DependencyInfo {
  dependencies: {
    name: string;
    version?: string;
    license: string | null;
    notice: string | null;
  }[];
}

/**
 * Format text as html:
 * - Split into <p> at double NLs (but ignore single NL as plain text wrapping)
 * - Convert CR to <br> (special convention for dependencies.json from puzzles)
 * - Omit ----- or ===== (and longer sequences)
 * Optional label is inserted at the start of the first paragraph if provided.
 */
function licenseTextToHTML(
  text: string,
  label?: string | HTMLTemplateResult,
): HTMLTemplateResult[] {
  const result: HTMLTemplateResult[] = [];
  const divider = /^\s*(?:={3,}|-{3,})\s*$/;
  let firstParagraph = true;
  let lastParagraphWasDivider = false;
  for (const paragraph of text.trim().split("\n\n")) {
    if (divider.test(paragraph)) {
      if (!firstParagraph) {
        result.push(html`<wa-divider></wa-divider>`);
        lastParagraphWasDivider = true;
      }
      continue;
    }
    lastParagraphWasDivider = false;
    const lines = paragraph
      .replace(/[-=]{5,}/g, "")
      .split("\r")
      .filter((line) => line.trim() !== "")
      .map((line, i) => (i > 0 ? html`<br>${line}` : line));
    if (lines.length > 0) {
      result.push(html`<p>${firstParagraph ? label : nothing}${lines}</p>`);
      firstParagraph = false;
    }
  }
  if (lastParagraphWasDivider) {
    // Skip trailing <hr>
    result.pop();
  }
  if (firstParagraph && label) {
    // Didn't get a chance to add the label (no paragraphs in the lines)
    result.push(html`<p>${label}</p>`);
  }
  return result;
}

@customElement("about-dialog")
export class AboutDialog extends SignalWatcher(LitElement) {
  @query("wa-dialog", true)
  protected dialog?: HTMLElementTagNameMap["wa-dialog"];

  get open(): boolean {
    return this.dialog?.open ?? false;
  }
  set open(value: boolean) {
    if (this.dialog) {
      this.dialog.open = value;
    }
  }

  @state()
  private hasCheckedForUpdates = false;

  @state()
  private dependencies?: DependencyInfo["dependencies"];

  private async loadDependencies() {
    if (!this.dependencies) {
      // Load dependency info. This must be fetched rather than imported,
      // because dependencies-app.json is generated *after* bundling
      // (and we don't want to bundle an imported placeholder).
      async function loadJson(href: string): Promise<DependencyInfo["dependencies"]> {
        const response = await fetch(href);
        const { dependencies } = (await response.json()) as DependencyInfo;
        return dependencies;
      }

      const dependencies = (
        await Promise.all([
          // package.json dependencies, from rollup-plugin-license via vite:
          loadJson(`${import.meta.env.BASE_URL}dependencies-app.json`),
          // Emscripten/WASM dependencies, from puzzles/emcc-dependency-info.py:
          loadJson(new URL("./assets/puzzles/dependencies.json", import.meta.url).href),
        ])
      ).flat();

      // Sort by name ignoring leading "@" (and other punctuation)
      const { compare } = new Intl.Collator(undefined, {
        sensitivity: "accent",
        ignorePunctuation: true,
      });
      dependencies.sort((a, b) => compare(a.name, b.name));
      this.dependencies = dependencies;
    }
  }

  protected override render() {
    return html`
      <wa-dialog light-dismiss @wa-show=${this.handleDialogShow}>
        <div slot="label">About <cite>${appName}</cite></div>
        
        <div class="panel">
          <p>
            A web adaptation of
            <cite>${this.renderOffsiteLink(
              "https://www.chiark.greenend.org.uk/~sgtatham/puzzles/",
              html`<span class="nowrap">Simon Tatham’s</span> 
                <span class="nowrap">Portable Puzzles Collection</span>`,
            )}</cite>
            <span class="nowrap">by Mike Edmunds</span>
          </p>
          <p>
            Version <span class="version">${version}</span><br>
            ${this.renderUpdateInfo()}
          </p>
          <p>
            Source code: 
            ${this.renderOffsiteLink("https://github.com/medmunds/puzzles")}
          </p>
        </div>
        
        <wa-details summary="Privacy">
          ${unsafeHTML(privacyHtml)}
        </wa-details>

        <wa-details 
            summary="Copyright notices and licenses" 
            @wa-show=${this.loadDependencies}
        >
          ${licenseTextToHTML(
            licenseText,
            html`<strong>${repoName /* NOT appName */}</strong><br>`,
          )}

          <wa-divider></wa-divider>
          
          <div>
            <h2>Additional licensed software</h2>
            <p>This application incorporates the following software<br>
              (expand each item to view its copyright and license terms)</p>
          </div>
          
          <wa-details appearance="plain" icon-placement="start">
            <div slot="summary">Simon Tatham’s Portable Puzzles Collection</div>
            ${licenseTextToHTML(sgtPuzzlesLicenseText)}
          </wa-details>

          ${this.dependencies?.map(
            ({ name, license, notice }) => html`
              <wa-details appearance="plain" icon-placement="start">
                <div slot="summary">${name}</div>
                ${licenseTextToHTML(notice ?? `${license} license (no license text provided)`)}
              </wa-details>
            `,
          )}

        </wa-details>
      </wa-dialog>
    `;
  }

  private renderOffsiteLink(link: string, text?: string | TemplateResult) {
    return html`<a href=${link} target="_blank">${text ?? link}</a>`;
  }

  private renderUpdateInfo() {
    // Reactive updateStatus
    switch (pwaManager.updateStatus) {
      case UpdateStatus.Unknown:
        if (pwaManager.offlineReady) {
          // Shouldn't really occur (certainly not for long)
          return html`<wa-spinner></wa-spinner> Initializing&hellip;`;
        }
        // UpdateStatus.Unknown + !offlineReady means not installed for offline use
        return html`<a href="#" @click=${this.handleInstallOffline}>Make available offline</a>`;
      case UpdateStatus.UpToDate:
        return html`
          Offline ready, up to date
          (<a href="#" @click=${this.handleCheckForUpdate}>${
            !this.hasCheckedForUpdates ? "check for updates" : "check again"
          }</a>)
        `;
      case UpdateStatus.Checking:
        return html`<wa-spinner></wa-spinner> Checking for update&hellip;`;
      case UpdateStatus.Available:
        return html`
          Update available: 
          <a href="#" @click=${this.handleInstallUpdate}>install now</a>
        `;
      case UpdateStatus.Installing:
        return html`<wa-spinner></wa-spinner> Installing&hellip;`;
      case UpdateStatus.Error:
        return html`
          <wa-icon name="error"></wa-icon> Installation error
          (<a href="#" @click=${this.handleReloadApp}>reload app</a>)
        `;
    }
  }

  private async handleDialogShow(event: Event) {
    // Check for updates when the dialog is shown.
    // (The wa-details elements also emit wa-show, and we don't want to check
    // for updates when those are expanded.)
    if (event.target instanceof HTMLElement && event.target.localName === "wa-dialog") {
      const status = pwaManager.updateStatus;
      if (
        status !== UpdateStatus.Unknown &&
        status !== UpdateStatus.Available &&
        status !== UpdateStatus.Installing &&
        status !== UpdateStatus.Checking
      ) {
        await pwaManager.checkForUpdate();
      }
    }
  }

  private async handleCheckForUpdate(event: UIEvent) {
    event.preventDefault();
    this.hasCheckedForUpdates = true;
    await pwaManager.checkForUpdate();
  }

  private handleInstallUpdate(event: UIEvent) {
    event.preventDefault();
    pwaManager.installUpdate();
  }

  private handleReloadApp(event: UIEvent) {
    event.preventDefault();
    window.location.reload();
  }

  private async handleInstallOffline(event: UIEvent) {
    event.preventDefault();
    await pwaManager.makeAvailableOffline();
  }

  static styles = [
    cssNative,
    cssWATweaks,
    css`
      :host {
        display: contents;
      }
  
      wa-dialog {
        --width: min(calc(100vw - 2 * var(--wa-space-l)), 65ch);
      }
  
      wa-dialog::part(body) {
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-l);
      }
  
      wa-dialog::part(dialog) {
        background-color: var(--wa-color-neutral-fill-quiet);
      }
  
      wa-details:not([appearance="plain"])[open]::part(header) {
        border-block-end:
            var(--wa-panel-border-width)
            var(--wa-color-surface-border)
            var(--wa-panel-border-style);
      }
      
      wa-details wa-details {
        &::part(header) {
          padding: 0;
          font-weight: var(--wa-font-weight-semibold);
        }
        &::part(content) {
          padding-block: 0;
          /* caret (wa-icon) width = 1em in wa-tweaks.css */
          padding-inline-start: calc(1em + var(--spacing));
          padding-inline-end: 0;
        }
      }
      
      .panel {
        /* Effectively a wa-details without the summary */
        padding: var(--wa-space-m);
  
        background-color: var(--wa-color-surface-default);
        color: var(--wa-color-text-normal);
  
        border: var(--wa-panel-border-width) var(--wa-color-surface-border) var(--wa-panel-border-style);
        border-radius: var(--wa-panel-border-radius);
      }
  
      .panel,
      wa-details::part(content) {
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-m);
      }
      
      .nowrap {
        white-space: nowrap;
      }
  
      h1, h2, h3 {
        font-size: inherit;
      }
      
      strong {
        font-weight: var(--wa-font-weight-semibold);
      }
      
      wa-spinner {
        vertical-align: -2px; /* visual text-middle alignment*/
      }
      
      .version {
        user-select: all;
      }
  `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "about-dialog": AboutDialog;
  }
}
