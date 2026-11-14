import { describe, expect, it, vi } from 'vitest';
import {
  createUpdateController,
  nextStatus,
  UPDATE_TIMEOUT_MS,
  type ContainerLike,
  type RegistrationLike,
  type UpdateStatus,
  type WorkerLike,
} from './updates';

describe('nextStatus', () => {
  it('nenhum -> disponível -> atualizando', () => {
    expect(nextStatus('none', 'found')).toBe('available');
    expect(nextStatus('available', 'apply')).toBe('updating');
  });
  it('"Depois" dispensa e uma nova detecção não volta a incomodar', () => {
    expect(nextStatus('available', 'dismiss')).toBe('dismissed');
    expect(nextStatus('dismissed', 'found')).toBe('dismissed');
  });
  it('não atualiza sem versão nova e não dispensa o que não foi mostrado', () => {
    expect(nextStatus('none', 'apply')).toBe('none');
    expect(nextStatus('none', 'dismiss')).toBe('none');
    expect(nextStatus('updating', 'dismiss')).toBe('updating');
    expect(nextStatus('updating', 'found')).toBe('updating');
  });
  it('revert só sai de "atualizando"; clear zera; stale pede recarga', () => {
    expect(nextStatus('updating', 'revert')).toBe('available');
    expect(nextStatus('available', 'revert')).toBe('available');
    expect(nextStatus('updating', 'clear')).toBe('none');
    expect(nextStatus('available', 'clear')).toBe('none');
    expect(nextStatus('none', 'stale')).toBe('reload');
    expect(nextStatus('reload', 'found')).toBe('reload');
    expect(nextStatus('reload', 'clear')).toBe('reload');
  });
});

/** Worker falso que permite avançar o estado e dispara `statechange`. */
function fakeWorker(state = 'installing') {
  const listeners: Array<() => void> = [];
  const worker = {
    state,
    postMessage: vi.fn(),
    addEventListener: (_: 'statechange', l: () => void) => listeners.push(l),
    setState(s: string) {
      worker.state = s;
      for (const l of listeners) l();
    },
  };
  return worker satisfies WorkerLike & { setState(s: string): void };
}

function setup(opts: { controller?: boolean; inGame?: boolean } = {}) {
  const reg = {
    waiting: null as WorkerLike | null,
    installing: null as WorkerLike | null,
    update: vi.fn(async () => undefined),
    found: [] as Array<() => void>,
    addEventListener(_: 'updatefound', l: () => void) {
      reg.found.push(l);
    },
  };
  const changes: Array<() => void> = [];
  const container: ContainerLike = {
    controller: opts.controller === false ? null : {},
    register: vi.fn(async () => reg as RegistrationLike),
    addEventListener: (_, l) => changes.push(l),
  };
  const statuses: UpdateStatus[] = [];
  const reload = vi.fn();
  // Tempo falso: o relógio só anda quando o teste manda.
  const timers: Array<{ fn: () => void; ms: number; cancelled: boolean }> = [];
  const env = { inGame: opts.inGame ?? false };
  const controller = createUpdateController({
    container,
    reload,
    onChange: (s) => statuses.push(s),
    inGame: () => env.inGame,
    schedule(fn, ms) {
      const t = { fn, ms, cancelled: false };
      timers.push(t);
      return () => {
        t.cancelled = true;
      };
    },
  });
  return {
    reg,
    container,
    controller,
    reload,
    statuses,
    env,
    timers,
    fireTimers: () => timers.filter((t) => !t.cancelled).forEach((t) => t.fn()),
    controllerChange: () => changes.forEach((l) => l()),
  };
}

