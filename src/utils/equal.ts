/**
 * Return true if sets have same items
 */
export const equalSet = <T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean => {
  // TODO: can be simplified in ES2024:
  //   return a.size === b.size && a.isSubsetOf(b);
  if (a.size !== b.size) {
    return false;
  }
  for (const item of a) {
    if (!b.has(item)) {
      return false;
    }
  }
  return true;
};
