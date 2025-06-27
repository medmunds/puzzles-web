import { SignalWatcher } from "@lit-labs/signals";
import { consume } from "@lit/context";
import type SlDialog from "@shoelace-style/shoelace/dist/components/dialog/dialog.js";
import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { query } from "lit/decorators/query.js";
import { when } from "lit/directives/when.js";
import { puzzleContext } from "./contexts.ts";
import type { Puzzle } from "./puzzle.ts";
import type { ConfigDescription, ConfigItem, ConfigValues } from "./types.ts";

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

const isNumeric = (value: unknown) =>
  typeof value === "number" || (typeof value === "string" && /[0-9]+/.test(value));

/**
 * Common code for configuration dialogs.
 * Must be used within a puzzle-context component.
 */
abstract class PuzzleConfig extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  protected puzzle?: Puzzle;

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
   * The title for the dialog; taken from the config title by default
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
  protected dialog?: SlDialog;

  @state()
  protected config?: ConfigDescription;

  @state()
  protected values: ConfigValues = {};

  @state()
  protected error?: string;

  protected abstract getConfig(): Promise<ConfigDescription | undefined>;
  protected abstract getValues(): Promise<ConfigValues>;
  protected abstract setValues(values: ConfigValues): Promise<string | undefined>;

  protected async loadConfig(): Promise<void> {
    this.config = await this.getConfig();
    this.dialogTitle = this.config?.title || "";
    await this.loadValues();
  }

  protected async loadValues() {
    this.values = await this.getValues();
    this.error = undefined;
  }

  protected async afterSubmit(_applied: boolean): Promise<void> {
    await this.puzzle?.redraw();
  }

  protected override async willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("puzzle") && this.puzzle) {
      await this.loadConfig();
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
          ${Object.entries(this.config?.items ?? {}).map(([id, config]) => this.renderConfigItem(id, config))}
        </form>

        <div slot="footer" part="footer">
          <sl-button variant="primary" @click=${this.handleSubmit}>${this.submitLabel}</sl-button>
          <sl-button @click=${this.handleCancel}>${this.cancelLabel}</sl-button>
        </div>
      </sl-dialog>
    `;
  }

  private renderConfigItem(id: string, config: ConfigItem) {
    const value = this.values?.[id];
    switch (config.type) {
      case "string":
        return html`
          <sl-input
            id=${id}
            inputmode=${isNumeric(value) ? "decimal" : "text"}
            label=${config.name}
            value=${value}
            @sl-focus=${this.autoSelectInput}
            @sl-change=${this.updateTextValue}
          ></sl-input>
        `;

      case "boolean":
        return html`
          <sl-checkbox 
            id=${id}
            ?checked=${value}
            @sl-change=${this.updateCheckboxValue}
          >${config.name}</sl-checkbox>
        `;

      case "choices":
        if (config.choicenames.length <= 3) {
          // Render small option sets as a radio button group rather than a select popup
          return html`
            <sl-radio-group
              id=${id}
              label=${config.name}
              value=${value}
              @sl-change=${this.updateSelectValue}
            >
              ${config.choicenames.map(
                (choice, value) => html`
                <sl-radio-button value=${value}>${choice}</sl-radio-button>`,
              )}
            </sl-radio-group>
          `;
        }
        return html`
          <sl-select
            id=${id}
            label=${config.name}
            value=${value}
            @sl-change=${this.updateSelectValue}
          >
            ${config.choicenames.map(
              (choice, value) => html`
              <sl-option value=${value}>${choice}</sl-option>
            `,
            )}
          </sl-select>
        `;

      default:
        // @ts-ignore: item.type never
        throw new Error(`Unknown config item type ${item.type}`);
    }
  }

  private autoSelectInput(event: FocusEvent) {
    const target = event.target as HTMLInputElement;
    target.select();
  }

  private updateTextValue(event: CustomEvent) {
    const target = event.target as HTMLInputElement;
    this.values[target.id] = target.value;
  }

  private updateCheckboxValue(event: CustomEvent) {
    const target = event.target as HTMLInputElement;
    this.values[target.id] = target.checked;
  }

  private updateSelectValue(event: CustomEvent) {
    const target = event.target as HTMLInputElement;
    this.values[target.id] = Number.parseInt(target.value);
  }

  private async handleSubmit(e: Event) {
    e.preventDefault();

    if (!this.puzzle) {
      return;
    }

    try {
      // Submit updated config
      const result = await this.setValues(this.values);

      if (result) {
        // If there's a result string, it's an error message
        this.error = result;
      } else {
        // Success
        this.hide();
        await this.afterSubmit(true);
      }
    } catch (err) {
      console.error("Failed to apply config:", err);
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  private async handleCancel() {
    this.hide();
    await this.afterSubmit(false);
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

  public async reloadValues() {
    await this.loadValues();
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

/**
 * Dialog for editing custom game params (custom type)
 */
@customElement("puzzle-custom-params")
export class PuzzleCustomParams extends PuzzleConfig {
  protected override async getConfig() {
    return this.puzzle?.getCustomParamsConfig();
  }

  protected override async getValues() {
    return this.puzzle?.getCustomParams() ?? {};
  }

  protected override async setValues(values: ConfigValues) {
    return this.puzzle?.setCustomParams(values);
  }

  protected override async afterSubmit(applied: boolean) {
    if (applied) {
      // Start a new game with the new params
      await this.puzzle?.newGame();
    }
  }
}

/**
 * Dialog for editing puzzle preferences
 */
@customElement("puzzle-preferences")
export class PuzzlePreferences extends PuzzleConfig {
  protected override async getConfig() {
    return this.puzzle?.getPreferencesConfig();
  }

  protected override async getValues() {
    return this.puzzle?.getPreferences() ?? {};
  }

  protected override async setValues(values: ConfigValues) {
    return this.puzzle?.setPreferences(values);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-custom-params": PuzzleCustomParams;
    "puzzle-preferences": PuzzlePreferences;
  }
}
