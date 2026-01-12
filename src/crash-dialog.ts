import * as Sentry from "@sentry/browser";
import { css, html, LitElement, nothing } from "lit";
import { query } from "lit/decorators/query.js";
import { customElement, property, state } from "lit/decorators.js";
import { cssWATweaks } from "./utils/css.ts";
import { sleep } from "./utils/timing.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/copy-button/copy-button.js";
import "@awesome.me/webawesome/dist/components/checkbox/checkbox.js";
import "@awesome.me/webawesome/dist/components/details/details.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "@awesome.me/webawesome/dist/components/textarea/textarea.js";

const ignoreErrors: (string | RegExp)[] = [
  // Emscripten runtime aborted wasm load on navigation/refresh:
  /RuntimeError:\s*Aborted\s*\(NetworkError.*Build with -sASSERTIONS/i,
  // Web Awesome: https://github.com/shoelace-style/webawesome/issues/1905:
  /TypeError.*clientX.*handleDragStop/,
  // Web Awesome: https://github.com/shoelace-style/webawesome/issues/1911:
  /TypeError.*(assignedElements|hidePopover).*disconnectedCallback/,
  // Unknown DuckDuckGo complaint:
  /^Error: invalid origin$/,
  // Chrome iOS "Translate" bug (in anonymous script):
  /^RangeError: Maximum call stack size exceeded.*at undefined/,
  // All browsers (but usually Firefox). Sentry ignores this by default:
  "ResizeObserver loop completed with undelivered notifications",
  // Browser extensions and extension-only APIs:
  // (See Sentry's longer list:
  // https://github.com/getsentry/relay/blob/322fa6f678add6abed4772fb6046cbf7daf4814a/relay-filter/src/browser_extensions.rs#L9-L81)
  /^(chrome(-extension)?|moz-extension|safari(-web)?-extension):\/\//,
  "Extension context invalidated",
  "runtime.sendMessage",
  "webkit-masked-url",
  "window.__firefox__",
] as const;

function shouldIgnoreError(errorString: string) {
  return ignoreErrors.some((pattern) =>
    pattern instanceof RegExp
      ? pattern.test(errorString)
      : errorString.includes(pattern),
  );
}

async function isErrorInThirdPartyCode(error: unknown) {
  // Borrow Sentry.thirdPartyErrorFilterIntegration's stack trace filtering.
  // The __third_party_code__ flag is set in Sentry.init beforeSend() in main.ts.
  // Sentry's processing is async, so wait a tick for it to finish.
  await sleep(0);
  return error instanceof Error && "__third_party_code__" in error;
}

/**
 * Create and display a crash-dialog for message.
 * (Provide the original error object if available, for better filtering.)
 *
 * If the crash-dialog is already open, adds message to its list
 * (to avoid getting stuck in a repeated error loop).
 */
export async function reportError(message: string, error?: unknown) {
  const isIgnored = shouldIgnoreError(message);
  const isThirdParty = await isErrorInThirdPartyCode(error);
  if (isIgnored || isThirdParty) {
    if (import.meta.env.VITE_SENTRY_DSN) {
      Sentry.addBreadcrumb({
        type: "error",
        category: "error.ignored",
        message,
        data: { isIgnored, isThirdParty },
      });
    }
    return;
  }

  try {
    let dialog = document.querySelector("crash-dialog");
    if (!dialog) {
      dialog = document.createElement("crash-dialog");
      document.body.appendChild(dialog);
    }
    await dialog.reportError(message);
  } catch (err) {
    if (import.meta.env.VITE_SENTRY_DSN) {
      Sentry.captureException(err);
    }
    console.error("Error while trying to reportError", err, error);
  }
}

@customElement("crash-dialog")
export class CrashDialog extends LitElement {
  private suppressedErrors = new Set<string>();

  // Maximum number of errors to display in the dialog at once
  @property({ type: Number, attribute: "maxErrors" })
  maxErrors = 20;

  @state()
  private errors: string[] = [];

  @state()
  private sentryLastEventId?: string;

  @state()
  private suppressErrors = false;

  // Whether the current content of the user description
  // textarea might include an email address.
  @state()
  private mightHavePersonalInfo = false;

  private postingUserDescription = false;

  @query("wa-dialog")
  private dialog?: HTMLElementTagNameMap["wa-dialog"];

  @query("wa-textarea")
  private userDescription?: HTMLElementTagNameMap["wa-textarea"];

  reset() {
    this.suppressErrors = false;
    this.errors = [];
    if (this.userDescription) {
      this.userDescription.value = "";
    }
    this.mightHavePersonalInfo = false;
    this.postingUserDescription = false;
    if (import.meta.env.VITE_SENTRY_DSN) {
      this.sentryLastEventId = Sentry.lastEventId();
    }
  }

  /**
   * If error has previously been ignored, do nothing.
   * Otherwise, if dialog is not open, open it to show error.
   * If dialog is already open, append error to the displayed list.
   */
  async reportError(errorString: string) {
    if (this.suppressedErrors.has(errorString)) {
      return;
    }
    if (!this.dialog?.open) {
      this.reset();
    }
    this.errors = [...this.errors, errorString];

    if (!this.dialog) {
      // reportError before first render
      await this.updateComplete;
    }
    if (this.dialog) {
      this.dialog.open = true;
    }
  }

  protected override render() {
    const content = [
      html`
        <div>Uh-oh, an unexpected error occurred. Sorry about that.
          ${import.meta.env.VITE_SENTRY_DSN ? "The developer has been notified." : nothing}
        </div>
        <div>If this keeps happening, try reloading the page.</div>
      `,
    ];

    if (import.meta.env.VITE_SENTRY_DSN) {
      const noPersonal = this.mightHavePersonalInfo ? "highlight" : nothing;
      content.push(html`
        <wa-textarea
          label="What were you doing when this occurred? (optional)"
          maxlength="1000"
          resize="auto"
          rows="3"
          @input=${this.handleUserDescriptionChange}
          @change=${this.handleUserDescriptionChange}
        >
          <div slot="hint">
            If you know what causes this, it can help fix the problem. 
            (Please <strong class=${noPersonal}>don’t include email addresses</strong> 
            or other personal information.)
          </div>
        </wa-textarea>
      `);
    }

    if (this.sentryLastEventId) {
      content.push(
        html`
          <div class="event-id">Event ID (for GitHub bug reports):<br>
            <span id="event-id">${this.sentryLastEventId}</span>
            <wa-copy-button from="event-id"></wa-copy-button>
          </div>
        `,
      );
    }

    if (this.errors.length > 0) {
      content.push(html`
        <wa-details appearance="plain" open>
          <div slot="summary">Technical details</div>
          ${this.errors
            .slice(-this.maxErrors)
            .map((error) => html`<div>${error}</div>`)}
        </wa-details>
        <wa-checkbox 
            .checked=${this.suppressErrors}
            @change=${this.handleSuppressErrorsChange}
        >${
          this.errors.length === 1
            ? "Don’t show this error again"
            : "Don’t show these errors again"
        }</wa-checkbox>
      `);
    }

    return html`
      <wa-dialog @wa-hide=${this.handleDismiss}>
        <wa-icon slot="label" name="error"></wa-icon>
        <div slot="label">Something went wrong</div>
        ${content}
        <wa-button slot="footer" @click=${this.handleReload}>Reload page</wa-button>
        <wa-button slot="footer" variant="brand" data-dialog="close">Close</wa-button>
      </wa-dialog>
    `;
  }

  private handleSuppressErrorsChange(event: UIEvent) {
    const checkbox = event.target as HTMLInputElement;
    this.suppressErrors = checkbox.checked;
  }

  private handleUserDescriptionChange() {
    this.mightHavePersonalInfo = /\w+@\w+/.test(this.userDescription?.value ?? "");
  }

  private async postUserDescription() {
    if (!this.postingUserDescription) {
      const description = this.userDescription?.value?.trim();
      if (description) {
        this.postingUserDescription = true;
        try {
          await Sentry.sendFeedback({
            associatedEventId: this.sentryLastEventId,
            message: description,
          });
        } catch (error: unknown) {
          console.error("Error in Sentry.captureFeedback", error);
          Sentry.captureException(error);
        } finally {
          this.postingUserDescription = false;
        }
      }
    }
  }

  private async handleDismiss() {
    if (this.suppressErrors) {
      for (const error of this.errors) {
        this.suppressedErrors.add(error);
      }
    }
    await this.postUserDescription();
  }

  private async handleReload(event: UIEvent) {
    if (event.target instanceof HTMLElement) {
      event.target.setAttribute("loading", "");
    }
    await this.postUserDescription();
    window.location.reload();
  }

  static styles = [
    cssWATweaks,
    css`
      :host {
        display: contents;
      }
      
      wa-dialog::part(dialog) {
        background-color: var(--wa-color-danger-fill-quiet);
        border-color: var(--wa-color-danger-border-loud);
        border-style: var(--wa-border-style);
        border-width: var(--wa-border-width-l);
      }
      wa-dialog::part(title) {
        display: flex;
        gap: var(--wa-space-xs);
        align-items: flex-start;
      }
      wa-icon[slot="label"] {
        margin-block-start: 0.125em;
        color: var(--wa-color-danger-on-quiet);
      }
      wa-dialog::part(body) {
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-l);
      }
      wa-dialog::part(footer) {
        gap: var(--wa-space-m);
      }
      
      wa-details {
        display: contents;
      }
      wa-details::part(base) {
        flex: 0 1 auto;
        min-height: 1em;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        padding-block: var(--wa-space-xs);
        border-block-start: 
            var(--wa-color-danger-border-normal) 
            var(--wa-border-style) 
            var(--wa-border-width-s);
        border-block-end: 
            var(--wa-color-danger-border-normal) 
            var(--wa-border-style) 
            var(--wa-border-width-s);
      }
      wa-details::part(header) {
        padding: 0;
        --spacing: var(--wa-space-xs); /* between caret and summary */
      }
      wa-details::part(content) {
        padding: 0;
        padding-block-start: var(--wa-space-xs);
        font-size: var(--wa-font-size-s);
        
        flex: 0 1 auto;
        min-height: 3em;
        max-height: 30vh;
        overflow: auto;
        
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-xs);
      }
      wa-details > div:not([slot]) {
        white-space: pre-wrap;
        line-height: var(--wa-line-height-condensed);
      }
      
      .event-id {
        line-height: var(--wa-line-height-condensed);
      }
      #event-id {
        user-select: all;
      }
      wa-copy-button::part(button) {
        padding: 0;
        padding-inline-start: var(--wa-space-2xs);
      }

      wa-textarea::part(textarea) {
        max-height: 6lh;
      }
      wa-textarea::part(label) {
        font-weight: var(--wa-font-weight-normal);
      }
      .highlight {
        color: var(--wa-color-danger-on-quiet);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "crash-dialog": CrashDialog;
  }
}
