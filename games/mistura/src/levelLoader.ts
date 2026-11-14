import type { GeneratedLevel } from './logic';

/** O que o carregador precisa do cliente do Worker (permite um cliente falso nos testes). */
export interface LevelSource {
  generateLevel(level: number): Promise<GeneratedLevel>;
}

export type LoadResult =
  | { status: 'ok'; gen: GeneratedLevel }
  /** Todas as tentativas falharam. */
  | { status: 'failed' }
  /** Um pedido mais novo ou `invalidate()` tornou este resultado obsoleto: descarte. */
  | { status: 'stale' };

export interface LevelLoaderOptions {
  attempts?: number;
  /** Espera entre tentativas (ms). Injetável nos testes. */
  delay?: (ms: number) => Promise<void>;
  onError?: (error: unknown) => void;
}

const defaultDelay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Carrega fases pelo Worker com tentativas, pré-geração da próxima e um token que descarta
 * resultados obsoletos (reiniciar, novo pedido ou encerramento). Não conhece Three nem DOM.
 */
export function createLevelLoader(source: LevelSource, options: LevelLoaderOptions = {}) {
  const attempts = options.attempts ?? 3;
  const delay = options.delay ?? defaultDelay;
  let token = 0;
  let prefetched: { level: number; promise: Promise<GeneratedLevel | null> } | null = null;

  return {
    /** Começa a gerar `level` em segundo plano. */
    prefetch(level: number): void {
      prefetched = { level, promise: source.generateLevel(level).catch(() => null) };
    },

    async load(level: number): Promise<LoadResult> {
      const mine = ++token;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          let gen: GeneratedLevel | null = null;
          if (prefetched?.level === level) {
            const early = prefetched;
            prefetched = null;
            gen = await early.promise;
          }
          gen ??= await source.generateLevel(level);
          return mine === token ? { status: 'ok', gen } : { status: 'stale' };
        } catch (err) {
          if (mine !== token) return { status: 'stale' };
          options.onError?.(err);
          if (attempt < attempts) {
            await delay(400 * attempt);
            if (mine !== token) return { status: 'stale' };
          }
        }
      }
      return { status: 'failed' };
    },

    /** Torna obsoleto qualquer `load` em andamento. */
    invalidate(): void {
      token++;
    },
  };
}

export type LevelLoader = ReturnType<typeof createLevelLoader>;
