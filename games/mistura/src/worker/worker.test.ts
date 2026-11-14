import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateLevel, parseState } from '../logic';
import {
  CancelledError,
  createLogicClient,
  describeWorkerError,
  formatWorkerError,
  type WorkerLike,
} from './client';
import { handleRequest } from './handler';
import type { LogicRequest, LogicResponse } from './protocol';

describe('handleRequest (protocolo)', () => {
  it('generate devolve a fase (idêntica ao gerador) e o mesmo id', () => {
    const res = handleRequest({ id: 7, type: 'generate', level: 3 });
    expect(res).toEqual({ id: 7, type: 'generate', result: generateLevel(3) });
  });

  it('hint devolve a próxima jogada', () => {
    const state = parseState('0 1 | 1 0 | ', 2);
    const res = handleRequest({ id: 2, type: 'hint', state });
    expect(res.type).toBe('hint');
    if (res.type === 'hint') {
      expect(res.result.move).not.toBeNull();
      expect(res.result.state).toEqual(state);
    }
  });

  it('erros viram resposta de erro, sem lançar', () => {
    const res = handleRequest({ id: 9, type: 'generate', level: 0 });
    expect(res).toMatchObject({ id: 9, type: 'error' });
    expect(handleRequest({ id: 1, type: 'xyz' } as unknown as LogicRequest)).toMatchObject({
      type: 'error',
    });
  });

  it('as mensagens sobrevivem ao structured clone', () => {
    const res = handleRequest({ id: 1, type: 'generate', level: 45 });
    expect(structuredClone(res)).toEqual(res);
  });
});

