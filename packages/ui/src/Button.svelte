<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    type?: 'button' | 'submit';
    disabled?: boolean;
    full?: boolean;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  };
  let {
    variant = 'primary',
    type = 'button',
    disabled = false,
    full = false,
    onclick,
    children,
  }: Props = $props();
</script>

<button class="btn {variant}" class:full {type} {disabled} {onclick}>
  {@render children()}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: var(--tap, 44px);
    padding: 0 20px;
    border: 0;
    border-radius: var(--radius-sm, 12px);
    font: inherit;
    font-weight: 800;
    cursor: pointer;
    color: #fff;
    background: var(--primary, #1e63e0);
    box-shadow: 0 4px 0 var(--primary-dark, #1749a8);
    transition:
      transform 0.12s var(--ease-pop),
      box-shadow 0.12s;
    -webkit-tap-highlight-color: transparent;
  }
  .btn:active:not(:disabled) {
    transform: translateY(3px);
    box-shadow: 0 1px 0 var(--primary-dark, #1749a8);
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .btn:focus-visible {
    outline: 3px solid var(--accent, #fdd835);
    outline-offset: 2px;
  }
  .full {
    width: 100%;
  }
  .secondary {
    background: var(--surface, #fff);
    color: var(--primary, #1e63e0);
    box-shadow:
      0 4px 0 #c5d6f2,
      inset 0 0 0 2px #c5d6f2;
  }
  .secondary:active:not(:disabled) {
    box-shadow:
      0 1px 0 #c5d6f2,
      inset 0 0 0 2px #c5d6f2;
  }
  .danger {
    background: var(--danger, #e53935);
    box-shadow: 0 4px 0 var(--danger-dark, #a82523);
  }
  .danger:active:not(:disabled) {
    box-shadow: 0 1px 0 var(--danger-dark, #a82523);
  }
  .ghost {
    background: transparent;
    color: var(--ink, #1b2b44);
    box-shadow: none;
  }
  .ghost:active:not(:disabled) {
    box-shadow: none;
    background: rgb(27 43 68 / 8%);
  }
</style>
