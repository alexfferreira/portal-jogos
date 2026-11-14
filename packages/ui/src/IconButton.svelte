<script lang="ts">
  import Icon from './Icon.svelte';

  type Props = {
    icon: string;
    /** Rótulo acessível (já traduzido). */
    label: string;
    disabled?: boolean;
    onclick?: (e: MouseEvent) => void;
  };
  let { icon, label, disabled = false, onclick }: Props = $props();
</script>

<button class="icon-btn" type="button" aria-label={label} title={label} {disabled} {onclick}>
  <Icon name={icon} />
</button>

<style>
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--tap, 44px);
    height: var(--tap, 44px);
    border: 0;
    border-radius: 50%;
    background: var(--surface, #fff);
    color: var(--ink, #1b2b44);
    box-shadow: 0 3px 0 #c5d6f2;
    cursor: pointer;
    transition: transform 0.12s var(--ease-pop);
    -webkit-tap-highlight-color: transparent;
  }
  .icon-btn:active:not(:disabled) {
    transform: translateY(2px);
    box-shadow: 0 1px 0 #c5d6f2;
  }
  .icon-btn:disabled {
    opacity: 0.45;
  }
  .icon-btn:focus-visible {
    outline: 3px solid var(--accent, #fdd835);
    outline-offset: 2px;
  }
</style>
