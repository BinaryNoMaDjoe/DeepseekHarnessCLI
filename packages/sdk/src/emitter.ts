import type { Emitter, Unsubscribe } from "./events.js";

/**
 * A tiny synchronous typed emitter. Deliberately dependency-free; sized for
 * the SDK's single hot path (session events), not a general pub/sub library.
 */
export function createEmitter<E>(): Emitter<E> {
  const listeners = new Set<(event: E) => void>();
  return {
    emit(event: E): void {
      for (const listener of listeners) listener(event);
    },
    subscribe(listener: (event: E) => void): Unsubscribe {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
