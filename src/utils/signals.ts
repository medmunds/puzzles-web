import { Signal, signal } from "@lit-labs/signals";
import { liveQuery, type Subscription } from "dexie";

/**
 * Creates a signal that automatically manages a Dexie liveQuery subscription.
 * The liveQuery is only active when the signal is being observed.
 *
 * @param initialValue - Initial value for the signal
 * @param querier - Function that queries Dexie -- see Dexie liveQuery for limitations
 * @param options - Additional signal options (like custom equals function)
 * @returns A signal that stays in sync with the liveQuery result
 */
export function liveQuerySignal<T>(
  initialValue: T,
  querier: () => T | Promise<T>,
  options?: Omit<
    Signal.Options<T>,
    typeof Signal.subtle.watched | typeof Signal.subtle.unwatched
  >,
): Signal.State<T> {
  const query = liveQuery(querier);
  let subscription: Subscription | undefined;

  const startWatching = () => {
    if (!subscription) {
      subscription = query.subscribe((value) => {
        resultSignal.set(value);
      });
    }
  };

  const stopWatching = () => {
    subscription?.unsubscribe();
    subscription = undefined;
  };

  const resultSignal = signal<T>(initialValue, {
    ...options,
    [Signal.subtle.watched]: startWatching,
    [Signal.subtle.unwatched]: stopWatching,
  });

  return resultSignal;
}
