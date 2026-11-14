<script lang="ts">
  import { Button } from '@recreio/ui';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { t } from '#lib/app.svelte.ts';
  import GameHost from '#lib/GameHost.svelte';
  import { findGame } from '#lib/games.ts';

  const game = $derived(findGame(page.params.id ?? ''));
</script>

{#if game}
  {#key game.id}
    <GameHost {game} />
  {/key}
{:else}
  <main>
    <p>{t('game.notFound')}</p>
    <Button onclick={() => goto(resolve('/'))}>{t('common.back')}</Button>
  </main>
{/if}

<style>
  main {
    display: grid;
    justify-items: center;
    gap: 16px;
    padding: 64px 16px;
    font-weight: 700;
  }
</style>
