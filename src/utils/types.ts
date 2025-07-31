/**
 * Return the PropertyDescriptor for property in obj's prototype chain (if any)
 */
export function getPropertyDescriptor(
  obj: unknown,
  property: PropertyKey,
): PropertyDescriptor | undefined {
  for (let o = obj; o; o = Object.getPrototypeOf(o)) {
    const descriptor = Object.getOwnPropertyDescriptor(o, property);
    if (descriptor) {
      return descriptor;
    }
  }
  return undefined;
}

/**
 * Runtime type guard that obj[key] is readable
 */
export function hasReadableProperty<T, K extends string>(
  obj: T,
  key: K,
): obj is T & Readonly<Record<K, unknown>> {
  const descriptor = getPropertyDescriptor(obj, key);
  return descriptor
    ? "value" in descriptor || typeof descriptor?.get === "function"
    : false;
}

/**
 * Runtime type guard that obj[key] is writable
 */
export function hasWritableProperty<T, K extends string>(
  obj: T,
  key: K,
): obj is T & Record<K, unknown> {
  const descriptor = getPropertyDescriptor(obj, key);
  return descriptor?.writable || typeof descriptor?.set === "function";
}

/**
 * Development-only runtime assertion that obj[key] is readable
 */
export function assertHasReadableProperty<T, K extends string>(
  obj: T,
  key: K,
  message?: string | (() => string),
): asserts obj is T & Readonly<Record<K, unknown>> {
  if (import.meta.env.DEV && !hasReadableProperty(obj, key)) {
    const errorMessage =
      typeof message === "function"
        ? message()
        : (message ?? `Object does not have property ${key}`);
    throw new Error(errorMessage);
  }
}

/**
 * Development-only runtime assertion that obj[key] is writable
 */
export function assertHasWritableProperty<T, K extends string>(
  obj: T,
  key: K,
  message?: string | (() => string),
): asserts obj is T & Record<K, unknown> {
  if (import.meta.env.DEV && !hasWritableProperty(obj, key)) {
    const errorMessage =
      typeof message === "function"
        ? message()
        : (message ?? `Object does not have writable property ${key}`);
    throw new Error(errorMessage);
  }
}
