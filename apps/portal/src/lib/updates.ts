/**
 * Lógica do aviso de "nova versão disponível", sem depender de `navigator.serviceWorker`:
 * o ambiente é injetado (nos testes é um falso; no app, `sw.svelte.ts` liga ao navegador).
 */

/**
 * none: sem novidade · available: versão nova esperando · updating: ativando · dismissed: "Depois" ·
 * reload: outra aba ativou a versão nova enquanto esta estava em partida; recarregar para convergir.
 */
export type UpdateStatus = 'none' | 'available' | 'updating' | 'dismissed' | 'reload';

export type UpdateEvent =
  | 'found'
  | 'apply'
  | 'dismiss'
  /** A ativação não aconteceu (timeout ou worker descartado): volta a oferecer a atualização. */
  | 'revert'
  /** Não há mais versão nova esperando. */
  | 'clear'
  /** Outra aba ativou a versão nova e esta página ainda roda o código antigo. */
  | 'stale';

/** Milissegundos de espera pelo `controllerchange` depois de "Atualizar" antes de desistir. */
export const UPDATE_TIMEOUT_MS = 8000;

/** Transição pura do estado do aviso. */
export function nextStatus(status: UpdateStatus, event: UpdateEvent): UpdateStatus {
  switch (event) {
    case 'found':
      // Já dispensado, atualizando ou pedindo recarga: não volta a incomodar na mesma sessão.
      return status === 'none' ? 'available' : status;
    case 'apply':
      return status === 'available' || status === 'dismissed' ? 'updating' : status;
    case 'dismiss':
      return status === 'available' ? 'dismissed' : status;
    case 'revert':
      return status === 'updating' ? 'available' : status;
    case 'clear':
      return status === 'reload' ? status : 'none';
    case 'stale':
      return 'reload';
  }
}

/** O mínimo que usamos de um `ServiceWorker`. */
export interface WorkerLike {
  state: string;
  postMessage(message: unknown): void;
  addEventListener(type: 'statechange', listener: () => void): void;
}

/** O mínimo que usamos de um `ServiceWorkerRegistration`. */
export interface RegistrationLike {
  waiting: WorkerLike | null;
  installing: WorkerLike | null;
  addEventListener(type: 'updatefound', listener: () => void): void;
  update(): Promise<unknown>;
}

/** O mínimo que usamos de um `ServiceWorkerContainer`. */
export interface ContainerLike {
  /** Quem controla a página agora. `null` na primeira visita (ainda não há versão anterior). */
  controller: unknown;
  register(url: string, options?: { type?: 'module' | 'classic' }): Promise<RegistrationLike>;
  addEventListener(type: 'controllerchange', listener: () => void): void;
}

export interface UpdateEnv {
  container: ContainerLike;
  /** Recarrega a página (`location.reload`). */
  reload(): void;
  /** Avisa a interface de que o estado mudou. */
  onChange(status: UpdateStatus): void;
  /** O jogador está no meio de uma partida (nunca recarregamos nesse caso). */
  inGame(): boolean;
  /** Agenda `fn` daqui a `ms`; devolve a função que cancela. */
  schedule(fn: () => void, ms: number): () => void;
}

export interface UpdateController {
  readonly status: UpdateStatus;
  /** Registra o service worker e passa a observar versões novas. */
  start(scriptUrl: string): Promise<void>;
  /** Pede ao worker novo que assuma e recarrega UMA vez quando ele assumir. */
  apply(): void;
  dismiss(): void;
  /** Recarrega agora (estado `reload`, pedido pelo jogador). Só uma vez. */
  reloadNow(): void;
  /** Pede ao navegador que procure uma versão nova (ex.: ao voltar para a aba). */
  check(): void;
}

export function createUpdateController(env: UpdateEnv): UpdateController {
  let status: UpdateStatus = 'none';
  let registration: RegistrationLike | undefined;
  let reloaded = false;
  let cancelTimeout: (() => void) | undefined;
  // Falso na primeira visita: o `claim()` da primeira ativação não é uma troca de versão.
  let controlled = Boolean(env.container.controller);

  const dispatch = (event: UpdateEvent) => {
    const next = nextStatus(status, event);
    if (next === status) return;
    status = next;
    if (status !== 'updating') {
      cancelTimeout?.();
      cancelTimeout = undefined;
    }
    env.onChange(status);
  };

  const reloadOnce = () => {
    if (reloaded) return;
    reloaded = true;
    env.reload();
  };

  /** Relê o que o navegador tem esperando e acerta o estado (worker descartado, novo deploy). */
  const resync = () => {
    const waiting = Boolean(registration?.waiting) && Boolean(env.container.controller);
    if (!waiting) dispatch('clear');
    else if (status === 'updating') dispatch('revert');
    else dispatch('found');
  };

  /** Uma versão "nova" só existe se já há uma controlando a página; na 1ª visita é a instalação. */
  const watch = (worker: WorkerLike) => {
    const check = () => {
      if (worker.state === 'installed' && env.container.controller) dispatch('found');
      else if (worker.state === 'redundant') resync();
    };
    worker.addEventListener('statechange', check);
    check();
  };

  env.container.addEventListener('controllerchange', () => {
    const wasControlled = controlled;
    controlled = true;
    if (!wasControlled || reloaded) return;
    if (status === 'updating') {
      cancelTimeout?.(); // foi o jogador quem pediu: não desiste mais
      reloadOnce();
    } else if (env.inGame())
      dispatch('stale'); // nunca no meio da partida
    else reloadOnce(); // outra aba atualizou: esta ainda tem o código antigo
  });

  return {
    get status() {
      return status;
    },
    async start(scriptUrl) {
      registration = await env.container.register(scriptUrl, { type: 'module' });
      if (registration.waiting && env.container.controller) dispatch('found');
      if (registration.installing) watch(registration.installing);
      registration.addEventListener('updatefound', () => {
        if (registration?.installing) watch(registration.installing);
      });
    },
    apply() {
      const waiting = registration?.waiting;
      if (!waiting) return;
      dispatch('apply');
      if (status !== 'updating') return;
      waiting.addEventListener('statechange', () => {
        if (waiting.state === 'redundant') resync();
      });
      cancelTimeout?.();
      // Sem `controllerchange` a tempo: não deixa o aviso preso, volta a oferecer a atualização.
      cancelTimeout = env.schedule(() => dispatch('revert'), UPDATE_TIMEOUT_MS);
      waiting.postMessage({ type: 'SKIP_WAITING' });
    },
    dismiss() {
      dispatch('dismiss');
    },
    reloadNow() {
      if (status === 'reload') reloadOnce();
    },
    check() {
      void registration?.update().catch(() => undefined);
    },
  };
}
