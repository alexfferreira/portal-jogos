<script lang="ts" generics="T extends string">
  type Option = { value: T; label: string };
  type Props = {
    options: Option[];
    value: T;
    label: string;
    onchange?: (value: T) => void;
  };
  let { options, value = $bindable(), label, onchange }: Props = $props();

  function pick(v: T) {
    value = v;
    onchange?.(v);
  }
</script>

<!-- Grupo de botões com aria-pressed: cada opção entra na ordem do Tab, sem exigir setas. -->
<div class="group" role="group" aria-label={label}>
  {#each options as o (o.value)}
    <button
      type="button"
      aria-pressed={value === o.value}
      class:active={value === o.value}
      onclick={() => pick(o.value)}
    >
      {o.label}
    </button>
  {/each}
</div>

<style>
  .group {
    display: flex;
    gap: 6px;
    padding: 4px;
    border-radius: var(--radius-sm, 12px);
    background: var(--surface-2, #eef4ff);
  }
  button {
    flex: 1;
    min-height: var(--tap, 44px);
    padding: 0 10px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--ink-soft, #5a6b85);
    font: inherit;
    font-weight: 800;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  button.active {
    background: var(--surface, #fff);
    color: var(--primary, #1e63e0);
    box-shadow: 0 2px 0 #c5d6f2;
  }
  button:focus-visible {
    outline: 3px solid var(--accent, #fdd835);
    outline-offset: 1px;
  }
</style>
