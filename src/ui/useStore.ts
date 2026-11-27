import { useSyncExternalStore } from 'react';
import { store } from '../game/store';

export function useStore() {
    useSyncExternalStore(store.subscribe, store.getVersion);
    return store;
}