/** Worker falso: guarda os pedidos; o teste decide quando e como responder. */
class FakeWorker implements WorkerLike {
  sent: LogicRequest[] = [];
  terminated = false;
  onmessage: ((e: { data: LogicResponse }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessageerror: ((e: unknown) => void) | null = null;
  postMessage(m: LogicRequest): void {
    this.sent.push(m);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(res: LogicResponse): void {
    this.onmessage?.({ data: res });
  }
  /** Responde com o handler real. */
  answer(req: LogicRequest): void {
    this.reply(handleRequest(req));
  }
}

function setup() {
  const fake = new FakeWorker();
  const client = createLogicClient({ createWorker: () => fake });
  return { fake, client };
}

describe('createLogicClient', () => {
  const HINT_STATE = parseState('0 1 | 1 0 | ', 2);

  it('envia o pedido ao worker e resolve com a resposta', async () => {
    const { fake, client } = setup();
    const p = client.generateLevel(5);
    expect(fake.sent).toEqual([{ id: 1, type: 'generate', level: 5 }]);
    fake.answer(fake.sent[0] as LogicRequest);
    expect((await p).level).toBe(5);
  });

  it('hint passa pelo worker e devolve o estado de origem', async () => {
    const { fake, client } = setup();
    const p = client.hint(HINT_STATE);
    fake.answer(fake.sent[0] as LogicRequest);
    const r = await p;
    expect(r.status).toBe('solved');
    expect(r.state).toEqual(HINT_STATE);
  });

  it('envia um pedido por vez; os outros esperam na fila', async () => {
    const { fake, client } = setup();
    const g = client.generateLevel(1);
    const h = client.hint(HINT_STATE);
    expect(fake.sent).toHaveLength(1);
    fake.answer(fake.sent[0] as LogicRequest);
    await g;
    expect(fake.sent).toHaveLength(2);
    fake.answer(fake.sent[1] as LogicRequest);
    await expect(h).resolves.toBeDefined();
    expect(fake.terminated).toBe(false);
  });

  it('pedido novo da mesma fase substitui o anterior em voo: termina o worker e recria', async () => {
    const workers: FakeWorker[] = [];
    const client = createLogicClient({
      createWorker: () => {
        const w = new FakeWorker();
        workers.push(w);
        return w;
      },
    });
    const old = client.generateLevel(3);
    const fresh = client.generateLevel(3);
    await expect(old).rejects.toBeInstanceOf(CancelledError);
    expect(workers[0]?.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    expect(workers[1]?.sent).toHaveLength(1);
    workers[1]?.answer(workers[1].sent[0] as LogicRequest);
    expect((await fresh).level).toBe(3);
  });

  it('pedido substituído que ainda estava na fila só é descartado (sem terminate)', async () => {
    const { fake, client } = setup();
    const running = client.generateLevel(1);
    const queued = client.hint(HINT_STATE);
    const queuedNew = client.hint(HINT_STATE);
    await expect(queued).rejects.toBeInstanceOf(CancelledError);
    expect(fake.terminated).toBe(false);
    fake.answer(fake.sent[0] as LogicRequest);
    await running;
    fake.answer(fake.sent[1] as LogicRequest);
    await expect(queuedNew).resolves.toBeDefined();
    expect(fake.sent).toHaveLength(2);
    expect(fake.terminated).toBe(false);
  });

  it('gerar fases diferentes em paralelo não cancela nenhuma', async () => {
    const { fake, client } = setup();
    const a = client.generateLevel(10);
    const b = client.generateLevel(11);
    fake.answer(fake.sent[0] as LogicRequest);
    expect((await a).level).toBe(10);
    fake.answer(fake.sent[1] as LogicRequest);
    expect((await b).level).toBe(11);
    expect(fake.terminated).toBe(false);
  });

  it('AbortSignal no pedido em voo termina o worker; o próximo usa worker novo', async () => {
    const workers: FakeWorker[] = [];
    const client = createLogicClient({
      createWorker: () => {
        const w = new FakeWorker();
        workers.push(w);
        return w;
      },
    });
    const ctrl = new AbortController();
    const p = client.generateLevel(1, { signal: ctrl.signal });
    const next = client.hint(HINT_STATE);
    ctrl.abort();
    await expect(p).rejects.toBeInstanceOf(CancelledError);
    expect(workers[0]?.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    workers[1]?.answer(workers[1].sent[0] as LogicRequest);
    await expect(next).resolves.toBeDefined();
    await expect(client.generateLevel(1, { signal: ctrl.signal })).rejects.toBeInstanceOf(
      CancelledError,
    );
  });

  it('abort de pedido na fila não termina o worker', async () => {
    const { fake, client } = setup();
    const running = client.generateLevel(1);
    const ctrl = new AbortController();
    const queued = client.hint(HINT_STATE, { signal: ctrl.signal });
    ctrl.abort();
    await expect(queued).rejects.toBeInstanceOf(CancelledError);
    expect(fake.terminated).toBe(false);
    fake.answer(fake.sent[0] as LogicRequest);
    await running;
  });

  it('abort depois de resolvido não faz nada e o listener é removido', async () => {
    const { fake, client } = setup();
    const added: string[] = [];
    const removed: string[] = [];
    const signal = {
      aborted: false,
      addEventListener: (t: string) => added.push(t),
      removeEventListener: (t: string) => removed.push(t),
    } as unknown as AbortSignal;
    const p = client.generateLevel(2, { signal });
    fake.answer(fake.sent[0] as LogicRequest);
    await p;
    expect(added).toEqual(['abort']);
    expect(removed).toEqual(['abort']);
    expect(fake.terminated).toBe(false);
  });

  it('messageerror rejeita o pedido em voo e o seguinte segue em worker novo', async () => {
    const workers: FakeWorker[] = [];
    const client = createLogicClient({
      createWorker: () => {
        const w = new FakeWorker();
        workers.push(w);
        return w;
      },
    });
    const a = client.generateLevel(1);
    const b = client.generateLevel(2);
    workers[0]?.onmessageerror?.(new Error('x'));
    await expect(a).rejects.toThrow(/ilegível/);
    expect(workers[0]?.terminated).toBe(true);
    workers[1]?.answer(workers[1].sent[0] as LogicRequest);
    expect((await b).level).toBe(2);
  });

  it('erro do worker rejeita o pedido', async () => {
    const { fake, client } = setup();
    const p = client.generateLevel(1);
    fake.reply({ id: 1, type: 'error', message: 'boom' });
    await expect(p).rejects.toThrow('boom');
  });

  it('falha do worker (onerror) rejeita pendentes e o próximo pedido recria o worker', async () => {
    const workers: FakeWorker[] = [];
    const client = createLogicClient({
      createWorker: () => {
        const w = new FakeWorker();
        workers.push(w);
        return w;
      },
    });
    const p = client.generateLevel(1);
    workers[0]?.onerror?.(new Error('x'));
    await expect(p).rejects.toThrow('falha no worker');
    expect(workers[0]?.terminated).toBe(true);
    const q = client.generateLevel(2);
    expect(workers).toHaveLength(2);
    workers[1]?.answer(workers[1].sent[0] as LogicRequest);
    expect((await q).level).toBe(2);
  });

  it('dispose termina o worker, cancela pendentes e recusa novos pedidos', async () => {
    const { fake, client } = setup();
    const p = client.generateLevel(1);
    client.dispose();
    client.dispose();
    expect(fake.terminated).toBe(true);
    await expect(p).rejects.toBeInstanceOf(CancelledError);
    await expect(client.generateLevel(1)).rejects.toBeInstanceOf(CancelledError);
  });

  it('usa o fallback injetado quando não há worker', async () => {
    const client = createLogicClient({
      createWorker: () => {
        throw new Error('sem worker');
      },
      fallback: (req) => handleRequest(req),
    });
    expect((await client.generateLevel(4)).level).toBe(4);
  });

  it('em node (sem Worker) usa o handler real por padrão', async () => {
    const client = createLogicClient();
    expect((await client.generateLevel(6)).level).toBe(6);
    const h = await client.hint(parseState('0 1 | 1 0 | ', 2));
    expect(h.move).not.toBeNull();
  });

  it('erro lançado pelo fallback rejeita o pedido', async () => {
    const client = createLogicClient({
      fallback: () => {
        throw new Error('quebrou');
      },
    });
    await expect(client.generateLevel(1)).rejects.toThrow('quebrou');
  });
});

describe('diagnóstico de falha do Worker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('describeWorkerError usa a mensagem, o arquivo e a posição do ErrorEvent', () => {
    const d = describeWorkerError(
      { message: 'x is not defined', filename: 'http://h/w.js', lineno: 12, colno: 5 },
      'http://h/logic.worker.ts',
    );
    expect(d).toEqual({
      url: 'http://h/logic.worker.ts',
      message: 'x is not defined',
      filename: 'http://h/w.js',
      line: 12,
      column: 5,
    });
    expect(formatWorkerError(d)).toBe(
      'falha no worker [http://h/logic.worker.ts]: x is not defined em http://h/w.js:12:5',
    );
  });

  it('sem mensagem (script não carregou) o texto diz isso e aponta para a URL', () => {
    const text = formatWorkerError(
      describeWorkerError({ message: '' }, 'http://h/logic.worker.ts'),
    );
    expect(text).toContain('http://h/logic.worker.ts');
    expect(text).toContain('não pôde ser carregado');
  });

  it('aceita um Error comum e valores estranhos', () => {
    expect(describeWorkerError(new Error('boom')).message).toBe('boom');
    expect(describeWorkerError(undefined).message).toContain('sem mensagem');
    expect(describeWorkerError('texto').message).toContain('sem mensagem');
  });

  it('onerror registra a mensagem real e rejeita com ela', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fake = new FakeWorker();
    const client = createLogicClient({ createWorker: () => fake });
    const p = client.generateLevel(1);
    fake.onerror?.({ message: 'SyntaxError: boom', filename: 'w.js', lineno: 3, colno: 1 });
    await expect(p).rejects.toThrow('falha no worker: SyntaxError: boom em w.js:3:1');
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('SyntaxError: boom'),
      expect.objectContaining({ message: 'SyntaxError: boom', line: 3 }),
    );
  });

  it('Worker padrão: erro sem mensagem registra a URL e a sonda mostra o status HTTP', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fake = new FakeWorker();
    let createdWith: unknown;
    vi.stubGlobal(
      'Worker',
      class {
        constructor(url: URL) {
          createdWith = url;
          return fake;
        }
      },
    );
    const fetchMock = vi.fn(async () => ({
      status: 403,
      headers: new Headers({ 'content-type': 'text/plain' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createLogicClient();
    const p = client.generateLevel(1);
    expect(String(createdWith)).toContain('logic.worker');
    fake.onerror?.({ message: '' });
    await expect(p).rejects.toThrow(/falha no worker \[.*logic\.worker.*\]/);
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith(expect.stringContaining('HTTP 403')));
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('falha ao criar o Worker é registrada e cai no fallback', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = createLogicClient({
      createWorker: () => {
        throw new Error('sem permissão');
      },
      fallback: (req) => handleRequest(req),
    });
    expect((await client.generateLevel(2)).level).toBe(2);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('não foi possível criar o Worker'),
      expect.any(Error),
    );
  });
});
