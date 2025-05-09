import { SignalWatcher } from "@lit-labs/signals";
import { consume } from "@lit/context";
import type SlDialog from "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { query } from "lit/decorators/query.js";
import { when } from "lit/directives/when.js";
import { puzzleContext } from "./contexts.ts";
import type { ConfigItem, ConfigItems, Puzzle } from "./puzzle.ts";

// Register components
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/checkbox/checkbox.js";
import "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
import "@shoelace-style/shoelace/dist/components/divider/divider.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/option/option.js";
import "@shoelace-style/shoelace/dist/components/select/select.js";
import "@shoelace-style/shoelace/dist/components/radio-button/radio-button.js";
import "@shoelace-style/shoelace/dist/components/radio-group/radio-group.js";

/**
 * The `<puzzle-config>` component renders a configuration dialog for a puzzle.
 * It must be used within a puzzle-context component.
 */
@customElement("puzzle-config")
export class PuzzleConfig extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  private puzzle?: Puzzle;

  /**
   * Which configuration to display (0 for game preferences, 1 for custom params)
   */
  @property({ type: Number })
  which = 0;

  /**
   * The label for the submit button
   */
  @property({ type: String })
  submitLabel = "Apply";

  /**
   * The label for the cancel button
   */
  @property({ type: String })
  cancelLabel = "Cancel";

  /**
   * The title for the dialog; taken from the configItems title by default
   */
  @property({ type: String })
  dialogTitle = "Configure puzzle";

  // Expose dialog's open property
  get open() {
    return this.dialog?.open ?? false;
  }
  set open(isOpen: boolean) {
    if (isOpen) {
      this.dialog?.show();
    } else {
      this.dialog?.hide();
    }
  }

  @query("sl-dialog")
  private dialog?: SlDialog;

  @state()
  private configItems: ConfigItems = [];

  @state()
  private error?: string;

  override async connectedCallback() {
    super.connectedCallback();
    await this.loadConfigItems();
  }

  override async willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("puzzle") || changedProperties.has("which")) {
      await this.loadConfigItems();
    }
  }

  private async loadConfigItems() {
    if (!this.puzzle) return;

    try {
      this.configItems = await this.puzzle.getConfigItems(this.which);
      this.error = undefined;

      // Find the first title item to use as dialog title if not explicitly set
      if (!this.hasAttribute("dialogTitle")) {
        const titleItem = this.configItems.find((item) => item.type === "title");
        if (titleItem) {
          this.dialogTitle = titleItem.label;
        }
      }
    } catch (err) {
      console.error("Failed to load config items:", err);
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  override render() {
    return html`
      <sl-dialog 
          label=${this.dialogTitle} 
          @sl-after-hide=${this.handleDialogHide}
          @sl-request-close=${this.handleDialogRequestClose}
      >
        ${when(this.error, () => html`<div part="error">${this.error}</div>`)}

        <form part="form" @submit=${this.handleSubmit}>
          ${this.configItems.map((item, index) => this.renderConfigItem(item, index))}
        </form>

        <div slot="footer" part="footer">
          <sl-button variant="primary" @click=${this.handleSubmit}>${this.submitLabel}</sl-button>
          <sl-button @click=${this.handleCancel}>${this.cancelLabel}</sl-button>
        </div>
      </sl-dialog>
    `;
  }

  private renderConfigItem(item: ConfigItem, index: number) {
    switch (item.type) {
      case "title":
        // Title was rendered as the dialog title
        break;

      case "text":
        return html`
          <sl-input
            data-index=${index}
            label=${item.label}
            value=${item.value}
            @sl-input=${this.updateTextValue}
          ></sl-input>
        `;

      case "checkbox":
        return html`
          <sl-checkbox
            data-index=${index}
            ?checked=${item.value}
            @sl-change=${this.updateCheckboxValue}
          >${item.label}</sl-checkbox>
        `;

      case "select":
        if (item.options.length <= 3) {
          // Render small option sets as a radio button group rather than a select popup
          return html`
            <sl-radio-group
              data-index=${index}
              label=${item.label}
              value=${item.value}
              @sl-change=${this.updateSelectValue}
            >
              ${item.options.map(
                (option, index) => html`
                <sl-radio-button value=${index}>${option}</sl-radio-button>`,
              )}
            </sl-radio-group>
          `;
        }
        return html`
          <sl-select
            data-index=${index}
            label=${item.label}
            value=${item.value}
            @sl-change=${this.updateSelectValue}
          >
            ${item.options.map(
              (option, index) => html`
              <sl-option value=${index}>${option}</sl-option>
            `,
            )}
          </sl-select>
        `;

      default:
        // @ts-ignore: item.type never
        throw new Error(`Unknown config item type ${item.type}`);
    }
  }

  // Form controls edit the configItems' values in place
  private getFormConfigItem(element: HTMLElement): ConfigItem {
    const dataIndex = element.getAttribute("data-index");
    if (!dataIndex) {
      throw new Error("Element does not have a data-index attribute");
    }
    const index = Number.parseInt(dataIndex, 10);
    return this.configItems[index];
  }

  private updateTextValue(event: CustomEvent) {
    const target = event.target as HTMLInputElement;
    const configItem = this.getFormConfigItem(target);
    if (configItem.type !== "text") {
      throw new Error(
        `updateTextValue() can't handle type ${configItem.type} for ${configItem.label}`,
      );
    }
    configItem.value = target.value;
  }

  private updateCheckboxValue(event: CustomEvent) {
    const target = event.target as HTMLInputElement;
    const configItem = this.getFormConfigItem(target);
    if (configItem.type !== "checkbox") {
      throw new Error(
        `updateCheckboxValue() can't handle type ${configItem.type} for ${configItem.label}`,
      );
    }
    configItem.value = target.checked;
  }

  private updateSelectValue(event: CustomEvent) {
    const target = event.target as HTMLInputElement;
    const configItem = this.getFormConfigItem(target);
    if (configItem.type !== "select") {
      throw new Error(
        `updateSelectValue() can't handle type ${configItem.type} for ${configItem.label}`,
      );
    }
    configItem.value = Number.parseInt(target.value);
  }

  private async handleSubmit(e: Event) {
    e.preventDefault();

    if (!this.puzzle) return;

    try {
      // Submit updated config
      const result = await this.puzzle.setConfigItems(this.which, this.configItems);

      if (result) {
        // If there's a result string, it's an error message
        this.error = result;
      } else {
        // Success - dispatch event and hide dialog
        const event = new CustomEvent("puzzle-config-applied", {
          bubbles: true,
          composed: true,
          detail: { which: this.which },
        });

        this.dispatchEvent(event);
        this.hide();
        if (!event.defaultPrevented) {
          if (this.which === 0) {
            // By default, start a new game with the updated config
            await this.puzzle.newGame();
          } else {
            await this.puzzle.redraw();
          }
        }
      }
    } catch (err) {
      console.error("Failed to apply config:", err);
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  private handleCancel() {
    this.dispatchEvent(
      new CustomEvent("puzzle-config-cancelled", {
        bubbles: true,
        composed: true,
        detail: { which: this.which },
      }),
    );
    this.hide();
  }

  private handleDialogHide() {
    // Notify parent that dialog was closed
    this.dispatchEvent(
      new CustomEvent("puzzle-config-closed", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleDialogRequestClose(event: CustomEvent<{ source: string }>) {
    // Prevent the dialog from closing when the user clicks on the overlay
    if (event.detail.source === "overlay") {
      event.preventDefault();
    }
  }

  /**
   * Show the configuration dialog
   */
  public show() {
    this.dialog?.show();
  }

  /**
   * Hide the configuration dialog
   */
  public hide() {
    this.dialog?.hide();
  }

  public async reloadConfigItems() {
    await this.loadConfigItems();
    await this.updateComplete;
  }

  static styles = css`
    :host {
      display: contents;
    }

    [part="form"] {
      display: flex;
      flex-direction: column;
      gap: var(--sl-spacing-medium);
    }

    [part="footer"] {
      display: flex;
      justify-content: flex-end;
      gap: var(--sl-spacing-small);
    }

    [part="error"] {
      color: var(--sl-color-danger-600);
      margin-bottom: var(--sl-spacing-medium);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-config": PuzzleConfig;
  }
}
