/**
 * Element.closest(selectors) that pierces shadow roots.
 *
 * Adapted from
 * https://www.abeautifulsite.net/posts/finding-the-closest-element-through-shadow-roots/
 */
export function closest<E extends Element = Element>(
  element: Element,
  selectors: string,
): E | null {
  function getNext(el: Element, next = el?.closest<E>(selectors)): E | null {
    if (el instanceof Window || el instanceof Document || !el) {
      return null;
    }

    return next ? next : getNext((el.getRootNode() as ShadowRoot).host);
  }

  return getNext(element);
}
