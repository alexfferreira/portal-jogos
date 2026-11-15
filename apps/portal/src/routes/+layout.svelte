<script lang="ts">
  import '@fontsource-variable/nunito';
  import '@recreio/ui/theme.css';
  import { app } from '#lib/app.svelte.ts';
  import { registerServiceWorker } from '#lib/sw.svelte.ts';
  import UpdateBanner from '#lib/UpdateBanner.svelte';
  import { onMount, type Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  onMount(registerServiceWorker);

  // O áudio só pode iniciar depois de um gesto do usuário.
  function unlockAudio() {
    app.core?.audio.unlock();
  }
</script>

<!-- No celular só pointerup/touchend/click/keydown contam como gesto para liberar o som; o
     pointerdown não conta. Por isso todos chamam o unlock (barato e idempotente). -->
<svelte:window
  onpointerdown={unlockAudio}
  onpointerup={unlockAudio}
  ontouchend={unlockAudio}
  onclick={unlockAudio}
  onkeydown={unlockAudio}
/>

{@render children()}
<UpdateBanner />

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
