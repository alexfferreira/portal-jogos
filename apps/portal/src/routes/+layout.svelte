<script lang="ts">
  import '@fontsource-variable/nunito';
  import '@recreio/ui/theme.css';
  import { app } from '#lib/app.svelte.ts';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  // O áudio só pode iniciar depois de um gesto do usuário.
  function unlockAudio() {
    app.core?.audio.unlock();
  }
</script>

<svelte:window onpointerdown={unlockAudio} onkeydown={unlockAudio} />

{@render children()}

<style>
  :global(html, body) {
    margin: 0;
    min-height: 100%;
    font-family: var(--font);
    color: var(--ink);
    background: linear-gradient(var(--bg-top), var(--bg-bottom)) fixed;
    overscroll-behavior: none;
    -webkit-text-size-adjust: 100%;
  }
  :global(*) {
    box-sizing: border-box;
  }
  :global(a) {
    color: inherit;
  }
</style>
