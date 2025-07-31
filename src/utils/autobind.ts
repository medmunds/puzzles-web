import type { AttributePart } from "lit";
import {
  AsyncDirective,
  type DirectiveResult,
  type PartInfo,
  PartType,
  directive,
} from "lit/async-directive.js";
import { assertHasReadableProperty } from "./types";

export interface AutoBindOptions<T extends object, K extends keyof T> {
  /**
   * The name of the element's change event (default "sl-change")
   */
  event?: string;

  /**
   * The name of the element's property that holds the current value
   * (default same as the attribute where the directive is applied)
   */
  property?: string;

  /**
   * Function that converts from element[property] value to object[field]
   * (default assumes no conversion necessary)
   */
  convert?: (value: unknown) => T[K];
}

class AutoBindDirective<T extends object, K extends keyof T> extends AsyncDirective {
  constructor(partInfo: PartInfo) {
    super(partInfo);
    if (
      partInfo.type !== PartType.ATTRIBUTE &&
      partInfo.type !== PartType.BOOLEAN_ATTRIBUTE
    ) {
      throw new Error("autoBind can only be used in attribute position");
    }
  }

  private object?: T;
  private field?: K;
  private event = "";
  private property = "";
  private convert?: (value: unknown) => T[K];
  private element?: HTMLElement;
  private eventListenerInstalled = false;

  private handleEvent = (event: Event) => {
    // Listener for this.event (typically "change" or similar).
    if (!this.object || !this.field) {
      throw new Error("AutoBindDirective.handleEvent called before first update");
    }
    const target = event.target as HTMLElement;
    assertHasReadableProperty(target, this.property);
    const value = target[this.property];
    this.object[this.field] = this.convert ? this.convert(value) : (value as T[K]);
  };

  private listen() {
    if (!this.element) {
      throw new Error("AutoBindDirective.listen called before first update");
    }
    if (!this.eventListenerInstalled) {
      this.element.addEventListener(this.event, this.handleEvent);
      this.eventListenerInstalled = true;
    }
  }

  private unlisten() {
    if (this.eventListenerInstalled && this.element) {
      this.element.removeEventListener(this.event, this.handleEvent);
    }
    this.eventListenerInstalled = false;
  }

  override render(object: T, field: K, _options: AutoBindOptions<T, K> | undefined) {
    return object[field];
  }

  override update(
    part: AttributePart,
    [object, field, options]: [T, K, AutoBindOptions<T, K> | undefined],
  ) {
    const { event = "sl-change", convert, property = part.name } = options ?? {};

    // Remove old listener if element or event is changing
    if (
      this.eventListenerInstalled &&
      (this.element !== part.element || this.event !== event)
    ) {
      this.unlisten();
    }

    // Always capture latest values (for handleEvent)
    this.element = part.element;
    this.object = object;
    this.field = field;
    this.event = event;
    this.property = property;
    this.convert = convert;

    // Add event listener if we didn't on an earlier update (and we're still connected)
    if (this.isConnected && !this.eventListenerInstalled) {
      this.listen();
    }

    return this.render(object, field, options);
  }

  override disconnected() {
    this.unlisten();
  }

  override reconnected() {
    this.listen();
  }
}

/**
 * Lit custom directive that creates a two-way binding between
 * a property and `object[field]`:
 *
 *   <input value=${autoBind(settings, "foo", {event: "change"})}>
 *
 * Is (roughly) equivalent to:
 *
 *   <input
 *     value=${settings["foo"]}
 *     @change=${
 *       (event) => { settings["foo"] = event.target.value; }
 *     }
 *   >
 */
export const autoBind = directive(AutoBindDirective) as <
  T extends object,
  K extends keyof T,
>(
  object: T,
  field: K,
  options?: AutoBindOptions<T, K>,
) => DirectiveResult;
// (Without the type cast, TS thinks `field` is type never.)
