<script lang="ts">
  type Props = {
    checked: boolean;
    label: string;
    onchange?: (checked: boolean) => void;
  };
  let { checked = $bindable(), label, onchange }: Props = $props();

  function toggle() {
    checked = !checked;
    onchange?.(checked);
  }
</script>

<div class="row">
  <span class="label">{label}</span>
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    class="switch"
    class:on={checked}
    onclick={toggle}
  >
    <span class="track"><span class="knob"></span></span>
  </button>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: var(--tap, 44px);
  }
  .label {
    font-weight: 700;
  }
  /* O botão tem a área de toque inteira (≥ 44 px); o desenho do interruptor fica dentro dele. */
  .switch {
    display: grid;
    place-items: center;
    flex: none;
    width: 64px;
    height: var(--tap, 44px);
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .switch:focus-visible {
    outline: 3px solid var(--accent, #fdd835);
    outline-offset: 0;
    border-radius: 16px;
  }
  .track {
    position: relative;
    width: 56px;
    height: 32px;
    border-radius: 16px;
    background: #c5d6f2;
    transition: background 0.15s;
  }
  .on .track {
    background: var(--primary, #1e63e0);
  }
  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 4px rgb(0 0 0 / 25%);
    transition: transform 0.18s var(--ease-pop);
  }
  .on .knob {
    transform: translateX(24px);
  }
</style>
