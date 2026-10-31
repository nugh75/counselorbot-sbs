import { useSyncExternalStore } from 'react';

const noSubscription = () => () => {};

/** Reads a browser-only primitive (URL, origin, device, localStorage flag)
    without a mount effect: the server render and hydration use `serverValue`,
    then the client value. `read` must return a primitive so React can compare
    snapshots; values that never change after load need no subscription. */
export function useClientValue<T extends string | number | boolean | null>(read: () => T, serverValue: T): T {
    return useSyncExternalStore(noSubscription, read, () => serverValue);
}
