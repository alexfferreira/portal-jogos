import type { GeneratedLevel, HintResult, State } from '../logic';
import type { LogicRequest, LogicRequestBody, LogicResponse } from './protocol';

/** Parte mínima de um Worker usada pelo cliente (permite "worker falso" nos testes). */
export interface WorkerLike {
  postMessage(message: LogicRequest): void;
  terminate(): void;
  onmessage: ((e: { data: LogicResponse }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onmessageerror?: ((e: unknown) => void) | null;
}

export interface LogicClientOptions {
  /** Cria o worker. Padrão: Worker real do módulo `logic.worker.ts` (se existir `Worker`). */
  createWorker?: () => WorkerLike;
  /**
   * Fallback usado quando não há Worker (ou a criação falha).
   * Padrão: importa o handler sob demanda e roda na thread principal.
   */
  fallback?: (req: LogicRequest) => LogicResponse | Promise<LogicResponse>;
}

export interface RequestOptions {
  /** Cancela o pedido: a promessa rejeita com `CancelledError`. */
  signal?: AbortSignal;
}

/**
 * Contrato de cancelamento: um pedido novo com a MESMA chave cancela o anterior, que rejeita
 * com `CancelledError` (os chamadores devem tratar). A chave é `hint` para dicas e
 * `generate:<fase>` para geração: gerar a fase N+1 não cancela a N; só outro pedido da fase N.
 */
export interface LogicClient {
  generateLevel(level: number, options?: RequestOptions): Promise<GeneratedLevel>;
  /** A resposta traz `state` (o estado de origem) para o chamador descartar dica velha. */
  hint(state: State, options?: RequestOptions): Promise<HintResult>;
  /** Encerra o worker e rejeita tudo o que estiver pendente. */
  dispose(): void;
}

/** Pedido cancelado, substituído por outro mais novo da mesma chave, ou cliente encerrado. */
export class CancelledError extends Error {
  constructor(reason = 'pedido cancelado') {
    super(reason);
    this.name = 'CancelledError';
  }
}

interface Pending {
  id: number;
  key: string;
  type: LogicRequest['type'];
  req: LogicRequest;
  /** Já enviado ao worker (ou ao fallback) e ainda sem resposta. */
  inFlight: boolean;
  resolve(value: never): void;
  reject(error: Error): void;
  cleanup(): void;
}

function defaultCreateWorker(): WorkerLike {
  return new Worker(new URL('./logic.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike;
}

async function defaultFallback(req: LogicRequest): Promise<LogicResponse> {
  const { handleRequest } = await import('./handler');
  return handleRequest(req);
}

const keyOf = (body: LogicRequestBody): string =>
  body.type === 'generate' ? `generate:${body.level}` : 'hint';

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Cliente assíncrono da lógica pesada.
 * - Um pedido por vez vai ao worker; os demais esperam na fila do cliente.
 * - Cancelar/substituir um pedido na fila só o descarta. Cancelar o pedido EM EXECUÇÃO
 *   termina o worker (`terminate()`) e o próximo pedido recria um worker novo, para uma
 *   busca obsoleta não bloquear os seguintes.
 * - `dispose()` termina o worker e cancela os pendentes.
 */
export function createLogicClient(options: LogicClientOptions = {}): LogicClient {
  const fallback = options.fallback ?? defaultFallback;
  const queue: Pending[] = [];
  let current: Pending | null = null;
  let nextId = 1;
  let worker: WorkerLike | null = null;
  let disposed = false;

  const finish = (p: Pending): void => {
    p.cleanup();
    if (current === p) current = null;
    const i = queue.indexOf(p);
    if (i >= 0) queue.splice(i, 1);
  };

  const dropWorker = (): void => {
    worker?.terminate();
    worker = null;
  };

  /** Remove o pedido; se estava em voo no worker, termina o worker. Não rejeita. */
  const discard = (p: Pending): void => {
    const wasInFlight = current === p;
    finish(p);
    if (wasInFlight) dropWorker();
  };

  const settle = (res: LogicResponse): void => {
    const p = current;
    if (!p || p.id !== res.id) return; // tardia ou desconhecida
    finish(p);
    if (res.type === 'error') p.reject(new Error(res.message));
    else if (res.type !== p.type) p.reject(new Error('resposta de tipo inesperado'));
    else p.resolve(res.result as never);
    pump();
  };

  const rejectAll = (error: () => Error): void => {
    for (const p of [...queue]) {
      finish(p);
      p.reject(error());
    }
  };

  const failCurrent = (message: string): void => {
    const p = current;
    if (!p) return;
    discard(p);
    p.reject(new Error(message));
    pump();
  };

  const ensureWorker = (): WorkerLike | null => {
    if (worker) return worker;
    const create =
      options.createWorker ?? (typeof Worker === 'undefined' ? undefined : defaultCreateWorker);
    if (!create) return null;
    try {
      const w = create();
      w.onmessage = (e) => {
        if (worker === w) settle(e.data);
      };
      w.onerror = () => {
        if (worker !== w) return;
        dropWorker();
        current = null;
        rejectAll(() => new Error('falha no worker'));
      };
      w.onmessageerror = () => {
        if (worker === w) failCurrent('mensagem do worker ilegível');
      };
      worker = w;
      return w;
    } catch {
      return null;
    }
  };

  function pump(): void {
    if (disposed || current || queue.length === 0) return;
    const p = queue[0] as Pending;
    current = p;
    p.inFlight = true;
    const w = ensureWorker();
    if (w) {
      try {
        w.postMessage(p.req);
      } catch (e) {
        settle({ id: p.id, type: 'error', message: messageOf(e) });
      }
    } else {
      Promise.resolve()
        .then(() => fallback(p.req))
        .then(settle, (e: unknown) => settle({ id: p.id, type: 'error', message: messageOf(e) }));
    }
  }

  function request<T>(body: LogicRequestBody, opts: RequestOptions | undefined): Promise<T> {
    if (disposed) return Promise.reject(new CancelledError('cliente encerrado'));
    const signal = opts?.signal;
    if (signal?.aborted) return Promise.reject(new CancelledError());

    const key = keyOf(body);
    // Substitui pedidos antigos com a mesma chave.
    for (const old of queue.filter((p) => p.key === key)) {
      discard(old);
      old.reject(new CancelledError('substituído por um pedido mais novo'));
    }

    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      const onAbort = (): void => {
        if (!queue.includes(pending)) return;
        discard(pending);
        reject(new CancelledError());
        pump();
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      const pending: Pending = {
        id,
        key,
        type: body.type,
        req: { ...body, id } as LogicRequest,
        inFlight: false,
        resolve: resolve as (v: never) => void,
        reject,
        cleanup: () => signal?.removeEventListener('abort', onAbort),
      };
      queue.push(pending);
      pump();
    });
  }

  return {
    generateLevel: (level, opts) => request<GeneratedLevel>({ type: 'generate', level }, opts),
    hint: (state, opts) => request<HintResult>({ type: 'hint', state }, opts),
    dispose() {
      if (disposed) return;
      disposed = true;
      dropWorker();
      current = null;
      rejectAll(() => new CancelledError('cliente encerrado'));
    },
  };
}
