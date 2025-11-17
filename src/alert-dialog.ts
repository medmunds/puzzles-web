import { css, html, LitElement, nothing } from "lit";
import { query } from "lit/decorators/query.js";
import { customElement, property } from "lit/decorators.js";
import { cssWATweaks } from "./utils/css.ts";

// Register components
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";

export interface AlertOptions {
  label?: string;
  message?: string;
  type?: "info" | "success" | "warning" | "error";
}

export async function showAlert(options: AlertOptions) {
  const alert = Object.assign(document.createElement("alert-dialog"), options);
  document.body.appendChild(alert);
  await alert.show();
  alert.remove();
}

@customElement("alert-dialog")
export class AlertDialog extends LitElement {
  @property({ type: String })
  label: string = "";

  @property({ type: String })
  message: string = "";

  @property({ type: String, reflect: true })
  type: Required<AlertOptions>["type"] = "error";

  closed: Promise<void> = Promise.resolve();

  @query("wa-dialog")
  private dialog?: HTMLElementTagNameMap["wa-dialog"];

  private resolveClosedPromise?: () => void;

  async show() {
    await this.updateComplete;
    const dialog = this.dialog;
    if (dialog && !dialog.open) {
      this.closed = new Promise<void>((resolve) => {
        this.resolveClosedPromise = resolve;
      });
      dialog.open = true;
      await dialog.updateComplete;
    }
    return this.closed;
  }

  protected override render() {
    return html`
      <wa-dialog @wa-after-hide=${this.handleDialogHide}>
        <wa-icon slot="label" name=${this.type}></wa-icon>
        ${this.label ? html`<div slot="label">${this.label}</div>` : nothing}
        ${this.message ? html`<div>${this.message}</div>` : nothing}
      </wa-dialog>
    `;
  }

  private handleDialogHide() {
    this.resolveClosedPromise?.();
  }

  static styles = [
    cssWATweaks,
    css`
      :host {
        display: contents;
      }

      wa-dialog {
        --width: min(28rem, calc(100% - 2 * var(--wa-space-l)));
      }
      
      wa-dialog::part(dialog) {
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
      }

      :host([type="error"]) {
        wa-dialog::part(dialog) {
          border-color: var(--wa-color-danger-border-loud);
        }
        wa-icon[slot="label"] {
          color: var(--wa-color-danger-fill-loud);
        }
      }

      :host([type="info"]) {
        wa-dialog::part(dialog) {
          border-color: var(--wa-color-brand-border-loud);
        }
        wa-icon[slot="label"] {
          color: var(--wa-color-brand-fill-loud);
        }
      }

      :host([type="success"]) {
        wa-dialog::part(dialog) {
          border-color: var(--wa-color-success-border-loud);
        }
        wa-icon[slot="label"] {
          color: var(--wa-color-success-fill-loud);
        }
      }

      :host([type="warning"]) {
        wa-dialog::part(dialog) {
          border-color: var(--wa-color-warning-border-loud);
        }
        wa-icon[slot="label"] {
          color: var(--wa-color-warning-fill-loud);
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "alert-dialog": AlertDialog;
  }
}
