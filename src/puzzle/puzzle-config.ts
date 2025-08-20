import type WaDialog from "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import { consume } from "@lit/context";
import { SignalWatcher, signal } from "@lit-labs/signals";
import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { query } from "lit/decorators/query.js";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { puzzleContext } from "./contexts.ts";
import type { Puzzle } from "./puzzle.ts";
import type { ConfigDescription, ConfigItem, ConfigValues } from "./types.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/checkbox/checkbox.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import "@awesome.me/webawesome/dist/components/divider/divider.js";
import "@awesome.me/webawesome/dist/components/input/input.js";
import "@awesome.me/webawesome/dist/components/option/option.js";
import "@awesome.me/webawesome/dist/components/scroller/scroller.js";
import "@awesome.me/webawesome/dist/components/select/select.js";
import "@awesome.me/webawesome/dist/components/radio/radio.js";
import "@awesome.me/webawesome/dist/components/radio-group/radio-group.js";

const isNumeric = (value: unknown) =>
  typeof value === "number" || (typeof value === "string" && /[0-9]+/.test(value));

interface PuzzleConfigChangeDetail {
  puzzle: Puzzle;
  changes: ConfigValues;
  value: ConfigValues;
}
export type PuzzleConfigChangeEvent = CustomEvent<PuzzleConfigChangeDetail>;

/**
 * Common code for configuration forms.
 * Must be used within a puzzle-context component.
 */
abstract class PuzzleConfigForm extends SignalWatcher(LitElement) {
  @consume({ context: puzzleContext, subscribe: true })
  @state()
  protected puzzle?: Puzzle;

  @property({ type: Boolean })
  autosubmit = false;

  /**
   * The title for the dialog, per the config
   */
  get title(): string {
    return this._title.get();
  }

  protected _title = signal<string>("");

  @state()
  protected config?: ConfigDescription;

  @state()
  protected values: ConfigValues = {};

  @state()
  protected changes: ConfigValues = {};

  @state()
  protected error?: string;

  protected abstract submitEventType: string;
  protected abstract getConfig(): Promise<ConfigDescription | undefined>;
  protected abstract getValues(): Promise<ConfigValues>;
  protected abstract setValues(values: ConfigValues): Promise<string | undefined>;

  protected async loadConfig(): Promise<void> {
    this.config = await this.getConfig();
    this._title.set(this.config?.title ?? "");
    await this.loadValues();
  }

  protected async loadValues() {
    this.values = await this.getValues();
    this.changes = {};
    this.error = undefined;
  }

