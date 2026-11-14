import type { KeyValueStore } from './kv';

const PREFIX = 'recreio:';
const BACKUP_APP = 'recreio';
const BACKUP_FORMAT = 1;

/** Como um documento é gravado: versão do schema + dados. */
export interface Envelope<T = unknown> {
  v: number;
  data: T;
}

/** `migrations[n]` converte dados da versão n para a n+1. */
export type Migrations = Record<number, (data: unknown) => unknown>;

export interface DocSpec<T> {
  /** Versão atual do schema. */
  version: number;
  migrations?: Migrations;
  /** Valor usado quando não há dado, ou quando ele está corrompido/incompatível. */
  defaults: () => T;
  /** Validação final depois das migrações; false = tratar como corrompido. */
  validate?: (data: unknown) => data is T;
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  format: number;
  exportedAt: string;
  entries: Record<string, Envelope>;
}

export type ImportResult = { ok: true; imported: number } | { ok: false; reason: 'invalid' };

export interface Storage {
  load<T>(key: string, spec: DocSpec<T>): Promise<T>;
  save<T>(key: string, data: T, version: number): Promise<void>;
  remove(key: string): Promise<void>;
  /** Remove todos os documentos cuja chave começa com `keyPrefix` (ex.: `progress:mistura`). */
  removeWhere(keyPrefix: string): Promise<void>;
  exportAll(): Promise<BackupFile>;
  /** Substitui o conteúdo atual pelo do backup. Não altera nada se o arquivo for inválido. */
  importAll(raw: unknown): Promise<ImportResult>;
}

function isEnvelope(value: unknown): value is Envelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Envelope).v === 'number' &&
    Number.isInteger((value as Envelope).v) &&
    'data' in value
  );
}

export function migrate(envelope: Envelope, spec: DocSpec<unknown>): unknown {
  if (envelope.v > spec.version) throw new Error('versão do dado é mais nova que o app');
  let data = envelope.data;
  for (let v = envelope.v; v < spec.version; v++) {
    const step = spec.migrations?.[v];
    if (!step) throw new Error(`sem migração de ${v} para ${v + 1}`);
    data = step(data);
  }
  return data;
}

export function createStorage(kv: KeyValueStore): Storage {
  const full = (key: string): string => PREFIX + key;

  return {
    async load<T>(key: string, spec: DocSpec<T>): Promise<T> {
      let raw: unknown;
      try {
        raw = await kv.get(full(key));
      } catch {
        return spec.defaults();
      }
      if (raw === undefined) return spec.defaults();
      try {
        if (!isEnvelope(raw)) throw new Error('envelope inválido');
        const data = migrate(raw, spec as DocSpec<unknown>);
        if (spec.validate && !spec.validate(data)) throw new Error('dado inválido');
        return data as T;
      } catch {
        // Corrompido ou de versão futura: não derruba o app; usa o padrão.
        return spec.defaults();
      }
    },

    async save<T>(key: string, data: T, version: number): Promise<void> {
      const envelope: Envelope<T> = { v: version, data };
      await kv.set(full(key), envelope);
    },

    async remove(key: string): Promise<void> {
      await kv.del(full(key));
    },

    async removeWhere(keyPrefix: string): Promise<void> {
      // Casa a chave exata ou filhos ("prefixo:..."): "progress:a" não apaga "progress:ab".
      const exact = full(keyPrefix);
      for (const [k] of await kv.entries()) {
        if (k === exact || k.startsWith(exact + ':')) await kv.del(k);
      }
    },

    async exportAll(): Promise<BackupFile> {
      const out: Record<string, Envelope> = {};
      for (const [k, value] of await kv.entries()) {
        if (k.startsWith(PREFIX) && isEnvelope(value)) out[k.slice(PREFIX.length)] = value;
      }
      return {
        app: BACKUP_APP,
        format: BACKUP_FORMAT,
        exportedAt: new Date().toISOString(),
        entries: out,
      };
    },

    async importAll(raw: unknown): Promise<ImportResult> {
      if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'invalid' };
      const file = raw as Partial<BackupFile>;
      if (file.app !== BACKUP_APP || file.format !== BACKUP_FORMAT) {
        return { ok: false, reason: 'invalid' };
      }
      const incoming = file.entries;
      if (typeof incoming !== 'object' || incoming === null)
        return { ok: false, reason: 'invalid' };
      const list = Object.entries(incoming);
      if (!list.every(([, value]) => isEnvelope(value))) return { ok: false, reason: 'invalid' };

      // Grava o novo conteúdo primeiro e só então remove o que sobrou: uma falha
      // no meio não apaga o progresso existente.
      for (const [key, value] of list) await kv.set(full(key), value);
      const keep = new Set(list.map(([key]) => full(key)));
      for (const [k] of await kv.entries())
        if (k.startsWith(PREFIX) && !keep.has(k)) await kv.del(k);
      return { ok: true, imported: list.length };
    },
  };
}

/** Pede ao navegador para não apagar os dados. Retorna se foi concedido. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
