<script lang="ts">
  type Props = {
    value: number;
    label: string;
    min?: number;
    max?: number;
    step?: number;
    onchange?: (value: number) => void;
  };
  let { value = $bindable(), label, min = 0, max = 1, step = 0.05, onchange }: Props = $props();
</script>

<label class="slider">
  <span class="label">{label}</span>
  <input
    type="range"
    {min}
    {max}
    {step}
    bind:value
    oninput={() => onchange?.(value)}
    aria-label={label}
  />
</label>

<style>
  .slider {
    display: grid;
    gap: 4px;
    min-height: var(--tap, 44px);
  }
  .label {
    font-weight: 700;
  }
  input {
    width: 100%;
    height: var(--tap, 44px);
    margin: 0;
    accent-color: var(--primary, #1e63e0);
  }
</style>