  protected override async willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("puzzle") && this.puzzle) {
      await this.loadConfig();
    }
  }

  protected override render() {
    return html`
      <form part="form" @submit=${this.submit}>
        ${when(this.error, () => html`<div part="error">${this.error}</div>`)}

        ${Object.entries(this.config?.items ?? {}).map(([id, config]) => this.renderConfigItem(id, config))}
      </form>
    `;
  }

  private renderConfigItem(id: string, config: ConfigItem) {
    const value = this.changes[id] ?? this.values[id];
    switch (config.type) {
      case "string":
        return html`
          <wa-input
            id=${id}
            inputmode=${isNumeric(value) ? "decimal" : "text"}
            label=${config.name}
            value=${value}
            @focus=${this.autoSelectInput}
            @change=${this.updateTextValue}
          ></wa-input>
        `;

      case "boolean":
        return html`
          <wa-checkbox 
            id=${id}
            ?checked=${value}
            @change=${this.updateCheckboxValue}
          >${config.name}</wa-checkbox>
        `;

      case "choices":
        if (config.choicenames.length <= 4) {
          // Render small option sets as a radio button group rather than a select popup.
          // Use a horizontal button group for short options, otherwise vertical radio buttons.
          const totalChars = config.choicenames.reduce(
            (sum, name) => sum + name.length,
            0,
          );
          const isShort = totalChars < 30;

          // Bind to .value (property) rather than value (attribute) to work
          // around a wa-radio-group bug where attribute changes aren't rendered.
          // https://github.com/shoelace-style/webawesome/issues/1273
          return html`
            <wa-radio-group
              id=${id}
              label=${config.name}
              .value=${value}
              orientation=${isShort ? "horizontal" : "vertical"}
              @change=${this.updateSelectValue}
            >
              ${config.choicenames.map(
                (choice, value) => html`
                  <wa-radio 
                    value=${value} 
                    appearance=${isShort ? "button" : nothing}
                  >${choice}</wa-radio>
                `,
              )}
            </wa-radio-group>
          `;
        }
        return html`
          <wa-select
            id=${id}
            label=${config.name}
            value=${value}
            @change=${this.updateSelectValue}
          >
            ${config.choicenames.map(
              (choice, value) => html`
              <wa-option value=${value}>${choice}</wa-option>
            `,
            )}
          </wa-select>
        `;

      default:
        // @ts-ignore: item.type never
        throw new Error(`Unknown config item type ${item.type}`);
    }
  }

  private resetFormItemValues() {
    // If the form has already been rendered, re-rendering with new value attributes
    // won't update input element state. Flush current values into item properties.
    for (const [id, { type }] of Object.entries(this.config?.items ?? [])) {
      const value = this.changes[id] ?? this.values[id];
      const element = this.shadowRoot?.querySelector<HTMLInputElement>(`#${id}`);
      if (element && value !== undefined) {
        if (type === "boolean") {
          element.checked = Boolean(value);
        } else {
          element.value = String(value);
        }
      }
    }
  }

  private autoSelectInput(event: FocusEvent) {
    const target = event.target as HTMLInputElement;
    target.select();
  }

  private async updateTextValue(event: CustomEvent) {
    const target = event.target as HTMLInputElement;
    this.changes[target.id] = target.value; // doesn't force redraw
    if (this.autosubmit) {
      await this.submit();
    }
  }

  private async updateCheckboxValue(event: CustomEvent) {
    const target = event.target as HTMLInputElement;
    this.changes[target.id] = target.checked; // doesn't force redraw
    if (this.autosubmit) {
      await this.submit();
    }
  }

  private async updateSelectValue(event: CustomEvent) {
    const target = event.target as HTMLInputElement;
    this.changes[target.id] = Number.parseInt(target.value); // doesn't force redraw
    if (this.autosubmit) {
      await this.submit();
    }
  }

  public get hasErrors(): boolean {
    return this.error !== undefined;
  }

  public async submit(event?: Event) {
    event?.preventDefault();

    const result = await this.setValues(this.changes);
    if (result) {
      // If there's a result string, it's an error message
      this.error = result;
    } else {
      // Success
      if (this.puzzle) {
        this.dispatchEvent(
          new CustomEvent<PuzzleConfigChangeDetail>(this.submitEventType, {
            bubbles: true,
            composed: true,
            detail: {
              puzzle: this.puzzle,
              changes: this.changes,
              value: this.values,
            },
          }),
        );
      }

      this.values = { ...this.values, ...this.changes };
      this.changes = {};
    }
  }

  public async reset() {
    this.changes = {};
    this.error = undefined;
    this.resetFormItemValues();
  }

  public async reloadValues() {
    await this.loadValues();
    await this.updateComplete;
    this.resetFormItemValues();
  }

  static styles = css`
    :host {
      display: contents;
      --item-spacing: var(--wa-space-l);
    }

    [part="form"] {
      display: flex;
      flex-direction: column;
      gap: var(--item-spacing);
      align-items: flex-start;
    }

    [part="error"] {
      color: var(--wa-color-danger-on-normal);
      margin-bottom: var(--item-spacing);
    }
  `;
}

/**
 * Form for editing custom game params (custom puzzle type)
 */
@customElement("puzzle-custom-params-form")
export class PuzzleCustomParamsForm extends PuzzleConfigForm {
  protected override submitEventType = "puzzle-custom-params-change";

  protected override async getConfig() {
    return this.puzzle?.getCustomParamsConfig();
  }

  protected override async getValues() {
    return this.puzzle?.getCustomParams() ?? {};
  }

  protected override async setValues(values: ConfigValues) {
    return this.puzzle?.setCustomParams(values);
  }

  /**
   * Return encoded params for current form values
   */
  async getParams(): Promise<string | undefined> {
    if (this.puzzle) {
      const result = await this.puzzle.encodeCustomParams({
        ...this.values,
        ...this.changes,
      });
      if (!result.startsWith("#ERROR:")) {
        return result;
      }
      console.warn(`PuzzleCustomParamsForm.getParams: ${result}`);
    }
  }
}

/**
 * Form for editing puzzle preferences
 */
@customElement("puzzle-preferences-form")
export class PuzzlePreferencesForm extends PuzzleConfigForm {
  protected override submitEventType = "puzzle-preferences-change";

  protected override async getConfig() {
    return this.puzzle?.getPreferencesConfig();
  }

