import type { GameEvents } from '../types';

type Handler<T> = (payload: T) => void;

/** Typed event bus. Handlers errors are caught and re-emitted as 'error'. */
export class EventBus<E extends Record<string, any> = GameEvents> {
  private map = new Map<keyof E, Set<Handler<any>>>();
  private anyHandlers = new Set<(name: keyof E, payload: any) => void>();

  on<K extends keyof E>(name: K, fn: Handler<E[K]>): () => void {
    let set = this.map.get(name);
    if (!set) { set = new Set(); this.map.set(name, set); }
    set.add(fn);
    return () => set!.delete(fn);
  }

  /** Subscribe to every event (used by test API event log). */
  onAny(fn: (name: keyof E, payload: any) => void): () => void {
    this.anyHandlers.add(fn);
    return () => this.anyHandlers.delete(fn);
  }

  emit<K extends keyof E>(name: K, payload: E[K]): void {
    this.anyHandlers.forEach((fn) => { try { fn(name, payload); } catch (e) { console.error(e); } });
    const set = this.map.get(name);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try { fn(payload); } catch (e) {
        console.error(`[EventBus] handler for ${String(name)} threw`, e);
        if (name !== 'error') (this as any).emit('error', { message: String(e), source: String(name) });
      }
    }
  }

  clear(): void { this.map.clear(); this.anyHandlers.clear(); }
}