describe('createUpdateController', () => {
  it('registra o worker como módulo', async () => {
    const s = setup();
    await s.controller.start('/service-worker.js');
    expect(s.container.register).toHaveBeenCalledWith('/service-worker.js', { type: 'module' });
    expect(s.controller.status).toBe('none');
  });

  it('versão nova instalada com a página já controlada: aviso disponível', async () => {
    const s = setup();
    await s.controller.start('/service-worker.js');
    const next = fakeWorker();
    s.reg.installing = next;
    s.reg.found.forEach((l) => l());
    expect(s.controller.status).toBe('none');
    next.setState('installed');
    expect(s.controller.status).toBe('available');
    expect(s.statuses).toEqual(['available']);
  });

  it('primeira visita (sem controller): a instalação inicial não é "nova versão"', async () => {
    const s = setup({ controller: false });
    const first = fakeWorker();
    s.reg.installing = first;
    await s.controller.start('/service-worker.js');
    first.setState('installed');
    first.setState('activated');
    s.controllerChange(); // clients.claim() da primeira ativação
    expect(s.controller.status).toBe('none');
    expect(s.reload).not.toHaveBeenCalled();
  });

  it('já havia um worker esperando ao abrir o app: aviso disponível', async () => {
    const s = setup();
    s.reg.waiting = fakeWorker('installed');
    await s.controller.start('/service-worker.js');
    expect(s.controller.status).toBe('available');
  });

  it('"Atualizar" manda SKIP_WAITING e recarrega UMA vez quando o worker assume', async () => {
    const s = setup();
    const waiting = fakeWorker('installed');
    s.reg.waiting = waiting;
    await s.controller.start('/service-worker.js');
    s.controller.apply();
    expect(s.controller.status).toBe('updating');
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(s.reload).not.toHaveBeenCalled();
    s.controllerChange();
    s.controllerChange();
    expect(s.reload).toHaveBeenCalledTimes(1);
  });

  it('"Depois" dispensa; versão nova detectada depois não reabre o aviso', async () => {
    const s = setup();
    s.reg.waiting = fakeWorker('installed');
    await s.controller.start('/service-worker.js');
    s.controller.dismiss();
    expect(s.controller.status).toBe('dismissed');
    const again = fakeWorker();
    s.reg.installing = again;
    s.reg.found.forEach((l) => l());
    again.setState('installed');
    expect(s.controller.status).toBe('dismissed');
  });

  it('apply sem worker esperando não faz nada', async () => {
    const s = setup();
    await s.controller.start('/service-worker.js');
    s.controller.apply();
    expect(s.controller.status).toBe('none');
  });

  it('check pede atualização ao navegador e engole falhas de rede', async () => {
    const s = setup();
    await s.controller.start('/service-worker.js');
    s.reg.update.mockRejectedValueOnce(new Error('offline'));
    s.controller.check();
    expect(s.reg.update).toHaveBeenCalledTimes(1);
  });
});

describe('outra aba ativou a versão nova (sem o jogador pedir aqui)', () => {
  it('fora de partida recarrega UMA vez para convergir', async () => {
    const s = setup();
    await s.controller.start('/service-worker.js');
    s.controllerChange();
    s.controllerChange();
    expect(s.reload).toHaveBeenCalledTimes(1);
  });

  it('em partida NÃO recarrega: pede recarga e só recarrega quando o jogador tocar', async () => {
    const s = setup({ inGame: true });
    await s.controller.start('/service-worker.js');
    s.controllerChange();
    expect(s.reload).not.toHaveBeenCalled();
    expect(s.controller.status).toBe('reload');
    s.controller.reloadNow();
    s.controller.reloadNow();
    expect(s.reload).toHaveBeenCalledTimes(1);
  });

  it('reloadNow fora do estado "reload" não faz nada', async () => {
    const s = setup();
    await s.controller.start('/service-worker.js');
    s.controller.reloadNow();
    expect(s.reload).not.toHaveBeenCalled();
  });
});

describe('banner nunca fica preso em "atualizando"', () => {
  it('sem controllerchange, o timeout volta a "disponível" e permite tentar de novo', async () => {
    const s = setup();
    const waiting = fakeWorker('installed');
    s.reg.waiting = waiting;
    await s.controller.start('/service-worker.js');
    s.controller.apply();
    expect(s.controller.status).toBe('updating');
    expect(s.timers.at(-1)?.ms).toBe(UPDATE_TIMEOUT_MS);
    s.fireTimers();
    expect(s.controller.status).toBe('available');
    s.controller.apply();
    expect(s.controller.status).toBe('updating');
    expect(waiting.postMessage).toHaveBeenCalledTimes(2);
  });

  it('o timeout é cancelado quando o worker assume', async () => {
    const s = setup();
    s.reg.waiting = fakeWorker('installed');
    await s.controller.start('/service-worker.js');
    s.controller.apply();
    s.controllerChange();
    expect(s.timers.at(-1)?.cancelled).toBe(true);
    s.fireTimers();
    expect(s.controller.status).toBe('updating');
    expect(s.reload).toHaveBeenCalledTimes(1);
  });

  it('worker esperando vira redundant e há outro novo: volta a "disponível"', async () => {
    const s = setup();
    const waiting = fakeWorker('installed');
    s.reg.waiting = waiting;
    await s.controller.start('/service-worker.js');
    s.controller.apply();
    const newer = fakeWorker('installed');
    s.reg.waiting = newer; // terceiro deploy
    waiting.setState('redundant');
    expect(s.controller.status).toBe('available');
    s.controller.apply();
    expect(newer.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('worker esperando vira redundant e não há outro: aviso some', async () => {
    const s = setup();
    const waiting = fakeWorker('installed');
    s.reg.waiting = waiting;
    await s.controller.start('/service-worker.js');
    s.controller.apply();
    s.reg.waiting = null;
    waiting.setState('redundant');
    expect(s.controller.status).toBe('none');
  });
});