  protected override async getValues() {
    return this.puzzle?.getPreferences() ?? {};
  }

  protected override async setValues(values: ConfigValues) {
    const result = await this.puzzle?.setPreferences(values);
    if (!result) {
      await this.puzzle?.redraw();
    }
    return result;
  }
}

abstract class PuzzleConfigDialog extends SignalWatcher(LitElement) {
  /**
   * The label for the submit button
   */
  @property({ type: String, attribute: "submit-label" })
  submitLabel = "OK";

  /**
   * The label for the cancel button
   */
  @property({ type: String, attribute: "cancel-label" })
  cancelLabel = "Cancel";

  @property({ type: String, attribute: "dialog-title" })
  dialogTitle = "Configuration";

  @query("wa-dialog", true)
  protected dialog?: WaDialog;

  protected abstract form?: PuzzleConfigForm;

  protected override render() {
    return html`
      <wa-dialog label=${this.dialogTitle}>
        <wa-scroller orientation="vertical">
          ${this.renderConfigForm()}
        </wa-scroller>
        
        <div slot="footer" part="footer">
          <wa-button appearance="filled outlined" @click=${this.handleCancel}>${this.cancelLabel}</wa-button>
          <wa-button variant="brand" @click=${this.handleSubmit}>${this.submitLabel}</wa-button>
        </div>
      </wa-dialog>
    `;
  }

  protected override updated() {
    if (!this.hasAttribute("dialog-title")) {
      // Get the dialog title from the form.
      // This causes Lit changed-in-update warning.
      const title = this.form?.title;
      if (title && title !== this.dialogTitle) {
        this.dialogTitle = title;
      }
    }
  }

  protected abstract renderConfigForm(): TemplateResult;

  protected async handleSubmit() {
    await this.form?.submit();
    if (!this.form?.hasErrors) {
      await this.hide();
    }
  }

  protected async handleCancel() {
    await this.form?.reset();
    await this.hide();
  }

  // Expose dialog's open property
  get open() {
    return this.dialog?.open ?? false;
  }
  set open(isOpen: boolean) {
    if (this.dialog) {
      this.dialog.open = isOpen;
    }
  }

  show() {
    this.open = true;
  }

  hide() {
    this.open = false;
  }

  async reloadValues(): Promise<void> {
    return this.form?.reloadValues();
  }

  static styles = css`
    :host {
      display: contents;
    }
    
    wa-dialog::part(body) {
      /* Move overflow scrolling to wa-scroller; constrain size */
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    wa-scroller {
      /* Make the shadow visibly larger than puzzle-config-form --item-spacing, 
         but leave at least enough room for a full form control between shadows. 
      */
      --shadow-size: min(
          calc(2.5 * var(--wa-space-l)),
          calc((100% - var(--wa-form-control-height)) / 2) 
      );
    }

    [part="footer"] {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
      justify-content: end;
      align-items: center;
      gap: var(--wa-space-s);
    }
  `;
}
// change-in-update is necessary because title is retrieved
// from PuzzleConfigForm after first render.
PuzzleConfigDialog.disableWarning?.("change-in-update");

/**
 * Dialog for editing custom game params (custom puzzle type)
 */
@customElement("puzzle-custom-params-dialog")
export class PuzzleCustomParamsDialog extends PuzzleConfigDialog {
  @query("puzzle-custom-params-form")
  protected form?: PuzzleCustomParamsForm;

  protected override renderConfigForm() {
    return html`
      <puzzle-custom-params-form part="form"></puzzle-custom-params-form>
    `;
  }

  async getParams(): Promise<string | undefined> {
    return this.form?.getParams();
  }
}

/**
 * Dialog for editing puzzle preferences
 */
@customElement("puzzle-preferences-dialog")
export class PuzzlePreferencesDialog extends PuzzleConfigDialog {
  @query("puzzle-preferences-form")
  protected form?: PuzzlePreferencesForm;

  protected override renderConfigForm() {
    return html`
      <puzzle-preferences-form part="form"></puzzle-preferences-form>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "puzzle-custom-params-form": PuzzleCustomParamsForm;
    "puzzle-preferences-form": PuzzlePreferencesForm;
    "puzzle-custom-params-dialog": PuzzleCustomParamsDialog;
    "puzzle-preferences-dialog": PuzzlePreferencesDialog;
  }

  interface HTMLElementEventMap {
    "puzzle-custom-params-change": PuzzleConfigChangeEvent;
    "puzzle-preferences-change": PuzzleConfigChangeEvent;
  }
}
