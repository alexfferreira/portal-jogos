<script lang="ts">
  import { IconButton } from '@recreio/ui';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { t } from '#lib/app.svelte.ts';
  import GameCard from '#lib/GameCard.svelte';
  import { games } from '#lib/games.ts';
  import InstallHint from '#lib/InstallHint.svelte';
</script>

<svelte:head><title>{t('app.name')}</title></svelte:head>

<main>
  <header>
    <h1>{t('app.name')}</h1>
    <IconButton
      icon="settings"
      label={t('settings.title')}
      onclick={() => goto(resolve('/configuracoes'))}
    />
  </header>

  <InstallHint />

  <section class="grid" aria-label={t('settings.games')}>
    {#each games as game (game.id)}
      <GameCard {game} />
    {/each}
  </section>
</main>

<style>
  main {
    display: grid;
    gap: 16px;
    max-width: 560px;
    margin: 0 auto;
    padding: calc(16px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom));
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h1 {
    margin: 0;
    font-size: 2rem;
    letter-spacing: -0.5px;
  }
  .grid {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }
</style>
