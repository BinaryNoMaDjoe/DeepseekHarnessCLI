import { useSyncExternalStore } from "react";
import type { SessionUiState, SessionStore } from "./store.js";

/** React binding: re-render when the store notifies. */
export function useSessionState(store: SessionStore): SessionUiState {
  return useSyncExternalStore(store.subscribe, store.getState);
}
