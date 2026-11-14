<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    open: boolean;
    title: string;
    /** Pedido de fechar (Esc ou toque fora). Omita para um modal que só fecha pelos botões. */
    onclose?: () => void;
    /**
     * Qual controle recebe o foco ao abrir. Use `last` quando o botão seguro (Cancelar)
     * vem depois do destrutivo, para um Enter acidental não apagar nada.
     */
    initialFocus?: 'first' | 'last';
    children?: Snippet;
    actions?: Snippet;
  };
  let { open, title, onclose, initialFocus = 'first', children, actions }: Props = $props();

  const uid = $props.id();
  const titleId = `modal-${uid}`;
  let dialog = $state<HTMLDivElement>();
  let backdrop = $state<HTMLDivElement>();

  const FOCUSABLE =
    'button:not(:disabled), [href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])';

  /** Marca como `inert` tudo que não é o modal (ou seus ancestrais), e devolve o desfazer. */
  function inertOutside(el: HTMLElement): () => void {
    const changed: HTMLElement[] = [];
    for (let node: HTMLElement = el; node.parentElement; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert) {
          sibling.inert = true;
          changed.push(sibling);
        }
      }
    }
    return () => changed.forEach((s) => (s.inert = false));
  }

  // Ao abrir: foca o controle certo e isola o fundo. Ao fechar: devolve o foco a quem o tinha.
  $effect(() => {
    if (!open || !dialog || !backdrop) return;
    const previous = document.activeElement;
    const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const target = initialFocus === 'last' ? items[items.length - 1] : items[0];
    (target ?? dialog).focus();
    const restoreInert = inertOutside(backdrop);
    return () => {
      restoreInert();
      if (previous instanceof HTMLElement) previous.focus();
    };
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && onclose) {
      e.stopPropagation();
      onclose();
      return;
    }
    if (e.key !== 'Tab' || !dialog) return;
    // Mantém o foco dentro do modal.
    const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
</script>

{#if open}
  <div
    class="backdrop"
    bind:this={backdrop}
    role="presentation"
    onpointerdown={(e) => {
      if (e.target === e.currentTarget) onclose?.();
    }}
    {onkeydown}
  >
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabindex="-1"
      bind:this={dialog}
    >
      <h2 id={titleId}>{title}</h2>
      {#if children}<div class="body">{@render children()}</div>{/if}
      {#if actions}<div class="actions">{@render actions()}</div>{/if}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgb(27 43 68 / 45%);
    animation: fade 0.15s ease-out;
  }
  .dialog {
    width: min(100%, 360px);
    max-height: 100%;
    overflow: auto;
    box-sizing: border-box;
    padding: 20px;
    border-radius: var(--radius, 18px);
    background: var(--surface, #fff);
    color: var(--ink, #1b2b44);
    box-shadow: var(--shadow);
    animation: pop 0.22s var(--ease-pop);
  }
  .dialog:focus {
    outline: none;
  }
  h2 {
    margin: 0 0 8px;
    font-size: 1.3rem;
  }
  .body {
    color: var(--ink-soft, #5a6b85);
    line-height: 1.4;
  }
  .actions {
    display: grid;
    gap: 10px;
    margin-top: 18px;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
  }
</style>
