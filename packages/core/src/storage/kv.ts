import { createStore, del, entries, get, set, type UseStore } from 'idb-keyval';

/** Armazenamento chave-valor assíncrono. Valores são clonáveis (JSON-safe). */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  entries(): Promise<[string, unknown][]>;
}

/** Implementação em memória: testes e fallback quando o IndexedDB não está disponível. */
export function createMemoryKv(initial: Record<string, unknown> = {}): KeyValueStore {
  const map = new Map<string, unknown>(Object.entries(initial));
  return {
    get: async (key) => structuredClone(map.get(key)),
    set: async (key, value) => void map.set(key, structuredClone(value)),
    del: async (key) => void map.delete(key),
    entries: async () => [...map.entries()].map(([k, v]) => [k, structuredClone(v)]),
  };
}

/** Implementação em IndexedDB (via idb-keyval). */
export function createIdbKv(dbName = 'recreio', storeName = 'kv'): KeyValueStore {
  let store: UseStore | undefined;
  const s = (): UseStore => (store ??= createStore(dbName, storeName));
  return {
    get: (key) => get(key, s()),
    set: (key, value) => set(key, value, s()),
    del: (key) => del(key, s()),
    entries: async () =>
      (await entries(s())).filter((e): e is [string, unknown] => typeof e[0] === 'string'),
  };
}

/** IndexedDB se existir; senão memória (o progresso então não persiste). */
export function createDefaultKv(): KeyValueStore {
  return typeof indexedDB === 'undefined' ? createMemoryKv() : createIdbKv();
}
