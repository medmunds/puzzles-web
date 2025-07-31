import type { AttributePart } from "lit";
import {
  Directive,
  type DirectiveResult,
  type PartInfo,
  PartType,
  directive,
} from "lit/directive.js";
import { assertHasReadableProperty } from "./types";

export interface AutoBindOptions<T, K extends keyof T> {
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

class AutoBindDirective<T, K extends keyof T> extends Directive {
  constructor(partInfo: PartInfo) {
    super(partInfo);
    if (
      partInfo.type !== PartType.ATTRIBUTE &&
      partInfo.type !== PartType.BOOLEAN_ATTRIBUTE
    ) {
      throw new Error("autoBind can only be used in attribute position");
    }
  }

  render(object: T, field: K, _options: AutoBindOptions<T, K> | undefined) {
    return object[field];
  }

  private current?: {
    element: HTMLElement;
    event: string;
    eventListener: EventListener;
  };

  update(
    part: AttributePart,
    [object, field, options]: [T, K, AutoBindOptions<T, K> | undefined],
  ) {
    const { event = "sl-change", convert, property = part.name } = options ?? {};

    // Remove old listener if element or event is changing
    if (
      this.current &&
      (this.current.element !== part.element || this.current.event !== event)
    ) {
      this.current.element.removeEventListener(
        this.current.event,
        this.current.eventListener,
      );
      this.current = undefined;
    }

    // Add event listener if we didn't on an earlier render
    if (!this.current) {
      this.current = {
        element: part.element,
        event: event,
        eventListener: (event) => {
          const target = event.target as HTMLElement;
          assertHasReadableProperty(target, property);
          const value = target[property];
          object[field] = convert ? convert(value) : (value as T[K]);
        },
      };
      this.current.element.addEventListener(
        this.current.event,
        this.current.eventListener,
      );
    }

    return this.render(object, field, options);
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
export const autoBind = directive(AutoBindDirective) as <T, K extends keyof T>(
  object: T,
  field: K,
  options?: AutoBindOptions<T, K>,
) => DirectiveResult;
// (Without the type cast, TS thinks `field` is type never.)
